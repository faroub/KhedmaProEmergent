"""Dynamic categories collection + admin CRUD.

The initial seed is done on app startup (see `server.py`) from the static
`CATEGORIES` list. After the first boot, admins can add / edit / remove
categories at runtime via these endpoints.

Each stored doc:
{
  id: str,           # slug (unique)
  icon: str,         # Ionicons name (e.g. "brush", "hammer")
  name_en: str,
  name_fr: str,
  name_ar: str,
  order: int,
  active: bool,
}
"""
import io
import json
import re
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from database import db
from deps import current_user, require_admin

router = APIRouter(tags=["admin-categories"])


# ---------- Pydantic ----------
_SLUG_RE = re.compile(r"^[a-z0-9_\-]{2,40}$")


class CategoryIn(BaseModel):
    id: str = Field(min_length=2, max_length=40)
    icon: str = Field(min_length=1, max_length=40)
    name_en: str = Field(min_length=1, max_length=60)
    name_fr: str = Field(min_length=1, max_length=60)
    name_ar: str = Field(min_length=1, max_length=60)
    order: Optional[int] = None
    active: bool = True

    @field_validator("id")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not _SLUG_RE.match(v):
            raise ValueError("id must be lowercase letters/digits/dashes/underscores, 2-40 chars")
        return v


class CategoryPatch(BaseModel):
    icon: Optional[str] = Field(default=None, min_length=1, max_length=40)
    name_en: Optional[str] = Field(default=None, min_length=1, max_length=60)
    name_fr: Optional[str] = Field(default=None, min_length=1, max_length=60)
    name_ar: Optional[str] = Field(default=None, min_length=1, max_length=60)
    order: Optional[int] = None
    active: Optional[bool] = None


class ReorderIn(BaseModel):
    order: list[str]  # list of category ids in the desired order


# ---------- Helpers ----------
def _sanitize(doc: dict) -> dict:
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


# ---------- Admin endpoints ----------
@router.get("/admin/categories")
async def admin_list_categories(user: Annotated[dict, Depends(current_user)]):
    require_admin(user)
    docs = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    return docs


@router.post("/admin/categories", status_code=201)
async def admin_create_category(
    body: CategoryIn,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    existing = await db.categories.find_one({"id": body.id}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=409, detail="Category id already exists")
    now_iso = datetime.now(timezone.utc).isoformat()
    order = body.order
    if order is None:
        # Append at the end.
        last = await db.categories.find({}, {"_id": 0, "order": 1}).sort("order", -1).limit(1).to_list(1)
        order = ((last[0]["order"] if last else -1) + 1)
    doc = {
        **body.model_dump(),
        "order": order,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.categories.insert_one(dict(doc))
    return _sanitize(doc)


@router.patch("/admin/categories/{cat_id}")
async def admin_update_category(
    cat_id: str,
    body: CategoryPatch,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.categories.update_one({"id": cat_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    doc = await db.categories.find_one({"id": cat_id}, {"_id": 0})
    return doc


@router.delete("/admin/categories/{cat_id}")
async def admin_delete_category(
    cat_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    # Guard: block deletion if any provider still uses this category.
    in_use = await db.users.count_documents({"category": cat_id})
    if in_use > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Category is used by {in_use} provider(s). Deactivate instead.",
        )
    res = await db.categories.delete_one({"id": cat_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"success": True}


@router.post("/admin/categories/reorder")
async def admin_reorder_categories(
    body: ReorderIn,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()
    for idx, cat_id in enumerate(body.order):
        await db.categories.update_one(
            {"id": cat_id},
            {"$set": {"order": idx, "updated_at": now_iso}},
        )
    docs = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    return docs


# ---------- Import / Export ----------
@router.get("/admin/categories/export")
async def admin_export_categories(user: Annotated[dict, Depends(current_user)]):
    """Download all categories as a JSON file (for backup / bulk edit)."""
    require_admin(user)
    docs = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(500)
    # Strip audit fields so the file is easy to hand-edit.
    clean = [
        {k: v for k, v in d.items() if k not in {"created_at", "updated_at"}}
        for d in docs
    ]
    payload = json.dumps(clean, ensure_ascii=False, indent=2)
    fname = f"khedmapro_categories_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


class ImportIn(BaseModel):
    """Bulk import categories. `mode`:
    - `merge` (default): upsert by id, do not delete existing ones missing from the payload
    - `replace`: delete every existing category not in the payload, then upsert all
    """
    categories: list[CategoryIn]
    mode: str = Field(default="merge", pattern="^(merge|replace)$")


@router.post("/admin/categories/import")
async def admin_import_categories(
    body: ImportIn,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()

    incoming_ids = {c.id for c in body.categories}
    stats = {"created": 0, "updated": 0, "removed": 0, "skipped_in_use": 0}

    if body.mode == "replace":
        # Only remove existing categories that are (a) not in the incoming payload
        # AND (b) not currently in use by any provider.
        existing = await db.categories.find({}, {"_id": 0, "id": 1}).to_list(500)
        for e in existing:
            if e["id"] in incoming_ids:
                continue
            in_use = await db.users.count_documents({"category": e["id"]})
            if in_use > 0:
                stats["skipped_in_use"] += 1
                continue
            await db.categories.delete_one({"id": e["id"]})
            stats["removed"] += 1

    for cat in body.categories:
        existing = await db.categories.find_one({"id": cat.id}, {"_id": 0, "id": 1})
        doc = {**cat.model_dump(), "updated_at": now_iso}
        if cat.order is None:
            doc.pop("order", None)
        if existing:
            await db.categories.update_one({"id": cat.id}, {"$set": doc})
            stats["updated"] += 1
        else:
            doc.setdefault("order", len(await db.categories.find({}, {"_id": 0, "order": 1}).to_list(500)))
            doc["created_at"] = now_iso
            await db.categories.insert_one(dict(doc))
            stats["created"] += 1

    return {"success": True, "stats": stats}
