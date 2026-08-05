"""Partner ads / promotional banners shown on the client Home screen.

Public read endpoint returns only active ads (respecting optional start/end
windows). Admin CRUD lets platform owners add, edit, reorder, toggle and
delete banner content. Impressions and clicks are tracked with lightweight
$inc updates (fire-and-forget from the client).

Stored doc:
{
  id: str,             # uuid
  title: str,
  subtitle: str | None,
  image_url: str,      # http(s) URL or data:image/... (base64)
  link_url: str | None,
  active: bool,
  order: int,
  start_at: iso | None,
  end_at: iso | None,
  impressions: int,
  clicks: int,
  created_at: iso,
  updated_at: iso,
}
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from deps import current_user, require_admin

router = APIRouter(tags=["ads"])


# ---------- Schemas ----------
class AdIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    subtitle: Optional[str] = Field(default=None, max_length=140)
    image_url: str = Field(min_length=1)
    link_url: Optional[str] = None
    order: Optional[int] = None
    active: bool = True
    start_at: Optional[str] = None  # iso timestamp
    end_at: Optional[str] = None    # iso timestamp
    impression_cap: Optional[int] = Field(default=None, ge=1)  # auto-pause once reached


class AdPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=80)
    subtitle: Optional[str] = Field(default=None, max_length=140)
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    order: Optional[int] = None
    active: Optional[bool] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    impression_cap: Optional[int] = Field(default=None, ge=0)  # 0 or None = uncapped


class ReorderIn(BaseModel):
    order: list[str]


# ---------- Public: list active ads ----------
@router.get("/ads")
async def public_list_ads():
    now_iso = datetime.now(timezone.utc).isoformat()
    filt = {
        "active": True,
        "$and": [
            {"$or": [{"start_at": None}, {"start_at": {"$exists": False}}, {"start_at": {"$lte": now_iso}}]},
            {"$or": [{"end_at": None}, {"end_at": {"$exists": False}}, {"end_at": {"$gte": now_iso}}]},
        ],
    }
    docs = await db.ads.find(filt, {"_id": 0}).sort("order", 1).to_list(50)
    # Auto-pause ads that reached their impression cap.
    out: list[dict] = []
    for d in docs:
        cap = d.get("impression_cap")
        if cap and int(d.get("impressions", 0)) >= int(cap):
            continue
        out.append(d)
    return out


@router.post("/ads/{ad_id}/impression", status_code=204)
async def ad_impression(ad_id: str):
    """Fire-and-forget impression counter — no auth required."""
    await db.ads.update_one({"id": ad_id}, {"$inc": {"impressions": 1}})
    return None


@router.post("/ads/{ad_id}/click", status_code=204)
async def ad_click(ad_id: str):
    """Fire-and-forget click counter — no auth required."""
    await db.ads.update_one({"id": ad_id}, {"$inc": {"clicks": 1}})
    return None


# ---------- Admin CRUD ----------
@router.get("/admin/ads")
async def admin_list_ads(user: Annotated[dict, Depends(current_user)]):
    require_admin(user)
    docs = await db.ads.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    return docs


@router.post("/admin/ads", status_code=201)
async def admin_create_ad(
    body: AdIn,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()
    order = body.order
    if order is None:
        last = await db.ads.find({}, {"_id": 0, "order": 1}).sort("order", -1).limit(1).to_list(1)
        order = ((last[0]["order"] if last else -1) + 1)
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "order": order,
        "impressions": 0,
        "clicks": 0,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.ads.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.patch("/admin/ads/{ad_id}")
async def admin_update_ad(
    ad_id: str,
    body: AdPatch,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.ads.update_one({"id": ad_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ad not found")
    doc = await db.ads.find_one({"id": ad_id}, {"_id": 0})
    return doc


@router.delete("/admin/ads/{ad_id}")
async def admin_delete_ad(
    ad_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    res = await db.ads.delete_one({"id": ad_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ad not found")
    return {"success": True}


@router.post("/admin/ads/reorder")
async def admin_reorder_ads(
    body: ReorderIn,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()
    for idx, ad_id in enumerate(body.order):
        await db.ads.update_one({"id": ad_id}, {"$set": {"order": idx, "updated_at": now_iso}})
    docs = await db.ads.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    return docs
