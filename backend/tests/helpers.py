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
