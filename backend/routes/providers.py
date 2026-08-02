"""Provider listing + detail + provider reviews list."""
from typing import Optional

from fastapi import APIRouter, HTTPException

from database import db
from schemas import Role
from subscription import enforce_lifecycle, serialize_user

router = APIRouter(tags=["providers"])


@router.get("/providers")
async def list_providers(
    category: Optional[str] = None,
    search: Optional[str] = None,
    wilaya: Optional[str] = None,
):
    query = {
        "role": Role.service_provider.value,
        # Hide soft-deleted & manually-deactivated from the public marketplace.
        "$and": [
            {"$or": [{"is_deleted": {"$exists": False}}, {"is_deleted": False}]},
            {"$or": [{"is_manually_deactivated": {"$exists": False}}, {"is_manually_deactivated": False}]},
        ],
    }
    if category:
        query["category"] = category
    if wilaya:
        # Matches home-wilaya or providers who travel cross-wilaya.
        query["$and"].append({"$or": [{"wilaya_code": wilaya}, {"cross_wilaya": True}]})
    if search:
        query["$and"].append({"$or": [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"bio": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}},
            {"baladiya": {"$regex": search, "$options": "i"}},
        ]})
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(500)
    result = []
    for d in docs:
        d = await enforce_lifecycle(d)
        if d.get("is_deleted"):
            continue
        s = serialize_user(d, public=True)
        if s["active"]:
            result.append(s)
    result.sort(key=lambda x: x["rating"], reverse=True)
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
