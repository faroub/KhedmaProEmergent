"""P23 — one report per (reporter, provider) per 30-day window (N7-style).

- a valid report returns 201
- a duplicate report within the window returns 409; another provider is fine
- the insert race (find_one sees nothing, insert raises DuplicateKeyError)
  returns the same 409
- the per-user rate limit from P12 returns 429 after N requests
- a report from REPORTS_AUTO_FLAG_THRESHOLD distinct reporters within the
  window is auto_flagged for admin review; the provider account is not
  touched — the decision stays with the admin
"""
import asyncio
import os
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from helpers import API, fresh_client, fresh_provider

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_BODY = {"reason": "spam", "details": "keeps messaging off-platform"}


def _report(token: str, provider_id: str):
    import requests

    return requests.post(
        f"{API}/reports",
        json={"provider_id": provider_id, **_BODY},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )


class TestReportsHttp:
    def test_valid_report(self):
        provider = fresh_provider()
        client = fresh_client()
        r = _report(client["access_token"], provider["user"]["id"])
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "open"
        assert body["reporter_id"] == client["user"]["id"]
        assert body["provider_id"] == provider["user"]["id"]
        # single reporter, threshold 3 → not auto-flagged
        assert body["auto_flagged"] is False

    def test_duplicate_report_within_window_409(self):
        provider = fresh_provider()
        client = fresh_client()
        r = _report(client["access_token"], provider["user"]["id"])
        assert r.status_code == 201, r.text
        r2 = _report(client["access_token"], provider["user"]["id"])
        assert r2.status_code == 409
        assert "already reported" in r2.json()["detail"]
        # the rule is per provider: reporting someone else still works
        other = fresh_provider()
        r3 = _report(client["access_token"], other["user"]["id"])
        assert r3.status_code == 201, r3.text

    def test_unknown_provider_404(self):
        client = fresh_client()
        r = _report(client["access_token"], f"nope-{uuid.uuid4().hex[:8]}")
        assert r.status_code == 404

    def test_auto_flag_after_three_distinct_reporters(self):
        provider = fresh_provider()
        for _ in range(2):
            c = fresh_client()
            r = _report(c["access_token"], provider["user"]["id"])
            assert r.status_code == 201, r.text
            assert r.json()["auto_flagged"] is False
        c = fresh_client()
        r = _report(c["access_token"], provider["user"]["id"])
        assert r.status_code == 201, r.text
        assert r.json()["auto_flagged"] is True
        # the flag is informational for the admin: the provider account itself
        # keeps its normal state (no automated action).
        doc = MongoClient(MONGO_URL)[DB_NAME].users.find_one(
            {"id": provider["user"]["id"]}, {"_id": 0}
        )
        assert not doc.get("auto_flagged")
        assert not doc.get("flagged_by_reports")


class TestReportsInProcess:
    """Handler-level checks the server's constants/db cannot express over HTTP
    (the running server has its own module state)."""

    @staticmethod
    def _run(monkeypatch, scenario) -> None:
        async def wrapped():
            from motor.motor_asyncio import AsyncIOMotorClient

            client = AsyncIOMotorClient(MONGO_URL)
            import routes.reports as reports

            monkeypatch.setattr(reports, "db", client[DB_NAME])
            try:
                await scenario(reports, client)
            finally:
                client.close()

        asyncio.run(wrapped())

    def test_per_user_rate_limit_returns_429(self, monkeypatch):
        # The cap counts reports from ONE user across providers, so use a
        # distinct provider per call (no duplicate-report 409 gets in the way).
        providers = [fresh_provider() for _ in range(3)]
        client = fresh_client()
        user = client["user"]
        pids = [p["user"]["id"] for p in providers]

        async def scenario(reports, client):
            import ratelimit

            monkeypatch.setattr(ratelimit, "db", client[DB_NAME])
            monkeypatch.setattr(reports, "RATE_LIMIT_REPORT_USER", 2)
            from schemas import ReportIn

            for pid in pids[:2]:
                r = await reports.report_provider(ReportIn(provider_id=pid, **_BODY), user)
                assert r["status"] == "open"
            with pytest.raises(HTTPException) as exc:
                await reports.report_provider(ReportIn(provider_id=pids[2], **_BODY), user)
            assert exc.value.status_code == 429
            assert int(exc.value.headers["Retry-After"]) >= 1

        self._run(monkeypatch, scenario)

    def test_duplicate_insert_race_returns_409(self, monkeypatch):
        """find_one finds no prior report (a concurrent report won the race)
        and the unique index makes the insert raise DuplicateKeyError → 409."""
        provider = fresh_provider()
        client = fresh_client()
        user = client["user"]
        pid = provider["user"]["id"]

        async def fake_consume(*args, **kwargs):
            return None

        class FakeReports:
            async def find_one(self, *a, **k):
                return None

            async def count_documents(self, *a, **k):
                return 0

            async def insert_one(self, doc):
                raise DuplicateKeyError("E11000 duplicate key error collection: reports")

        class FakeUsers:
            async def find_one(self, *a, **k):
                return {"id": pid, "role": "service_provider", "full_name": "P"}

        import routes.reports as reports

        monkeypatch.setattr(reports, "consume", fake_consume)
        monkeypatch.setattr(reports, "db", SimpleNamespace(users=FakeUsers(), reports=FakeReports()))

        async def go():
            from schemas import ReportIn

            body = ReportIn(provider_id=pid, **_BODY)
            with pytest.raises(HTTPException) as exc:
                await reports.report_provider(body, user)
            assert exc.value.status_code == 409
            assert "already reported" in exc.value.detail

        asyncio.run(go())
