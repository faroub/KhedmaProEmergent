"""Chat threads, message history, send-message, and WebSocket route.

The WebSocket handler is exported as a plain async function so `server.py`
can register it against the FastAPI app directly (WS routes cannot live on
an `APIRouter` with a prefix in the same way HTTP routes can).
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from config import RATE_LIMIT_MESSAGE_USER
from database import db
from deps import current_user
from ratelimit import consume
from routes.push import fire_and_forget, send_push
from schemas import ChatMessageIn, Role
from security import decode_token
from ws_manager import thread_id, ws_manager

router = APIRouter(tags=["messages"])


@router.get("/chats/mine")
async def my_chats(user: Annotated[dict, Depends(current_user)]):
    """Distinct conversations for the current user with last message + counterpart preview."""
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


@router.get("/chats/{other_id}/messages")
async def chat_history(other_id: str, user: Annotated[dict, Depends(current_user)]):
    tid = thread_id(user["id"], other_id)
    msgs = await db.messages.find({"thread_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return msgs


@router.post("/chats/{other_id}/messages", status_code=201)
async def send_message(
    other_id: str,
    body: ChatMessageIn,
    user: Annotated[dict, Depends(current_user)],
):
    # Per-user cap: a single account must not be able to flood threads.
    await consume(f"msg:{user['id']}", RATE_LIMIT_MESSAGE_USER, 60)
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if other.get("is_deleted") or other.get("is_manually_deactivated"):
        raise HTTPException(status_code=410, detail="This account is no longer available")
    # Relationship gate (P21): no cold outreach except the app's
    # client→provider contact flow (the Message button on a provider
    # profile). A message is allowed when the pair shares a booking (any
    # status, either side), when the counterpart already started the thread
    # (providers can always reply), or when a client contacts a provider
    # for the first time. Everything else — provider→client cold starts,
    # client→client, provider→provider — is denied.
    shared_booking = await db.bookings.find_one(
        {
            "$or": [
                {"client_id": user["id"], "provider_id": other_id},
                {"provider_id": user["id"], "client_id": other_id},
            ]
        },
        {"_id": 0, "id": 1},
    )
    counterpart_started = await db.messages.find_one(
        {"from_id": other_id, "to_id": user["id"]}, {"_id": 0, "id": 1}
    )
    client_to_provider = (
        user.get("role") == Role.client.value
        and other.get("role") == Role.service_provider.value
    )
    if not (shared_booking or counterpart_started or client_to_provider):
        raise HTTPException(
            status_code=403,
            detail="You can only message providers you have a booking with, "
            "or users who have already messaged you",
        )
    msg = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id(user["id"], other_id),
        "from_id": user["id"],
        "from_name": user["full_name"],
        "to_id": other_id,
        "text": body.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    await ws_manager.send_to(other_id, {"type": "message", "message": msg})
    await ws_manager.send_to(user["id"], {"type": "message", "message": msg})

    # Push notification to the recipient — scheduled, never awaited (P26).
    preview = body.text[:120] if body.text else ""
    fire_and_forget(send_push(
        recipients=[other_id],
        data={
            "title": user["full_name"],
            "message": preview,
            "action_url": f"/chat/{user['id']}",
        },
        idempotency_key=f"msg:{msg['id']}",
    ))
    return msg


# ---- WebSocket ----
WS_AUTH_TIMEOUT = 5.0  # seconds the client has to send the auth message
WS_REVALIDATE_INTERVAL = 60.0  # seconds between session rechecks on idle sockets

logger = logging.getLogger(__name__)


async def _read_auth_message(websocket: WebSocket) -> Optional[dict]:
    """Read the first {"type":"auth","token":...} message and decode the token.
    Closes the socket with 1008 on any failure and returns None."""
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=WS_AUTH_TIMEOUT)
        data = json.loads(raw)
    except (asyncio.TimeoutError, json.JSONDecodeError, TypeError, ValueError):
        await websocket.close(code=1008)
        return None
    if (
        not isinstance(data, dict)
        or data.get("type") != "auth"
        or not isinstance(data.get("token"), str)
    ):
        await websocket.close(code=1008)
        return None
    try:
        return decode_token(data["token"])
    except jwt.InvalidTokenError:
        await websocket.close(code=1008)
        return None


async def _ws_session_payload(websocket: WebSocket, token: Optional[str]) -> Optional[dict]:
    """Decode the session payload from the first-message auth protocol, or from
    the query-string token (deprecated, kept for one release). Returns None
    (socket already closed with 1008) when authentication fails."""
    if token:
        try:
            payload = decode_token(token)
        except jwt.InvalidTokenError:
            payload = None
        else:
            logger.warning(
                "WS chat: connected via deprecated query-string token; "
                'send {"type":"auth","token":...} as the first message instead'
            )
        if payload is None:
            await websocket.close(code=1008)
            return None
    else:
        payload = await _read_auth_message(websocket)
        if payload is None:
            return None
    # Tokens minted for a specific purpose (e.g. phone verification) are not
    # session tokens.
    if not payload.get("sub") or payload.get("purpose") is not None:
        await websocket.close(code=1008)
        return None
    return payload


async def _ws_session_valid(user_id: str, token_version: int) -> bool:
    """The socket stays open only while the account still exists, is neither
    deleted nor deactivated, and its token_version still matches the token."""
    user = await db.users.find_one({"id": user_id}, {"password_hash": 0})
    if not user or user.get("is_deleted") or user.get("is_manually_deactivated"):
        return False
    return (user.get("token_version") or 0) == token_version


async def ws_chat(websocket: WebSocket, token: Optional[str] = None):
    """Authenticated chat WebSocket.

    Preferred auth: the client sends {"type":"auth","token":"<JWT>"} as the
    first message within 5s of connect, which keeps tokens out of URLs and
    proxy logs. The ?token=... query string still works for one release but is
    deprecated. Sessions are rechecked on every inbound message and at least
    once per WS_REVALIDATE_INTERVAL; deactivated, deleted, or revoked
    accounts are dropped with close code 1008.
    """
    await websocket.accept()
    payload = await _ws_session_payload(websocket, token)
    if payload is None:
        return
    user_id = payload["sub"]
    token_version = payload.get("ver", 0) or 0
    if not await _ws_session_valid(user_id, token_version):
        await websocket.close(code=1008)
        return
    await ws_manager.connect(user_id, websocket)
    try:
        while True:
            try:
                await asyncio.wait_for(
                    websocket.receive_text(), timeout=WS_REVALIDATE_INTERVAL
                )
            except asyncio.TimeoutError:
                pass  # idle socket: revalidate below instead of idling forever
            if not await _ws_session_valid(user_id, token_version):
                logger.info(
                    "WS chat: closing socket for %s — account deleted, "
                    "deactivated, or session revoked",
                    user_id,
                )
                await websocket.close(code=1008)
                break
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WS chat: connection for %s ended", user_id, exc_info=True)
    finally:
        ws_manager.disconnect(user_id, websocket)
