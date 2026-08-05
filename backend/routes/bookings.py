"""Booking creation + listing + status transitions."""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException

from config import (
    FLAG_CONFIRMED_WINDOW_DAYS,
    FLAG_CONSECUTIVE_NO_COMPLETE,
    FLAG_MIN_COMPLETION_RATE,
    FLAG_RATE_WINDOW,
)
from database import db
from deps import current_user, optional_current_user
from routes.push import send_push
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

    # Notify the provider about the new booking (non-blocking).
    try:
        await send_push(
            recipients=[body.provider_id],
            data={
                "title": "New booking request",
                "message": f"{client_name} requested: {body.task_description[:80]}",
                "action_url": "/(provider)/bookings",
            },
            idempotency_key=f"booking-new:{booking_id}",
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Push failed (non-blocking): %s", e)

    return doc


@router.get("/bookings/mine")
async def my_bookings(user: Annotated[dict, Depends(current_user)]):
    if user["role"] == Role.client.value:
        query = {"client_id": user["id"]}
    else:
        query = {"provider_id": user["id"]}
    docs = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Strip counterpart phone unless booking has been mutually confirmed.
    for d in docs:
        if d.get("status") in ("pending", "cancelled"):
            if user["role"] == Role.client.value:
                d["provider_phone_hidden"] = True
            else:
                d["client_phone"] = None  # not revealed to provider until confirmed
                d["client_phone_hidden"] = True
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

    now_iso = datetime.now(timezone.utc).isoformat()
    updates: dict = {}
    new_status = body.status.value

    if user["role"] == Role.service_provider.value:
        if booking["provider_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your booking")
        # Best-effort phone verification: providers cannot confirm bookings
        # (or mark them done) until they verify their phone number. Cancels
        # remain allowed — never dead-end the user.
        if (
            new_status
            in (
                BookingStatus.confirmed.value,
                BookingStatus.completed.value,  # would become awaiting_confirmation
                BookingStatus.awaiting_confirmation.value,
            )
            and not user.get("phone_verified")
        ):
            raise HTTPException(
                status_code=403,
                detail="Please verify your phone number to accept bookings",
            )
        # Provider: pending→confirmed, confirmed→awaiting_confirmation (was completed), any→cancelled
        if new_status == BookingStatus.completed.value:
            # Provider "completing" now means they marked their side done; wait for client.
            if booking["status"] != BookingStatus.confirmed.value:
                raise HTTPException(status_code=400, detail="Booking must be confirmed first")
            new_status = BookingStatus.awaiting_confirmation.value
            updates["provider_marked_done_at"] = now_iso
        elif new_status == BookingStatus.confirmed.value:
            updates["confirmed_at"] = now_iso
    else:
        if booking["client_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your booking")
        if new_status == BookingStatus.completed.value:
            # Client can complete only after provider marked done.
            if booking["status"] != BookingStatus.awaiting_confirmation.value:
                raise HTTPException(status_code=400, detail="Provider hasn't marked the work done yet")
            updates["client_confirmed_done_at"] = now_iso
        elif new_status != BookingStatus.cancelled.value:
            raise HTTPException(status_code=403, detail="Clients can only cancel or confirm completion")

    updates["status"] = new_status
    await db.bookings.update_one({"id": booking_id}, {"$set": updates})
    booking.update(updates)

    # Bump provider `last_activity_at` for the ranking recency bonus whenever
    # they confirm / complete / cancel a booking.
    if user["role"] == Role.service_provider.value and new_status in (
        BookingStatus.confirmed.value,
        BookingStatus.awaiting_confirmation.value,
        BookingStatus.completed.value,
        BookingStatus.cancelled.value,
    ):
        try:
            from datetime import datetime, timezone  # local import — avoid module top-level clutter
            await db.users.update_one(
                {"id": booking["provider_id"]},
                {"$set": {"last_activity_at": datetime.now(timezone.utc).isoformat()}},
            )
        except Exception:
            pass

    # Notify the counterpart about the status change (non-blocking).
    try:
        _messages = {
            BookingStatus.confirmed.value: ("Booking confirmed", "Your provider confirmed the booking."),
            BookingStatus.awaiting_confirmation.value: ("Work marked done", "Please confirm the work is complete."),
            BookingStatus.completed.value: ("Booking completed", "The booking has been marked completed."),
            BookingStatus.cancelled.value: ("Booking cancelled", "The booking was cancelled."),
        }
        title_msg = _messages.get(new_status)
        if title_msg:
            # Recipient is the OTHER party.
            recipient_id = (
                booking["client_id"]
                if user["role"] == Role.service_provider.value
                else booking["provider_id"]
            )
            await send_push(
                recipients=[recipient_id],
                data={
                    "title": title_msg[0],
                    "message": title_msg[1],
                    "action_url": (
                        "/(client)/bookings" if user["role"] == Role.service_provider.value
                        else "/(provider)/bookings"
                    ),
                },
                idempotency_key=f"booking-status:{booking_id}:{new_status}",
            )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Push failed (non-blocking): %s", e)

    # If terminal state, recompute completion metrics + auto-flag if needed.
    if new_status in (BookingStatus.completed.value, BookingStatus.cancelled.value):
        await _recompute_and_maybe_flag(booking["provider_id"])

    return booking


async def _recompute_and_maybe_flag(provider_id: str):
    """Recompute completion rate + auto-flag on breach (all 3 penalties)."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    docs = await db.bookings.find(
        {"provider_id": provider_id, "status": {"$in": ["confirmed", "awaiting_confirmation", "completed", "cancelled"]}},
        {"_id": 0, "status": 1, "confirmed_at": 1, "created_at": 1, "client_confirmed_done_at": 1},
    ).sort("created_at", -1).to_list(200)

    last_n = docs[:FLAG_RATE_WINDOW]
    confirmed_or_more = [b for b in last_n if b["status"] in ("confirmed", "awaiting_confirmation", "completed", "cancelled")]
    completed = [b for b in confirmed_or_more if b["status"] == "completed"]
    rate = (len(completed) / len(confirmed_or_more)) if confirmed_or_more else 1.0

    # Consecutive: newest-first, count how many "confirmed" or "awaiting_confirmation" older than window we hit
    threshold = now - timedelta(days=FLAG_CONFIRMED_WINDOW_DAYS)
    consecutive_stale = 0
    for b in docs:
        if b["status"] == "completed":
            break
        if b["status"] in ("confirmed", "awaiting_confirmation"):
            ca = b.get("confirmed_at") or b.get("created_at")
            if isinstance(ca, str):
                try:
                    ca_dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                except Exception:
                    ca_dt = None
            else:
                ca_dt = ca
            if ca_dt and ca_dt < threshold:
                consecutive_stale += 1

    should_flag = (
        consecutive_stale >= FLAG_CONSECUTIVE_NO_COMPLETE
        or (len(confirmed_or_more) >= FLAG_RATE_WINDOW and rate < FLAG_MIN_COMPLETION_RATE)
    )
    updates = {
        "completion_rate": round(rate, 2),
        "completed_count_window": len(completed),
        "confirmed_count_window": len(confirmed_or_more),
    }
    if should_flag:
        reason = (
            f"{consecutive_stale} stale confirmed bookings" if consecutive_stale >= FLAG_CONSECUTIVE_NO_COMPLETE
            else f"completion rate {rate:.0%} < 60%"
        )
        updates.update({
            "is_flagged": True,
            "flagged_at": now.isoformat(),
            "flag_reason": reason,
            "search_penalty": 100,
            "is_manually_deactivated": True,
            "manually_deactivated_at": now.isoformat(),
            "deactivated_reason": "flagged_auto",
        })
        # Add flag row for admin queue (upsert-style).
        await db.flags.update_one(
            {"provider_id": provider_id, "resolved": False},
            {"$set": {
                "provider_id": provider_id,
                "reason": reason,
                "flagged_at": now.isoformat(),
                "resolved": False,
            }},
            upsert=True,
        )
    await db.users.update_one({"id": provider_id}, {"$set": updates})
