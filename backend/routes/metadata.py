"""Static reference endpoints: /categories, /wilayas, / (root)."""
from fastapi import APIRouter

from reference_data import CATEGORIES, WILAYAS

router = APIRouter(tags=["metadata"])


@router.get("/categories")
async def list_categories():
    return CATEGORIES


@router.get("/wilayas")
async def list_wilayas():
    return WILAYAS


@router.get("/")
async def root():
    return {"message": "khedmaPro API", "status": "ok"}
