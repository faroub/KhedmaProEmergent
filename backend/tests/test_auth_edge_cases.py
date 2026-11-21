"""P14 — hardened auth edges.

- login for an unknown email pays the full bcrypt cost (timing-safe) and
  returns the same 401 shape
- /auth/otp/verify-for-registration no longer 409s for numbers that are
  already registered (the duplicate check lives in /auth/register)
- phone-verification tokens carry a single-use jti; replays are rejected
- the register duplicate-key race returns the same 409 messages as the
  pre-checks (patched race: find_one sees nothing, insert raises)
"""
import asyncio
import os
import time
import uuid
from types import SimpleNamespace

import pytest
import requests
from fastapi import HTTPException
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from helpers import API, KNOWN_OTP, fresh_client, fresh_provider, phone_verification_token, seed_otp_challenge
from schemas import RegisterIn
from security import decode_phone_verification_token, make_phone_verification_token

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _random_phone() -> str:
    return f"+2136{uuid.uuid4().int % 10**8:08d}"


# ------------------------------------------------------------------ login

def test_login_unknown_email_returns_same_401_shape():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": f"ghost_{uuid.uuid4().hex}@example.com", "password": "whatever"},
        timeout=15,
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Incorrect email or password"


def test_login_unknown_email_pays_the_bcrypt_cost():
    """A dummy hash is checked for unknown emails so the response time cannot
    be used to distinguish existing from non-existing accounts."""
    start = time.perf_counter()
    requests.post(
        f"{API}/auth/login",
        json={"email": f"ghost_{uuid.uuid4().hex}@example.com", "password": "whatever"},
        timeout=15,
    )
    elapsed = time.perf_counter() - start
    # bcrypt with the default cost factor takes well over 50ms even on fast
    # hardware; before P14 this path did no hashing at all.
    assert elapsed > 0.05, f"unknown-email login took only {elapsed:.3f}s"


# ------------------------------------------- verify-for-registration 409

