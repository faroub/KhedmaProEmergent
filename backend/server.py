from fastapi import FastAPI, APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Annotated
from datetime import datetime, timedelta, timezone
from enum import Enum
import bcrypt
import jwt
import re
import secrets


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_EXPIRE_MINUTES = int(os.environ.get('JWT_EXPIRE_MINUTES', 1440))
TRIAL_MONTHS = 3
DEACTIVATION_MONTHS = 12
SUBSCRIPTION_FEE_DZD = 1000

app = FastAPI(title="khedmaPro API")
api_router = APIRouter(prefix="/api")


# ============ ENUMS & MODELS ============
class Role(str, Enum):
    service_provider = "service_provider"
    client = "client"


class BookingStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"


CATEGORIES = [
    {"id": "plumbing", "name": "Plumbing", "icon": "water"},
    {"id": "electrical", "name": "Electrical", "icon": "flash"},
    {"id": "cleaning", "name": "Cleaning", "icon": "sparkles"},
    {"id": "carpentry", "name": "Carpentry", "icon": "hammer"},
    {"id": "painting", "name": "Painting", "icon": "color-palette"},
    {"id": "landscaping", "name": "Landscaping", "icon": "leaf"},
    {"id": "it_support", "name": "IT Support", "icon": "laptop"},
    {"id": "admin_education", "name": "Admin Education", "icon": "school"},
    {"id": "photography", "name": "Photography", "icon": "camera"},
    {"id": "moving", "name": "Moving", "icon": "cube"},
]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: Role
    full_name: str
    phone: Optional[str] = None
    # Provider-only fields
    category: Optional[str] = None
    bio: Optional[str] = None
    hourly_rate: Optional[float] = None
    task_rate: Optional[float] = None
    city: Optional[str] = None
    avatar_url: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: Role
    phone: Optional[str] = None
    category: Optional[str] = None
    bio: Optional[str] = None
    hourly_rate: Optional[float] = None
    task_rate: Optional[float] = None
    city: Optional[str] = None
    avatar_url: Optional[str] = None
    rating: float = 0.0
    reviews_count: int = 0
    active: bool = True
    created_at: datetime
    trial_ends_at: Optional[datetime] = None
    subscription_status: Optional[str] = None  # trial, active, due, deactivated
    days_until_due: Optional[int] = None


class BookingCreate(BaseModel):
    provider_id: str
    scheduled_date: str  # ISO format
    task_description: str
    address: str
    rate_type: str = "hourly"  # hourly or task
    estimated_hours: Optional[float] = None
    # Guest booking fields (used when caller is not authenticated)
    guest_name: Optional[str] = None
    guest_phone: Optional[str] = None
    guest_email: Optional[str] = None


class BookingStatusUpdate(BaseModel):
    status: BookingStatus


class ReviewCreate(BaseModel):
    booking_id: Optional[str] = None
    provider_id: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    comment: str


class ScheduleIn(BaseModel):
    # working_hours: { "mon": {"start": "08:00", "end": "17:00"}, ... }
    working_hours: dict
    # breaks per day, e.g. { "mon": [{"start":"12:00","end":"13:00"}] }
    breaks: dict = {}
    # ISO date strings, e.g. ["2026-06-10", "2026-06-11"]
    vacation_days: List[str] = []


class ChatMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class OtpRequestIn(BaseModel):
    phone: str = Field(min_length=9, max_length=20)


class OtpVerifyIn(BaseModel):
    phone: str = Field(min_length=9, max_length=20)
    code: str = Field(pattern=r"^\d{6}$")
    role: Role = Role.client


class ProfileCompleteIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    city: Optional[str] = None
    # Provider-only extras
    category: Optional[str] = None
    bio: Optional[str] = None
    hourly_rate: Optional[float] = None
    task_rate: Optional[float] = None


