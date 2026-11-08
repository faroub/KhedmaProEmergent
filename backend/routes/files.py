"""Serve locally-stored files (P24, N8).

These routes only exist for the local-filesystem storage backend (development
and test). When S3 is configured, public and private URLs point straight at
object storage / CDN and nothing hits these paths — hence the 404 fallback.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

import storage
from storage import sniff, verify_private_token

router = APIRouter(tags=["files"])


async def _serve(key: str) -> Response:
    data: Optional[bytes] = await storage.get_bytes(key)
    if data is None:
        raise HTTPException(status_code=404, detail="File not found")
    mime = sniff(data) or "application/octet-stream"
    return Response(content=data, media_type=mime)


@router.get("/files/public/{key:path}")
async def get_public_file(key: str):
    if storage.uses_s3():
        raise HTTPException(status_code=404, detail="File not found")
    return await _serve(key)


@router.get("/files/private/{key:path}/{exp}.{sig}")
async def get_private_file(key: str, exp: str, sig: str):
    if storage.uses_s3() or not verify_private_token(key, exp, sig):
        raise HTTPException(status_code=404, detail="File not found")
    return await _serve(key)
