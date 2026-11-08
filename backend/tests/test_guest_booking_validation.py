"""P20 — guest bookings validate contact data (M14).

Guest phones are normalized with normalize_dz_phone (invalid numbers get
400), task_description/address/guest_name have max lengths, and guest_email
must be a valid email address when present.
"""
import asyncio
import os
import uuid

import pytest
import requests
from fastapi import HTTPException

import ratelimit
from config import DB_NAME, MONGO_URL
from helpers import API, fresh_provider
from schemas import BookingCreate

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
GUEST_PHONE_OK = "0555123456"  # normalizes to +213555123456


def _book(**overrides) -> requests.Response:
    provider = fresh_provider()
    payload = {
        "provider_id": provider["user"]["id"],
        "scheduled_date": "2030-01-15T10:00:00",
        "task_description": "Fix a leaking sink",
        "address": "12 Rue Didouche Mourad, Alger",
        "guest_name": "TEST Guest",
        "guest_phone": GUEST_PHONE_OK,
        "rate_type": "hourly",
    }
    payload.update(overrides)
    return requests.post(f"{API}/bookings", json=payload, timeout=15)


class TestGuestBookingValidation:
    def test_valid_guest_booking_normalizes_phone(self):
        r = _book()
        assert r.status_code == 201, r.text
        assert r.json()["client_phone"] == "+213555123456"

    def test_malformed_phone_rejected(self):
        for bad in ("not-a-phone", "12345", "+213123", "0" * 20):
            r = _book(guest_phone=bad)
            assert r.status_code == 400, (bad, r.text)
            assert "phone" in r.text.lower()

    def test_oversize_fields_rejected(self):
        r = _book(task_description="x" * 2001)
        assert r.status_code == 422
        r = _book(address="x" * 301)
        assert r.status_code == 422
        r = _book(guest_name="x" * 101)
        assert r.status_code == 422

    def test_boundary_lengths_accepted(self):
        r = _book(task_description="x" * 2000, address="x" * 300, guest_name="x" * 100)
        assert r.status_code == 201, r.text

    def test_invalid_guest_email_rejected(self):
        r = _book(guest_email="not-an-email")
        assert r.status_code == 422

    def test_valid_guest_email_accepted(self):
        r = _book(guest_email=f"guest_{uuid.uuid4().hex[:8]}@example.com")
        assert r.status_code == 201, r.text
        assert r.json()["client_email"].endswith("@example.com")

    def test_guest_rate_limit_429(self, monkeypatch):
        """Unauthenticated bookings are capped per IP (P12) — exercised
        in-process like tests/test_ratelimit.py (the server's constants cannot
        be monkeypatched cross-process)."""
        from starlette.requests import Request

        import routes.bookings as bookings_mod

        monkeypatch.setattr(bookings_mod, "RATE_LIMIT_GUEST_BOOKING_IP", 2)
        provider = fresh_provider()
        provider_id = provider["user"]["id"]
        # Unique per run so a previous suite run on the same database cannot
        # have consumed this key's counter.
        ip = f"198.51.{uuid.uuid4().int % 256}.{uuid.uuid4().int % 256}"

        async def scenario(client):
            monkeypatch.setattr(bookings_mod, "db", client[DB_NAME])
            body = BookingCreate(
                provider_id=provider_id,
                scheduled_date="2030-01-15T10:00:00",
                task_description="x",
                address="x",
                guest_name="TEST Guest",
                guest_phone=GUEST_PHONE_OK,
            )
            request = Request(
                {"type": "http", "client": (ip, 40000), "headers": []}
            )
            created = 0
            for _ in range(2):
                await bookings_mod.create_booking(body, request, None)
                created += 1
            with pytest.raises(HTTPException) as exc:
                await bookings_mod.create_booking(body, request, None)
            assert exc.value.status_code == 429
            assert int(exc.value.headers["Retry-After"]) >= 1

        async def wrapped():
            from motor.motor_asyncio import AsyncIOMotorClient

            import routes.settings as settings_mod

            async def fake_settings():
                return {}

            monkeypatch.setattr(settings_mod, "get_effective_settings", fake_settings)
            client = AsyncIOMotorClient(MONGO_URL)
            monkeypatch.setattr(ratelimit, "db", client[DB_NAME])
            try:
                await scenario(client)
            finally:
                client.close()

        asyncio.run(wrapped())
