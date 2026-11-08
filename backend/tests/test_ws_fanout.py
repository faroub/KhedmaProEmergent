"""P27 — real-time chat fan-out across workers.

ws_manager delivers in-process when no bus is attached and through a Redis
pub/sub bus when REDIS_URL is set, so a message sent from one gunicorn
worker reaches sockets held by another. The cross-worker test spawns a
second uvicorn process sharing the database, JWT secret, and REDIS_URL; it
is skipped unless REDIS_URL is set (CI provides a redis service container).

Note: the cross-worker test expects the PRIMARY backend (EXPO_PUBLIC_BACKEND_URL)
to share the same REDIS_URL — otherwise its POST is published locally only.
"""
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid

import pytest
import requests
import websockets  # type: ignore

from helpers import fresh_provider
from ws_manager import WSManager

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER_PORT = 8002


class FakeSocket:
    def __init__(self):
        self.sent = []

    async def send_json(self, message):
        self.sent.append(message)


class FailingSocket:
    async def send_json(self, message):
        raise RuntimeError("socket closed")


class TestLocalDelivery:
    def test_no_bus_delivers_locally(self):
        async def go():
            mgr = WSManager()
            ws = FakeSocket()
            await mgr.connect("u1", ws)
            await mgr.send_to("u1", {"type": "message", "n": 1})
            await mgr.send_to("u1", {"type": "message", "n": 2})
            await mgr.stop()  # no bus attached: stop is a no-op
            return ws.sent

        assert asyncio.run(go()) == [
            {"type": "message", "n": 1},
            {"type": "message", "n": 2},
        ]

    def test_dead_sockets_are_pruned(self):
        async def go():
            mgr = WSManager()
            live, dead = FakeSocket(), FailingSocket()
            await mgr.connect("u1", live)
            await mgr.connect("u1", dead)
            await mgr.send_to("u1", {"type": "message"})
            return live.sent, mgr.sockets.get("u1")

        sent, remaining = asyncio.run(go())
        assert sent == [{"type": "message"}]
        # the failing socket was pruned, the live one kept
        assert isinstance(remaining, list) and len(remaining) == 1


def _attach_in_process_bus(manager, subscribers):
    """Two managers sharing this 'bus' behave like two workers on Redis:
    publish fans the payload out to every subscriber, including the
    publisher's own subscriber."""

    async def publish(payload):
        for feed in list(subscribers):
            await feed(payload)

    async def run_subscriber(on_message):
        async def feed(payload):
            await on_message(payload)

        subscribers.append(feed)
        try:
            await asyncio.Event().wait()  # run until stop() cancels
        finally:
            subscribers.remove(feed)

    manager.attach_bus(publish, run_subscriber)


class TestInProcessBusFanOut:
    def test_send_reaches_other_manager_and_own_sockets(self):
        subscribers = []

        async def go():
            a, b = WSManager(), WSManager()
            a_ws, b_ws = FakeSocket(), FakeSocket()
            _attach_in_process_bus(a, subscribers)
            _attach_in_process_bus(b, subscribers)
            await asyncio.sleep(0)  # let both subscribers register
            assert len(subscribers) == 2
            await a.connect("u", a_ws)
            await b.connect("u", b_ws)
            await a.send_to("u", {"type": "message"})
            await a.stop()
            await b.stop()
            return a_ws.sent, b_ws.sent

        a_sent, b_sent = asyncio.run(go())
        # Delivery goes only through subscribers — including the sender's own
        # (echo) — so each socket receives exactly once.
        assert a_sent == [{"type": "message"}]
        assert b_sent == [{"type": "message"}]

    def test_malformed_payload_is_ignored(self):
        subscribers = []

        async def go():
            a = WSManager()
            ws = FakeSocket()
            _attach_in_process_bus(a, subscribers)
            await asyncio.sleep(0)
            await a.connect("u", ws)
            # Malformed payloads must not raise or poison the subscriber.
            await a._on_bus_message("not json")
            await a._on_bus_message(json.dumps({"bogus": True}))
            await a.send_to("u", {"type": "message"})
            await a.stop()
            return ws.sent

        assert asyncio.run(go()) == [{"type": "message"}]


def _register_client() -> dict:
    email = f"TEST_ws27_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": "TEST WS27",
        },
        timeout=15,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return {"id": body["user"]["id"], "token": body["access_token"]}


@pytest.mark.skipif(
    not os.environ.get("REDIS_URL"),
    reason="requires a Redis server at REDIS_URL shared by both workers",
)
class TestCrossWorkerDelivery:
    def test_message_posted_on_one_worker_reaches_socket_on_another(self):
        provider = fresh_provider()
        provider_id, provider_token = provider["user"]["id"], provider["access_token"]
        client = _register_client()

        log_path = os.path.join(tempfile.gettempdir(), "ws_fanout_worker.log")
        log = open(log_path, "w")
        env = dict(os.environ)
        proc = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn", "server:app",
                "--host", "127.0.0.1", "--port", str(WORKER_PORT),
            ],
            cwd=BACKEND_DIR,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            up = False
            for _ in range(120):
                try:
                    if requests.get(
                        f"http://127.0.0.1:{WORKER_PORT}/api/categories", timeout=2
                    ).status_code == 200:
                        up = True
                        break
                except Exception:
                    pass
                time.sleep(0.5)
            if not up:
                log.close()
                with open(log_path) as fh:
                    pytest.fail("second worker did not start:\n" + fh.read())

            async def go():
                async with websockets.connect(
                    f"ws://127.0.0.1:{WORKER_PORT}/api/ws/chat", open_timeout=10
                ) as ws:
                    # P15 auth handshake: the token rides the first message,
                    # not the query string.
                    await ws.send(json.dumps({"type": "auth", "token": provider_token}))
                    await asyncio.sleep(0.5)
                    r = requests.post(
                        f"{API}/chats/{provider_id}/messages",
                        headers={"Authorization": f"Bearer {client['token']}"},
                        json={"text": "hello from the other worker"},
                        timeout=15,
                    )
                    assert r.status_code == 201, r.text
                    raw = await asyncio.wait_for(ws.recv(), timeout=10)
                    return json.loads(raw)

            msg = asyncio.run(go())
            assert msg["type"] == "message"
            assert msg["message"]["from_id"] == client["id"]
            assert msg["message"]["to_id"] == provider_id
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            log.close()
