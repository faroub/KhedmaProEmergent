"""In-memory WebSocket registry for real-time chat fan-out."""
from fastapi import WebSocket


class WSManager:
    """Very small in-process registry keyed by user id."""

    def __init__(self):
        self.sockets: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.sockets.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        lst = self.sockets.get(user_id, [])
        if ws in lst:
            lst.remove(ws)
        if not lst:
            self.sockets.pop(user_id, None)

    async def send_to(self, user_id: str, message: dict):
        for ws in list(self.sockets.get(user_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(user_id, ws)


# App-wide singleton
ws_manager = WSManager()


def thread_id(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))