# ============ HELPERS ============
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def compute_subscription(user: dict) -> dict:
    """Compute subscription status for provider based on created_at."""
    if user["role"] != Role.service_provider.value:
        return {"trial_ends_at": None, "subscription_status": None, "days_until_due": None, "active": True}

    created_at = user["created_at"]
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    trial_end = created_at + timedelta(days=TRIAL_MONTHS * 30)
    now = datetime.now(timezone.utc)
    last_paid_at = user.get("last_paid_at")
    if isinstance(last_paid_at, str):
        last_paid_at = datetime.fromisoformat(last_paid_at.replace("Z", "+00:00"))

    # If paid, subscription active for 1 month
    if last_paid_at:
        paid_expires = last_paid_at + timedelta(days=30)
        if paid_expires > now:
            days_left = (paid_expires - now).days
            return {
                "trial_ends_at": trial_end,
                "subscription_status": "active",
                "days_until_due": days_left,
                "active": True,
            }

    # Check trial
    if now < trial_end:
        days_left = (trial_end - now).days
        return {
            "trial_ends_at": trial_end,
            "subscription_status": "trial",
            "days_until_due": days_left,
            "active": True,
        }

    # Trial expired. Deactivation window = 12 months after trial ended
    deactivation_deadline = trial_end + timedelta(days=DEACTIVATION_MONTHS * 30)
    if now < deactivation_deadline:
        return {
            "trial_ends_at": trial_end,
            "subscription_status": "due",
            "days_until_due": 0,
            "active": False,
        }
    # Fully deactivated
    return {
        "trial_ends_at": trial_end,
        "subscription_status": "deactivated",
        "days_until_due": 0,
        "active": False,
    }


def serialize_user(doc: dict, public: bool = False) -> dict:
    """Serialize a user document. When `public=True` sensitive fields
    (email, phone) are omitted so listings can be shared without auth."""
    sub = compute_subscription(doc)
    out = {
        "id": doc["id"],
        "full_name": doc["full_name"],
        "role": doc["role"],
        "category": doc.get("category"),
        "bio": doc.get("bio"),
        "hourly_rate": doc.get("hourly_rate"),
        "task_rate": doc.get("task_rate"),
        "city": doc.get("city"),
        "avatar_url": doc.get("avatar_url"),
        "rating": doc.get("rating", 0.0),
        "reviews_count": doc.get("reviews_count", 0),
        "active": sub["active"],
        "created_at": doc["created_at"],
        "trial_ends_at": sub["trial_ends_at"],
        "subscription_status": sub["subscription_status"],
        "days_until_due": sub["days_until_due"],
    }
    if not public:
        out["email"] = doc["email"]
        out["phone"] = doc.get("phone")
    return out


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def optional_current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.InvalidTokenError:
        return None
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    return user


def require_role(role: Role):
    async def dep(user: Annotated[dict, Depends(current_user)]) -> dict:
        if user["role"] != role.value:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


# ============ AUTH ROUTES ============
@api_router.post("/auth/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
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


@api_router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = make_token(user["id"], user["role"])
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(user)}


@api_router.get("/auth/me")
async def me(user: Annotated[dict, Depends(current_user)]):
    return serialize_user(user)


# ============ CATEGORIES ============
@api_router.get("/categories")
async def list_categories():
    return CATEGORIES


# ============ PROVIDERS ============
@api_router.get("/providers")
async def list_providers(category: Optional[str] = None, search: Optional[str] = None):
    query = {"role": Role.service_provider.value}
    if category:
        query["category"] = category
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"bio": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(500)
    # Only include active providers
    result = []
    for d in docs:
        s = serialize_user(d, public=True)
        if s["active"]:
            result.append(s)
    # Sort by rating desc
    result.sort(key=lambda x: x["rating"], reverse=True)
    return result


