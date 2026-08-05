"""Provider self-analytics — chart data for the provider dashboard.

Aggregates bookings by ISO week over the last 12 weeks:
- count of bookings (all statuses)
- completed count
- earned DZD (sum of total_dzd on completed bookings)
- rating snapshot

Kept in a dedicated router so it doesn't clutter `providers.py`. Requires
a service_provider role (or admin acting on their own account).
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from database import db
from deps import require_role
from schemas import Role

router = APIRouter(tags=["provider-analytics"])


@router.get("/providers/me/analytics")
async def my_provider_analytics(
    user: Annotated[dict, Depends(require_role(Role.service_provider))],
    weeks: int = Query(default=12, ge=1, le=52),
):
    """Return per-week aggregates for the calling provider."""
    pid = user["id"]
    now = datetime.now(timezone.utc)
    # Anchor to Monday of the current week (ISO week start).
    monday_this_week = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    start_iso = (monday_this_week - timedelta(weeks=weeks - 1)).isoformat()

    pipeline = [
        {"$match": {"provider_id": pid, "created_at": {"$gte": start_iso}}},
        {
            "$group": {
                "_id": {"$substr": ["$created_at", 0, 10]},  # YYYY-MM-DD
                "count": {"$sum": 1},
                "completed": {
                    "$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}
                },
                "earned": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$status", "completed"]},
                            {"$ifNull": ["$total_dzd", 0]},
                            0,
                        ]
                    }
                },
            }
        },
    ]
    raw = await db.bookings.aggregate(pipeline).to_list(1000)
    by_day: dict[str, dict] = {r["_id"]: r for r in raw}

    # Bucket by week.
    weekly: list[dict] = []
    for i in range(weeks):
        wk_start = monday_this_week - timedelta(weeks=weeks - 1 - i)
        wk_end = wk_start + timedelta(days=6)
        c = 0
        d = 0
        e = 0
        cur = wk_start
        while cur <= wk_end:
            key = cur.strftime("%Y-%m-%d")
            if key in by_day:
                r = by_day[key]
                c += r["count"]
                d += r["completed"]
                e += r["earned"]
            cur += timedelta(days=1)
        weekly.append(
            {
                "week_start": wk_start.strftime("%Y-%m-%d"),
                "bookings": c,
                "completed": d,
                "earned_dzd": int(e),
            }
        )

    # Totals for the range.
    totals = {
        "bookings": sum(w["bookings"] for w in weekly),
        "completed": sum(w["completed"] for w in weekly),
        "earned_dzd": sum(w["earned_dzd"] for w in weekly),
    }

    return {
        "weeks": weekly,
        "totals": totals,
        "rating": user.get("rating") or 0.0,
        "reviews_count": user.get("reviews_count") or 0,
        "profile_views": user.get("profile_views") or 0,
        "verification_status": user.get("verification_status", "unverified"),
    }
