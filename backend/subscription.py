"""Subscription / lifecycle / serialization helpers.

`compute_subscription` is pure (no I/O). `enforce_lifecycle` writes back to
Mongo when a provider crosses the auto-delete threshold. `serialize_user`
produces the public/private user dict returned from every user-facing endpoint.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from config import TRIAL_MONTHS, DEACTIVATION_MONTHS
from database import db
from schemas import Role


def compute_subscription(user: dict) -> dict:
    """Compute subscription status for provider based on created_at.
    Honors manual deactivation & soft-delete flags on the user doc.

    Returns dict with keys: trial_ends_at, subscription_status, days_until_due,
    active, should_soft_delete (bool — for callers to persist).
    """
    now = datetime.now(timezone.utc)

    if user.get("is_deleted"):
        return {
            "trial_ends_at": None,
            "subscription_status": "deleted",
            "days_until_due": None,
            "active": False,
            "should_soft_delete": False,
        }

    if user["role"] != Role.service_provider.value:
        if user.get("is_manually_deactivated"):
            return {
                "trial_ends_at": None,
                "subscription_status": "manually_deactivated",
                "days_until_due": None,
                "active": False,
                "should_soft_delete": False,
            }
        return {
            "trial_ends_at": None,
            "subscription_status": None,
            "days_until_due": None,
            "active": True,
            "should_soft_delete": False,
        }

    # ---- Provider path ----
    if user.get("is_manually_deactivated"):
        return {
            "trial_ends_at": None,
            "subscription_status": "manually_deactivated",
            "days_until_due": None,
            "active": False,
            "should_soft_delete": False,
        }

    created_at = user["created_at"]
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    trial_end = created_at + timedelta(days=TRIAL_MONTHS * 30)
    last_paid_at = user.get("last_paid_at")
    if isinstance(last_paid_at, str):
        last_paid_at = datetime.fromisoformat(last_paid_at.replace("Z", "+00:00"))

    if last_paid_at:
        paid_expires = last_paid_at + timedelta(days=30)
        if paid_expires > now:
            days_left = (paid_expires - now).days
            return {
                "trial_ends_at": trial_end,
                "subscription_status": "active",
                "days_until_due": days_left,
                "active": True,
                "should_soft_delete": False,
            }

    if now < trial_end:
        days_left = (trial_end - now).days
        return {
            "trial_ends_at": trial_end,
            "subscription_status": "trial",
            "days_until_due": days_left,
            "active": True,
            "should_soft_delete": False,
        }

    deactivation_deadline = trial_end + timedelta(days=DEACTIVATION_MONTHS * 30)
    if now < deactivation_deadline:
        return {
            "trial_ends_at": trial_end,
            "subscription_status": "due",
            "days_until_due": 0,
            "active": False,
            "should_soft_delete": False,
        }
    return {
        "trial_ends_at": trial_end,
        "subscription_status": "deleted",
        "days_until_due": 0,
        "active": False,
        "should_soft_delete": True,
    }


async def enforce_lifecycle(user: dict) -> dict:
    """Persist auto soft-delete when subscription says so. Safe to call on every fetch."""
    sub = compute_subscription(user)
    if sub.get("should_soft_delete") and not user.get("is_deleted"):
        now = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"is_deleted": True, "deleted_at": now, "deleted_reason": "auto_unpaid_12mo"}},
        )
        user["is_deleted"] = True
        user["deleted_at"] = now
        user["deleted_reason"] = "auto_unpaid_12mo"
    return user


def _is_new_provider(doc: dict, days: int = 7) -> bool:
    """A provider counts as `new` for `days` days after their created_at."""
    if doc.get("role") != "service_provider":
        return False
    created = doc.get("created_at")
    if not created:
        return False
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            return False
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - created).days < days


def _weighted_rating(rating: float, reviews_count: int, prior_weight: float = 5.0, global_mean: float = 4.0) -> float:
    """Bayesian-weighted rating so a lone 5.0★ from 1 review doesn't outrank a
    4.8★ from 100 reviews. Falls back to `global_mean` when `reviews_count == 0`.
    """
    v = float(reviews_count or 0)
    m = float(prior_weight)
    C = float(global_mean)
    R = float(rating or 0.0)
    return (v / (v + m)) * R + (m / (v + m)) * C


def serialize_user(doc: dict, public: bool = False) -> dict:
    """Serialize a user document. When `public=True` sensitive fields
    (email, phone, verification documents, admin flag) are omitted."""
    sub = compute_subscription(doc)
    rating = doc.get("rating", 0.0) or 0.0
    reviews_count = doc.get("reviews_count", 0) or 0
    out = {
        "id": doc["id"],
        "full_name": doc["full_name"],
        "role": doc["role"],
        "category": doc.get("category"),
        "bio": doc.get("bio"),
        "hourly_rate": doc.get("hourly_rate"),
        "task_rate": doc.get("task_rate"),
        "city": doc.get("city"),
        "avatar_url": doc.get("avatar_url"),
        "rating": rating,
        "reviews_count": reviews_count,
        # Ranking helpers exposed for the client so it can render badges without
        # a second round-trip. Sort logic in routes/providers.py uses these too.
        "weighted_rating": round(_weighted_rating(rating, reviews_count), 4),
        "is_new": _is_new_provider(doc),
        "last_activity_at": doc.get("last_activity_at"),
        "active": sub["active"],
        "created_at": doc["created_at"],
        "trial_ends_at": sub["trial_ends_at"],
        "subscription_status": sub["subscription_status"],
        "days_until_due": sub["days_until_due"],
        "wilaya_code": doc.get("wilaya_code"),
        "baladiya": doc.get("baladiya"),
        "cross_wilaya": doc.get("cross_wilaya", False),
        "location_lat": doc.get("location_lat"),
        "location_lng": doc.get("location_lng"),
        "portfolio_images": [
            (
                {"url": p, "caption": None, "tags": [], "is_cover": i == 0}
                if isinstance(p, str)
                else {
                    "url": p.get("url"),
                    "caption": p.get("caption"),
                    "tags": p.get("tags", []) or [],
                    "is_cover": bool(p.get("is_cover")),
                }
            )
            for i, p in enumerate(doc.get("portfolio_images", []) or [])
        ],
        "is_manually_deactivated": bool(doc.get("is_manually_deactivated")),
        "is_deleted": bool(doc.get("is_deleted")),
        "manually_deactivated_at": doc.get("manually_deactivated_at"),
        "last_paid_at": doc.get("last_paid_at"),
        "verification_status": doc.get("verification_status", "unverified"),
        "is_verified": doc.get("verification_status") == "verified",
        "is_flagged": bool(doc.get("is_flagged")),
        "search_penalty": doc.get("search_penalty", 0),
        "phone_verified": bool(doc.get("phone_verified")),
    }
    if not public:
        out["email"] = doc["email"]
        out["phone"] = doc.get("phone")
        out["verification_documents"] = doc.get("verification_documents", [])
        out["verification_reject_reason"] = doc.get("verification_reject_reason")
        out["verification_submitted_at"] = doc.get("verification_submitted_at")
        out["verification_reviewed_at"] = doc.get("verification_reviewed_at")
        out["is_admin"] = bool(doc.get("is_admin"))
    return out
