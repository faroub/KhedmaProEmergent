"""Object storage for user-uploaded files (P24, N8).

ID scans and portfolio images used to be stored as base64 data URIs directly
inside `users` documents — sensitive data loaded by every user query and a
16 MB document-size risk. This module stores each file under a random,
unguessable key in object storage; MongoDB keeps only the key + metadata.

Two interchangeable backends:
- S3-compatible (recommended in production): set S3_ENDPOINT_URL / S3_BUCKET /
  S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY (region optional). boto3 is imported
  lazily, so deployments that don't configure S3 do not need it installed.
- Local filesystem (development / test fallback): files land in
  FILE_STORAGE_DIR and are served by the routes in routes/files.py.

Every upload is content-sniffed by magic bytes (the declared content type is
never trusted) and capped by a byte limit. Private files (verification
documents) are only reachable through a short-lived signed URL; portfolio
files are public.
"""
import asyncio
import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
import time
from typing import Optional

from config import API_PUBLIC_URL, JWT_SECRET

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Invalid upload content/size, or a backend failure."""


# Magic-byte signatures (prefix → mime, extension). The declared content type
# of an upload is advisory only — what the bytes actually are is authoritative.
_SIGNATURES: tuple[tuple[bytes, str, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"GIF87a", "image/gif", "gif"),
    (b"GIF89a", "image/gif", "gif"),
    (b"RIFF", "image/webp", "webp"),  # + b"WEBP" at offset 8 (see _sniff)
    (b"%PDF", "application/pdf", "pdf"),
)
_ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_ALLOWED_DOC_MIMES = _ALLOWED_IMAGE_MIMES | {"application/pdf"}
_WEBP_TAIL = b"WEBP"

S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "").strip()
S3_REGION = os.environ.get("S3_REGION", "").strip()
S3_BUCKET = os.environ.get("S3_BUCKET", "").strip()
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "").strip()
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "").strip()
S3_PUBLIC_BASE = os.environ.get("S3_PUBLIC_BASE", "").rstrip("/")
# Local-backend root (only used when S3 is not configured).
FILE_STORAGE_DIR = os.environ.get("FILE_STORAGE_DIR", "").strip() or ".khedmapro_files"


def uses_s3() -> bool:
    return bool(S3_ENDPOINT_URL and S3_BUCKET and S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY)


def sniff(data: bytes) -> str:
    """Return the content type of `data` by magic bytes, or '' if unknown."""
    if data.startswith(b"RIFF") and data[8:12] == _WEBP_TAIL:
        return "image/webp"
    for prefix, mime, _ext in _SIGNATURES:
        if data.startswith(prefix):
            return mime
    return ""


def generate_key(kind: str, mime: str) -> str:
    ext = next((e for p, m, e in _SIGNATURES if m == mime), "bin")
    return f"{kind}/{secrets.token_urlsafe(16)}.{ext}"


async def put_bytes(data: bytes, *, kind: str, allow: tuple[str, ...], max_bytes: int) -> str:
    """Validate and store `data`; return the storage key.

    Raises StorageError when the content type is not allowed (unknown or not
    in `allow`) or the payload exceeds `max_bytes`.
    """
    if len(data) > max_bytes:
        raise StorageError(f"file exceeds the {max_bytes}-byte limit")
    mime = sniff(data)
    if mime not in allow:
        raise StorageError("unsupported file type")
    key = generate_key(kind, mime)
    if uses_s3():
        await asyncio.to_thread(_s3_put, key, data, mime)
    else:
        await asyncio.to_thread(_local_put, key, data)
    return key


async def get_bytes(key: str) -> Optional[bytes]:
    """Fetch a stored object (used to verify uploads and serve local files)."""
    if uses_s3():
        return await asyncio.to_thread(_s3_get, key)
    return await asyncio.to_thread(_local_get, key)


async def delete_object(key: str) -> None:
    if uses_s3():
        await asyncio.to_thread(_s3_delete, key)
    else:
        await asyncio.to_thread(_local_delete, key)


def public_url(key: str) -> str:
    """URL for a portfolio (public) file. Synthesized at serialization time, so
    S3 deployments without a CDN base keep working through presigned URLs that
    are freshly signed on every read and never go stale."""
    if uses_s3() and not S3_PUBLIC_BASE:
        return presigned_url(key, expires=7 * 86400)
    base = S3_PUBLIC_BASE or f"{API_PUBLIC_URL}/api/files/public"
    return f"{base}/{key}"


def presigned_url(key: str, expires: int) -> str:
    """Short-lived URL for a private file (verification documents). S3 uses its
    own presigning; the local backend uses an HMAC token bound to key+expiry."""
    if uses_s3():
        return _s3_presigned_get(key, expires=expires)
    exp = str(int(time.time()) + expires)
    sig = hmac.new(JWT_SECRET.encode(), f"{key}:{exp}".encode(), hashlib.sha256).hexdigest()
    return f"{API_PUBLIC_URL}/api/files/private/{key}/{exp}.{sig}"


def verify_private_token(key: str, exp: str, sig: str) -> bool:
    expected = hmac.new(JWT_SECRET.encode(), f"{key}:{exp}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return False
    try:
        return time.time() <= int(exp)
    except ValueError:
        return False


_DATA_URI_RE = re.compile(r"^data:([a-zA-Z0-9.+/-]+?)(;base64)?,(.*)$", re.DOTALL)


def decode_data_uri(uri: str) -> bytes:
    """Decode an inline data URI. Raises StorageError when malformed."""
    m = _DATA_URI_RE.match(uri)
    if not m:
        raise StorageError("not a data URI")
    if m.group(2) != ";base64":
        raise StorageError("only base64 data URIs are accepted")
    try:
        return base64.b64decode(m.group(3), validate=True)
    except Exception:
        raise StorageError("malformed base64 payload")


# ---- S3 backend ----
def _s3_client():
    global _s3
    import boto3  # imported lazily — installs are only needed when S3 is configured

    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT_URL,
            region_name=S3_REGION or None,
            aws_access_key_id=S3_ACCESS_KEY_ID,
            aws_secret_access_key=S3_SECRET_ACCESS_KEY,
        )
    return _s3


def _s3_presigned_get(key: str, expires: int) -> str:
    return _s3_client().generate_presigned_url(
        "get_object", Params={"Bucket": S3_BUCKET, "Key": key}, ExpiresIn=expires
    )


def _s3_put(key: str, data: bytes, mime: str) -> None:
    try:
        _s3_client().put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=mime)
    except Exception as e:
        logger.error("S3 put failed for %s: %s", key, e)
        raise StorageError(f"upload failed: {e}") from e


def _s3_get(key: str) -> Optional[bytes]:
    try:
        return _s3_client().get_object(Bucket=S3_BUCKET, Key=key)["Body"].read()
    except Exception:
        return None


def _s3_delete(key: str) -> None:
    try:
        _s3_client().delete_object(Bucket=S3_BUCKET, Key=key)
    except Exception as e:
        logger.warning("S3 delete failed for %s: %s", key, e)


_s3 = None


# ---- Local-filesystem backend ----
def _local_path(key: str) -> str:
    # Keys are generated server-side but defensive path handling is free.
    if os.path.basename(key) != key and "\\" in key:
        raise StorageError("bad key")
    safe = key.replace("\\", "/")
    parts = safe.split("/")
    if any(p in ("", "..", ".") for p in parts):
        raise StorageError("bad key")
    return os.path.join(FILE_STORAGE_DIR, *parts)


def _local_put(key: str, data: bytes) -> None:
    try:
        path = _local_path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    except OSError as e:
        logger.error("local storage write failed for %s: %s", key, e)
        raise StorageError(f"upload failed: {e}") from e


def _local_get(key: str) -> Optional[bytes]:
    try:
        with open(_local_path(key), "rb") as f:
            return f.read()
    except OSError:
        return None


def _local_delete(key: str) -> None:
    try:
        os.remove(_local_path(key))
    except OSError:
        pass
