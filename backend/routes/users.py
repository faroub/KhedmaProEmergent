"""Users: profile completion, portfolio, manual account lifecycle."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException

from config import MAX_IMAGE_BYTES
from database import db
from deps import current_user, require_role
from schemas import PortfolioUpdateIn, ProfileCompleteIn, Role
from subscription import serialize_user

router = APIRouter(tags=["users"])


@router.patch("/users/me/profile")
async def complete_profile(
    body: ProfileCompleteIn,
    user: Annotated[dict, Depends(current_user)],
):
    update: dict = {"full_name": body.full_name, "profile_complete": True}
    if body.city is not None:
        update["city"] = body.city
    if body.wilaya_code is not None:
        update["wilaya_code"] = body.wilaya_code
    if body.baladiya is not None:
        update["baladiya"] = body.baladiya
    if body.cross_wilaya is not None:
        update["cross_wilaya"] = body.cross_wilaya
    if body.location_lat is not None:
        update["location_lat"] = body.location_lat
    if body.location_lng is not None:
        update["location_lng"] = body.location_lng
    if user["role"] == Role.service_provider.value:
        if not body.category:
            raise HTTPException(status_code=400, detail="Category required for providers")
        update["category"] = body.category
        if body.bio is not None:
            update["bio"] = body.bio
        if body.hourly_rate is not None:
            update["hourly_rate"] = body.hourly_rate
        if body.task_rate is not None:
            update["task_rate"] = body.task_rate
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return serialize_user(updated)


@router.patch("/users/me/portfolio")
async def set_portfolio(
    body: PortfolioUpdateIn,
    user: Annotated[dict, Depends(require_role(Role.service_provider))],
):
    normalized: list[dict] = []
    cover_index: Optional[int] = None
    for idx, img in enumerate(body.portfolio_images):
        if isinstance(img, str):
            url = img
            item = {"url": url, "caption": None, "tags": [], "is_cover": False}
        else:
            url = img.url
            item = {
                "url": img.url,
                "caption": img.caption,
                "tags": img.tags or [],
                "is_cover": bool(img.is_cover),
            }
        if len(url) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image too large, please compress further")
        if item["is_cover"] and cover_index is None:
            cover_index = idx
        normalized.append(item)
    if cover_index is not None:
        for i, it in enumerate(normalized):
            it["is_cover"] = i == cover_index
    elif normalized:
        normalized[0]["is_cover"] = True

    await db.users.update_one({"id": user["id"]}, {"$set": {"portfolio_images": normalized}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"portfolio_images": updated.get("portfolio_images", [])}


# ---- Manual account lifecycle (both roles) ----
@router.post("/users/me/deactivate")
async def deactivate_account(user: Annotated[dict, Depends(current_user)]):
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"is_manually_deactivated": True, "manually_deactivated_at": now_iso}},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"success": True, "user": serialize_user(updated)}


@router.post("/users/me/reactivate")
async def reactivate_account(user: Annotated[dict, Depends(current_user)]):
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"is_manually_deactivated": False, "manually_deactivated_at": None}},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"success": True, "user": serialize_user(updated)}


@router.post("/users/me/delete")
async def delete_account(user: Annotated[dict, Depends(current_user)]):
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "is_deleted": True,
            "deleted_at": now_iso,
            "deleted_reason": "user_requested",
            "is_manually_deactivated": True,
        }},
    )
    return {"success": True, "id": user["id"], "deleted_at": now_iso}
