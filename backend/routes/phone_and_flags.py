"""Phone-number reveal (behind bookings) + admin flag management."""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import current_user, require_admin

router = APIRouter(tags=["phone-and-flags"])


REVEAL_STATUSES = {"confirmed", "awaiting_confirmation", "completed"}


@router.get("/users/{other_id}/phone")
async def reveal_phone(other_id: str, user: Annotated[dict, Depends(current_user)]):
    """Return the counterpart's phone ONLY if a mutually-confirmed booking exists.
    Every successful reveal is logged for abuse detection."""
    if other_id == user["id"]:
        raise HTTPException(status_code=400, detail="That's your own phone")

    # Find any booking between the two parties that has crossed the "confirmed" barrier.
    q = {
        "status": {"$in": list(REVEAL_STATUSES)},
        "$or": [
            {"provider_id": user["id"], "client_id": other_id},
            {"provider_id": other_id, "client_id": user["id"]},
        ],
    }
    booking = await db.bookings.find_one(q, {"_id": 0, "id": 1, "status": 1})
    if not booking:
        raise HTTPException(status_code=403, detail="Phone will be visible once the booking is confirmed")

    other = await db.users.find_one({"id": other_id}, {"_id": 0, "phone": 1, "full_name": 1})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    await db.phone_reveals.insert_one({
        "viewer_id": user["id"],
        "target_id": other_id,
        "booking_id": booking["id"],
        "revealed_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"phone": other.get("phone"), "full_name": other.get("full_name")}


# ---- Admin flag management ----
@router.get("/admin/flags")
async def list_flags(user: Annotated[dict, Depends(current_user)]):
    require_admin(user)
    rows = await db.flags.find({"resolved": False}, {"_id": 0}).sort("flagged_at", -1).to_list(200)
    # Attach provider name/email for the queue UI.
    out = []
    for r in rows:
        p = await db.users.find_one({"id": r["provider_id"]}, {"_id": 0, "full_name": 1, "email": 1, "category": 1, "completion_rate": 1})
        if p:
            r.update({"full_name": p.get("full_name"), "email": p.get("email"),
                      "category": p.get("category"), "completion_rate": p.get("completion_rate")})
        out.append(r)
    return out


@router.post("/admin/flags/{provider_id}/clear")
async def clear_flag(provider_id: str, user: Annotated[dict, Depends(current_user)]):
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.flags.update_many(
        {"provider_id": provider_id, "resolved": False},
        {"$set": {"resolved": True, "resolved_at": now_iso, "resolved_by": user["id"]}},
    )
    await db.users.update_one(
        {"id": provider_id},
        {"$set": {
            "is_flagged": False,
            "search_penalty": 0,
            "is_manually_deactivated": False,
            "manually_deactivated_at": None,
            "deactivated_reason": None,
        }},
    )
    return {"success": True}
