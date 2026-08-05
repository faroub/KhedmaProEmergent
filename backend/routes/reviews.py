"""Client → Provider reviews."""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import require_role
from routes.push import send_push
from schemas import BookingStatus, ReviewCreate, Role

router = APIRouter(tags=["reviews"])


@router.post("/reviews", status_code=201)
async def create_review(
    body: ReviewCreate,
    user: Annotated[dict, Depends(require_role(Role.client))],
):
    # Two modes: review tied to a completed booking, or a direct provider review.
    provider_id: Optional[str] = None
    booking = None
    if body.booking_id:
        booking = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking["client_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your booking")
        if booking["status"] != BookingStatus.completed.value:
            raise HTTPException(status_code=400, detail="Booking must be completed to review")
        if booking.get("reviewed"):
            raise HTTPException(status_code=409, detail="Booking already reviewed")
        provider_id = booking["provider_id"]
    elif body.provider_id:
        prov = await db.users.find_one(
            {"id": body.provider_id, "role": Role.service_provider.value}, {"_id": 0}
        )
        if not prov:
            raise HTTPException(status_code=404, detail="Provider not found")
        existing = await db.reviews.find_one(
            {"provider_id": body.provider_id, "client_id": user["id"], "booking_id": None},
            {"_id": 0},
        )
        if existing:
            raise HTTPException(status_code=409, detail="You already reviewed this provider")
        provider_id = body.provider_id
    else:
        raise HTTPException(status_code=400, detail="booking_id or provider_id required")

    review_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Sanitize photos: strict data-URI cap so a malicious client can't push
    # a 20 MB blob per photo. ~350 KB per photo is well above what our client
    # compressor produces (~200 KB target).
    raw_photos = (body.photos or [])[:3]
    photos: list[str] = []
    for p in raw_photos:
        if not isinstance(p, str) or not p.startswith("data:image/"):
            continue
        if len(p) > 500_000:  # ~350 KB base64 payload cap
            raise HTTPException(status_code=413, detail="Photo too large — compress before upload")
        photos.append(p)

    doc = {
        "id": review_id,
        "booking_id": body.booking_id,
        "provider_id": provider_id,
        "client_id": user["id"],
        "client_name": user["full_name"],
        "rating": body.rating,
        "comment": body.comment,
        "photos": photos,
        "created_at": now_iso,
    }
    await db.reviews.insert_one(doc)
    if booking:
        await db.bookings.update_one({"id": body.booking_id}, {"$set": {"reviewed": True}})

    # Recompute provider rating.
    all_reviews = await db.reviews.find({"provider_id": provider_id}, {"_id": 0}).to_list(2000)
    total = sum(r["rating"] for r in all_reviews)
    count = len(all_reviews)
    avg = total / count if count else 0
    await db.users.update_one(
        {"id": provider_id},
        {"$set": {
            "rating": round(avg, 2),
            "reviews_count": count,
            # A fresh review counts as provider activity → bump for ranking recency.
            "last_activity_at": now_iso,
        }},
    )
    doc.pop("_id", None)

    # Notify provider of the new review (non-blocking).
    try:
        stars = "★" * int(round(body.rating))
        await send_push(
            recipients=[provider_id],
            data={
                "title": f"New review {stars}",
                "message": (body.comment or f"{user['full_name']} rated you {body.rating}/5")[:120],
                "action_url": "/(provider)/profile",
            },
            idempotency_key=f"review:{review_id}",
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Push failed (non-blocking): %s", e)

    return doc
