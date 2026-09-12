"""Iteration 14 — Admin Flags UI wiring, phone-reveal, and mandatory provider fields."""
import os
import random
import uuid

import requests
from pymongo import MongoClient

from helpers import with_phone_token

API = os.environ.get("API_BASE", "http://localhost:8001/api")

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]


def _cleanup_user(uid: str) -> None:
    if not uid:
        return
    try:
        _db.users.delete_one({"id": uid})
    except Exception:
        pass


def _admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "admin@khedmapro.dz", "password": "admin123"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# =========================================================================
# TASK 3 — mandatory phone + wilaya at provider registration
# =========================================================================

def _new_provider_payload(**overrides):
    tag = uuid.uuid4().hex[:8]
    tail = "".join(str(random.randint(0, 9)) for _ in range(8))
    base = {
        "email": f"TEST_iter14_{tag}@example.com",
        "password": "SuperStrongPw1!",
        "role": "service_provider",
        "full_name": "Iter14 Provider",
        "category": "plumbing",
        "phone": f"+2135{tail}",
        "wilaya_code": "16",  # Alger
    }
    base.update(overrides)
    return base


def test_provider_register_missing_phone_400():
    r = requests.post(f"{API}/auth/register", json=_new_provider_payload(phone=None), timeout=10)
    assert r.status_code == 400
    assert "phone" in r.text.lower() or "algerian" in r.text.lower()


def test_provider_register_missing_wilaya_400():
    r = requests.post(f"{API}/auth/register", json=_new_provider_payload(wilaya_code=None), timeout=10)
    assert r.status_code == 400
    assert "wilaya" in r.text.lower()


def test_provider_register_invalid_wilaya_400():
    r = requests.post(f"{API}/auth/register", json=_new_provider_payload(wilaya_code="99"), timeout=10)
    assert r.status_code == 400
    assert "wilaya" in r.text.lower()


def test_provider_register_bad_phone_400():
    r = requests.post(f"{API}/auth/register", json=_new_provider_payload(phone="12345"), timeout=10)
    assert r.status_code == 400


def test_provider_register_happy_path_201():
    payload = with_phone_token(_new_provider_payload(), API)
    r = requests.post(f"{API}/auth/register", json=payload, timeout=10)
    assert r.status_code == 201, r.text
    user = r.json()["user"]
    assert user["role"] == "service_provider"
    assert user.get("wilaya_code") == "16"
    _cleanup_user(user["id"])


def test_client_register_no_phone_still_works():
    """Clients keep the pre-existing behavior: phone/wilaya are optional."""
    tag = uuid.uuid4().hex[:8]
    payload = {
        "email": f"TEST_iter14_client_{tag}@example.com",
        "password": "SuperStrongPw1!",
        "role": "client",
        "full_name": "Iter14 Client",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=10)
    assert r.status_code == 201, r.text
    user = r.json()["user"]
    assert user["role"] == "client"
    _cleanup_user(user["id"])


# =========================================================================
# TASK 1 — admin flags endpoint (UI wiring smoke)
# =========================================================================

def test_admin_flags_endpoint_reachable():
    token = _admin_token()
    r = requests.get(f"{API}/admin/flags", headers=_hdr(token), timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for row in data:
        assert "provider_id" in row
        assert "reason" in row
        assert "flagged_at" in row


def test_admin_flags_non_admin_403():
    tag = uuid.uuid4().hex[:8]
    payload = {
        "email": f"TEST_iter14_flags_c_{tag}@example.com",
        "password": "SuperStrongPw1!",
        "role": "client",
        "full_name": "Not Admin",
    }
    rr = requests.post(f"{API}/auth/register", json=payload, timeout=10)
    assert rr.status_code == 201
    token = rr.json()["access_token"]
    r = requests.get(f"{API}/admin/flags", headers=_hdr(token), timeout=10)
    assert r.status_code == 403
    _cleanup_user(rr.json()["user"]["id"])


# =========================================================================
# TASK 2 — reveal-phone endpoint contract (frontend calls this)
# =========================================================================

def test_reveal_phone_own_id_400():
    token = _admin_token()
    me = requests.get(f"{API}/auth/me", headers=_hdr(token), timeout=10).json()
    r = requests.get(f"{API}/users/{me['id']}/phone", headers=_hdr(token), timeout=10)
    assert r.status_code == 400


def test_reveal_phone_without_active_booking_403():
    """Without any active booking between the two parties, reveal is 403."""
    tag = uuid.uuid4().hex[:8]
    r0 = requests.post(
        f"{API}/auth/register",
        json={
            "email": f"TEST_iter14_reveal_c_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": "Reveal Client",
        },
        timeout=10,
    )
    assert r0.status_code == 201
    client_token = r0.json()["access_token"]
    client_id = r0.json()["user"]["id"]

    prov_login = requests.post(
        f"{API}/auth/login",
        json={"email": "provider1@khedmapro.dz", "password": "password123"},
        timeout=10,
    )
    assert prov_login.status_code == 200
    prov_id = prov_login.json()["user"]["id"]

    r = requests.get(f"{API}/users/{prov_id}/phone", headers=_hdr(client_token), timeout=10)
    assert r.status_code == 403
    _cleanup_user(client_id)
