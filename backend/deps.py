"""FastAPI dependencies — auth + role guards."""
from typing import Annotated, Optional
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from database import db
from schemas import Role
from security import decode_token
from subscription import enforce_lifecycle


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        user_id = payload["sub"]
        if payload.get("purpose") is not None:
            # Tokens minted for a specific purpose (e.g. phone verification) are
            # not session tokens — reject instead of confusing the caller.
            raise jwt.InvalidTokenError("Wrong token purpose")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except (KeyError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user = await enforce_lifecycle(user)
    if user.get("is_deleted"):
        raise HTTPException(status_code=410, detail="Account has been deleted")
    # Session revocation (P13): tokens minted before a token_version bump
    # (logout, deactivation, deletion) are no longer valid.
    if payload.get("ver", 0) != (user.get("token_version") or 0):
        raise HTTPException(status_code=401, detail="Session revoked — please log in again")
    return user


async def optional_current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = payload["sub"]
        if payload.get("purpose") is not None:
            raise jwt.InvalidTokenError("Wrong token purpose")
    except jwt.InvalidTokenError:
        return None
    except (KeyError, TypeError):
        return None
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return None
    user = await enforce_lifecycle(user)
    if user.get("is_deleted"):
        return None
    if payload.get("ver", 0) != (user.get("token_version") or 0):
        return None
    return user


def require_role(role: Role):
    async def dep(user: Annotated[dict, Depends(current_user)]) -> dict:
        if user["role"] != role.value:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


def require_admin(user: dict) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
