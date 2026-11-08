"""Provider listing + detail + provider reviews list."""
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from database import db
from schemas import Role
from subscription import enforce_lifecycle, serialize_user

router = APIRouter(tags=["providers"])


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two GPS points in kilometers."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _distance_band(km: float, step_km: float = 5.0) -> float:
    """Coarse upper-bound band (multiple of `step_km`) so the exact position
    cannot be recovered from the distance (M16)."""
    return step_km * max(1, math.ceil(km / step_km))


def _recency_bonus(last_activity_at: Optional[str], window_days: int = 30, max_bonus: float = 0.20) -> float:
    """Tiny bonus (0.0–max_bonus) for providers with recent activity, decaying
    linearly across `window_days`. Keeps active pros from being buried under
    dormant top-rated ones."""
    if not last_activity_at:
        return 0.0
    try:
        if isinstance(last_activity_at, str):
            dt = datetime.fromisoformat(last_activity_at.replace("Z", "+00:00"))
        else:
            dt = last_activity_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        return 0.0
    days = (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0
    if days < 0:
        return max_bonus
    if days >= window_days:
        return 0.0
    return max_bonus * (1.0 - (days / window_days))


@router.get("/providers")
async def list_providers(
    category: Optional[str] = None,
    search: Optional[str] = None,
    wilaya: Optional[str] = None,
    # Location-based radius search. When both lat/lng AND radius_km are given,
    # only providers with a pinned service area within `radius_km` of the client
    # are returned. `wilaya` may still be combined to narrow further.
    lat: Optional[float] = Query(default=None, ge=-90, le=90),
    lng: Optional[float] = Query(default=None, ge=-180, le=180),
    radius_km: Optional[float] = Query(default=None, gt=0, le=500),
    # Price range in DZD on hourly_rate. min/max inclusive; open-ended if omitted.
    min_price: Optional[float] = Query(default=None, ge=0),
    max_price: Optional[float] = Query(default=None, ge=0),
    verified_only: Optional[bool] = Query(default=None),
    new_only: Optional[bool] = Query(default=None),
    # Client-driven ordering. Falls back to legacy behavior (distance in radius mode,
    # rating otherwise) when omitted or set to "auto".
    sort: Optional[str] = Query(
        default=None, regex="^(auto|rating|distance|price_asc|price_desc|newest)$"
    ),
):
    query = {
        "role": Role.service_provider.value,
        "$and": [
            {"$or": [{"is_deleted": {"$exists": False}}, {"is_deleted": False}]},
            {"$or": [{"is_manually_deactivated": {"$exists": False}}, {"is_manually_deactivated": False}]},
        ],
    }
    if category:
        query["category"] = category
    if wilaya:
        query["$and"].append({"$or": [{"wilaya_code": wilaya}, {"cross_wilaya": True}]})
    if search:
        # re.escape: search input is a literal string, never a regex —
        # unescaped input made "." a wildcard and allowed catastrophic
        # patterns to burn database CPU.
        esc = re.escape(search)
        query["$and"].append({"$or": [
            {"full_name": {"$regex": esc, "$options": "i"}},
            {"bio": {"$regex": esc, "$options": "i"}},
            {"city": {"$regex": esc, "$options": "i"}},
            {"baladiya": {"$regex": esc, "$options": "i"}},
        ]})

    radius_mode = lat is not None and lng is not None and radius_km is not None
    if radius_mode:
        # Cheap first-pass narrowing: providers must at least have coordinates.
        query["$and"].append({"location_lat": {"$ne": None}, "location_lng": {"$ne": None}})

    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(500)

    result: list[dict] = []
    # Parallel flags: search_penalty is honored when sorting but is no longer
    # included in public responses (internal moderation state).
    penalties: list[bool] = []
    for d in docs:
        d = await enforce_lifecycle(d)
        if d.get("is_deleted"):
            continue
        s = serialize_user(d, public=True)
        if not s["active"]:
            continue
        if verified_only and not s.get("is_verified"):
            continue
        if new_only and not s.get("is_new"):
            continue
        # Price range filter on hourly_rate. Providers with no hourly_rate are
        # kept unless a bound is set (we can't compare to null).
        hr = s.get("hourly_rate")
        if min_price is not None and (hr is None or hr < min_price):
            continue
        if max_price is not None and (hr is None or hr > max_price):
            continue
        if radius_mode:
            # Distances come from the provider's REAL pinned location (the raw
            # doc — the public serialization below carries only the wilaya
            # centroid), and the response exposes only a coarse band so the
            # exact position cannot be recovered (M16).
            plat, plng = d.get("location_lat"), d.get("location_lng")
            if plat is None or plng is None:
                continue
            dist = _haversine_km(lat, lng, plat, plng)
            if dist > radius_km:
                continue
            s["distance_km"] = _distance_band(dist)
        result.append(s)
        penalties.append(bool(d.get("search_penalty")))

    # Sort: flagged providers always go last, THEN honor the user's explicit
    # `sort` if given, otherwise fall back to legacy behavior (distance ASC in
    # radius mode, weighted-rating DESC everywhere else).
    def _score(x: dict) -> float:
        """Bayesian-weighted rating + tiny recency bonus. Higher is better."""
        return float(x.get("weighted_rating") or 0.0) + _recency_bonus(x.get("last_activity_at"))

    ranked = list(zip(penalties, result))
    effective_sort = sort or "auto"
    if effective_sort == "auto":
        if radius_mode:
            ranked.sort(key=lambda t: (t[0], t[1].get("distance_km", 1e9)))
        else:
            ranked.sort(key=lambda t: (t[0], -_score(t[1])))
    elif effective_sort == "rating":
        ranked.sort(
            key=lambda t: (
                t[0],
                -_score(t[1]),
                -t[1].get("reviews_count", 0),
            )
        )
    elif effective_sort == "distance":
        # Providers without distance sink to the bottom (dist ~inf).
        ranked.sort(
            key=lambda t: (
                t[0],
                t[1].get("distance_km") if t[1].get("distance_km") is not None else 1e9,
            )
        )
    elif effective_sort == "price_asc":
        ranked.sort(
            key=lambda t: (
                t[0],
                t[1].get("hourly_rate") if t[1].get("hourly_rate") is not None else 1e12,
            )
        )
    elif effective_sort == "price_desc":
        ranked.sort(
            key=lambda t: (
                t[0],
                -(t[1].get("hourly_rate") if t[1].get("hourly_rate") is not None else -1),
            )
        )
    elif effective_sort == "newest":
        ranked.sort(key=lambda t: (t[0], -_iso_to_epoch(t[1].get("created_at"))))
    return [s for _, s in ranked]


def _iso_to_epoch(iso: Optional[str]) -> float:
    if not iso:
        return 0.0
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0.0


@router.get("/providers/{provider_id}")
async def get_provider(provider_id: str):
    doc = await db.users.find_one(
        {"id": provider_id, "role": Role.service_provider.value},
        {"_id": 0, "password_hash": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Provider not found")
    doc = await enforce_lifecycle(doc)
    if doc.get("is_deleted"):
        raise HTTPException(status_code=404, detail="Provider not found")
    # Fire-and-forget profile view counter (never blocks response).
    try:
        await db.users.update_one({"id": provider_id}, {"$inc": {"profile_views": 1}})
    except Exception:
        pass
    return serialize_user(doc, public=True)


@router.get("/providers/{provider_id}/reviews")
async def get_provider_reviews(provider_id: str):
    reviews = (
        await db.reviews.find({"provider_id": provider_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return reviews