@api_router.get("/providers/{provider_id}")
async def get_provider(provider_id: str):
    doc = await db.users.find_one(
        {"id": provider_id, "role": Role.service_provider.value},
        {"_id": 0, "password_hash": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Provider not found")
    return serialize_user(doc, public=True)


@api_router.get("/providers/{provider_id}/reviews")
async def get_provider_reviews(provider_id: str):
    reviews = await db.reviews.find(
        {"provider_id": provider_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return reviews


# ============ BOOKINGS ============
@api_router.post("/bookings", status_code=201)
async def create_booking(
    body: BookingCreate,
    user: Annotated[Optional[dict], Depends(optional_current_user)],
):
    provider = await db.users.find_one(
        {"id": body.provider_id, "role": Role.service_provider.value}, {"_id": 0}
    )
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Determine client identity: either logged-in client or guest
    if user and user["role"] == Role.client.value:
        client_id = user["id"]
        client_name = user["full_name"]
        client_phone = user.get("phone")
        client_email = user["email"]
        is_guest = False
    elif user and user["role"] == Role.service_provider.value:
        raise HTTPException(status_code=403, detail="Providers cannot book services")
    else:
        # Guest booking
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
    }
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/bookings/mine")
async def my_bookings(user: Annotated[dict, Depends(current_user)]):
    if user["role"] == Role.client.value:
        query = {"client_id": user["id"]}
    else:
        query = {"provider_id": user["id"]}
    docs = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.patch("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: str,
    body: BookingStatusUpdate,
    user: Annotated[dict, Depends(current_user)],
):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Provider can confirm/complete/cancel; client can cancel
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


# ============ REVIEWS ============
@api_router.post("/reviews", status_code=201)
async def create_review(
    body: ReviewCreate,
    user: Annotated[dict, Depends(require_role(Role.client))],
):
    # Two modes: review tied to a booking, or a direct provider review
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
        # One direct review per client per provider
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
    doc = {
        "id": review_id,
        "booking_id": body.booking_id,
        "provider_id": provider_id,
        "client_id": user["id"],
        "client_name": user["full_name"],
        "rating": body.rating,
        "comment": body.comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(doc)
    if booking:
        await db.bookings.update_one({"id": body.booking_id}, {"$set": {"reviewed": True}})

    # Recompute provider rating
    all_reviews = await db.reviews.find({"provider_id": provider_id}, {"_id": 0}).to_list(2000)
    total = sum(r["rating"] for r in all_reviews)
    count = len(all_reviews)
    avg = total / count if count else 0
    await db.users.update_one(
        {"id": provider_id},
        {"$set": {"rating": round(avg, 2), "reviews_count": count}},
    )
    doc.pop("_id", None)
    return doc


# ============ SUBSCRIPTION ============
@api_router.post("/subscription/pay")
async def pay_subscription(user: Annotated[dict, Depends(require_role(Role.service_provider))]):
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_paid_at": now}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"success": True, "amount_dzd": SUBSCRIPTION_FEE_DZD, "user": serialize_user(updated)}


# ============ OTP AUTH ============
def normalize_dz_phone(raw: str) -> str:
    s = re.sub(r"[\s().-]", "", raw or "")
    if s.startswith("+213"):
        national = s[4:]
    elif s.startswith("00213"):
        national = s[5:]
    elif s.startswith("0"):
        national = s[1:]
    else:
        national = s
    if not re.fullmatch(r"[567]\d{8}", national):
        raise HTTPException(status_code=400, detail="Invalid Algerian phone number")
    return "+213" + national


async def send_otp_code(phone_e164: str, code: str) -> None:
    """MOCK sender — logs the code. Swap this function to add Twilio / Firebase / a local SMS gateway."""
    logger.warning("MOCK OTP for %s: %s", phone_e164, code)


@api_router.post("/auth/otp/request")
async def request_otp(body: OtpRequestIn):
    phone = normalize_dz_phone(body.phone)
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)
    thirty_seconds_ago = now - timedelta(seconds=30)

    # Clean up stale challenges for this phone
    await db.otp_challenges.delete_many({
        "phone_e164": phone,
        "$or": [{"expires_at": {"$lte": now.isoformat()}}, {"created_at": {"$lt": one_hour_ago.isoformat()}}],
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


@api_router.post("/auth/otp/verify")
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

    # Find or create user by phone
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
        }
        await db.users.insert_one(user_doc)
        user = user_doc

    token = make_token(user["id"], user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "is_new_user": is_new,
        "profile_complete": user.get("profile_complete", bool(user.get("full_name"))),
        "user": serialize_user(user),
    }


@api_router.patch("/users/me/profile")
async def complete_profile(
    body: ProfileCompleteIn,
    user: Annotated[dict, Depends(current_user)],
):
    update: dict = {
        "full_name": body.full_name,
        "profile_complete": True,
    }
    if body.city is not None:
        update["city"] = body.city
    if user["role"] == Role.service_provider.value:
        if not body.category:
            raise HTTPException(status_code=400, detail="Category required for providers")
        update["category"] = body.category
        if body.bio is not None:
            update["bio"] = body.bio
        if body.hourly_rate is not None:
            update["hourly_rate"] = body.hourly_rate
        if body.task_rate is not None:
            update["task_rate"] = body.task_rate
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return serialize_user(updated)


# ============ SCHEDULE ============
DEFAULT_HOURS = {
    "mon": {"start": "08:00", "end": "17:00"},
    "tue": {"start": "08:00", "end": "17:00"},
    "wed": {"start": "08:00", "end": "17:00"},
    "thu": {"start": "08:00", "end": "17:00"},
    "fri": {"start": "08:00", "end": "12:00"},
    "sat": {"start": "09:00", "end": "16:00"},
    "sun": None,
}


@api_router.get("/schedule/{provider_id}")
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


@api_router.put("/schedule")
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
    await db.schedules.update_one(
        {"provider_id": user["id"]}, {"$set": doc}, upsert=True
    )
    return doc


# ============ CHAT ============
class WSManager:
    """Simple in-memory websocket registry keyed by user id."""

    def __init__(self):
        self.sockets: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.sockets.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        lst = self.sockets.get(user_id, [])
        if ws in lst:
            lst.remove(ws)
        if not lst:
            self.sockets.pop(user_id, None)

    async def send_to(self, user_id: str, message: dict):
        for ws in list(self.sockets.get(user_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(user_id, ws)


ws_manager = WSManager()


def _thread_id(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))


@api_router.get("/chats/mine")
async def my_chats(user: Annotated[dict, Depends(current_user)]):
    """Return distinct conversations for the current user with last message + counterpart preview."""
    pipeline = [
        {"$match": {"$or": [{"from_id": user["id"]}, {"to_id": user["id"]}]}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$thread_id",
            "last_text": {"$first": "$text"},
            "last_at": {"$first": "$created_at"},
            "from_id": {"$first": "$from_id"},
            "to_id": {"$first": "$to_id"},
        }},
        {"$sort": {"last_at": -1}},
    ]
    threads = await db.messages.aggregate(pipeline).to_list(500)
    out = []
    for t in threads:
        other_id = t["to_id"] if t["from_id"] == user["id"] else t["from_id"]
        other = await db.users.find_one({"id": other_id}, {"_id": 0, "password_hash": 0})
        if not other:
            continue
        out.append({
            "other_id": other_id,
            "other_name": other["full_name"],
            "other_avatar": other.get("avatar_url"),
            "other_role": other["role"],
            "last_text": t["last_text"],
            "last_at": t["last_at"],
        })
    return out


@api_router.get("/chats/{other_id}/messages")
async def chat_history(
    other_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    tid = _thread_id(user["id"], other_id)
    msgs = await db.messages.find({"thread_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return msgs


@api_router.post("/chats/{other_id}/messages", status_code=201)
async def send_message(
    other_id: str,
    body: ChatMessageIn,
    user: Annotated[dict, Depends(current_user)],
):
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="Recipient not found")
    msg = {
        "id": str(uuid.uuid4()),
        "thread_id": _thread_id(user["id"], other_id),
        "from_id": user["id"],
        "from_name": user["full_name"],
        "to_id": other_id,
        "text": body.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    # Fanout via websocket
    await ws_manager.send_to(other_id, {"type": "message", "message": msg})
    await ws_manager.send_to(user["id"], {"type": "message", "message": msg})
    return msg


@app.websocket("/api/ws/chat")
async def ws_chat(websocket: WebSocket, token: str):
    """Authenticated chat WebSocket. Client connects with ?token=<JWT>."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.InvalidTokenError:
        await websocket.close(code=1008)
        return
    await ws_manager.connect(user_id, websocket)
    try:
        while True:
            # Keep connection alive; we only push server->client
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
    except Exception:
        ws_manager.disconnect(user_id, websocket)


# ============ SEED (DEV ONLY) ============
@api_router.post("/seed")
async def seed_data():
    # Only seed providers if empty
    existing = await db.users.count_documents({"role": Role.service_provider.value})
    reviews_count = await db.reviews.count_documents({})
    if existing > 0 and reviews_count > 0:
        return {"message": "Already seeded", "providers": existing, "reviews": reviews_count}

    seed_providers = [
        {"full_name": "Ahmed Boumediene", "category": "plumbing", "hourly_rate": 800, "task_rate": 2500, "city": "Algiers", "bio": "10+ years experience in residential plumbing. Fast, clean and reliable.", "avatar_url": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400"},
        {"full_name": "Karim Belkacem", "category": "electrical", "hourly_rate": 1000, "task_rate": 3000, "city": "Oran", "bio": "Certified electrician for homes and small businesses. Safe wiring guaranteed.", "avatar_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400"},
        {"full_name": "Amina Cherif", "category": "cleaning", "hourly_rate": 500, "task_rate": 2000, "city": "Algiers", "bio": "Deep home & office cleaning with eco-friendly products.", "avatar_url": "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400"},
        {"full_name": "Youcef Mansouri", "category": "carpentry", "hourly_rate": 900, "task_rate": 3500, "city": "Constantine", "bio": "Custom furniture, doors, and interior finishes.", "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"},
        {"full_name": "Sofiane Kaci", "category": "painting", "hourly_rate": 700, "task_rate": 2800, "city": "Algiers", "bio": "Interior/exterior painting, decorative finishes.", "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400"},
        {"full_name": "Nadia Haddad", "category": "landscaping", "hourly_rate": 600, "task_rate": 2200, "city": "Blida", "bio": "Garden design and maintenance for villas.", "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400"},
        {"full_name": "Riad Zerouki", "category": "it_support", "hourly_rate": 1500, "task_rate": 4000, "city": "Algiers", "bio": "PC repair, network setup, remote support.", "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400"},
        {"full_name": "Leila Bensalem", "category": "admin_education", "hourly_rate": 1200, "task_rate": 3500, "city": "Oran", "bio": "Tutor and admin coach for university applications.", "avatar_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400"},
        {"full_name": "Mehdi Fares", "category": "photography", "hourly_rate": 2000, "task_rate": 8000, "city": "Algiers", "bio": "Wedding, event, and portrait photography.", "avatar_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400"},
        {"full_name": "Salim Ouhadj", "category": "moving", "hourly_rate": 1200, "task_rate": 5000, "city": "Algiers", "bio": "Careful moving service with team & truck.", "avatar_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400"},
        {"full_name": "Fatima Zohra", "category": "cleaning", "hourly_rate": 550, "task_rate": 2100, "city": "Setif", "bio": "Reliable home cleaning, deep-clean specialist.", "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400"},
        {"full_name": "Bilal Rahmani", "category": "electrical", "hourly_rate": 950, "task_rate": 2900, "city": "Algiers", "bio": "Emergency electrical services, 24/7 available.", "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400"},
    ]

    for i, p in enumerate(seed_providers):
        # Skip if this seed provider already exists
        if await db.users.find_one({"email": f"provider{i+1}@khedmapro.dz"}):
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "email": f"provider{i+1}@khedmapro.dz",
            "password_hash": hash_password("password123"),
            "role": Role.service_provider.value,
            "phone": f"+21355500{i+1:04d}",
            "rating": round(3.8 + (i % 5) * 0.25, 2),
            "reviews_count": 5 + i * 2,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_paid_at": None,
            **p,
        }
        await db.users.insert_one(doc)

    # Seed fake reviews to make the app feel populated
    fake_review_texts = [
        "Excellent work, very professional and on time!",
        "Highly recommended. Fair pricing and clean job.",
        "Quick, polite and skilled. Will hire again.",
        "Good service overall, minor delay but great result.",
        "Absolutely satisfied. Fixed everything on the first visit.",
        "Nice communication and quality workmanship.",
        "Reasonable rates and honest advice — a rare find.",
        "Very thorough, left the place spotless.",
    ]
    fake_client_names = [
        "Yasmine A.", "Omar B.", "Sara D.", "Hakim E.",
        "Linda F.", "Redouane K.", "Nassima M.", "Zineb T.",
    ]
    provider_docs = await db.users.find(
        {"role": Role.service_provider.value}, {"_id": 0}
    ).to_list(500)
    for pdoc in provider_docs:
        num_reviews = 4 + (hash(pdoc["id"]) % 5)  # 4-8 reviews each
        ratings = []
        for j in range(num_reviews):
            rating = 4 + (j % 2)  # mix of 4 and 5
            ratings.append(rating)
            review_doc = {
                "id": str(uuid.uuid4()),
                "booking_id": None,
                "provider_id": pdoc["id"],
                "client_id": f"seed-client-{j}",
                "client_name": fake_client_names[j % len(fake_client_names)],
                "rating": rating,
                "comment": fake_review_texts[j % len(fake_review_texts)],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.reviews.insert_one(review_doc)
        avg = sum(ratings) / len(ratings)
        await db.users.update_one(
            {"id": pdoc["id"]},
            {"$set": {"rating": round(avg, 2), "reviews_count": len(ratings)}},
        )

    return {"message": "Seeded", "providers": len(seed_providers)}


# ============ ROOT ============
@api_router.get("/")
async def root():
    return {"message": "khedmaPro API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    await db.users.create_index("category")
    await db.bookings.create_index("client_id")
    await db.bookings.create_index("provider_id")
    await db.reviews.create_index("provider_id")
    await db.messages.create_index("thread_id")
    await db.messages.create_index([("thread_id", 1), ("created_at", 1)])
    await db.schedules.create_index("provider_id", unique=True)
    await db.users.create_index("phone_e164", unique=True, sparse=True)
    await db.otp_challenges.create_index("phone_e164", unique=True)
    await db.otp_challenges.create_index("expires_at", expireAfterSeconds=0)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
