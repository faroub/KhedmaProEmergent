"""Production deployment smoke: /api/ws/chat handshake.

The production image installs only requirements.prod.txt. Without the
``websockets`` package uvicorn refuses WebSocket upgrades (logs "No supported
WebSocket library detected" and the endpoint answers 404), so the chat socket
is silently dead in production while working in the dev venv. These tests pin
the handshake contract: a valid JWT opens the socket, an invalid one is
rejected. Run against a production-style server by pointing
EXPO_PUBLIC_BACKEND_URL at it (the server must be started with the
requirements.prod.txt dependency set).
"""
import asyncio
import os
import uuid

import requests
import websockets  # type: ignore

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
WS_BASE = BASE.replace("https://", "wss://").replace("http://", "ws://")


def _register_client() -> str:
    email = f"TEST_ws_smoke_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": "password123",
        "role": "client",
        "full_name": "TEST WS Smoke",
    }, timeout=10)
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


class TestWsChatHandshake:
    def test_valid_first_message_auth_succeeds(self):
        import json
        token = _register_client()

        async def go():
            uri = f"{WS_BASE}/api/ws/chat"
            async with websockets.connect(uri, open_timeout=10) as ws:
                await ws.send(json.dumps({"type": "auth", "token": token}))
                pong = await ws.ping()
                await asyncio.wait_for(pong, timeout=5)
                try:
                    await asyncio.wait_for(ws.recv(), timeout=1)
                except asyncio.TimeoutError:
                    pass
                return True

        assert asyncio.run(go()) is True

    def test_query_string_token_rejected(self):
        token = _register_client()

        async def go():
            try:
                async with websockets.connect(
                    f"{WS_BASE}/api/ws/chat?token={token}",
                    open_timeout=10,
                ) as ws:
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=5)
                    except websockets.exceptions.ConnectionClosed as e:
                        return e.code
                    return "open"
            except websockets.exceptions.InvalidStatus as e:
                return e.response.status_code
            except websockets.exceptions.ConnectionClosedError as e:
                return e.code

        result = asyncio.run(go())
        assert result in (1008, 403, 401, 1006), f"got {result}"
