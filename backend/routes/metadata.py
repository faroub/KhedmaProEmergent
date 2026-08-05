"""Static reference endpoints: /categories, /wilayas, / (root)."""
from fastapi import APIRouter

from database import db
from reference_data import CATEGORIES, WILAYAS

router = APIRouter(tags=["metadata"])


@router.get("/categories")
async def list_categories():
    """List active categories from the DB.

    Each doc includes tri-language names so the client can render immediately
    without needing static translation keys. Falls back to the hardcoded
    reference list if the DB collection is empty (safety net).
    """
    docs = await db.categories.find(
        {"active": True}, {"_id": 0}
    ).sort("order", 1).to_list(200)
    if docs:
        return docs
    # Fallback — should only happen on very first request before startup seed.
    return [
        {
            "id": c["id"],
            "icon": c["icon"],
            "name_en": c["name"],
            "name_fr": c["name"],
            "name_ar": c["name"],
            "order": i,
            "active": True,
        }
        for i, c in enumerate(CATEGORIES)
    ]


@router.get("/wilayas")
async def list_wilayas():
    return WILAYAS


@router.get("/")
async def root():
    return {"message": "khedmaPro API", "status": "ok"}
