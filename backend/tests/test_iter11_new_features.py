"""Iteration 11 — Feature tests for:
  1) Phone reveal behind bookings   (/api/users/{id}/phone)
  2) Two-step booking completion   (PATCH /api/bookings/{id}/status)
  3) Auto-flagging + admin /flags   (with seeded stale bookings)
  4) Chargily webhook wiring       (/api/webhooks/chargily signature verification)
  5) Regression: /api/subscription/pay still mock in this env

Cleans up all seeded documents in the fixture teardown.
"""
import os
import time
import uuid
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load backend/.env so we can reach MongoDB directly for seeding + cleanup.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"] if "EXPO_PUBLIC_BACKEND_URL" in os.environ else None
if not BASE:
    # Fallback: read frontend/.env
    fe_env = Path("/app/frontend/.env").read_text()
    for line in fe_env.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().strip('"')
            break
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def state():
    return {}


@pytest.fixture(scope="module")
def provider1_token():
    r = requests.post(f"{API}/auth/login", json={"email": "provider1@khedmapro.dz", "password": "password123"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@khedmapro.dz", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def fresh_client():
    """Create a throwaway client account (registered with a unique email)."""
    email = f"TEST_iter11_client_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": email,
        "password": "password123",
        "role": "client",
        "full_name": "TEST Iter11 Client",
        "phone": "+213555000999",
    }
    r = requests.post(f"{API}/auth/register", json=payload)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return {"email": email, "token": body["access_token"], "id": body["user"]["id"]}


@pytest.fixture(scope="module", autouse=True)
def cleanup(state, provider1_token):
    """Runs teardown after all tests: delete seeded bookings, reset provider1, delete test client."""
    yield
    import asyncio

    async def _cleanup():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        prov_id = provider1_token["user"]["id"]
        # Remove test bookings
        bids = state.get("booking_ids", [])
        if bids:
            await db.bookings.delete_many({"id": {"$in": bids}})
        # Remove seeded stale bookings
        seed_bids = state.get("seeded_stale_ids", [])
        if seed_bids:
            await db.bookings.delete_many({"id": {"$in": seed_bids}})
        # Reset provider1
        await db.users.update_one(
            {"id": prov_id},
            {"$set": {
                "is_flagged": False,
                "search_penalty": 0,
                "is_manually_deactivated": False,
                "manually_deactivated_at": None,
                "deactivated_reason": None,
                "last_paid_at": None,
            },
             "$unset": {"completion_rate": "", "flagged_at": "", "flag_reason": "",
                        "completed_count_window": "", "confirmed_count_window": ""}},
        )
        # Delete flags for provider1
        await db.flags.delete_many({"provider_id": prov_id})
        # Truncate phone_reveals for the test client + provider1
        client_id = state.get("client_id")
        if client_id:
            await db.phone_reveals.delete_many({"$or": [{"viewer_id": client_id}, {"target_id": client_id}]})
            await db.users.delete_one({"id": client_id})
        # Truncate chargily_events created during test
        cev_ids = state.get("chargily_event_ids", [])
        if cev_ids:
            await db.chargily_events.delete_many({"event_id": {"$in": cev_ids}})
        client.close()

    asyncio.run(_cleanup())


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ================= 1) Phone reveal =================
class TestPhoneReveal:
    def test_own_id_400(self, provider1_token):
        pid = provider1_token["user"]["id"]
        r = requests.get(f"{API}/users/{pid}/phone", headers=_hdr(provider1_token["access_token"]))
        assert r.status_code == 400, r.text

    def test_no_booking_403(self, provider1_token):
        random_id = str(uuid.uuid4())
        r = requests.get(f"{API}/users/{random_id}/phone", headers=_hdr(provider1_token["access_token"]))
        assert r.status_code == 403, r.text
        assert "confirmed" in r.json()["detail"].lower()

    def test_before_confirm_403(self, provider1_token, fresh_client, state):
        state["client_id"] = fresh_client["id"]
        # Create booking as client → provider1
        prov_id = provider1_token["user"]["id"]
        payload = {
            "provider_id": prov_id,
            "scheduled_date": datetime.now(timezone.utc).isoformat(),
            "task_description": "TEST iter11 task",
            "address": "TEST addr",
            "rate_type": "hourly",
            "estimated_hours": 1,
        }
        r = requests.post(f"{API}/bookings", json=payload, headers=_hdr(fresh_client["token"]))
        assert r.status_code == 201, r.text
        b = r.json()
        state["booking_ids"] = [b["id"]]
        state["primary_booking_id"] = b["id"]

        # Before confirm: reveal should 403
        r = requests.get(f"{API}/users/{prov_id}/phone", headers=_hdr(fresh_client["token"]))
        assert r.status_code == 403, r.text

    def test_after_confirm_reveal_ok_both_ways(self, provider1_token, fresh_client, state):
        prov_id = provider1_token["user"]["id"]
        bid = state["primary_booking_id"]
        # Provider confirms
        r = requests.patch(f"{API}/bookings/{bid}/status", json={"status": "confirmed"},
                           headers=_hdr(provider1_token["access_token"]))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "confirmed"
        assert r.json().get("confirmed_at")

        # Client → provider phone (200)
        r = requests.get(f"{API}/users/{prov_id}/phone", headers=_hdr(fresh_client["token"]))
        assert r.status_code == 200, r.text
        assert "phone" in r.json() and "full_name" in r.json()

        # Provider → client phone (200)
        r = requests.get(f"{API}/users/{fresh_client['id']}/phone",
                         headers=_hdr(provider1_token["access_token"]))
        assert r.status_code == 200, r.text

    def test_phone_reveals_row_persisted(self, fresh_client, provider1_token):
        import asyncio

        async def _check():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            n = await db.phone_reveals.count_documents({"viewer_id": fresh_client["id"]})
            client.close()
            return n

        n = asyncio.run(_check())
        assert n >= 1, f"expected at least 1 phone_reveals row for viewer, got {n}"