def test_verify_for_registration_no_longer_409s_for_registered_phone():
    phone = _random_phone()
    holder = fresh_client()
    MongoClient(MONGO_URL)[DB_NAME].users.update_one(
        {"id": holder["user"]["id"]}, {"$set": {"phone_e164": phone}}
    )
    seed_otp_challenge(phone)
    r = requests.post(
        f"{API}/auth/otp/verify-for-registration",
        json={"phone": phone, "code": KNOWN_OTP},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert "phone_verification_token" in r.json()


def test_register_still_rejects_duplicate_phone_with_409():
    provider = fresh_provider()
    payload = {
        "email": f"p14_dup_{uuid.uuid4().hex[:8]}@example.com",
        "password": "SuperStrongPw1!",
        "role": "service_provider",
        "full_name": "P14 Dup",
        "category": "plumbing",
        "phone": provider["user"]["phone"],
        "wilaya_code": "16",
        "phone_verification_token": phone_verification_token(provider["user"]["phone"]),
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 409
    assert r.json()["detail"] == "This phone number is already registered"


# ------------------------------------------------------------- jti single-use

def test_phone_tokens_carry_unique_jti():
    j1 = decode_phone_verification_token(make_phone_verification_token("+213600000001"))["jti"]
    j2 = decode_phone_verification_token(make_phone_verification_token("+213600000001"))["jti"]
    assert j1 and j2
    assert j1 != j2


class _FakeUsersCollection:
    def __init__(self, find_one_result=None, insert_error=None):
        self.find_one_result = find_one_result
        self.insert_error = insert_error

    async def find_one(self, query, *args, **kwargs):
        if callable(self.find_one_result):
            return self.find_one_result(query)
        return self.find_one_result

    async def insert_one(self, doc):
        if self.insert_error:
            raise self.insert_error
        return SimpleNamespace(inserted_id=doc.get("id"))


class _FakeUsedTokenCollection:
    """Mimics the unique index on _id: the same jti cannot be consumed twice."""

    def __init__(self):
        self._ids = set()

    async def insert_one(self, doc):
        if doc["_id"] in self._ids:
            raise DuplicateKeyError("E11000 duplicate key error collection: used_phone_tokens")
        self._ids.add(doc["_id"])
        return SimpleNamespace(inserted_id=doc["_id"])


def _register_in_process(monkeypatch, mongodb, payload: dict):
    import routes.auth as auth

    monkeypatch.setattr(auth, "db", mongodb)
    return asyncio.run(auth.register(RegisterIn(**payload)))


def _provider_payload(token: str, phone: str) -> dict:
    return {
        "email": f"p14_{uuid.uuid4().hex[:8]}@example.com",
        "password": "SuperStrongPw1!",
        "role": "service_provider",
        "full_name": "P14 Race",
        "category": "plumbing",
        "phone": phone,
        "wilaya_code": "16",
        "phone_verification_token": token,
    }


def test_register_duplicate_key_race_returns_precheck_messages(monkeypatch):
    """find_one returns None (a concurrent registration won the race) and the
    insert raises DuplicateKeyError → same 409 as the pre-checks would give."""
    phone = _random_phone()
    token = phone_verification_token(phone)
    payload = _provider_payload(token, phone)
    users = _FakeUsersCollection(find_one_result=None, insert_error=DuplicateKeyError("E11000"))
    mongodb = SimpleNamespace(users=users, used_phone_tokens=_FakeUsedTokenCollection())
    with pytest.raises(HTTPException) as exc:
        _register_in_process(monkeypatch, mongodb, payload)
    assert exc.value.status_code == 409
    assert exc.value.detail == "This phone number is already registered"

    # email-variant: the re-check finds the colliding email
    users = _FakeUsersCollection(
        find_one_result=lambda query: {"id": "existing"} if "email" in query else None,
        insert_error=DuplicateKeyError("E11000"),
    )
    mongodb = SimpleNamespace(users=users, used_phone_tokens=_FakeUsedTokenCollection())
    with pytest.raises(HTTPException) as exc:
        _register_in_process(monkeypatch, mongodb, payload)
    assert exc.value.status_code == 409
    assert exc.value.detail == "Email is already registered"


def test_phone_verification_token_replay_is_rejected(monkeypatch):
    """The jti is consumed before the insert, so a registration that lost the
    race cannot be retried with the same verification token."""
    phone = _random_phone()
    token = phone_verification_token(phone)
    payload = _provider_payload(token, phone)
    users = _FakeUsersCollection(find_one_result=None, insert_error=DuplicateKeyError("E11000"))
    mongodb = SimpleNamespace(users=users, used_phone_tokens=_FakeUsedTokenCollection())

    with pytest.raises(HTTPException) as exc:
        _register_in_process(monkeypatch, mongodb, payload)
    assert exc.value.status_code == 409  # insert lost the race, jti consumed

    replay = dict(payload, email=f"p14_{uuid.uuid4().hex[:8]}_second@example.com")
    with pytest.raises(HTTPException) as exc:
        _register_in_process(monkeypatch, mongodb, replay)
    assert exc.value.status_code == 400
    assert "already been used" in exc.value.detail


def test_verify_otp_duplicate_key_race_handled(monkeypatch):
    import routes.otp as otp_mod
    from schemas import OtpVerifyIn, Role

    phone = "+213550112233"

    class FakeChallengesColl:
        async def find_one(self, query, projection=None):
            return {"phone_e164": phone, "code_hash": "$2b$12$12345678901234567890123456789012345678901234567890123", "expires_at": "2099-01-01T00:00:00+00:00", "attempts": 0}
        async def delete_one(self, query):
            return SimpleNamespace(deleted_count=1)

    class FakeUsersColl:
        def __init__(self):
            self.inserted = False
        async def find_one(self, query, projection=None):
            if not self.inserted:
                return None
            return {"id": "user-race-1", "phone_e164": phone, "role": "client", "full_name": "Race User", "token_version": 0}
        async def insert_one(self, doc):
            self.inserted = True
            raise DuplicateKeyError("E11000 duplicate key error")
        async def update_one(self, query, update):
            pass

    fake_users = FakeUsersColl()

    class FakeRateLimitsColl:
        async def find_one_and_update(self, *args, **kwargs):
            return {"count": 1}

    fake_db = SimpleNamespace(
        otp_challenges=FakeChallengesColl(),
        users=fake_users,
        rate_limits=FakeRateLimitsColl(),
    )
    monkeypatch.setattr(otp_mod, "db", fake_db)
    import database as db_mod
    import ratelimit as rl_mod
    monkeypatch.setattr(db_mod, "db", fake_db)
    monkeypatch.setattr(rl_mod, "db", fake_db)

    async def fake_checkpw(code_bytes, hash_bytes):
        return True

    import bcrypt
    monkeypatch.setattr(bcrypt, "checkpw", fake_checkpw)

    class FakeRequest:
        client = None

    body = OtpVerifyIn(phone="0550112233", code="123456", role=Role.client)
    res = asyncio.run(otp_mod.verify_otp(body, FakeRequest()))
    assert res["access_token"]
    assert res["is_new_user"] is False
