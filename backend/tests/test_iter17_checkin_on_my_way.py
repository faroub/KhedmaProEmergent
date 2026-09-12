"""Iteration 17 — arrival check-in (`in_progress`) + "On my way" chat message.

Covers:
  * confirmed → in_progress by the provider stamps `arrived_at`, drops an
    automatic chat message in the client's thread and shows up in
    `/chats/mine` for both parties;
  * guards: pending → in_progress is 400, clients cannot set in_progress,
    unverified providers get 403, the phone-reveal gate accepts in_progress;
  * in_progress → completed becomes awaiting_confirmation (two-step completion
    still works from the new status);
  * guest bookings: check-in works but no chat message is created;
  * "On my way" = a normal chat message from provider to client — asserted via
    the REST send endpoint and the client's history.
"""
import os
import random
import uuid

import pytest
import requests
from pymongo import MongoClient

from helpers import with_phone_token

API = os.environ.get("API_BASE", "http://localhost:8001/api")

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]

ARRIVED_TEXT = "I've arrived"


def _hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _fresh_provider():
    tail = "".join(str(random.randint(0, 9)) for _ in range(8))
    tag = uuid.uuid4().hex[:8]
    body = with_phone_token(
        {
            "email": f"TEST_iter17_p_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "service_provider",
            "full_name": f"Iter17 P {tag}",
            "category": "plumbing",
            "phone": f"+2135{tail}",
            "wilaya_code": "16",
        },
        API,
    )
    r = requests.post(f"{API}/auth/register", json=body, timeout=10)
    assert r.status_code == 201, r.text
    return r.json()


