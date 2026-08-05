"""Password hashing and JWT helpers."""
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt

from config import JWT_SECRET, JWT_EXPIRE_MINUTES


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


def decode_token(token: str) -> dict:
    """Raises jwt.InvalidTokenError on failure."""
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])



# ---------------------------------------------------------------- OTP tokens
def make_phone_verification_token(phone_e164: str, ttl_minutes: int = 15) -> str:
    """Signed short-lived token proving `phone_e164` was OTP-verified.
    Used by the pre-registration flow so a caller can't register a phone
    they haven't actually verified in the last few minutes."""
    now = datetime.now(timezone.utc)
    payload = {
        "purpose": "phone_verify",
        "phone_e164": phone_e164,
        "iat": now,
        "exp": now + timedelta(minutes=ttl_minutes),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_phone_verification_token(token: str) -> dict:
    """Returns payload if valid + still fresh. Raises jwt.InvalidTokenError otherwise."""
    payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    if payload.get("purpose") != "phone_verify":
        raise jwt.InvalidTokenError("Wrong token purpose")
    return payload
