"""Provider listing + detail + provider reviews list."""
import math
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
        query["$and"].append({"$or": [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"bio": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}},
            {"baladiya": {"$regex": search, "$options": "i"}},
        ]})

    radius_mode = lat is not None and lng is not None and radius_km is not None
    if radius_mode:
        # Cheap first-pass narrowing: providers must at least have coordinates.
        query["$and"].append({"location_lat": {"$ne": None}, "location_lng": {"$ne": None}})

    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(500)

    result = []
    for d in docs:
        d = await enforce_lifecycle(d)
        if d.get("is_deleted"):
            continue
        s = serialize_user(d, public=True)
        if not s["active"]:
            continue
        if radius_mode:
            plat, plng = s.get("location_lat"), s.get("location_lng")
            if plat is None or plng is None:
                continue
            dist = _haversine_km(lat, lng, plat, plng)
            if dist > radius_km:
                continue
            s["distance_km"] = round(dist, 2)
        result.append(s)

    # Sort: flagged providers (search_penalty > 0) go last; then by distance if in radius mode; else by rating desc.
    if radius_mode:
        result.sort(key=lambda x: (bool(x.get("search_penalty")), x.get("distance_km", 1e9)))
    else:
        result.sort(key=lambda x: (bool(x.get("search_penalty")), -x.get("rating", 0)))
    return result


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
    return serialize_user(doc, public=True)


@router.get("/providers/{provider_id}/reviews")
async def get_provider_reviews(provider_id: str):
    reviews = (
        await db.reviews.find({"provider_id": provider_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return reviews
