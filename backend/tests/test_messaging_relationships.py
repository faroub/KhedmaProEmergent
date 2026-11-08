"""P21 — messaging is restricted to relationships (M15).

Allowed: any pair sharing a booking (any status), replies to someone who
already messaged you, and a client contacting a provider for the first time
(the app's Message button). Denied: provider→client cold starts and any
client→client / provider→provider outreach (403). Messages to deleted or
deactivated recipients are refused with 410.
"""
import requests

from helpers import API, fresh_client, fresh_provider


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _send(sender_token: str, other_id: str, text: str = "TEST gated message") -> requests.Response:
    return requests.post(
        f"{API}/chats/{other_id}/messages",
        json={"text": text},
        headers=_bearer(sender_token),
        timeout=15,
    )


def _book_client_provider(client_token: str, provider_id: str) -> str:
    r = requests.post(
        f"{API}/bookings",
        json={
            "provider_id": provider_id,
            "scheduled_date": "2030-01-15T10:00:00",
            "task_description": "TEST booking for messaging gate",
            "address": "12 Rue Test, Alger",
        },
        headers=_bearer(client_token),
        timeout=15,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestMessagingRelationshipGate:
    def test_client_can_cold_message_provider(self):
        client = fresh_client()
        provider = fresh_provider()
        r = _send(client["access_token"], provider["user"]["id"])
        assert r.status_code == 201, r.text

    def test_provider_can_reply_after_client_message(self):
        client = fresh_client()
        provider = fresh_provider()
        first = _send(client["access_token"], provider["user"]["id"], "hello")
        assert first.status_code == 201, first.text
        r = _send(provider["access_token"], client["user"]["id"], "hi back")
        assert r.status_code == 201, r.text

    def test_shared_booking_allows_provider_to_message_client(self):
        client = fresh_client()
        provider = fresh_provider()
        _book_client_provider(client["access_token"], provider["user"]["id"])
        r = _send(provider["access_token"], client["user"]["id"], "about your booking")
        assert r.status_code == 201, r.text

    def test_provider_cold_message_to_client_denied(self):
        client = fresh_client()
        provider = fresh_provider()
        r = _send(provider["access_token"], client["user"]["id"])
        assert r.status_code == 403, r.text
        assert "booking" in r.text.lower()

    def test_client_to_client_denied(self):
        a = fresh_client()
        b = fresh_client()
        r = _send(a["access_token"], b["user"]["id"])
        assert r.status_code == 403, r.text

    def test_provider_to_provider_denied(self):
        a = fresh_provider()
        b = fresh_provider()
        r = _send(a["access_token"], b["user"]["id"])
        assert r.status_code == 403, r.text

    def test_deleted_recipient_denied(self):
        client = fresh_client()
        provider = fresh_provider()
        assert _send(client["access_token"], provider["user"]["id"]).status_code == 201
        # Client deletes their account; the provider's reply must be refused.
        r = requests.post(f"{API}/users/me/delete", headers=_bearer(client["access_token"]), timeout=15)
        assert r.status_code == 200, r.text
        r = _send(provider["access_token"], client["user"]["id"], "you there?")
        assert r.status_code == 410, r.text

    def test_deactivated_recipient_denied(self):
        client = fresh_client()
        provider = fresh_provider()
        assert _send(client["access_token"], provider["user"]["id"]).status_code == 201
        r = requests.post(f"{API}/users/me/deactivate", headers=_bearer(client["access_token"]), timeout=15)
        assert r.status_code == 200, r.text
        r = _send(provider["access_token"], client["user"]["id"], "you there?")
        assert r.status_code == 410, r.text
