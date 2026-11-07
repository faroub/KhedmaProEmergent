"""Shared helpers for backend tests.

Provider registration requires a `phone_verification_token` since iteration 14
(OTP proof-of-ownership). In MOCK SMS mode we short-circuit the SMS by
inserting a deterministic bcrypt-hashed challenge straight into
`otp_challenges`, then exchange it for a token via the public
`/auth/otp/verify-for-registration` endpoint — exactly what the app does.
"""
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import requests
from pymongo import MongoClient

API = (
    os.environ.get("API_BASE")
    or f"{(os.environ.get('EXPO_PUBLIC_BACKEND_URL') or os.environ.get('EXPO_BACKEND_URL') or 'http://localhost:8001').rstrip('/')}/api"
)

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]

KNOWN_OTP = "910428"


def seed_otp_challenge(phone_e164: str, code: str = KNOWN_OTP) -> None:
    """Upsert a valid 5-minute OTP challenge for `phone_e164` with a known code."""
    now = datetime.now(timezone.utc)
    _db.otp_challenges.replace_one(
        {"phone_e164": phone_e164},
        {
            "phone_e164": phone_e164,
            "code_hash": bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode(),
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(minutes=5)).isoformat(),
        },
        upsert=True,
    )


def phone_verification_token(phone_e164: str, api: str = API) -> str:
    """Return a signed `phone_verification_token` for a phone that is not yet registered."""
    seed_otp_challenge(phone_e164)
    r = requests.post(
        f"{api}/auth/otp/verify-for-registration",
        json={"phone": phone_e164, "code": KNOWN_OTP},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["phone_verification_token"]


def with_phone_token(payload: dict, api: str = API) -> dict:
    """Add `phone_verification_token` to a provider registration payload (in place + returned)."""
    payload["phone_verification_token"] = phone_verification_token(payload["phone"], api)
    return payload


def skip_if_real_payment_provider(r: requests.Response) -> None:
    """`/subscription/pay` only returns the MOCK receipt when Chargily is not configured.

    When a Chargily key is present the endpoint returns a hosted checkout URL
    (200) or a 502 if Chargily is unreachable from this environment — in both
    cases the mock assertions do not apply.
    """
    import pytest

    if r.status_code == 200 and "checkout_url" in r.json():
        pytest.skip("Chargily configured — real checkout returned instead of mock receipt")
    if r.status_code == 502:
        pytest.skip("Chargily configured but unreachable from this environment")


# ---------------------------------------------------------------------------
# Account factories (P6) — every test module creates the accounts it needs
# with random credentials per run. Nothing depends on the dev seed
# (/api/seed) or on admin@khedmapro.dz anymore.
# ---------------------------------------------------------------------------

def fresh_provider(session=None, **overrides) -> dict:
    """Register a throwaway provider via the public API (phone-verified the same
    way the app does). Returns the /auth/register response body
    ({"access_token", "user": {...}}). `overrides` patch the payload, e.g.
    category/wilaya_code/full_name."""
    import uuid

    tag = uuid.uuid4().hex[:8]
    tail = "".join(str(uuid.uuid4().int % 10) for _ in range(8))
    payload = {
        "email": f"TEST_prov_{tag}@example.com",
        "password": "SuperStrongPw1!",
        "role": "service_provider",
        "full_name": f"TEST Provider {tag}",
        "category": "plumbing",
        "phone": f"+2136{tail}",
        "wilaya_code": "16",
    }
    payload.update(overrides)
    with_phone_token(payload)
    r = (session or requests).post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 201, r.text
    body = r.json()
    body["password"] = payload["password"]
    return body


def fresh_client(session=None) -> dict:
    """Register a throwaway client via the public API. Returns the
    /auth/register response body."""
    import uuid

    tag = uuid.uuid4().hex[:8]
    r = (session or requests).post(
        f"{API}/auth/register",
        json={
            "email": f"TEST_user_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": f"TEST Client {tag}",
        },
        timeout=15,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    body["password"] = "SuperStrongPw1!"
    return body


def make_admin() -> dict:
    """Insert a throwaway admin straight into MongoDB (there is no admin-
    registration API) and log in. Returns
    {"id", "email", "password", "token"}."""
    import uuid

    from security import hash_password

    tag = uuid.uuid4().hex[:10]
    email = f"test_admin_{tag}@example.com"  # lowercase: /auth/login lowercases emails
    password = f"ThrowawayAdmin-{tag}-pw"
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "phone": None,
        "password_hash": hash_password(password),
        "full_name": "TEST Admin",
        "role": "client",  # is_admin gates admin endpoints (same shape as the seeded admin)
        "city": "Alger",
        "is_admin": True,
        "rating": 0.0,
        "reviews_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "profile_complete": True,
        "auth_methods": ["password"],
    }
    _db.users.insert_one(doc)
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return {"id": doc["id"], "email": email, "password": password,
            "token": r.json()["access_token"]}
