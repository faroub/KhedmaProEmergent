"""Push notifications via the Emergent managed relay (SuprSend).

Frontend registers a native FCM/APNs device token, which we forward to the
Emergent relay. Server-side code calls `send_push()` from event handlers
(new booking, message, review, verification decision, subscription reminder).

DO NOT swap this out for a different provider without going through the
integration_playbook_expert_v2. The relay endpoint + header contract is
fixed.
"""
import asyncio
import logging
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import EMERGENT_PUSH_KEY, RATE_LIMIT_PUSH_USER
from deps import current_user
from ratelimit import consume

logger = logging.getLogger(__name__)

PUSH_BASE_URL = "https://integrations.emergentagent.com"
# Read once by config.py so startup validation (server.py) sees the same value.
PUSH_KEY = EMERGENT_PUSH_KEY

_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

router = APIRouter(tags=["push"])


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@router.post("/register-push", status_code=201)
async def register_push(
    body: RegisterPushBody,
    user: Annotated[dict, Depends(current_user)],
):
    """Register (or refresh) a device token with the Emergent push relay.

    Authenticated: a user may only register a token for their OWN account —
    otherwise anyone could subscribe to another user's push notifications
    (booking details, chat previews, verification decisions).
    """
    # Per-user cap: token churn should not be an unbounded write path.
    await consume(f"push:{user['id']}", RATE_LIMIT_PUSH_USER, 60)
    if body.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="You can only register push for your own account")
    try:
        resp = await _client.post(
            "/api/v1/push/users/register", json=body.model_dump()
        )
    except httpx.HTTPError as e:
        logger.warning("Push register upstream error: %s", e)
        raise HTTPException(502, "Push provider unreachable")

    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code >= 400:
        logger.warning("Push register 4xx: %s %s", resp.status_code, resp.text)
        raise HTTPException(resp.status_code, "Push registration rejected")
    return {"status": "registered"}


async def send_push(
    recipients: list[str],
    data: dict,
    idempotency_key: Optional[str] = None,
) -> None:
    """Fire-and-forget helper used by feature routes.

    - `recipients`: list of user IDs (must be already registered).
    - `data`: at minimum {"title": str, "message": str}. Optional keys:
       subtext, image_url, action_url.
    - Never raises to the caller: push failure is a warning, not a business
      error. The event handler must not roll back on push errors.
    """
    if not recipients:
        return
    # Strip empties + dedupe while preserving order.
    seen = set()
    clean: list[str] = []
    for r in recipients:
        if not r or r in seen:
            continue
        if r.startswith("guest:"):
            # Guests have no device token — skip silently.
            continue
        seen.add(r)
        clean.append(r)
    if not clean:
        return
    if "title" not in data or "message" not in data:
        logger.warning("send_push called without title/message; skipping")
        return

    # Chunk into groups of 100 (relay hard limit).
    CHUNK = 100
    for i in range(0, len(clean), CHUNK):
        chunk = clean[i : i + CHUNK]
        payload: dict = {"recipients": chunk, "data": data}
        if idempotency_key:
            # If we're chunking, disambiguate the idempotency key per chunk.
            payload["$idempotency_key"] = (
                f"{idempotency_key}:{i // CHUNK}" if len(clean) > CHUNK else idempotency_key
            )
        try:
            resp = await _client.post("/api/v1/push/trigger", json=payload)
        except httpx.HTTPError as e:
            logger.warning("send_push upstream error: %s", e)
            continue
        if resp.status_code == 401:
            logger.warning("send_push: EMERGENT_PUSH_KEY missing or invalid")
            return
        if resp.status_code >= 400:
            logger.warning(
                "send_push non-2xx %s: %s", resp.status_code, resp.text[:200]
            )


# Tracks in-flight push deliveries so they are never garbage-collected
# mid-task and their failures are always logged (P26).
_pending_push_tasks: set = set()


def fire_and_forget(coro) -> None:
    """Schedule a push delivery without making the request wait for the relay.

    Request handlers call this instead of awaiting `send_push`: the response
    returns immediately and delivery failures surface in the server log, never
    as a business error. Guest-skip and chunking behave identically (they live
    inside `send_push`)."""
    task = asyncio.create_task(coro)
    _pending_push_tasks.add(task)
    task.add_done_callback(_push_task_done)


def _push_task_done(task) -> None:
    _pending_push_tasks.discard(task)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("push delivery task failed: %s", exc)
