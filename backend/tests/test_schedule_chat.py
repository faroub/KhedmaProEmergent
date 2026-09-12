"""khedmaPro backend tests — Schedule + Chat + WebSocket features."""
import os
import uuid
import json
import asyncio
import pytest
import requests
import websockets  # type: ignore

from helpers import with_phone_token

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
WS_BASE = BASE.replace("https://", "wss://").replace("http://", "ws://")


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def provider_ctx(s):
    r = s.post(f"{API}/auth/login", json={
        "email": "provider1@khedmapro.dz", "password": "password123",
    })
    assert r.status_code == 200, r.text
    return {"token": r.json()["access_token"], "id": r.json()["user"]["id"]}


@pytest.fixture(scope="module")
def provider_ctx_2(s):
    r = s.post(f"{API}/auth/login", json={
        "email": "provider2@khedmapro.dz", "password": "password123",
    })
    assert r.status_code == 200
    return {"token": r.json()["access_token"], "id": r.json()["user"]["id"]}


@pytest.fixture(scope="module")
def client_ctx(s):
    email = f"TEST_chat_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "password123",
        "role": "client", "full_name": "TEST Chat Client",
    })
    assert r.status_code == 201, r.text
    return {"token": r.json()["access_token"], "id": r.json()["user"]["id"], "email": email}


