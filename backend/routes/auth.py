"""Auth: register, login, me."""
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import current_user
from schemas import LoginIn, RegisterIn, Role, TokenOut
from security import hash_password, make_token, verify_password
from subscription import enforce_lifecycle, serialize_user


router = APIRouter(tags=["auth"])


@router.post("/auth/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email is already registered")
    if body.role == Role.service_provider and not body.category:
        raise HTTPException(status_code=400, detail="Category required for providers")

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "full_name": body.full_name,
        "role": body.role.value,
        "phone": body.phone,
        "category": body.category,
        "bio": body.bio,
        "hourly_rate": body.hourly_rate,
        "task_rate": body.task_rate,
        "city": body.city,
        "avatar_url": body.avatar_url,
        "rating": 0.0,
        "reviews_count": 0,
        "created_at": now.isoformat(),
        "last_paid_at": None,
    }
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
