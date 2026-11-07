"""Auth: register, login, me."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import current_user
from phone import normalize_dz_phone
from reference_data import WILAYAS
from schemas import LoginIn, RegisterIn, Role, TokenOut
from security import (
    hash_password,
    make_token,
    verify_password,
    decode_phone_verification_token,
)
from subscription import enforce_lifecycle, serialize_user


router = APIRouter(tags=["auth"])

# Login brute-force guard. Same pattern as the OTP rate limiter: a persistent
# counter per email, reset on any successful login. 5 failures per 15 minutes
# → 429. DB-backed (not in-memory) so it holds across all gunicorn workers.
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW = timedelta(minutes=15)


async def _check_login_rate_limit(email: str) -> None:
    row = await db.login_attempts.find_one({"_id": email})
    if not row:
        return
    window_start = row.get("window_started_at")
    if isinstance(window_start, str):
        window_start = datetime.fromisoformat(window_start.replace("Z", "+00:00"))
    if window_start and window_start > datetime.now(timezone.utc) - LOGIN_WINDOW:
        if row.get("failures", 0) >= LOGIN_MAX_FAILURES:
            raise HTTPException(
                status_code=429,
                detail="Too many failed login attempts — please try again in a few minutes",
            )


async def _record_login_failure(email: str) -> None:
    now = datetime.now(timezone.utc)
    row = await db.login_attempts.find_one({"_id": email}, {"_id": 0, "window_started_at": 1})
    window_start = row.get("window_started_at") if row else None
    if isinstance(window_start, str):
        window_start = datetime.fromisoformat(window_start.replace("Z", "+00:00"))
    if window_start and window_start > now - LOGIN_WINDOW:
        await db.login_attempts.update_one({"_id": email}, {"$inc": {"failures": 1}})
    else:
        await db.login_attempts.update_one(
            {"_id": email},
            {"$set": {"window_started_at": now.isoformat(), "failures": 1}},
            upsert=True,
        )


async def _reset_login_failures(email: str) -> None:
    await db.login_attempts.delete_one({"_id": email})

_VALID_WILAYA_CODES = {w["code"] for w in WILAYAS}


@router.post("/auth/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email is already registered")
    if body.role == Role.service_provider:
        if not body.category:
            raise HTTPException(status_code=400, detail="Category required for providers")
        # Phone is MANDATORY for providers (contact channel + fraud prevention).
        if not body.phone or not body.phone.strip():
            raise HTTPException(
                status_code=400,
                detail="A valid Algerian mobile number is required for providers",
            )
        # Wilaya is MANDATORY for providers (search + service area).
        if not body.wilaya_code or body.wilaya_code not in _VALID_WILAYA_CODES:
            raise HTTPException(
                status_code=400,
                detail="A valid Algerian wilaya is required for providers",
            )

    # Normalize DZ phone if provided (raises 400 on invalid format).
    normalized_phone = None
    if body.phone and body.phone.strip():
        normalized_phone = normalize_dz_phone(body.phone.strip())
        # Reject duplicates so we never seed two providers on the same number.
        existing_phone = await db.users.find_one({"phone_e164": normalized_phone})
        if existing_phone:
            raise HTTPException(status_code=409, detail="This phone number is already registered")

    # Enforce OTP verification BEFORE the provider account is created. Clients
    # aren't subject to this because they can browse anonymously.
    phone_verified_at = None
    if body.role == Role.service_provider:
        if not body.phone_verification_token:
            raise HTTPException(
                status_code=400,
                detail="Phone verification required. Verify your number before completing registration.",
            )
        try:
            payload = decode_phone_verification_token(body.phone_verification_token)
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=400,
                detail="Phone verification token is invalid or expired — please verify again.",
            )
        token_phone = payload.get("phone_e164")
        if not token_phone or token_phone != normalized_phone:
            raise HTTPException(
                status_code=400,
                detail="Phone verification token does not match the phone number being registered.",
            )
        phone_verified_at = datetime.now(timezone.utc).isoformat()

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "full_name": body.full_name,
        "role": body.role.value,
        "phone": normalized_phone or body.phone,
        "category": body.category,
        "bio": body.bio,
        "hourly_rate": body.hourly_rate,
        "task_rate": body.task_rate,
        "city": body.city,
        "avatar_url": body.avatar_url,
        "wilaya_code": body.wilaya_code,
        "baladiya": body.baladiya,
        "cross_wilaya": body.cross_wilaya,
        "rating": 0.0,
        "reviews_count": 0,
        "created_at": now.isoformat(),
        "last_paid_at": None,
    }
    if phone_verified_at:
        doc["phone_verified"] = True
        doc["phone_verified_at"] = phone_verified_at
    # Only set phone_e164 when we have a normalized value — the collection has
    # a sparse UNIQUE index on this field, which rejects explicit nulls.
    if normalized_phone:
        doc["phone_e164"] = normalized_phone
    await db.users.insert_one(doc)
    token = make_token(user_id, body.role.value)
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(doc)}


@router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    email = body.email.lower()
    await _check_login_rate_limit(email)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        await _record_login_failure(email)
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    await _reset_login_failures(email)
    user = await enforce_lifecycle(user)
    if user.get("is_deleted"):
        raise HTTPException(status_code=410, detail="This account has been deleted")
    token = make_token(user["id"], user["role"])
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(user)}


@router.get("/auth/me")
async def me(user: Annotated[dict, Depends(current_user)]):
    return serialize_user(user)
