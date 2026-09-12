"""Backend tests for OTP phone-number authentication (MOCK mode) + profile completion."""
import os
import re
import time
import uuid
import subprocess
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
API = f"{BASE_URL}/api"

# Mongo access for direct manipulation of otp_challenges / rate limits
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

LOG_PATH = "/var/log/supervisor/backend.err.log"


def _fresh_national() -> str:
    """Return a fresh 9-digit Algerian national number starting with 5/6/7."""
    n = uuid.uuid4().int
    # Use "5" prefix + 8 digits from uuid
    return "5" + f"{n:08d}"[-8:]


def _fresh_phone_variants():
    nat = _fresh_national()
    return {
        "national": nat,           # 555XXXXXXX
        "zero": "0" + nat,         # 0555XXXXXXX
        "plus": "+213" + nat,      # +213555XXXXXXX
        "double_zero": "00213" + nat,
        "e164": "+213" + nat,
    }


def _grep_mock_otp(phone_e164: str) -> str | None:
    """Grep the newest MOCK OTP code for a given phone from backend stderr."""
    try:
        out = subprocess.check_output(
            ["tail", "-n", "500", LOG_PATH], text=True, stderr=subprocess.DEVNULL
        )
    except Exception:
        return None
    # Match lines like:
    #   "[MOCK SMS] to=+213555000123 msg='khedmaPro: your verification code is 775524. …'"
    matches = re.findall(
        rf"\[MOCK SMS\] to={re.escape(phone_e164)} msg='[^']*?code is (\d{{6}})", out
    )
    return matches[-1] if matches else None


def _cleanup_phone(phone_e164: str):
    _db.otp_challenges.delete_many({"phone_e164": phone_e164})
    _db.otp_rate_limits.delete_many({"_id": phone_e164})
    _db.users.delete_many({"phone_e164": phone_e164})


# ------------------------------ /auth/otp/request ------------------------------

