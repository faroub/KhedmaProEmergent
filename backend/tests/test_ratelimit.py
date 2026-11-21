"""P12 — abuse-prone endpoints are rate limited.

The limiter is DB-backed (one document per key+time-bucket, TTL-cleaned) so
limits hold across gunicorn workers; the (N+1)th request in a window gets
429 with Retry-After, and the next window starts clean.

Handler wiring is tested by calling the endpoints in-process (the server's
constants cannot be monkeypatched cross-process), each on its own event loop
with a Motor client created on that loop.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import ratelimit
from config import DB_NAME, MONGO_URL
from helpers import fresh_client, fresh_provider
from schemas import ChatMessageIn, LoginIn


def _run(monkeypatch, scenario) -> None:
    """Run `scenario(mongo_client)` on a fresh event loop with a Motor client
    created on that loop (the module-level client is bound to the server's
    loop and cannot be reused across asyncio.run calls)."""

    async def wrapped():
        from motor.motor_asyncio import AsyncIOMotorClient

        client = AsyncIOMotorClient(MONGO_URL)
        monkeypatch.setattr(ratelimit, "db", client[DB_NAME])
        try:
            await scenario(client)
        finally:
            client.close()

    asyncio.run(wrapped())


def test_first_n_requests_pass_then_429(monkeypatch):
    key = f"ratelimit_unit_{uuid.uuid4().hex}"

    async def scenario(client):
        for _ in range(2):
            await ratelimit.consume(key, limit=2, window_seconds=3600)
        with pytest.raises(HTTPException) as exc:
            await ratelimit.consume(key, limit=2, window_seconds=3600)
        assert exc.value.status_code == 429
        assert int(exc.value.headers["Retry-After"]) >= 1

    _run(monkeypatch, scenario)


def test_window_resets(monkeypatch):
    t = [1_700_000_000.0]
    monkeypatch.setattr(ratelimit, "_now", lambda: t[0])
    key = f"ratelimit_reset_{uuid.uuid4().hex}"

    async def scenario(client):
        await ratelimit.consume(key, limit=1, window_seconds=60)
        with pytest.raises(HTTPException):
            await ratelimit.consume(key, limit=1, window_seconds=60)
        t[0] += 61  # next bucket
        await ratelimit.consume(key, limit=1, window_seconds=60)  # allowed again

    _run(monkeypatch, scenario)


def test_limits_are_per_key(monkeypatch):
    k1 = f"ratelimit_k1_{uuid.uuid4().hex}"
    k2 = f"ratelimit_k2_{uuid.uuid4().hex}"

    async def scenario(client):
        await ratelimit.consume(k1, limit=1, window_seconds=3600)
        await ratelimit.consume(k2, limit=1, window_seconds=3600)
        with pytest.raises(HTTPException):
            await ratelimit.consume(k1, limit=1, window_seconds=3600)

    _run(monkeypatch, scenario)


def _request_from_ip(ip: str) -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [],
            "query_string": b"",
            "client": (ip, 12345),
            "scheme": "http",
            "server": ("testserver", 80),
        }
    )


def test_login_per_ip_limit_returns_429(monkeypatch):
    """The login endpoint consumes a per-IP counter before checking
    credentials, so one address cannot spray many accounts."""
    import routes.auth as auth

    monkeypatch.setattr(auth, "RATE_LIMIT_LOGIN_IP", 2)
    email = f"nobody_{uuid.uuid4().hex}@example.com"

    async def scenario(client):
        monkeypatch.setattr(auth, "db", client[DB_NAME])
        body = LoginIn(email=email, password="wrong-pw-1")
        request = _request_from_ip("203.0.113.9")
        for _ in range(2):
            with pytest.raises(HTTPException) as exc:
                await auth.login(body, request)
            assert exc.value.status_code == 401
        with pytest.raises(HTTPException) as exc:
            await auth.login(body, request)
        assert exc.value.status_code == 429
        assert int(exc.value.headers["Retry-After"]) >= 1

    _run(monkeypatch, scenario)


def test_message_send_per_user_limit_returns_429(monkeypatch):
    """The send-message endpoint consumes a per-user counter."""
    import routes.messages as messages

    monkeypatch.setattr(messages, "RATE_LIMIT_MESSAGE_USER", 1)
    client_account = fresh_client()
    provider = fresh_provider()
    other_id = provider["user"]["id"]
    user = client_account["user"]

    async def scenario(client):
        monkeypatch.setattr(messages, "db", client[DB_NAME])
        body = ChatMessageIn(text="hello")
        first = await messages.send_message(other_id, body, user)
        assert first["text"] == "hello"
        with pytest.raises(HTTPException) as exc:
            await messages.send_message(other_id, body, user)
        assert exc.value.status_code == 429
        assert int(exc.value.headers["Retry-After"]) >= 1

    _run(monkeypatch, scenario)


def test_consume_phone_otp_limit_unit(monkeypatch):
    phone = "+213550112233"
    storage = {}

    class FakeOtpRateLimits:
        async def find_one(self, query):
            if query.get("_id") != phone:
                return None
            doc = storage.get(phone)
            if not doc:
                return None
            last_sent = query.get("last_sent_at", {})
            if "$gt" in last_sent:
                if doc.get("last_sent_at") and doc["last_sent_at"] > last_sent["$gt"]:
                    return doc
                return None
            return None

        async def find_one_and_update(self, query, update, upsert=False, return_document=None):
            now_str = update.get("$set", {}).get("last_sent_at")
            if not storage.get(phone):
                if upsert:
                    doc = {
                        "_id": phone,
                        "last_sent_at": now_str,
                        "hour_started_at": now_str,
                        "hour_count": 1,
                    }
                    storage[phone] = doc
                    return doc
                return None
            else:
                doc = storage[phone]
                last_sent_clause = query.get("$or", [{}])[0].get("last_sent_at", {})
                if "$lte" in last_sent_clause and doc.get("last_sent_at") and doc["last_sent_at"] > last_sent_clause["$lte"]:
                    return None
                doc["last_sent_at"] = now_str
                if "$inc" in update and "hour_count" in update["$inc"]:
                    doc["hour_count"] += update["$inc"]["hour_count"]
                return doc

    class FakeDB:
        otp_rate_limits = FakeOtpRateLimits()

    monkeypatch.setattr(ratelimit, "db", FakeDB())

    # 1. First call succeeds
    asyncio.run(ratelimit.consume_phone_otp_limit(phone))
    assert storage[phone]["hour_count"] == 1

    # 2. Immediate second call fails with 429
    with pytest.raises(HTTPException) as exc:
        asyncio.run(ratelimit.consume_phone_otp_limit(phone))
    assert exc.value.status_code == 429
    assert "30 seconds" in exc.value.detail


def test_consume_phone_otp_limit_query_structure(monkeypatch):
    """Verify query_new uses $and so both last_sent_at and hour_started_at $or clauses exist."""
    phone = "+213550112233"
    queries_executed = []

    class FakeOtpRateLimits:
        async def find_one(self, query):
            return None

        async def find_one_and_update(self, query, update, upsert=False, return_document=None):
            queries_executed.append(query)
            if "$and" in query:
                return {"_id": phone, "hour_count": 1}
            return None

    class FakeDB:
        otp_rate_limits = FakeOtpRateLimits()

    monkeypatch.setattr(ratelimit, "db", FakeDB())
    asyncio.run(ratelimit.consume_phone_otp_limit(phone))

    # Second query is query_new which must contain $and with 2 clauses
    assert len(queries_executed) >= 2
    query_new = queries_executed[1]
    assert "$and" in query_new
    assert len(query_new["$and"]) == 2
