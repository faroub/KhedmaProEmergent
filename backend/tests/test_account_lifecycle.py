"""Backend tests for khedmaPro account-lifecycle + subscription (iteration 7).

Covers:
- POST /api/users/me/deactivate + /reactivate + /delete (client & provider)
- GET  /api/subscription/status (provider)
- POST /api/subscription/pay (provider)
- Hiding manually_deactivated & deleted providers from GET /api/providers
- Booking rejection (410) against deactivated/deleted providers
- Login 410 on deleted accounts (email/password)
- /api/auth/me 410 on deleted accounts
- Post-test restoration of provider1 so subsequent runs still work
"""
import os
import time
import uuid
from datetime import datetime, timezone

import pytest
import requests

from helpers import skip_if_real_payment_provider

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
API = f"{BASE_URL}/api"

PROVIDER_EMAIL = "provider1@khedmapro.dz"
PROVIDER_PWD = "password123"


# ---------- fixtures --------------------------------------------------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, password):
    r = api.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _restore_provider1_via_mongo():
    """Reset provider1 flags directly in Mongo so re-runs are safe."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")

    async def _run():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        await db.users.update_one(
            {"email": PROVIDER_EMAIL},
            {"$set": {
                "is_deleted": False,
                "is_manually_deactivated": False,
                "deleted_at": None,
                "manually_deactivated_at": None,
                "last_paid_at": None,
            }},
        )
        client.close()

    asyncio.run(_run())


# ---------- provider lifecycle ---------------------------------------------
class TestProviderLifecycle:
    """Full provider1 lifecycle: status → deactivate → hidden → reactivate → pay → delete → restore."""

    @pytest.fixture(scope="class", autouse=True)
    def _restore_before_after(self):
        _restore_provider1_via_mongo()
        yield
        _restore_provider1_via_mongo()

    def test_01_login_provider1(self, api):
        r = _login(api, PROVIDER_EMAIL, PROVIDER_PWD)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == PROVIDER_EMAIL
        pytest.provider_token = body["access_token"]
        pytest.provider_id = body["user"]["id"]

    def test_02_subscription_status_trial(self, api):
        r = api.get(f"{API}/subscription/status", headers=_auth(pytest.provider_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["subscription_status"] == "trial", data
        assert data["active"] is True
        assert isinstance(data["days_until_due"], int)
        assert data["days_until_due"] > 0
        assert data["fee_dzd"] == 1000
        assert data["trial_days"] == 90
        assert data["is_manually_deactivated"] is False
        assert data["is_deleted"] is False

    def test_03_deactivate_account(self, api):
        r = api.post(f"{API}/users/me/deactivate", headers=_auth(pytest.provider_token))
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["is_manually_deactivated"] is True
        assert u["active"] is False

    def test_04_deactivated_provider_hidden_from_list(self, api):
        r = requests.get(f"{API}/providers")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert pytest.provider_id not in ids, "Deactivated provider should be hidden from /providers"

    def test_05_booking_against_deactivated_provider_410(self, api):
        payload = {
            "provider_id": pytest.provider_id,
            "scheduled_date": "2026-06-01T10:00:00Z",
            "task_description": "TEST_deactivated booking",
            "address": "TEST address",
            "rate_type": "task",
            "guest_name": "TEST Guest",
            "guest_phone": "+213555000111",
        }
        r = requests.post(f"{API}/bookings", json=payload)
        assert r.status_code == 410, f"expected 410, got {r.status_code}: {r.text}"

    def test_06_reactivate_account(self, api):
        r = api.post(f"{API}/users/me/reactivate", headers=_auth(pytest.provider_token))
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["is_manually_deactivated"] is False

        # confirm it's back in listings
        lst = requests.get(f"{API}/providers").json()
        assert pytest.provider_id in [p["id"] for p in lst]

    def test_07_pay_subscription(self, api):
        r = api.post(f"{API}/subscription/pay", headers=_auth(pytest.provider_token))
        skip_if_real_payment_provider(r)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        assert body["amount_dzd"] == 1000

        # re-check status
        s = api.get(f"{API}/subscription/status", headers=_auth(pytest.provider_token)).json()
        assert s["subscription_status"] == "active", s
        assert s["last_paid_at"] is not None
        assert 28 <= s["days_until_due"] <= 30, s

    def test_08_delete_account_blocks_login_and_me(self, api):
        r = api.post(f"{API}/users/me/delete", headers=_auth(pytest.provider_token))
        assert r.status_code == 200, r.text

        # login must now be 410
        login_r = _login(api, PROVIDER_EMAIL, PROVIDER_PWD)
        assert login_r.status_code == 410, f"login should be 410: {login_r.status_code} {login_r.text}"

        # /auth/me with the old token must also be 410
        me_r = api.get(f"{API}/auth/me", headers=_auth(pytest.provider_token))
        assert me_r.status_code == 410, f"/auth/me should be 410: {me_r.status_code} {me_r.text}"

    def test_09_deleted_provider_returns_404_on_detail(self, api):
        r = requests.get(f"{API}/providers/{pytest.provider_id}")
        assert r.status_code == 404, f"expected 404, got {r.status_code}"

    def test_10_restore_provider1_via_mongo(self, api):
        _restore_provider1_via_mongo()
        # verify login works again
        r = _login(api, PROVIDER_EMAIL, PROVIDER_PWD)
        assert r.status_code == 200, r.text


# ---------- fresh client lifecycle -----------------------------------------
class TestClientLifecycle:
    """Register a fresh client, deactivate, reactivate, delete → 410 on next login."""

    @pytest.fixture(scope="class")
    def client_creds(self, api):
        email = f"test_client_{uuid.uuid4().hex[:8]}@khedmapro.dz"
        payload = {
            "email": email,
            "password": "password123",
            "full_name": "TEST Client",
            "role": "client",
            "phone": f"+2135550{int(time.time()) % 100000:05d}",
        }
        r = api.post(f"{API}/auth/register", json=payload)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        return {"email": email, "password": "password123",
                "token": body["access_token"], "id": body["user"]["id"]}

    def test_01_deactivate_reactivate_client(self, api, client_creds):
        d = api.post(f"{API}/users/me/deactivate", headers=_auth(client_creds["token"]))
        assert d.status_code == 200, d.text
        assert d.json()["user"]["is_manually_deactivated"] is True

        # a deactivated client's /auth/me still works (only deleted is 410)
        me = api.get(f"{API}/auth/me", headers=_auth(client_creds["token"]))
        assert me.status_code == 200, me.text

        r = api.post(f"{API}/users/me/reactivate", headers=_auth(client_creds["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["user"]["is_manually_deactivated"] is False

    def test_02_delete_client_blocks_login(self, api, client_creds):
        r = api.post(f"{API}/users/me/delete", headers=_auth(client_creds["token"]))
        assert r.status_code == 200, r.text

        login = _login(api, client_creds["email"], client_creds["password"])
        assert login.status_code == 410, f"login post-delete should be 410, got {login.status_code}"

    def test_03_deleted_client_auth_me_410(self, api, client_creds):
        me = api.get(f"{API}/auth/me", headers=_auth(client_creds["token"]))
        assert me.status_code == 410
