"""OTP-based phone auth (mock SMS in dev)."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import current_user
from phone import normalize_dz_phone, send_otp_code
from schemas import OtpRequestIn, OtpVerifyIn, VerifyMyPhoneIn
from security import hash_password, make_token
from subscription import enforce_lifecycle, serialize_user

router = APIRouter(tags=["otp"])


@router.post("/auth/otp/request")
async def request_otp(body: OtpRequestIn):
    phone = normalize_dz_phone(body.phone)
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)
    thirty_seconds_ago = now - timedelta(seconds=30)

    await db.otp_challenges.delete_many({
        "phone_e164": phone,
        "$or": [
            {"expires_at": {"$lte": now.isoformat()}},
            {"created_at": {"$lt": one_hour_ago.isoformat()}},
        ],
    })

    rate = await db.otp_rate_limits.find_one({"_id": phone})
    if rate:
        last_sent = rate.get("last_sent_at")
        if isinstance(last_sent, str):
            last_sent = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
        if last_sent and last_sent > thirty_seconds_ago:
            raise HTTPException(status_code=429, detail="Please wait 30 seconds before requesting another code")
        hour_started = rate.get("hour_started_at")
        if isinstance(hour_started, str):
            hour_started = datetime.fromisoformat(hour_started.replace("Z", "+00:00"))
        if hour_started and hour_started > one_hour_ago:
            if rate.get("hour_count", 0) >= 5:
                raise HTTPException(status_code=429, detail="Too many OTP requests; try again later")
            hour_count = rate.get("hour_count", 0) + 1
            hour_start = hour_started
        else:
            hour_count = 1
            hour_start = now
    else:
        hour_count = 1
        hour_start = now

    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()

    await db.otp_challenges.replace_one(
        {"phone_e164": phone},
        {
            "phone_e164": phone,
            "code_hash": code_hash,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(minutes=5)).isoformat(),
        },
        upsert=True,
    )
    await db.otp_rate_limits.update_one(
        {"_id": phone},
        {"$set": {
            "last_sent_at": now.isoformat(),
            "hour_started_at": hour_start.isoformat(),
            "hour_count": hour_count,
        }},
        upsert=True,
    )
    await send_otp_code(phone, code)
    return {"message": "If the number is valid, a verification code was sent", "expires_in": 300}


@router.post("/auth/otp/verify")
async def verify_otp(body: OtpVerifyIn):
    phone = normalize_dz_phone(body.phone)
    now = datetime.now(timezone.utc)
    challenge = await db.otp_challenges.find_one({"phone_e164": phone}, {"_id": 0})
    if not challenge:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")
    expires_at = challenge.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if not expires_at or expires_at <= now:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")
    if not bcrypt.checkpw(body.code.encode(), challenge["code_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")

    # Single-use race protection
    deleted = await db.otp_challenges.delete_one({"phone_e164": phone})
    if deleted.deleted_count != 1:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")

    user = await db.users.find_one({"phone_e164": phone}, {"_id": 0})
    is_new = user is None
    if is_new:
        user_id = str(uuid.uuid4())
        placeholder_email = f"{phone[1:]}@phone.khedmapro.dz"  # drop leading +
        user_doc = {
            "id": user_id,
            "email": placeholder_email,
            "phone_e164": phone,
            "phone": phone,
            "password_hash": hash_password(secrets.token_urlsafe(24)),  # random, unused
            "full_name": "",
            "role": body.role.value,
            "category": None,
            "bio": None,
            "hourly_rate": None,
            "task_rate": None,
            "city": None,
            "avatar_url": None,
            "rating": 0.0,
            "reviews_count": 0,
            "created_at": now.isoformat(),
            "last_paid_at": None,
            "profile_complete": False,
            "auth_methods": ["otp"],
            "phone_verified": True,  # OTP was just verified
            "phone_verified_at": now.isoformat(),
        }
        await db.users.insert_one(user_doc)
        user = user_doc
    else:
        user = await enforce_lifecycle(user)
        if user.get("is_deleted"):
            raise HTTPException(status_code=410, detail="This account has been deleted")
        # Mark existing account's phone as verified (idempotent).
        if not user.get("phone_verified"):
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"phone_verified": True, "phone_verified_at": now.isoformat()}},
            )
            user["phone_verified"] = True

    token = make_token(user["id"], user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "is_new_user": is_new,
        "profile_complete": user.get("profile_complete", bool(user.get("full_name"))),
        "user": serialize_user(user),
    }



@router.post("/auth/verify-my-phone")
async def verify_my_phone(
    body: VerifyMyPhoneIn,
    user: Annotated[dict, Depends(current_user)],
):
    """Best-effort phone verification for an already-authenticated user.

    Consumes an existing OTP challenge tied to the user's stored `phone_e164`
    and flips `phone_verified=True`. Does NOT mint a new session token.
    """
    now = datetime.now(timezone.utc)

    # The user MUST have a phone on file to verify.
    stored_phone = user.get("phone_e164") or user.get("phone")
    if not stored_phone:
        raise HTTPException(status_code=400, detail="No phone number on file")
    try:
        phone = normalize_dz_phone(stored_phone)
    except HTTPException:
        raise HTTPException(status_code=400, detail="Invalid phone on file")

    challenge = await db.otp_challenges.find_one({"phone_e164": phone}, {"_id": 0})
    if not challenge:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")
    expires_at = challenge.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if not expires_at or expires_at <= now:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")
    if not bcrypt.checkpw(body.code.encode(), challenge["code_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")

    # Single-use.
    deleted = await db.otp_challenges.delete_one({"phone_e164": phone})
    if deleted.deleted_count != 1:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "phone_verified": True,
            "phone_verified_at": now.isoformat(),
            "phone_e164": phone,  # backfill normalized form if it was missing
        }},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"phone_verified": True, "user": serialize_user(updated)}