# ================= 2) Two-step completion =================
class TestTwoStepCompletion:
    def test_provider_cannot_skip_pending_to_completed(self, provider1_token, fresh_client, state):
        # New booking (still pending)
        prov_id = provider1_token["user"]["id"]
        payload = {
            "provider_id": prov_id,
            "scheduled_date": datetime.now(timezone.utc).isoformat(),
            "task_description": "TEST iter11 twostep",
            "address": "addr",
            "rate_type": "task",
        }
        r = requests.post(f"{API}/bookings", json=payload, headers=_hdr(fresh_client["token"]))
        assert r.status_code == 201, r.text
        bid = r.json()["id"]
        state["booking_ids"].append(bid)
        state["twostep_bid"] = bid

        r = requests.patch(f"{API}/bookings/{bid}/status", json={"status": "completed"},
                           headers=_hdr(provider1_token["access_token"]))
        assert r.status_code == 400, r.text

    def test_provider_pending_to_confirmed_ok(self, provider1_token, state):
        bid = state["twostep_bid"]
        r = requests.patch(f"{API}/bookings/{bid}/status", json={"status": "confirmed"},
                           headers=_hdr(provider1_token["access_token"]))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "confirmed"
        assert r.json().get("confirmed_at")

    def test_client_completed_before_provider_done_400(self, fresh_client, state):
        bid = state["twostep_bid"]
        r = requests.patch(f"{API}/bookings/{bid}/status", json={"status": "completed"},
                           headers=_hdr(fresh_client["token"]))
        assert r.status_code == 400, r.text

    def test_client_setting_confirmed_forbidden(self, fresh_client, state):
        bid = state["twostep_bid"]
        r = requests.patch(f"{API}/bookings/{bid}/status", json={"status": "confirmed"},
                           headers=_hdr(fresh_client["token"]))
        assert r.status_code == 403, r.text

    def test_provider_completed_becomes_awaiting(self, provider1_token, state):
        bid = state["twostep_bid"]
        r = requests.patch(f"{API}/bookings/{bid}/status", json={"status": "completed"},
                           headers=_hdr(provider1_token["access_token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "awaiting_confirmation", j
        assert j.get("provider_marked_done_at")

    def test_client_finalizes_completed(self, fresh_client, state):
        bid = state["twostep_bid"]
        r = requests.patch(f"{API}/bookings/{bid}/status", json={"status": "completed"},
                           headers=_hdr(fresh_client["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "completed", j
        assert j.get("client_confirmed_done_at")


# ================= 3) Auto-flagging =================
class TestAutoFlag:
    def test_seed_stale_and_trigger_flag(self, provider1_token, fresh_client, state):
        import asyncio

        prov_id = provider1_token["user"]["id"]
        stale_iso = (datetime.now(timezone.utc) - timedelta(days=20)).isoformat()
        # Use NEW created_at so seeded docs appear first in newest-first scan
        # (before any 'completed' booking left over from earlier tests would
        # short-circuit the consecutive-stale loop).
        now_iso = datetime.now(timezone.utc).isoformat()
        seeded_ids = [str(uuid.uuid4()) for _ in range(4)]

        async def _seed():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            docs = []
            for bid in seeded_ids:
                docs.append({
                    "id": bid,
                    "client_id": fresh_client["id"],
                    "client_name": "TEST",
                    "client_phone": "+213555000999",
                    "client_email": fresh_client["email"],
                    "is_guest": False,
                    "provider_id": prov_id,
                    "provider_name": "provider1",
                    "provider_category": "plumbing",
                    "provider_avatar": None,
                    "scheduled_date": stale_iso,
                    "task_description": "TEST stale",
                    "address": "addr",
                    "rate_type": "hourly",
                    "estimated_hours": 1,
                    "estimated_total": None,
                    "status": "confirmed",
                    "confirmed_at": stale_iso,
                    "created_at": now_iso,
                    "reviewed": False,
                    "booking_type": "instant",
                })
            await db.bookings.insert_many(docs)
            client.close()

        asyncio.run(_seed())
        state["seeded_stale_ids"] = seeded_ids

        # Trigger _recompute_and_maybe_flag by cancelling a fresh booking
        payload = {
            "provider_id": prov_id,
            "scheduled_date": datetime.now(timezone.utc).isoformat(),
            "task_description": "TEST trigger flag",
            "address": "addr",
            "rate_type": "task",
        }
        r = requests.post(f"{API}/bookings", json=payload, headers=_hdr(fresh_client["token"]))
        assert r.status_code == 201, r.text
        bid = r.json()["id"]
        state["booking_ids"].append(bid)

        r = requests.patch(f"{API}/bookings/{bid}/status", json={"status": "cancelled"},
                           headers=_hdr(fresh_client["token"]))
        assert r.status_code == 200, r.text

        # Confirm provider is flagged
        async def _check():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            u = await db.users.find_one({"id": prov_id}, {"_id": 0, "is_flagged": 1, "search_penalty": 1,
                                                            "is_manually_deactivated": 1, "deactivated_reason": 1})
            f = await db.flags.find_one({"provider_id": prov_id, "resolved": False}, {"_id": 0})
            client.close()
            return u, f

        u, f = asyncio.run(_check())
        assert u.get("is_flagged") is True, u
        assert u.get("search_penalty") == 100, u
        assert u.get("is_manually_deactivated") is True, u
        assert u.get("deactivated_reason") == "flagged_auto", u
        assert f is not None, "flags collection row missing"

    def test_admin_flags_lists_provider(self, admin_token, provider1_token):
        r = requests.get(f"{API}/admin/flags", headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        rows = r.json()
        prov_id = provider1_token["user"]["id"]
        ids = [x["provider_id"] for x in rows]
        assert prov_id in ids, f"provider1 not found in admin flags: {rows}"
        row = next(x for x in rows if x["provider_id"] == prov_id)
        assert row.get("full_name") and row.get("email")

    def test_admin_clear_flag(self, admin_token, provider1_token):
        import asyncio
        prov_id = provider1_token["user"]["id"]
        r = requests.post(f"{API}/admin/flags/{prov_id}/clear", headers=_hdr(admin_token))
        assert r.status_code == 200, r.text

        async def _check():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            u = await db.users.find_one({"id": prov_id}, {"_id": 0, "is_flagged": 1, "search_penalty": 1,
                                                            "is_manually_deactivated": 1})
            client.close()
            return u

        u = asyncio.run(_check())
        assert u.get("is_flagged") is False, u
        assert u.get("search_penalty") == 0, u
        assert u.get("is_manually_deactivated") is False, u

    def test_non_admin_forbidden(self, provider1_token):
        r = requests.get(f"{API}/admin/flags", headers=_hdr(provider1_token["access_token"]))
        assert r.status_code in (401, 403), r.text


# ================= 4) Chargily webhook wiring =================
class TestChargilyWebhook:
    def test_missing_signature_400(self):
        r = requests.post(f"{API}/webhooks/chargily", data=b"", headers={"content-type": "application/json"})
        assert r.status_code == 400, r.text
        assert "missing" in r.json()["detail"].lower() or "signature" in r.json()["detail"].lower()

    def test_missing_body_with_bogus_sig_still_400_no_secret(self):
        # Because CHARGILY_WEBHOOK_SECRET is empty in this env, the code returns 400 "Missing signature"
        # even when a header is supplied. This proves the guard order (secret+header) is wired.
        r = requests.post(f"{API}/webhooks/chargily", data=b"{}",
                          headers={"content-type": "application/json", "signature": "bogus"})
        # In env-with-secret, this would be 403. With empty secret, code returns 400.
        assert r.status_code in (400, 403), r.text


# ================= 5) Regression: /subscription/pay mock =================
class TestSubscriptionPayMockRegression:
    def test_mock_pay(self, provider1_token):
        r = requests.post(f"{API}/subscription/pay", headers=_hdr(provider1_token["access_token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("provider") == "mock", j
        assert j.get("success") is True, j
        assert j.get("amount_dzd") == 1000, j
        assert "user" in j
