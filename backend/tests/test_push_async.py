"""P26 — push notifications are non-blocking and fail visibly.

- request handlers schedule push delivery (fire_and_forget) and return
  without waiting for the relay: a slow relay never delays the API response
- scheduled deliveries are tracked, so their failures always land in the
  error log instead of vanishing or breaking the request
- guest-skip and chunking inside send_push are unchanged
- a missing/placeholder EMERGENT_PUSH_KEY logs an error at startup
  (production refuses to boot — P5)
"""
import asyncio
import logging
import os
import time

import pytest
from starlette.requests import Request

from helpers import fresh_client, fresh_provider

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(autouse=True)
def _isolate_settings(monkeypatch):
    """Keep in-process tests away from the process-global settings read:
    awaiting get_effective_settings binds the import-time motor client to
    this loop and later in-process tests would see "Event loop is closed"."""
    import routes.settings as settings_mod
    import subscription as subscription_mod

    async def fake_settings():
        return {}

    monkeypatch.setattr(settings_mod, "get_effective_settings", fake_settings)
    subscription_mod.invalidate_trial_days_cache()
    yield
    subscription_mod.invalidate_trial_days_cache()


def _fake_request() -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "path": "/api/bookings",
            "headers": [],
            "query_string": b"",
            "client": ("127.0.0.1", 12345),
            "scheme": "http",
            "server": ("testserver", 80),
        }
    )


def test_booking_response_returns_before_push_delivery(monkeypatch):
    """create_booking schedules the provider notification and returns; the
    response does not wait for the push relay (which takes 1s here)."""
    import routes.bookings as bookings_mod
    from schemas import BookingCreate

    provider = fresh_provider()
    user = fresh_client()["user"]

    started = asyncio.Event()
    finished = asyncio.Event()

    async def slow_send_push(recipients, data, idempotency_key=None):
        started.set()
        await asyncio.sleep(1.0)
        finished.set()

    monkeypatch.setattr(bookings_mod, "send_push", slow_send_push)

    async def go():
        from motor.motor_asyncio import AsyncIOMotorClient

        client = AsyncIOMotorClient(MONGO_URL)
        monkeypatch.setattr(bookings_mod, "db", client[DB_NAME])
        try:
            body = BookingCreate(
                provider_id=provider["user"]["id"],
                scheduled_date="2026-12-01",
                task_description="P26 push latency",
                address="Algiers",
            )
            t0 = time.monotonic()
            result = await bookings_mod.create_booking(body, _fake_request(), user)
            elapsed = time.monotonic() - t0
            assert result["id"]
            assert elapsed < 0.9, f"response waited for the push relay: {elapsed:.2f}s"
            # The delivery still runs to completion in the background.
            assert await asyncio.wait_for(started.wait(), timeout=5)
            assert await asyncio.wait_for(finished.wait(), timeout=5)
        finally:
            client.close()

    asyncio.run(go())


def test_fire_and_forget_logs_task_failures(caplog):
    import routes.push as push_mod

    async def boom():
        raise RuntimeError("relay exploded")

    async def driver():
        with caplog.at_level(logging.ERROR, logger="routes.push"):
            push_mod.fire_and_forget(boom())
            while push_mod._pending_push_tasks:
                await asyncio.sleep(0.01)
            await asyncio.sleep(0.05)

    asyncio.run(driver())
    assert any("relay exploded" in r.message for r in caplog.records)
    assert not push_mod._pending_push_tasks


def test_send_push_chunks_and_skips_guests(monkeypatch):
    import routes.push as push_mod

    calls = []

    class FakeResp:
        status_code = 200

    class FakeClient:
        async def post(self, path, json=None):
            calls.append(json)
            return FakeResp()

    monkeypatch.setattr(push_mod, "_client", FakeClient())

    async def go():
        # 248 distinct recipients + one duplicate + one guest → 3 chunks.
        ids = [f"user-{i}" for i in range(248)] + ["user-0", "guest:nobody"]
        await push_mod.send_push(ids, {"title": "t", "message": "m"}, idempotency_key="k")

    asyncio.run(go())

    assert len(calls) == 3, [len(c["recipients"]) for c in calls]
    assert sum(len(c["recipients"]) for c in calls) == 248
    assert all("guest:nobody" not in c["recipients"] for c in calls)
    # Chunked idempotency keys are disambiguated per chunk.
    assert [c["$idempotency_key"] for c in calls] == ["k:0", "k:1", "k:2"]


def test_missing_push_key_logs_error_at_startup(monkeypatch, caplog):
    import config
    import server as server_mod

    monkeypatch.setattr(config, "EMERGENT_PUSH_KEY", "placeholder")

    async def go():
        from motor.motor_asyncio import AsyncIOMotorClient

        client = AsyncIOMotorClient(MONGO_URL)
        monkeypatch.setattr(server_mod, "db", client[DB_NAME])

        async def fake_provider_status():
            return {"provider": "mock", "healthy": True}

        monkeypatch.setattr(server_mod, "get_provider_status", fake_provider_status)
        with caplog.at_level(logging.ERROR):
            await server_mod.on_startup()
        client.close()

    asyncio.run(go())
    assert any(
        "EMERGENT_PUSH_KEY" in r.message and r.levelno == logging.ERROR
        for r in caplog.records
    )