class TestOtpRequestValidation:
    def test_short_phone_returns_422(self):
        r = requests.post(f"{API}/auth/otp/request", json={"phone": "123"})
        assert r.status_code == 422, r.text

    def test_non_algerian_returns_400(self):
        # 10 digits but not Algerian pattern (starts with 1, not [567])
        r = requests.post(f"{API}/auth/otp/request", json={"phone": "1234567890"})
        assert r.status_code == 400
        assert "Invalid Algerian phone number" in r.json().get("detail", "")

    def test_normalizes_various_formats_to_same_e164(self):
        v = _fresh_phone_variants()
        e164 = v["e164"]
        _cleanup_phone(e164)

        # Send first variant
        r1 = requests.post(f"{API}/auth/otp/request", json={"phone": v["zero"]})
        assert r1.status_code == 200, r1.text

        # There should be exactly one challenge doc for the normalized number
        doc = _db.otp_challenges.find_one({"phone_e164": e164})
        assert doc is not None, f"No challenge stored for {e164}"

        # A follow-up request with a different-format phone would hit the 30s
        # rate-limit; the fact that it's rate-limited proves normalization.
        r2 = requests.post(f"{API}/auth/otp/request", json={"phone": v["plus"]})
        assert r2.status_code == 429
        assert "30 seconds" in r2.json().get("detail", "")

        _cleanup_phone(e164)

    def test_success_logs_mock_otp_to_stderr(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        r = requests.post(f"{API}/auth/otp/request", json={"phone": v["zero"]})
        assert r.status_code == 200
        time.sleep(0.5)  # give supervisor stderr a moment to flush
        code = _grep_mock_otp(v["e164"])
        assert code is not None, f"Expected MOCK OTP log line for {v['e164']}"
        assert re.fullmatch(r"\d{6}", code)
        _cleanup_phone(v["e164"])


class TestOtpRateLimits:
    def test_second_request_within_30s_returns_429(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        r1 = requests.post(f"{API}/auth/otp/request", json={"phone": v["zero"]})
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/otp/request", json={"phone": v["zero"]})
        assert r2.status_code == 429
        assert "30 seconds" in r2.json().get("detail", "")
        _cleanup_phone(v["e164"])

    def test_sixth_request_within_hour_returns_429(self):
        v = _fresh_phone_variants()
        e164 = v["e164"]
        _cleanup_phone(e164)
        now = datetime.now(timezone.utc)
        # Seed rate-limits doc with 5 requests already in this hour, last one 40s ago
        _db.otp_rate_limits.update_one(
            {"_id": e164},
            {"$set": {
                "last_sent_at": (now - timedelta(seconds=40)).isoformat(),
                "hour_started_at": (now - timedelta(minutes=10)).isoformat(),
                "hour_count": 5,
            }},
            upsert=True,
        )
        r = requests.post(f"{API}/auth/otp/request", json={"phone": v["zero"]})
        assert r.status_code == 429
        assert "Too many OTP requests" in r.json().get("detail", "")
        _cleanup_phone(e164)


# ------------------------------ /auth/otp/verify -------------------------------

class TestOtpVerify:
    def _req_and_grab(self, phone_zero: str, phone_e164: str) -> str:
        r = requests.post(f"{API}/auth/otp/request", json={"phone": phone_zero})
        assert r.status_code == 200, r.text
        time.sleep(0.6)
        code = _grep_mock_otp(phone_e164)
        assert code is not None
        return code

    def test_wrong_code_returns_401(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        self._req_and_grab(v["zero"], v["e164"])
        r = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": "000000", "role": "client"},
        )
        assert r.status_code == 401
        assert "Invalid or expired" in r.json().get("detail", "")
        _cleanup_phone(v["e164"])

    def test_correct_code_new_client_returns_new_user_true(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        code = self._req_and_grab(v["zero"], v["e164"])
        r = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": code, "role": "client"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_new_user"] is True
        assert body["profile_complete"] is False
        assert "access_token" in body
        assert body["user"]["role"] == "client"
        _cleanup_phone(v["e164"])

    def test_reuse_of_same_code_returns_401(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        code = self._req_and_grab(v["zero"], v["e164"])
        r1 = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": code, "role": "client"},
        )
        assert r1.status_code == 200
        r2 = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": code, "role": "client"},
        )
        assert r2.status_code == 401
        _cleanup_phone(v["e164"])

    def test_expired_challenge_returns_401(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        self._req_and_grab(v["zero"], v["e164"])
        code = _grep_mock_otp(v["e164"])
        # Manually expire the challenge
        past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        _db.otp_challenges.update_one(
            {"phone_e164": v["e164"]}, {"$set": {"expires_at": past}}
        )
        r = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": code, "role": "client"},
        )
        assert r.status_code == 401
        _cleanup_phone(v["e164"])

    def test_code_stored_as_bcrypt_hash_no_plaintext(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        code = self._req_and_grab(v["zero"], v["e164"])
        doc = _db.otp_challenges.find_one({"phone_e164": v["e164"]})
        assert doc is not None
        # Plaintext must not appear anywhere in the stored doc
        joined = " ".join(str(x) for x in doc.values())
        assert code not in joined
        assert doc.get("code_hash", "").startswith("$2")  # bcrypt prefix
        _cleanup_phone(v["e164"])

    def test_existing_user_role_not_overwritten(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        # 1st: create user as client
        code1 = self._req_and_grab(v["zero"], v["e164"])
        r1 = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": code1, "role": "client"},
        )
        assert r1.status_code == 200
        assert r1.json()["is_new_user"] is True

        # Wait 31s to bypass 30s cooldown OR clear the rate-limit doc directly
        _db.otp_rate_limits.delete_many({"_id": v["e164"]})

        # 2nd: re-verify claiming role=service_provider — must NOT overwrite
        code2 = self._req_and_grab(v["zero"], v["e164"])
        r2 = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": code2, "role": "service_provider"},
        )
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2["is_new_user"] is False
        assert body2["user"]["role"] == "client", "Existing user role must be preserved"
        _cleanup_phone(v["e164"])


# ------------------------------ /users/me/profile ------------------------------

class TestProfileComplete:
    def _new_client(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        requests.post(f"{API}/auth/otp/request", json={"phone": v["zero"]})
        time.sleep(0.6)
        code = _grep_mock_otp(v["e164"])
        r = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": code, "role": "client"},
        )
        return r.json()["access_token"], v["e164"]

    def _new_provider(self):
        v = _fresh_phone_variants()
        _cleanup_phone(v["e164"])
        requests.post(f"{API}/auth/otp/request", json={"phone": v["zero"]})
        time.sleep(0.6)
        code = _grep_mock_otp(v["e164"])
        r = requests.post(
            f"{API}/auth/otp/verify",
            json={"phone": v["zero"], "code": code, "role": "service_provider"},
        )
        return r.json()["access_token"], v["e164"]

    def test_profile_no_auth_returns_401(self):
        r = requests.patch(
            f"{API}/users/me/profile",
            json={"full_name": "TEST_no_auth"},
        )
        assert r.status_code == 401

    def test_client_profile_success(self):
        token, phone = self._new_client()
        r = requests.patch(
            f"{API}/users/me/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"full_name": "TEST_Client Name", "city": "Algiers"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["full_name"] == "TEST_Client Name"
        assert body["city"] == "Algiers"

        # Verify via /auth/me
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["full_name"] == "TEST_Client Name"
        _cleanup_phone(phone)

    def test_provider_profile_requires_category(self):
        token, phone = self._new_provider()
        r = requests.patch(
            f"{API}/users/me/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"full_name": "TEST_Provider"},
        )
        assert r.status_code == 400
        assert "Category required" in r.json().get("detail", "")
        _cleanup_phone(phone)

    def test_jwt_from_otp_accepted_by_me(self):
        token, phone = self._new_client()
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["role"] == "client"
        _cleanup_phone(phone)


# ------------------------------ Regression -------------------------------------

class TestRegression:
    def test_password_login_still_works(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": "provider1@khedmapro.dz", "password": "password123"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["user"]["role"] == "service_provider"

    def test_providers_list(self):
        r = requests.get(f"{API}/providers")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_categories_list(self):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200
        assert len(r.json()) >= 10
