"""WebSocket registry for real-time chat, with optional Redis fan-out.

Without a bus (REDIS_URL unset) delivery is in-process only — the original
behavior, fine for a single worker. When a bus is attached (server startup
with REDIS_URL set), send_to publishes to the shared channel and every
worker's subscriber delivers to its own local sockets, so a message sent
from one gunicorn worker reaches sockets held by another.

Delivery happens ONLY through subscribers — including the publisher's own —
so each socket receives exactly once even when several workers share the
bus. A failed publish falls back to local delivery (better than nothing) and
is logged.
"""
import asyncio
import contextlib
import json
import logging
import os

from fastapi import WebSocket

logger = logging.getLogger(__name__)

CHANNEL = "ws:fanout"


class WSManager:
    """Very small in-process registry keyed by user id."""

    def __init__(self):
        self.sockets: dict[str, list[WebSocket]] = {}
        self._publish = None
        self._run_subscriber = None
        self._subscriber_task = None
        self._client = None
        self._pubsub = None

    async def connect(self, user_id: str, ws: WebSocket):
        # The ws_chat handler accepts the socket before authentication so it
        # can exchange the auth message and close with 1008 on failure.
        self.sockets.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        lst = self.sockets.get(user_id, [])
        if ws in lst:
            lst.remove(ws)
        if not lst:
            self.sockets.pop(user_id, None)

    def attach_bus(self, publish, run_subscriber):
        """Wire an outbound publish callable and an inbound subscriber loop.

        `publish(payload: str)` fans a message out to every subscriber on the
        bus. `run_subscriber(on_message)` runs until cancelled, feeding each
        received payload to the manager's _on_bus_message. Called by start()
        once the Redis client is healthy.
        """
        self._publish = publish
        self._run_subscriber = run_subscriber
        self._subscriber_task = asyncio.get_running_loop().create_task(
            run_subscriber(self._on_bus_message)
        )

    async def start(self):
        """Attach a Redis pub/sub bus when REDIS_URL is set (multi-worker).

        Without REDIS_URL nothing changes: local in-memory delivery. A missing
        'redis' package only degrades (logged), but a reachable-but-broken
        Redis fails loudly at startup instead of silently dropping fan-out.
        """
        url = os.environ.get("REDIS_URL")
        if not url:
            return
        try:
            import redis.asyncio as aioredis
        except ImportError:
            logger.error(
                "REDIS_URL is set but the 'redis' package is not installed — "
                "falling back to per-worker in-memory delivery; chat messages "
                "will not reach sockets held by other workers"
            )
            return
        client = aioredis.from_url(url, decode_responses=True)
        pubsub = client.pubsub()
        # Subscribe before accepting any publish so nothing published between
        # start() and the subscriber loop is lost.
        await pubsub.subscribe(CHANNEL)

        async def publish(payload: str):
            await client.publish(CHANNEL, payload)

        async def run_subscriber(on_message):
            try:
                async for msg in pubsub.listen():
                    if msg.get("type") == "message":
                        await on_message(msg["data"])
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.error("ws fanout: subscriber loop stopped", exc_info=True)

        self._client = client
        self._pubsub = pubsub
        self.attach_bus(publish, run_subscriber)
        logger.info("ws fanout: Redis bus attached (%s, channel %s)", url, CHANNEL)

    async def stop(self):
        """Cancel the subscriber and close the bus. Safe when no bus attached."""
        task, self._subscriber_task = self._subscriber_task, None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._publish = None
        self._run_subscriber = None
        pubsub, self._pubsub = self._pubsub, None
        client, self._client = self._client, None
        if pubsub is not None:
            with contextlib.suppress(Exception):
                await pubsub.close()
        if client is not None:
            with contextlib.suppress(Exception):
                await client.close()

    async def _deliver(self, user_id: str, message: dict):
        for ws in list(self.sockets.get(user_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(user_id, ws)

    async def _on_bus_message(self, payload: str):
        try:
            data = json.loads(payload)
            user_id = data["user_id"]
            message = data["message"]
        except Exception:
            logger.debug("ws fanout: ignoring malformed payload")
            return
        await self._deliver(user_id, message)

    async def send_to(self, user_id: str, message: dict):
        if self._publish is not None:
            try:
                await self._publish(json.dumps({"user_id": user_id, "message": message}))
            except Exception:
                logger.error(
                    "ws fanout: publish failed; delivering locally only", exc_info=True
                )
                await self._deliver(user_id, message)
        else:
            await self._deliver(user_id, message)


# App-wide singleton
ws_manager = WSManager()


def thread_id(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))
