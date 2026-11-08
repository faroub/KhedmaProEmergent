"""P17 — account lifecycle out of read requests (H9).

- enforce_lifecycle is read-only: a GET denies access (410) without writing
  deleted_at / token_version to the user document
- scripts/lifecycle_job.py performs the persisted soft-delete (supports
  --dry-run, logs counts)
- refresh_trial_days_cache is TTL-guarded: a burst of requests costs one
  settings read, not one per request
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests
from pymongo import MongoClient

from helpers import API, fresh_provider
from subscription import enforce_lifecycle, invalidate_trial_days_cache

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

OVERDUE_DAYS = 500  # trial (3 mo) + deactivation window (12 mo) is ~450 days


@pytest.fixture(autouse=True)
def _isolate_trial_cache(monkeypatch):
    """Keep these in-process tests from touching process-global state:

    - refresh_trial_days_cache must never reach the real DB-backed
      get_effective_settings: awaiting it binds the import-time motor client
      to this test's loop, and later in-process async tests would see
      "Event loop is closed".
    - reset the module cache before/after so a value set here cannot leak
      into other test files in the same pytest process.
    """
    import routes.settings as settings_mod
    import subscription as subscription_mod

    async def fake_settings():
        return {}

    monkeypatch.setattr(settings_mod, "get_effective_settings", fake_settings)
    subscription_mod.invalidate_trial_days_cache()
    yield
    subscription_mod.invalidate_trial_days_cache()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_overdue(provider: dict) -> None:
    """Age a provider past the auto-delete deadline and clear any payment."""
    MongoClient(MONGO_URL)[DB_NAME].users.update_one(
        {"id": provider["user"]["id"]},
        {
            "$set": {
                "created_at": (datetime.now(timezone.utc) - timedelta(days=OVERDUE_DAYS)).isoformat(),
                "last_paid_at": None,
            }
        },
    )


def _user_doc(user_id: str) -> dict:
    return MongoClient(MONGO_URL)[DB_NAME].users.find_one({"id": user_id}, {"_id": 0})


class TestEnforceLifecycleReadOnly:
    def test_get_does_not_modify_user_document(self):
        provider = fresh_provider()
        _make_overdue(provider)
        before = _user_doc(provider["user"]["id"])

        # Access is still denied: the read-only gate marks it deleted in memory.
        r = requests.get(f"{API}/auth/me", headers=_bearer(provider["access_token"]), timeout=15)
        assert r.status_code == 410, r.text

        after = _user_doc(provider["user"]["id"])
        assert after.get("deleted_at") is None
        assert not after.get("is_deleted")
        assert after.get("token_version", 0) == before.get("token_version", 0)

    def test_enforce_lifecycle_never_writes(self):
        import subscription

        # The read path holds no database client reference at all now — a
        # write is structurally impossible from enforce_lifecycle.
        assert not hasattr(subscription, "db")

        user = {
            "id": f"p17-{uuid.uuid4().hex[:8]}",
            "role": "service_provider",
            "created_at": (datetime.now(timezone.utc) - timedelta(days=OVERDUE_DAYS)).isoformat(),
            "last_paid_at": None,
        }
        out = asyncio.run(enforce_lifecycle(user))
        assert out.get("is_deleted") is True
        assert out.get("deleted_reason") == "auto_unpaid_12mo_pending"

    def test_trial_days_cache_ttl_limits_db_reads(self, monkeypatch):
        invalidate_trial_days_cache()
        import routes.settings as settings_mod

        calls = {"n": 0}

        async def counting_settings():
            calls["n"] += 1
            return {"trial_days": 2}

        monkeypatch.setattr(settings_mod, "get_effective_settings", counting_settings)

        user = {
            "id": f"p17-{uuid.uuid4().hex[:8]}",
            "role": "service_provider",
            "created_at": (datetime.now(timezone.utc) - timedelta(days=OVERDUE_DAYS)).isoformat(),
            "last_paid_at": None,
        }
        # A burst of requests costs at most one settings read per 30 s window.
        for _ in range(50):
            asyncio.run(enforce_lifecycle(dict(user)))
        assert calls["n"] == 1, f"cache TTL not effective: {calls['n']} reads"

        invalidate_trial_days_cache()
        asyncio.run(enforce_lifecycle(dict(user)))
        assert calls["n"] == 2


class TestLifecycleJob:
    def test_job_soft_deletes_eligible_account(self, monkeypatch):
        provider = fresh_provider()
        _make_overdue(provider)
        uid = provider["user"]["id"]

        async def go():
            from motor.motor_asyncio import AsyncIOMotorClient

            import scripts.lifecycle_job as job

            client = AsyncIOMotorClient(MONGO_URL)
            monkeypatch.setattr(job, "db", client[DB_NAME])
            return await job.run()

        counts = asyncio.run(go())
        assert counts["soft_deleted"] >= 1

        doc = _user_doc(uid)
        assert doc.get("is_deleted") is True
        assert doc.get("deleted_at")
        assert doc.get("deleted_reason") == "auto_unpaid_12mo"
        assert doc.get("token_version", 0) >= 1  # sessions revoked

        # The account's existing session is rejected (deleted → 410).
        r = requests.get(f"{API}/auth/me", headers=_bearer(provider["access_token"]), timeout=15)
        assert r.status_code == 410, r.text

    def test_dry_run_writes_nothing(self, monkeypatch):
        provider = fresh_provider()
        _make_overdue(provider)
        uid = provider["user"]["id"]

        async def go():
            from motor.motor_asyncio import AsyncIOMotorClient

            import scripts.lifecycle_job as job

            client = AsyncIOMotorClient(MONGO_URL)
            monkeypatch.setattr(job, "db", client[DB_NAME])
            return await job.run(dry_run=True)

        counts = asyncio.run(go())
        assert counts["soft_deleted"] >= 1

        doc = _user_doc(uid)
        assert not doc.get("is_deleted")
        assert doc.get("deleted_at") is None
