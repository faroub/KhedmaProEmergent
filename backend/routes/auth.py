"""Auth: register, login, me."""
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import current_user
from phone import normalize_dz_phone
from reference_data import WILAYAS
from schemas import LoginIn, RegisterIn, Role, TokenOut
from security import hash_password, make_token, verify_password
from subscription import enforce_lifecycle, serialize_user


router = APIRouter(tags=["auth"])

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
    # Only set phone_e164 when we have a normalized value — the collection has
    # a sparse UNIQUE index on this field, which rejects explicit nulls.
    if normalized_phone:
        doc["phone_e164"] = normalized_phone
    await db.users.insert_one(doc)
    token = make_token(user_id, body.role.value)
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(doc)}


@router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    user = await enforce_lifecycle(user)
    if user.get("is_deleted"):
        raise HTTPException(status_code=410, detail="This account has been deleted")
    token = make_token(user["id"], user["role"])
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(user)}


@router.get("/auth/me")
async def me(user: Annotated[dict, Depends(current_user)]):
    return serialize_user(user)