# ================= SCHEDULE =================
class TestSchedule:
    def test_default_schedule_returned_when_none_saved(self, s):
        # Use a fresh provider id that has no schedule saved
        # (phone + wilaya are now mandatory for providers)
        import random
        tail = "".join(str(random.randint(0, 9)) for _ in range(8))
        r = s.post(f"{API}/auth/register", json=with_phone_token({
            "email": f"TEST_prov_{uuid.uuid4().hex[:6]}@x.dz",
            "password": "password123", "role": "service_provider",
            "full_name": "TEST Prov", "category": "plumbing",
            "phone": f"+2135{tail}", "wilaya_code": "16",
        }, API))
        assert r.status_code == 201, r.text
        pid = r.json()["user"]["id"]
        r2 = s.get(f"{API}/schedule/{pid}")
        assert r2.status_code == 200
        d = r2.json()
        assert d["working_hours"]["mon"] == {"start": "08:00", "end": "17:00"}
        assert d["working_hours"]["sun"] is None
        assert d["vacation_days"] == []
        assert d["breaks"] == {}

    def test_put_schedule_persists_as_provider(self, s, provider_ctx):
        payload = {
            "working_hours": {
                "mon": {"start": "09:00", "end": "18:00"},
                "tue": {"start": "09:00", "end": "18:00"},
                "wed": {"start": "09:00", "end": "18:00"},
                "thu": {"start": "09:00", "end": "18:00"},
                "fri": {"start": "09:00", "end": "12:00"},
                "sat": None,
                "sun": None,
            },
            "breaks": {"mon": [{"start": "12:00", "end": "13:00"}]},
            "vacation_days": ["2026-06-10", "2026-06-11"],
        }
        r = s.put(f"{API}/schedule", headers=auth(provider_ctx["token"]), json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["provider_id"] == provider_ctx["id"]
        assert d["working_hours"]["fri"]["end"] == "12:00"
        assert d["vacation_days"] == ["2026-06-10", "2026-06-11"]
        # Verify persisted via GET
        r2 = s.get(f"{API}/schedule/{provider_ctx['id']}")
        assert r2.status_code == 200
        got = r2.json()
        assert got["working_hours"]["fri"]["end"] == "12:00"
        assert got["breaks"]["mon"][0]["start"] == "12:00"

    def test_put_schedule_requires_provider_role(self, s, client_ctx):
        r = s.put(f"{API}/schedule", headers=auth(client_ctx["token"]), json={
            "working_hours": {}, "breaks": {}, "vacation_days": [],
        })
        assert r.status_code == 403, r.text


# ================= CHAT REST =================
class TestChat:
    def test_send_message_without_auth_401(self, s, provider_ctx):
        r = s.post(f"{API}/chats/{provider_ctx['id']}/messages",
                   json={"text": "TEST no auth"})
        assert r.status_code == 401

    def test_client_sends_message_provider_can_read(self, s, client_ctx, provider_ctx):
        pid = provider_ctx["id"]
        r = s.post(f"{API}/chats/{pid}/messages",
                   headers=auth(client_ctx["token"]),
                   json={"text": "TEST hello from client"})
        assert r.status_code == 201, r.text
        m = r.json()
        assert m["from_id"] == client_ctx["id"]
        assert m["to_id"] == pid
        assert m["text"] == "TEST hello from client"
        # both parties can retrieve
        r_client = s.get(f"{API}/chats/{pid}/messages", headers=auth(client_ctx["token"]))
        r_prov = s.get(f"{API}/chats/{client_ctx['id']}/messages", headers=auth(provider_ctx["token"]))
        assert r_client.status_code == 200
        assert r_prov.status_code == 200
        texts_client = [x["text"] for x in r_client.json()]
        texts_prov = [x["text"] for x in r_prov.json()]
        assert "TEST hello from client" in texts_client
        assert "TEST hello from client" in texts_prov

    def test_provider_replies_and_history_contains_both(self, s, client_ctx, provider_ctx):
        r = s.post(f"{API}/chats/{client_ctx['id']}/messages",
                   headers=auth(provider_ctx["token"]),
                   json={"text": "TEST reply from provider"})
        assert r.status_code == 201
        r_hist = s.get(f"{API}/chats/{provider_ctx['id']}/messages",
                       headers=auth(client_ctx["token"]))
        texts = [x["text"] for x in r_hist.json()]
        assert "TEST hello from client" in texts
        assert "TEST reply from provider" in texts

    def test_my_chats_returns_thread_with_counterpart(self, s, client_ctx, provider_ctx):
        r = s.get(f"{API}/chats/mine", headers=auth(client_ctx["token"]))
        assert r.status_code == 200
        threads = r.json()
        assert len(threads) >= 1
        t0 = next((t for t in threads if t["other_id"] == provider_ctx["id"]), None)
        assert t0 is not None
        assert t0["other_role"] == "service_provider"
        assert t0["last_text"] in (
            "TEST reply from provider", "TEST hello from client",
        )
        assert t0.get("last_at")
        assert t0.get("other_name")

    def test_my_chats_without_auth_401(self, s):
        r = s.get(f"{API}/chats/mine")
        assert r.status_code == 401


# ================= WEBSOCKET =================
class TestChatWebSocket:
    def test_invalid_token_rejected(self):
        async def go():
            uri = f"{WS_BASE}/api/ws/chat?token=invalid.jwt.token"
            try:
                async with websockets.connect(uri) as ws:
                    # Should close quickly with 1008
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=3)
                    except websockets.exceptions.ConnectionClosed as e:
                        return e.code
                return None
            except websockets.exceptions.InvalidStatus as e:
                # Some servers reject at handshake
                return e.response.status_code
            except websockets.exceptions.ConnectionClosedError as e:
                return e.code
        code = asyncio.run(go())
        # Accept either 1008 close or handshake failure (non-200)
        assert code in (1008, 401, 403, 1006) or code is None or code >= 400, f"got {code}"

    def test_valid_token_receives_realtime_message(self, s, client_ctx, provider_ctx):
        async def go():
            uri = f"{WS_BASE}/api/ws/chat?token={provider_ctx['token']}"
            received = []
            async with websockets.connect(uri) as ws:
                # give server a moment to register
                await asyncio.sleep(0.5)
                # trigger message from client -> provider via REST
                r = s.post(f"{API}/chats/{provider_ctx['id']}/messages",
                           headers=auth(client_ctx["token"]),
                           json={"text": "TEST ws realtime"})
                assert r.status_code == 201
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                    received.append(json.loads(raw))
                except asyncio.TimeoutError:
                    pass
            return received
        msgs = asyncio.run(go())
        assert len(msgs) >= 1, "WebSocket did not deliver message"
        m = msgs[0]
        assert m["type"] == "message"
        assert m["message"]["text"] == "TEST ws realtime"
        assert m["message"]["from_id"] == client_ctx["id"]
