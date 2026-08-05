"""Chargily Pay client + FastAPI webhook.

Real Chargily checkout is used when `CHARGILY_SECRET_KEY` is set.
Otherwise the subscription/pay endpoint falls back to the MOCK behavior
(useful for local dev + preview environments without keys).
"""
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request

from config import (
    ALLOW_MOCK_PAYMENTS,
    API_PUBLIC_URL,
    APP_RETURN_URL,
)
from database import db
from routes.settings import get_effective_settings


router = APIRouter(tags=["webhooks"])


async def is_chargily_enabled() -> bool:
    eff = await get_effective_settings()
    return bool(eff.get("_secret_key")) and bool(eff.get("payments_enabled", True))


async def create_checkout(provider_id: str, provider_email: str, provider_name: str) -> dict:
    """Create a Chargily checkout for the monthly subscription."""
    eff = await get_effective_settings()
    secret = eff.get("_secret_key") or ""
    if not secret:
        raise HTTPException(status_code=503, detail="Payment provider is not configured")
    if not eff.get("payments_enabled", True):
        raise HTTPException(status_code=503, detail="Payments are temporarily disabled by admin")

    payload = {
        "amount": int(eff["subscription_price_dzd"]),
        "currency": "dzd",
        "success_url": f"{APP_RETURN_URL}?result=success",
        "failure_url": f"{APP_RETURN_URL}?result=failure",
        "webhook_url": f"{API_PUBLIC_URL}/api/webhooks/chargily",
        "description": "khedmaPro provider monthly subscription",
        "locale": "en",
        "chargily_pay_fees_allocation": "merchant",
        "metadata": {"provider_id": provider_id},
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{eff['chargily_base_url']}/checkouts",
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
            json=payload,
        )
    if r.is_error:
        raise HTTPException(status_code=502, detail="Chargily checkout creation failed")
    checkout = r.json()
    if not checkout.get("checkout_url"):
        raise HTTPException(status_code=502, detail="Chargily returned no checkout URL")

    await db.subscription_payments.insert_one({
        "id": str(uuid.uuid4()),
        "provider_id": provider_id,
        "provider_checkout_id": checkout["id"],
        "amount_dzd": int(eff["subscription_price_dzd"]),
        "currency": "dzd",
        "status": "pending",
        "provider": "chargily",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"provider": "chargily", "checkout_id": checkout["id"], "checkout_url": checkout["checkout_url"]}


@router.post("/webhooks/chargily")
async def chargily_webhook(request: Request):
    """HMAC-verified idempotent webhook. Only `checkout.paid` activates the subscription."""
    raw = await request.body()
    signature = request.headers.get("signature") or request.headers.get("Signature")
    eff = await get_effective_settings()
    webhook_secret = eff.get("_webhook_secret") or ""
    if not webhook_secret or not signature:
        raise HTTPException(status_code=400, detail="Missing signature")
    expected = hmac.new(webhook_secret.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        event = json.loads(raw)
        checkout = event["data"]
        checkout_id = checkout["id"]
        event_id = event.get("id") or f"{event.get('type')}-{checkout_id}"
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid event")

    # Idempotency
    if await db.chargily_events.find_one({"event_id": event_id}):
        return {"ok": True}
    await db.chargily_events.insert_one({
        "event_id": event_id,
        "received_at": datetime.now(timezone.utc).isoformat(),
    })

    payment = await db.subscription_payments.find_one({"provider_checkout_id": checkout_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=400, detail="Unknown checkout")

    # Server-controlled invariants — reject unexpected amounts.
    expected_amount = int(eff["subscription_price_dzd"])
    if checkout.get("amount") != expected_amount or checkout.get("currency") != "dzd":
        raise HTTPException(status_code=400, detail="Unexpected amount/currency")

    event_type = event.get("type")
    now_iso = datetime.now(timezone.utc).isoformat()
    if event_type == "checkout.paid" and checkout.get("status") == "paid":
        await db.subscription_payments.update_one(
            {"provider_checkout_id": checkout_id},
            {"$set": {"status": "paid", "paid_at": now_iso}},
        )
        await db.users.update_one(
            {"id": payment["provider_id"]},
            {"$set": {
                "last_paid_at": now_iso,
                "is_manually_deactivated": False,
                "manually_deactivated_at": None,
            }},
        )
    elif event_type in ("checkout.failed", "checkout.canceled"):
        await db.subscription_payments.update_one(
            {"provider_checkout_id": checkout_id},
            {"$set": {"status": event_type.split(".")[1]}},
        )
    return {"ok": True}


# Re-export for the /subscription/pay route
__all__ = ["router", "is_chargily_enabled", "create_checkout", "ALLOW_MOCK_PAYMENTS"]
