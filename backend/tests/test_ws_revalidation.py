"""P15 — WebSocket first-message auth and session revalidation.

The socket is authenticated by {"type":"auth","token":...} within 5s of
connect; the query-string path is deprecated but still works. While
connected, the session is rechecked on every inbound message and at least
once a minute — a revoked, deactivated, or deleted account is dropped with
close code 1008.
"""
import asyncio
import json
import os
import uuid

import requests
import websockets  # type: ignore

from helpers import make_admin

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
WS_BASE = BASE.replace("https://", "wss://").replace("http://", "ws://")


def _register_client() -> dict:
    email = f"TEST_ws15_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": "TEST WS15",
        },
        timeout=15,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return {"id": body["user"]["id"], "token": body["access_token"]}


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _connect():
    return websockets.connect(f"{WS_BASE}/api/ws/chat", open_timeout=10)


class TestWsAuthMessage:
    def test_auth_message_opens_the_socket_and_delivers(self):
        me = _register_client()
        other = _register_client()

        async def go():
            async with _connect() as ws:
                await ws.send(json.dumps({"type": "auth", "token": me["token"]}))
                await asyncio.sleep(0.5)
                r = requests.post(
                    f"{API}/chats/{me['id']}/messages",
                    headers=_bearer(other["token"]),
                    json={"text": "hello over auth message"},
                    timeout=15,
                )
                assert r.status_code == 201, r.text
                raw = await asyncio.wait_for(ws.recv(), timeout=5)
                return json.loads(raw)

        msg = asyncio.run(go())
        assert msg["type"] == "message"
        assert msg["message"]["from_id"] == other["id"]
        assert msg["message"]["to_id"] == me["id"]

    def test_no_auth_message_closes_with_1008(self):
        async def go():
            async with _connect() as ws:
                try:
                    await asyncio.wait_for(ws.recv(), timeout=12)
                except websockets.exceptions.ConnectionClosed as e:
                    return e.code
            return None

        assert asyncio.run(go()) == 1008

    def test_invalid_token_in_auth_message_closes_with_1008(self):
        async def go():
            async with _connect() as ws:
                await ws.send(json.dumps({"type": "auth", "token": "invalid.jwt.token"}))
                try:
                    await asyncio.wait_for(ws.recv(), timeout=5)
                except websockets.exceptions.ConnectionClosed as e:
                    return e.code
            return None

        assert asyncio.run(go()) == 1008

    def test_non_auth_first_message_closes_with_1008(self):
        async def go():
            async with _connect() as ws:
                await ws.send(json.dumps({"hello": "not an auth message"}))
                try:
                    await asyncio.wait_for(ws.recv(), timeout=5)
                except websockets.exceptions.ConnectionClosed as e:
                    return e.code
            return None

        assert asyncio.run(go()) == 1008

    def test_malformed_first_message_closes_with_1008(self):
        async def go():
            async with _connect() as ws:
                await ws.send("not json at all")
                try:
                    await asyncio.wait_for(ws.recv(), timeout=5)
                except websockets.exceptions.ConnectionClosed as e:
                    return e.code
            return None

        assert asyncio.run(go()) == 1008


class TestWsRevalidation:
    def test_revocation_while_connected_closes_socket(self):
        me = _register_client()

        async def go():
            async with _connect() as ws:
                await ws.send(json.dumps({"type": "auth", "token": me["token"]}))
                await asyncio.sleep(0.5)
                # Revoke the session server-side: logout bumps token_version.
                r = requests.post(
                    f"{API}/auth/logout", headers=_bearer(me["token"]), timeout=15
                )
                assert r.status_code == 200, r.text
                # Any inbound traffic triggers a recheck.
                await ws.send("ping")
                try:
                    await asyncio.wait_for(ws.recv(), timeout=5)
                except websockets.exceptions.ConnectionClosed as e:
                    return e.code
            return None

        assert asyncio.run(go()) == 1008

    def test_deactivation_while_connected_closes_socket(self):
        me = _register_client()
        admin = make_admin()

        async def go():
            async with _connect() as ws:
                await ws.send(json.dumps({"type": "auth", "token": me["token"]}))
                await asyncio.sleep(0.5)
                r = requests.post(
                    f"{API}/admin/users/{me['id']}/deactivate",
                    headers=_bearer(admin["token"]),
                    timeout=15,
                )
                assert r.status_code == 200, r.text
                await ws.send("ping")
                try:
                    await asyncio.wait_for(ws.recv(), timeout=5)
                except websockets.exceptions.ConnectionClosed as e:
                    return e.code
            return None

        assert asyncio.run(go()) == 1008
