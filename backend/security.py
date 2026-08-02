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
