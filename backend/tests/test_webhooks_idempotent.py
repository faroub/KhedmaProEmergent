"""P19 — webhook processing is idempotent (M17).

The Chargily webhook inserts the event FIRST under the unique index on
chargily_events.event_id (created by scripts/migrate.py): a concurrent or
repeated delivery loses the insert and is answered without reprocessing.
Events that fail after the insert are marked "failed" and a later delivery
claims and retries them. HMAC + amount/currency validation are unchanged.
"""
import asyncio
import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timezone

import httpx
import requests
from pymongo import MongoClient

from helpers import API, fresh_provider

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
WEBHOOK_SECRET = os.environ.get("CHARGILY_WEBHOOK_SECRET", "")
PRICE = 1000


def _headers(raw: bytes, sig: str = None) -> dict:
    return {
        "content-type": "application/json",
        "signature": sig or hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest(),
    }


def _event(event_id: str, checkout_id: str, amount: int = PRICE, currency: str = "dzd",
           event_type: str = "checkout.paid", status: str = "paid") -> bytes:
    return json.dumps({
        "id": event_id,
        "type": event_type,
        "data": {"id": checkout_id, "amount": amount, "currency": currency, "status": status},
    }).encode()


def _seed_pending_payment(checkout_id: str, provider_id: str) -> None:
    MongoClient(MONGO_URL)[DB_NAME].subscription_payments.insert_one({
        "id": str(uuid.uuid4()),
        "provider_id": provider_id,
        "provider_checkout_id": checkout_id,
        "amount_dzd": PRICE,
        "currency": "dzd",
        "status": "pending",
        "provider": "chargily",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def _ensure_unique_index() -> None:
    """The index scripts/migrate.py creates in production (test stand-in)."""
    MongoClient(MONGO_URL)[DB_NAME].chargily_events.create_index("event_id", unique=True)


def _payment(checkout_id: str) -> dict:
    return MongoClient(MONGO_URL)[DB_NAME].subscription_payments.find_one(
        {"provider_checkout_id": checkout_id}, {"_id": 0}
    )


def _event_doc(event_id: str) -> dict:
    return MongoClient(MONGO_URL)[DB_NAME].chargily_events.find_one({"event_id": event_id}, {"_id": 0})


def _post(raw: bytes, sig: str = None) -> requests.Response:
    return requests.post(f"{API}/webhooks/chargily", data=raw, headers=_headers(raw, sig), timeout=15)


def _setup_paid_scenario():
    provider = fresh_provider()
    checkout_id = f"ch_{uuid.uuid4().hex[:10]}"
    _seed_pending_payment(checkout_id, provider["user"]["id"])
    _ensure_unique_index()
    return provider, checkout_id


class TestWebhookIdempotency:
    def test_first_delivery_processes_and_marks_processed(self):
        provider, checkout_id = _setup_paid_scenario()
        event_id = f"evt_{uuid.uuid4().hex[:10]}"
        raw = _event(event_id, checkout_id)

        r = _post(raw)
        assert r.status_code == 200, r.text
        assert _event_doc(event_id)["status"] == "processed"
        assert _payment(checkout_id)["status"] == "paid"
        doc = MongoClient(MONGO_URL)[DB_NAME].users.find_one(
            {"id": provider["user"]["id"]}, {"_id": 0}
        )
        assert doc.get("last_paid_at")

    def test_duplicate_delivery_skips_reprocessing(self):
        provider, checkout_id = _setup_paid_scenario()
        event_id = f"evt_{uuid.uuid4().hex[:10]}"
        raw = _event(event_id, checkout_id)

        r1 = _post(raw)
        assert r1.status_code == 200, r1.text
        before = _payment(checkout_id)
        assert before["status"] == "paid"

        # Second delivery of the same event: answered ok, not reprocessed.
        r2 = _post(raw)
        assert r2.status_code == 200, r2.text
        coll = MongoClient(MONGO_URL)[DB_NAME]
        assert coll.chargily_events.count_documents({"event_id": event_id}) == 1
        after = _payment(checkout_id)
        assert after["paid_at"] == before["paid_at"]

    def test_concurrent_deliveries_process_exactly_once(self):
        provider, checkout_id = _setup_paid_scenario()
        event_id = f"evt_{uuid.uuid4().hex[:10]}"
        raw = _event(event_id, checkout_id)

        async def go():
            async with httpx.AsyncClient(timeout=20) as client:
                responses = await asyncio.gather(
                    *[
                        client.post(f"{API}/webhooks/chargily", content=raw, headers=_headers(raw))
                        for _ in range(3)
                    ]
                )
            return [r.status_code for r in responses]

        codes = asyncio.run(go())
        assert codes == [200, 200, 200], codes
        coll = MongoClient(MONGO_URL)[DB_NAME]
        assert coll.chargily_events.count_documents({"event_id": event_id}) == 1
        assert _event_doc(event_id)["status"] == "processed"
        assert coll.subscription_payments.count_documents(
            {"provider_checkout_id": checkout_id}
        ) == 1

    def test_failed_event_can_be_retried(self):
        # First delivery references a checkout that doesn't exist yet -> 400,
        # and the event is stored as "failed" so it can be retried.
        provider = fresh_provider()
        checkout_id = f"ch_{uuid.uuid4().hex[:10]}"
        _ensure_unique_index()
        event_id = f"evt_{uuid.uuid4().hex[:10]}"
        raw = _event(event_id, checkout_id)

        r1 = _post(raw)
        assert r1.status_code == 400 and "Unknown checkout" in r1.text
        assert _event_doc(event_id)["status"] == "failed"

        # The payment record appears (e.g. checkout creation raced the
        # webhook); the same delivery now succeeds and processes.
        _seed_pending_payment(checkout_id, provider["user"]["id"])
        r2 = _post(raw)
        assert r2.status_code == 200, r2.text
        assert _event_doc(event_id)["status"] == "processed"
        assert _payment(checkout_id)["status"] == "paid"

    def test_invalid_signature_rejected(self):
        _, checkout_id = _setup_paid_scenario()
        raw = _event(f"evt_{uuid.uuid4().hex[:10]}", checkout_id)
        r = _post(raw, sig="0" * 64)
        assert r.status_code == 403, r.text

    def test_amount_mismatch_rejected(self):
        _, checkout_id = _setup_paid_scenario()
        event_id = f"evt_{uuid.uuid4().hex[:10]}"
        raw = _event(event_id, checkout_id, amount=999)
        r = _post(raw)
        assert r.status_code == 400 and "amount" in r.text.lower()
        assert _event_doc(event_id)["status"] == "failed"

    def test_currency_mismatch_rejected(self):
        _, checkout_id = _setup_paid_scenario()
        event_id = f"evt_{uuid.uuid4().hex[:10]}"
        raw = _event(event_id, checkout_id, currency="usd")
        r = _post(raw)
        assert r.status_code == 400 and "amount" in r.text.lower()
