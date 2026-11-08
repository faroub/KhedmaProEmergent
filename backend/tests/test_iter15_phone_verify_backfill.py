"""Iteration 15 — phone_verified best-effort gate.

(The wilaya backfill moved from an admin endpoint to scripts/migrate.py —
see test_migrations.py — when P35 removed dev-only/one-shot admin routes.)"""
import os
import random
import uuid

import requests
from pymongo import MongoClient

from helpers import with_phone_token

API = os.environ.get("API_BASE", "http://localhost:8001/api")

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]


def _hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _fresh_provider():
    tail = "".join(str(random.randint(0, 9)) for _ in range(8))
    tag = uuid.uuid4().hex[:8]
    body = {
        "email": f"TEST_iter15_p_{tag}@example.com",
        "password": "SuperStrongPw1!",
        "role": "service_provider",
        "full_name": f"Iter15 P {tag}",
        "category": "plumbing",
        "phone": f"+2135{tail}",
        "wilaya_code": "16",
    }
    with_phone_token(body, API)
    r = requests.post(f"{API}/auth/register", json=body, timeout=10)
    assert r.status_code == 201, r.text
    return r.json(), body


def _fresh_client():
    tag = uuid.uuid4().hex[:8]
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": f"TEST_iter15_c_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": f"Iter15 C {tag}",
        },
        timeout=10,
    )
    assert r.status_code == 201
    return r.json()


def _cleanup(uid: str):
    if uid:
        _db.users.delete_one({"id": uid})


# =========================================================================
# phone_verified in serialized user
# =========================================================================

def test_new_provider_registered_with_otp_token_is_verified():
    # Since iteration 14 provider registration requires an OTP-backed
    # `phone_verification_token`, so a freshly registered provider is verified.
    reg, _ = _fresh_provider()
    assert reg["user"]["phone_verified"] is True
    _cleanup(reg["user"]["id"])


def _mark_unverified(uid: str):
    """Simulate a legacy provider (pre-OTP registration) whose phone is not verified."""
    _db.users.update_one({"id": uid}, {"$set": {"phone_verified": False, "phone_verified_at": None}})


# =========================================================================
# verify-my-phone: happy path (via mock OTP challenge injection)
# =========================================================================

def test_verify_my_phone_happy_path():
    reg, body = _fresh_provider()
    token = reg["access_token"]
    phone = reg["user"]["phone"]
    # Trigger OTP challenge via existing request endpoint
    r0 = requests.post(f"{API}/auth/otp/request", json={"phone": phone}, timeout=10)
    assert r0.status_code == 200, r0.text
    # Fetch the code from backend stdout is not deterministic; instead, look up
    # bcrypt hash and try the deterministic mock code the backend prints.
    # Since we can't observe stdout easily, seed a known code by directly
    # replacing the challenge with a known bcrypt hash for "910428".
    import bcrypt
    from datetime import datetime, timedelta, timezone
    known_code = "910428"
    _db.otp_challenges.replace_one(
        {"phone_e164": phone},
        {
            "phone_e164": phone,
            "code_hash": bcrypt.hashpw(known_code.encode(), bcrypt.gensalt()).decode(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        },
        upsert=True,
    )
    r = requests.post(
        f"{API}/auth/verify-my-phone",
        json={"code": known_code},
        headers=_hdr(token),
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()["phone_verified"] is True
    assert r.json()["user"]["phone_verified"] is True
    _cleanup(reg["user"]["id"])


def test_verify_my_phone_invalid_code_401():
    reg, _ = _fresh_provider()
    token = reg["access_token"]
    r = requests.post(
        f"{API}/auth/verify-my-phone",
        json={"code": "000000"},
        headers=_hdr(token),
        timeout=10,
    )
    assert r.status_code == 401
    _cleanup(reg["user"]["id"])


def test_verify_my_phone_bad_body_422():
    reg, _ = _fresh_provider()
    token = reg["access_token"]
    r = requests.post(
        f"{API}/auth/verify-my-phone",
        json={"code": "abc"},
        headers=_hdr(token),
        timeout=10,
    )
    assert r.status_code == 422
    _cleanup(reg["user"]["id"])


def test_verify_my_phone_requires_auth():
    r = requests.post(f"{API}/auth/verify-my-phone", json={"code": "123456"}, timeout=10)
    assert r.status_code == 401


# =========================================================================
# Booking confirmation blocked when provider is unverified
# =========================================================================

def test_unverified_provider_cannot_confirm_booking():
    reg_p, _ = _fresh_provider()
    reg_c = _fresh_client()
    prov_token = reg_p["access_token"]
    client_token = reg_c["access_token"]
    prov_id = reg_p["user"]["id"]
    _mark_unverified(prov_id)

    # Create a booking as the client
    body = {
        "provider_id": prov_id,
        "task_description": "Fix leaking sink",
        "scheduled_date": "2026-08-10",
        "task_type": "hourly",
        "address": "10 rue Didouche Mourad, Alger",
    }
    r = requests.post(f"{API}/bookings", json=body, headers=_hdr(client_token), timeout=10)
    assert r.status_code == 201, r.text
    booking_id = r.json()["id"]

    # Provider (unverified) attempts to confirm → 403
    r2 = requests.patch(
        f"{API}/bookings/{booking_id}/status",
        json={"status": "confirmed"},
        headers=_hdr(prov_token),
        timeout=10,
    )
    assert r2.status_code == 403, r2.text
    assert "verify" in r2.text.lower() and "phone" in r2.text.lower()

    # Provider CAN still cancel (never dead-end).
    r3 = requests.patch(
        f"{API}/bookings/{booking_id}/status",
        json={"status": "cancelled"},
        headers=_hdr(prov_token),
        timeout=10,
    )
    assert r3.status_code == 200, r3.text

    _cleanup(reg_p["user"]["id"])
    _cleanup(reg_c["user"]["id"])
    _db.bookings.delete_one({"id": booking_id})


def test_verified_provider_can_confirm_booking():
    reg_p, _ = _fresh_provider()
    reg_c = _fresh_client()
    prov_id = reg_p["user"]["id"]
    # Mark provider as phone_verified directly.
    _db.users.update_one({"id": prov_id}, {"$set": {"phone_verified": True}})

    body = {
        "provider_id": prov_id,
        "task_description": "Fix leaking sink",
        "scheduled_date": "2026-08-10",
        "task_type": "hourly",
        "address": "10 rue Didouche Mourad, Alger",
    }
    r = requests.post(f"{API}/bookings", json=body, headers=_hdr(reg_c["access_token"]), timeout=10)
    assert r.status_code == 201
    booking_id = r.json()["id"]

    r2 = requests.patch(
        f"{API}/bookings/{booking_id}/status",
        json={"status": "confirmed"},
        headers=_hdr(reg_p["access_token"]),
        timeout=10,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "confirmed"

    _cleanup(reg_p["user"]["id"])
    _cleanup(reg_c["user"]["id"])
    _db.bookings.delete_one({"id": booking_id})

