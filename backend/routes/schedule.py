"""Provider schedule GET/PUT with default working hours."""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends

from database import db
from deps import require_role
from reference_data import DEFAULT_HOURS
from schemas import Role, ScheduleIn

router = APIRouter(tags=["schedule"])


@router.get("/schedule/{provider_id}")
async def get_schedule(provider_id: str):
    doc = await db.schedules.find_one({"provider_id": provider_id}, {"_id": 0})
    if not doc:
        return {
            "provider_id": provider_id,
            "working_hours": DEFAULT_HOURS,
            "breaks": {},
            "vacation_days": [],
        }
    return doc


@router.put("/schedule")
async def set_schedule(
    body: ScheduleIn,
    user: Annotated[dict, Depends(require_role(Role.service_provider))],
):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "provider_id": user["id"],
        "working_hours": body.working_hours,
        "breaks": body.breaks,
        "vacation_days": body.vacation_days,
        "updated_at": now,
    }
    await db.schedules.update_one({"provider_id": user["id"]}, {"$set": doc}, upsert=True)
    return doc
