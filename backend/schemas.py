"""All Pydantic request/response models and enums for khedmaPro."""
from enum import Enum
from typing import List, Optional, Union
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class Role(str, Enum):
    service_provider = "service_provider"
    client = "client"


class BookingStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    awaiting_confirmation = "awaiting_confirmation"
    completed = "completed"
    cancelled = "cancelled"


class VerificationDocType(str, Enum):
    id_recto = "id_recto"
    id_verso = "id_verso"
    certification = "certification"
    background_check = "background_check"


# ---------- Auth ----------
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
    wilaya_code: Optional[str] = None
    baladiya: Optional[str] = None
    cross_wilaya: bool = False


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
    subscription_status: Optional[str] = None
    days_until_due: Optional[int] = None


# ---------- OTP ----------
class OtpRequestIn(BaseModel):
    phone: str = Field(min_length=9, max_length=20)


class OtpVerifyIn(BaseModel):
    phone: str = Field(min_length=9, max_length=20)
    code: str = Field(pattern=r"^\d{6}$")
    role: Role = Role.client


# ---------- Profile / portfolio ----------
class ProfileCompleteIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    city: Optional[str] = None
    category: Optional[str] = None
    bio: Optional[str] = None
    hourly_rate: Optional[float] = None
    task_rate: Optional[float] = None
    wilaya_code: Optional[str] = None
    baladiya: Optional[str] = None
    cross_wilaya: Optional[bool] = None


class PortfolioItemIn(BaseModel):
    """One entry in a provider's portfolio gallery."""
    url: str = Field(min_length=1)  # data URI or http(s) URL
    caption: Optional[str] = Field(default=None, max_length=140)
    tags: List[str] = Field(default_factory=list, max_length=6)
    is_cover: bool = False


class PortfolioUpdateIn(BaseModel):
    # Accept either legacy string list (base64/URLs) or rich objects.
    portfolio_images: List[Union[str, PortfolioItemIn]] = Field(default_factory=list, max_length=20)


# ---------- Bookings / reviews ----------
class BookingCreate(BaseModel):
    provider_id: str
    scheduled_date: str  # ISO format
    task_description: str
    address: str
    rate_type: str = "hourly"  # hourly or task
    estimated_hours: Optional[float] = None
    # Guest booking fields
    guest_name: Optional[str] = None
    guest_phone: Optional[str] = None
    guest_email: Optional[str] = None
    booking_type: str = "instant"  # 'instant' or 'quote'
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    wilaya_code: Optional[str] = None
    baladiya: Optional[str] = None


class BookingStatusUpdate(BaseModel):
    status: BookingStatus


class ReviewCreate(BaseModel):
    booking_id: Optional[str] = None
    provider_id: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    comment: str


# ---------- Schedule / chat ----------
class ScheduleIn(BaseModel):
    working_hours: dict
    breaks: dict = {}
    vacation_days: List[str] = []


class ChatMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# ---------- Reports / verification ----------
class ReportIn(BaseModel):
    provider_id: str
    reason: str = Field(min_length=2, max_length=64)
    details: Optional[str] = Field(default=None, max_length=1000)


class VerificationDocIn(BaseModel):
    type: VerificationDocType
    url: str = Field(min_length=1)
    note: Optional[str] = Field(default=None, max_length=300)


class VerificationSubmitIn(BaseModel):
    documents: List[VerificationDocIn] = Field(default_factory=list, max_length=8)


class VerificationRejectIn(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
