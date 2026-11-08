"""Report a provider (spam / no-show / fraud etc.)."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from config import RATE_LIMIT_REPORT_USER, REPORTS_AUTO_FLAG_THRESHOLD, REPORT_WINDOW_DAYS
from database import db
from deps import current_user
from ratelimit import consume
from schemas import ReportIn, Role

router = APIRouter(tags=["reports"])


@router.post("/reports", status_code=201)
async def report_provider(
    body: ReportIn,
    user: Annotated[dict, Depends(current_user)],
):
    # Per-user cap: reports are a moderation write path, not a chat channel.
    await consume(f"report:{user['id']}", RATE_LIMIT_REPORT_USER, 3600)
    provider = await db.users.find_one(
        {"id": body.provider_id, "role": Role.service_provider.value}, {"_id": 0}
    )
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    now = datetime.now(timezone.utc)
    # One report per (reporter, provider) per 30-day window (N6/P23): a
    # pre-check for a friendly error, plus a unique index on
    # (reporter_id, provider_id, window) that closes the insert race.
    duplicate_detail = (
        f"You already reported this provider within the last {REPORT_WINDOW_DAYS} days"
    )
    existing = await db.reports.find_one(
        {
            "provider_id": body.provider_id,
            "reporter_id": user["id"],
            "created_at": {"$gte": (now - timedelta(days=REPORT_WINDOW_DAYS)).isoformat()},
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=409, detail=duplicate_detail)
    # The duplicate rule above also means the report count within the window
    # equals the count of distinct reporters; reaching the threshold marks the
    # triggering report for admin attention (auto_flag does NOT act on the
    # provider account — the decision stays with the admin review).
    prior = await db.reports.count_documents(
        {
            "provider_id": body.provider_id,
            "created_at": {"$gte": (now - timedelta(days=REPORT_WINDOW_DAYS)).isoformat()},
        }
    )
    auto_flagged = (prior + 1) >= REPORTS_AUTO_FLAG_THRESHOLD
    doc = {
        "id": str(uuid.uuid4()),
        "provider_id": body.provider_id,
        "reporter_id": user["id"],
        "reporter_name": user["full_name"],
        "reporter_role": user["role"],
        "reason": body.reason,
        "details": body.details,
        "created_at": now.isoformat(),
        "status": "open",
        "window": int(now.timestamp() // (REPORT_WINDOW_DAYS * 86400)),
        "auto_flagged": auto_flagged,
    }
    try:
        await db.reports.insert_one(doc)
    except DuplicateKeyError:  # concurrent report in the same window
        raise HTTPException(status_code=409, detail=duplicate_detail)
    doc.pop("_id", None)
    return doc
