"""Booking creation + listing + status transitions."""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import current_user, optional_current_user
from schemas import BookingCreate, BookingStatus, BookingStatusUpdate, Role
from subscription import compute_subscription, enforce_lifecycle

router = APIRouter(tags=["bookings"])


@router.post("/bookings", status_code=201)
async def create_booking(
    body: BookingCreate,
    user: Annotated[Optional[dict], Depends(optional_current_user)],
):
    provider = await db.users.find_one(
        {"id": body.provider_id, "role": Role.service_provider.value}, {"_id": 0}
    )
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    provider = await enforce_lifecycle(provider)
    if provider.get("is_deleted") or provider.get("is_manually_deactivated"):
        raise HTTPException(status_code=410, detail="This provider is no longer available")
    prov_sub = compute_subscription(provider)
    if not prov_sub["active"]:
        raise HTTPException(status_code=410, detail="This provider's subscription is inactive")

    # Determine client identity: logged-in client OR guest.
    if user and user["role"] == Role.client.value:
        client_id = user["id"]
        client_name = user["full_name"]
        client_phone = user.get("phone")
        client_email = user["email"]
        is_guest = False
    elif user and user["role"] == Role.service_provider.value:
        raise HTTPException(status_code=403, detail="Providers cannot book services")
    else:
        if not body.guest_name or not body.guest_phone:
            raise HTTPException(status_code=400, detail="Guest name and phone are required")
        client_id = f"guest:{uuid.uuid4()}"
        client_name = body.guest_name
        client_phone = body.guest_phone
        client_email = body.guest_email
        is_guest = True

    booking_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rate = provider.get("hourly_rate") if body.rate_type == "hourly" else provider.get("task_rate")
    estimated_total = None
    if rate and body.rate_type == "hourly" and body.estimated_hours:
        estimated_total = rate * body.estimated_hours
    elif rate and body.rate_type == "task":
        estimated_total = rate

    doc = {
        "id": booking_id,
        "client_id": client_id,
        "client_name": client_name,
        "client_phone": client_phone,
        "client_email": client_email,
        "is_guest": is_guest,
        "provider_id": body.provider_id,
        "provider_name": provider["full_name"],
        "provider_category": provider.get("category"),
        "provider_avatar": provider.get("avatar_url"),
        "scheduled_date": body.scheduled_date,
        "task_description": body.task_description,
        "address": body.address,
        "rate_type": body.rate_type,
        "estimated_hours": body.estimated_hours,
        "estimated_total": estimated_total,
        "status": BookingStatus.pending.value,
        "created_at": now,
        "reviewed": False,
        "booking_type": body.booking_type if body.booking_type in ("instant", "quote") else "instant",
        "location_lat": body.location_lat,
        "location_lng": body.location_lng,
        "wilaya_code": body.wilaya_code,
        "baladiya": body.baladiya,
    }
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/bookings/mine")
async def my_bookings(user: Annotated[dict, Depends(current_user)]):
    if user["role"] == Role.client.value:
        query = {"client_id": user["id"]}
    else:
        query = {"provider_id": user["id"]}
    docs = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.patch("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: str,
    body: BookingStatusUpdate,
    user: Annotated[dict, Depends(current_user)],
):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if user["role"] == Role.service_provider.value:
        if booking["provider_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your booking")
    else:
        if booking["client_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your booking")
        if body.status != BookingStatus.cancelled:
            raise HTTPException(status_code=403, detail="Clients can only cancel")

    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": body.status.value}})
    booking["status"] = body.status.value
    return booking
