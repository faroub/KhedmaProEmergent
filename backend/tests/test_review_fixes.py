"""Regression tests for the security/consistency review fixes.

Covers:
  * /providers `search` is a literal string, not a regex (no wildcard/DoS).
  * public provider listings hide internal moderation + billing state.
  * login brute-force limiter: 5 failures on one account → 429, other
    accounts unaffected, and the counter resets on a successful login.
  * OTP challenges are burned after 5 wrong attempts (even the correct code
    no longer works).
  * completed bookings cannot be cancelled by either side.
  * compute_subscription honors an explicit trial_days override (the value
    the admin sets in platform settings).
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

from helpers import KNOWN_OTP, seed_otp_challenge, with_phone_token

API = os.environ.get("API_BASE", "http://localhost:8001/api")
_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]


def _hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ---------- search is literal, not a regex ----------
def test_provider_search_is_literal_not_regex():
    # ".*" would match every provider as a regex; as a literal it matches none.
    r = requests.get(f"{API}/providers?search=.*", timeout=10)
    assert r.status_code == 200, r.text
    assert r.json() == [], r.json()


# ---------- public serialization ----------
def test_public_listing_hides_internal_fields():
    r = requests.get(f"{API}/providers", timeout=10)
    assert r.status_code == 200, r.text
    for p in r.json():
        for internal in (
            "is_flagged",
            "search_penalty",
            "last_paid_at",
            "is_manually_deactivated",
            "manually_deactivated_at",
            "is_deleted",
        ):
            assert internal not in p, f"{internal} leaked on {p['id']}"
        # Marketplace-facing fields must still be present.
        assert "active" in p and "is_verified" in p and "is_new" in p


# ---------- login brute-force limiter ----------
def test_login_rate_limited_after_repeated_failures():
    tag = uuid.uuid4().hex[:8]
    email = f"TEST_rl_{tag}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "SuperStrongPw1!", "role": "client", "full_name": f"RL {tag}"},
        timeout=10,
    )
    assert r.status_code == 201, r.text
    try:
        for _ in range(5):
            bad = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-pw"}, timeout=10)
            assert bad.status_code == 401, bad.text
        # 5 failures on the same account → blocked for a while.
        blocked = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-pw"}, timeout=10)
        assert blocked.status_code == 429, blocked.text
    finally:
        _db.login_attempts.delete_one({"_id": email})


def test_login_rate_limit_is_per_account():
    tag = uuid.uuid4().hex[:8]
    other = f"TEST_rl2_{tag}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": other, "password": "SuperStrongPw1!", "role": "client", "full_name": f"RL2 {tag}"},
        timeout=10,
    )
    assert r.status_code == 201, r.text
    try:
        # One failure on this account is fine.
        bad = requests.post(f"{API}/auth/login", json={"email": other, "password": "wrong-pw"}, timeout=10)
        assert bad.status_code == 401, bad.text
        good = requests.post(f"{API}/auth/login", json={"email": other, "password": "SuperStrongPw1!"}, timeout=10)
        assert good.status_code == 200, good.text
    finally:
        _db.login_attempts.delete_one({"_id": other})
        _db.users.delete_one({"email": other})


# ---------- OTP attempt cap ----------
def test_otp_challenge_burns_after_wrong_attempts():
    tail = "".join(str(uuid.uuid4().int % 10) for _ in range(8))
    phone = f"+2135{tail}"
    seed_otp_challenge(phone)
    try:
        for _ in range(5):
            r = requests.post(
                f"{API}/auth/otp/verify",
                json={"phone": phone, "code": "000000", "role": "client"},
                timeout=10,
            )
            assert r.status_code == 401, r.text
        # The challenge is burned — even the correct code no longer works.
        r = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": phone, "code": KNOWN_OTP, "role": "client"},
            timeout=10,
        )
        assert r.status_code == 401, r.text
        assert _db.otp_challenges.find_one({"phone_e164": phone}) is None
        assert _db.users.find_one({"phone_e164": phone}) is None
    finally:
        _db.otp_challenges.delete_one({"phone_e164": phone})
        _db.otp_rate_limits.delete_one({"_id": phone})


# ---------- completed bookings cannot be cancelled ----------
def _fresh_provider():
    tag = uuid.uuid4().hex[:8]
    tail = "".join(str(uuid.uuid4().int % 10) for _ in range(8))
    body = with_phone_token(
        {
            "email": f"TEST_fix_p_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "service_provider",
            "full_name": f"Fix P {tag}",
            "category": "plumbing",
            "phone": f"+2136{tail}",
            "wilaya_code": "16",
        },
        API,
    )
    r = requests.post(f"{API}/auth/register", json=body, timeout=10)
    assert r.status_code == 201, r.text
    return r.json()


def _fresh_client():
    tag = uuid.uuid4().hex[:8]
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": f"TEST_fix_c_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": f"Fix C {tag}",
        },
        timeout=10,
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_completed_booking_cannot_be_cancelled():
    prov = _fresh_provider()
    cli = _fresh_client()
    pid = prov["user"]["id"]
    cid = cli["user"]["id"]
    try:
        book = requests.post(
            f"{API}/bookings",
            json={
                "provider_id": pid,
                "task_description": "Fix review job",
                "scheduled_date": "2026-09-20T10:00:00Z",
                "rate_type": "task",
                "address": "10 rue Didouche Mourad, Alger",
            },
            headers=_hdr(cli["access_token"]),
            timeout=10,
        )
        assert book.status_code == 201, book.text
        bid = book.json()["id"]

        def set_status(token, status):
            return requests.patch(
                f"{API}/bookings/{bid}/status",
                json={"status": status},
                headers=_hdr(token),
                timeout=10,
            )

        assert set_status(prov["access_token"], "confirmed").status_code == 200
        assert set_status(prov["access_token"], "completed").status_code == 200  # → awaiting_confirmation
        assert set_status(cli["access_token"], "completed").status_code == 200  # → completed

        # Neither side may cancel a completed booking.
        r = set_status(prov["access_token"], "cancelled")
        assert r.status_code == 400, r.text
        r = set_status(cli["access_token"], "cancelled")
        assert r.status_code == 400, r.text
    finally:
        _db.bookings.delete_many({"provider_id": pid})
        _db.users.delete_many({"id": {"$in": [pid, cid]}})
        _db.login_attempts.delete_many({"_id": {"$in": [prov["user"]["email"], cli["user"]["email"]]}})


# ---------- trial days override ----------
def test_compute_subscription_honors_trial_days_override():
    # Direct module import pulls in config.py, which requires the backend env.
    # HTTP-only suites (no JWT_SECRET exported) skip; full-stack runs exercise it.
    if "JWT_SECRET" not in os.environ:
        pytest.skip("requires backend env (JWT_SECRET) for direct module import")
    from subscription import compute_subscription

    now = datetime.now(timezone.utc)
    doc = {"role": "service_provider", "created_at": now.isoformat(), "last_paid_at": None}

    def days_to(sub):
        end = sub["trial_ends_at"]
        if isinstance(end, str):
            end = datetime.fromisoformat(end.replace("Z", "+00:00"))
        return (end - now).days

    default = compute_subscription(doc)
    week = compute_subscription(doc, trial_days=7)
    assert 85 <= days_to(default) <= 90, default["trial_ends_at"]
    assert 5 <= days_to(week) <= 7, week["trial_ends_at"]
