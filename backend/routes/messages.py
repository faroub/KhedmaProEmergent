"""Chat threads, message history, send-message, and WebSocket route.

The WebSocket handler is exported as a plain async function so `server.py`
can register it against the FastAPI app directly (WS routes cannot live on
an `APIRouter` with a prefix in the same way HTTP routes can).
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from database import db
from deps import current_user
from schemas import ChatMessageIn
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
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="Recipient not found")
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
    return msg


# ---- WebSocket ----
async def ws_chat(websocket: WebSocket, token: str):
    """Authenticated chat WebSocket. Client connects with `?token=<JWT>`."""
    try:
        payload = decode_token(token)
        user_id = payload["sub"]
    except jwt.InvalidTokenError:
        await websocket.close(code=1008)
        return
    await ws_manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
    except Exception:
        ws_manager.disconnect(user_id, websocket)
