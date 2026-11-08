"""MongoDB-backed fixed-window rate limiter.

Counters live in the `rate_limits` collection as one document per
(key, time-bucket) with a TTL index on expiry — so limits hold across
gunicorn workers (in-memory limiters do not) and expired buckets clean
themselves automatically.

Public helper: `await consume(key, limit, window_seconds)` — counts the
action and raises `HTTPException(429)` with a `Retry-After` header once the
bucket exceeds `limit`.
"""
import time
from datetime import datetime, timezone

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from database import db


def _now() -> float:
    return time.time()


def client_ip(request) -> str:
    """Client address for per-IP limiters. Behind a proxy or k8s ingress this
    is the proxy's address unless the deployment terminates and trusts
    X-Forwarded-For upstream — operators must place the limiter inside their
    trusted proxy boundary (see the README deployment notes)."""
    return request.client.host if request.client else "unknown"


async def consume(key: str, limit: int, window_seconds: int) -> None:
    """Count one action under `key`. Raises 429 once the current time-bucket
    for that key exceeds `limit` actions."""
    now = _now()
    bucket = int(now // window_seconds)
    doc_id = f"{key}:{bucket}"
    expires_at = datetime.fromtimestamp((bucket + 1) * window_seconds, tz=timezone.utc)

    async def _inc():
        return await db.rate_limits.find_one_and_update(
            {"_id": doc_id},
            {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": expires_at}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

    try:
        doc = await _inc()
    except DuplicateKeyError:  # rare concurrent-upsert race
        doc = await _inc()

    if doc["count"] > limit:
        retry_after = max(1, int((bucket + 1) * window_seconds - now))
        raise HTTPException(
            status_code=429,
            detail="Too many requests — please slow down",
            headers={"Retry-After": str(retry_after)},
        )
