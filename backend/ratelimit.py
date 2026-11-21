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
from datetime import datetime, timedelta, timezone

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


async def consume_phone_otp_limit(phone: str) -> None:
    """Atomic per-phone OTP rate limiter.

    Enforces:
    1. 30-second cooldown between requests (raises 429 if requested <30s ago).
    2. Hourly cap of 5 OTP requests per phone number (raises 429 if 5 requests
       already sent in the active 1-hour window).
    """
    now = datetime.now(timezone.utc)
    thirty_seconds_ago_iso = (now - timedelta(seconds=30)).isoformat()
    one_hour_ago_iso = (now - timedelta(hours=1)).isoformat()
    now_iso = now.isoformat()

    # 1. Atomic 30-second cooldown check
    too_recent = await db.otp_rate_limits.find_one({
        "_id": phone,
        "last_sent_at": {"$gt": thirty_seconds_ago_iso},
    })
    if too_recent:
        raise HTTPException(
            status_code=429,
            detail="Please wait 30 seconds before requesting another code",
        )

    # 2. Atomic hourly count limit check
    hour_exceeded = await db.otp_rate_limits.find_one({
        "_id": phone,
        "hour_started_at": {"$gt": one_hour_ago_iso},
        "hour_count": {"$gte": 5},
    })
    if hour_exceeded:
        raise HTTPException(
            status_code=429,
            detail="Too many OTP requests; try again later",
        )

    # 3. Atomic slot reservation
    query_active = {
        "_id": phone,
        "$or": [
            {"last_sent_at": {"$lte": thirty_seconds_ago_iso}},
            {"last_sent_at": {"$exists": False}},
            {"last_sent_at": None},
        ],
        "hour_started_at": {"$gt": one_hour_ago_iso},
        "hour_count": {"$lt": 5},
    }
    update_active = {
        "$set": {"last_sent_at": now_iso},
        "$inc": {"hour_count": 1},
    }
    updated = await db.otp_rate_limits.find_one_and_update(
        query_active, update_active, return_document=ReturnDocument.AFTER
    )
    if updated:
        return

    query_new = {
        "_id": phone,
        "$and": [
            {
                "$or": [
                    {"last_sent_at": {"$lte": thirty_seconds_ago_iso}},
                    {"last_sent_at": {"$exists": False}},
                    {"last_sent_at": None},
                ]
            },
            {
                "$or": [
                    {"hour_started_at": {"$lte": one_hour_ago_iso}},
                    {"hour_started_at": {"$exists": False}},
                    {"hour_started_at": None},
                ]
            },
        ],
    }
    update_new = {
        "$set": {
            "last_sent_at": now_iso,
            "hour_started_at": now_iso,
            "hour_count": 1,
        }
    }
    try:
        updated = await db.otp_rate_limits.find_one_and_update(
            query_new, update_new, upsert=True, return_document=ReturnDocument.AFTER
        )
    except DuplicateKeyError:
        updated = None

    if not updated:
        raise HTTPException(
            status_code=429,
            detail="Please wait 30 seconds before requesting another code",
        )