def _fresh_client():
    tag = uuid.uuid4().hex[:8]
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": f"TEST_iter17_c_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": f"Iter17 C {tag}",
        },
        timeout=10,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _book(client_token: str, provider_id: str) -> str:
    r = requests.post(
        f"{API}/bookings",
        json={
            "provider_id": provider_id,
            "task_description": "Iter17 check-in job",
            "scheduled_date": "2026-09-20T10:00:00Z",
            "rate_type": "task",
            "address": "10 rue Didouche Mourad, Alger",
        },
        headers=_hdr(client_token),
        timeout=10,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _set_status(booking_id: str, token: str, status: str) -> requests.Response:
    return requests.patch(
        f"{API}/bookings/{booking_id}/status",
        json={"status": status},
        headers=_hdr(token),
        timeout=10,
    )


def _client_history(client_token: str, provider_id: str) -> list:
    r = requests.get(f"{API}/chats/{provider_id}/messages", headers=_hdr(client_token), timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture()
def pair():
    """Verified provider + registered client + a confirmed booking between them."""
    prov = _fresh_provider()
    cli = _fresh_client()
    pid, cid = prov["user"]["id"], cli["user"]["id"]
    bid = _book(cli["access_token"], pid)
    r = _set_status(bid, prov["access_token"], "confirmed")
    assert r.status_code == 200, r.text
    yield {"prov": prov, "cli": cli, "pid": pid, "cid": cid, "bid": bid}
    _db.bookings.delete_one({"id": bid})
    _db.messages.delete_many({"$or": [{"from_id": {"$in": [pid, cid]}}, {"to_id": {"$in": [pid, cid]}}]})
    _db.phone_reveals.delete_many({"$or": [{"viewer_id": {"$in": [pid, cid]}}, {"target_id": {"$in": [pid, cid]}}]})
    _db.users.delete_many({"id": {"$in": [pid, cid]}})


# =========================================================================
# Arrival check-in
# =========================================================================

def test_arrived_moves_confirmed_to_in_progress_and_stamps_arrived_at(pair):
    r = _set_status(pair["bid"], pair["prov"]["access_token"], "in_progress")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "in_progress"
    assert body.get("arrived_at"), body

    doc = _db.bookings.find_one({"id": pair["bid"]}, {"_id": 0})
    assert doc["status"] == "in_progress"
    assert doc["arrived_at"] == body["arrived_at"]

    # Both parties see the new status in their lists.
    mine_p = requests.get(f"{API}/bookings/mine", headers=_hdr(pair["prov"]["access_token"]), timeout=10).json()
    mine_c = requests.get(f"{API}/bookings/mine", headers=_hdr(pair["cli"]["access_token"]), timeout=10).json()
    assert next(b for b in mine_p if b["id"] == pair["bid"])["status"] == "in_progress"
    assert next(b for b in mine_c if b["id"] == pair["bid"])["status"] == "in_progress"


def test_arrived_posts_automatic_chat_message_to_client(pair):
    r = _set_status(pair["bid"], pair["prov"]["access_token"], "in_progress")
    assert r.status_code == 200, r.text

    history = _client_history(pair["cli"]["access_token"], pair["pid"])
    arrived = [m for m in history if ARRIVED_TEXT in m["text"]]
    assert len(arrived) == 1, history
    msg = arrived[0]
    assert msg["from_id"] == pair["pid"]
    assert msg["to_id"] == pair["cid"]
    assert msg["from_name"] == pair["prov"]["user"]["full_name"]

    # The thread is listed for the client with the arrival text as preview.
    threads = requests.get(f"{API}/chats/mine", headers=_hdr(pair["cli"]["access_token"]), timeout=10).json()
    thread = next(t for t in threads if t["other_id"] == pair["pid"])
    assert ARRIVED_TEXT in thread["last_text"]


def test_arrived_twice_is_rejected(pair):
    assert _set_status(pair["bid"], pair["prov"]["access_token"], "in_progress").status_code == 200
    r = _set_status(pair["bid"], pair["prov"]["access_token"], "in_progress")
    assert r.status_code == 400, r.text
    # Still exactly one automatic message.
    history = _client_history(pair["cli"]["access_token"], pair["pid"])
    assert len([m for m in history if ARRIVED_TEXT in m["text"]]) == 1


def test_arrived_requires_confirmed_booking():
    prov = _fresh_provider()
    cli = _fresh_client()
    bid = _book(cli["access_token"], prov["user"]["id"])
    try:
        r = _set_status(bid, prov["access_token"], "in_progress")  # still pending
        assert r.status_code == 400, r.text
        assert "confirmed" in r.text.lower()
        assert _db.bookings.find_one({"id": bid})["status"] == "pending"
    finally:
        _db.bookings.delete_one({"id": bid})
        _db.users.delete_many({"id": {"$in": [prov["user"]["id"], cli["user"]["id"]]}})


def test_client_cannot_set_in_progress(pair):
    r = _set_status(pair["bid"], pair["cli"]["access_token"], "in_progress")
    assert r.status_code == 403, r.text
    assert _db.bookings.find_one({"id": pair["bid"]})["status"] == "confirmed"


def test_other_provider_cannot_check_in(pair):
    intruder = _fresh_provider()
    try:
        r = _set_status(pair["bid"], intruder["access_token"], "in_progress")
        assert r.status_code == 403, r.text
    finally:
        _db.users.delete_one({"id": intruder["user"]["id"]})


def test_unverified_provider_cannot_check_in(pair):
    _db.users.update_one({"id": pair["pid"]}, {"$set": {"phone_verified": False}})
    r = _set_status(pair["bid"], pair["prov"]["access_token"], "in_progress")
    assert r.status_code == 403, r.text
    assert "phone" in r.text.lower()


def test_invalid_status_value_is_422(pair):
    r = _set_status(pair["bid"], pair["prov"]["access_token"], "arrived")
    assert r.status_code == 422, r.text


def test_in_progress_then_mark_done_becomes_awaiting_confirmation(pair):
    assert _set_status(pair["bid"], pair["prov"]["access_token"], "in_progress").status_code == 200
    r = _set_status(pair["bid"], pair["prov"]["access_token"], "completed")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "awaiting_confirmation"
    assert r.json().get("provider_marked_done_at")

    # Client finalises — full two-step completion still works from in_progress.
    r2 = _set_status(pair["bid"], pair["cli"]["access_token"], "completed")
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "completed"


def test_phone_reveal_allowed_while_in_progress(pair):
    assert _set_status(pair["bid"], pair["prov"]["access_token"], "in_progress").status_code == 200
    r = requests.get(f"{API}/users/{pair['pid']}/phone", headers=_hdr(pair["cli"]["access_token"]), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json().get("phone")


def test_guest_booking_check_in_has_no_chat_message():
    prov = _fresh_provider()
    pid = prov["user"]["id"]
    r = requests.post(
        f"{API}/bookings",
        json={
            "provider_id": pid,
            "task_description": "Iter17 guest job",
            "scheduled_date": "2026-09-20T10:00:00Z",
            "rate_type": "task",
            "address": "Bab Ezzouar, Alger",
            "guest_name": "Guest Iter17",
            "guest_phone": "0555123456",
        },
        timeout=10,
    )
    assert r.status_code == 201, r.text
    bid = r.json()["id"]
    try:
        assert _set_status(bid, prov["access_token"], "confirmed").status_code == 200
        before = _db.messages.count_documents({"from_id": pid})
        r2 = _set_status(bid, prov["access_token"], "in_progress")
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "in_progress"
        assert _db.messages.count_documents({"from_id": pid}) == before
    finally:
        _db.bookings.delete_one({"id": bid})
        _db.users.delete_one({"id": pid})


# =========================================================================
# "On my way" — an ETA chat message from provider to client
# =========================================================================

def test_on_my_way_message_reaches_client(pair):
    text = "🚗 I'm on my way! I should arrive in about 30 minutes (around 10:30 AM)."
    r = requests.post(
        f"{API}/chats/{pair['cid']}/messages",
        json={"text": text},
        headers=_hdr(pair["prov"]["access_token"]),
        timeout=10,
    )
    assert r.status_code == 201, r.text
    sent = r.json()
    assert sent["from_id"] == pair["pid"] and sent["to_id"] == pair["cid"]
    assert sent["text"] == text

    history = _client_history(pair["cli"]["access_token"], pair["pid"])
    assert any(m["id"] == sent["id"] and m["text"] == text for m in history), history

    # Provider sees the same message in their own history of the thread.
    mine = requests.get(f"{API}/chats/{pair['cid']}/messages", headers=_hdr(pair["prov"]["access_token"]), timeout=10).json()
    assert any(m["id"] == sent["id"] for m in mine)


def test_on_my_way_then_arrived_keeps_chronological_order(pair):
    eta = "🚗 I'm on my way! I should arrive in about 10 minutes (around 10:10 AM)."
    r = requests.post(
        f"{API}/chats/{pair['cid']}/messages",
        json={"text": eta},
        headers=_hdr(pair["prov"]["access_token"]),
        timeout=10,
    )
    assert r.status_code == 201, r.text
    assert _set_status(pair["bid"], pair["prov"]["access_token"], "in_progress").status_code == 200

    history = _client_history(pair["cli"]["access_token"], pair["pid"])
    texts = [m["text"] for m in history]
    i_eta = next(i for i, t in enumerate(texts) if t == eta)
    i_arr = next(i for i, t in enumerate(texts) if ARRIVED_TEXT in t)
    assert i_eta < i_arr, texts
    assert history[i_eta]["created_at"] <= history[i_arr]["created_at"]


def test_on_my_way_to_unknown_recipient_404(pair):
    r = requests.post(
        f"{API}/chats/{uuid.uuid4()}/messages",
        json={"text": "🚗 On my way"},
        headers=_hdr(pair["prov"]["access_token"]),
        timeout=10,
    )
    assert r.status_code == 404, r.text


def test_on_my_way_empty_text_422(pair):
    r = requests.post(
        f"{API}/chats/{pair['cid']}/messages",
        json={"text": ""},
        headers=_hdr(pair["prov"]["access_token"]),
        timeout=10,
    )
    assert r.status_code == 422, r.text
