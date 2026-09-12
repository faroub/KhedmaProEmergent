"""khedmaPro backend API tests — validates follow-up changes:
rename to khedmaPro, guest bookings, privacy (email/phone hiding),
direct provider reviews, password min-length 8, seeded fake reviews."""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Root branding ----------
def test_root_returns_khedmapro(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json()["message"] == "khedmaPro API"


# ---------- Auth / password min length ----------
def test_register_password_too_short_rejected(s):
    r = s.post(f"{API}/auth/register", json={
        "email": f"TEST_short_{uuid.uuid4().hex[:6]}@x.com",
        "password": "short7x",  # 7 chars
        "role": "client",
        "full_name": "TEST Short",
    })
    assert r.status_code == 422, r.text


def test_register_password_8_chars_ok(s):
    r = s.post(f"{API}/auth/register", json={
        "email": f"TEST_ok_{uuid.uuid4().hex[:6]}@x.com",
        "password": "eight888",
        "role": "client",
        "full_name": "TEST Ok",
    })
    assert r.status_code == 201, r.text


# ---------- Seeded providers ----------
def test_seeded_provider_login_khedmapro_email(s):
    r = s.post(f"{API}/auth/login", json={
        "email": "provider1@khedmapro.dz",
        "password": "password123",
    })
    assert r.status_code == 200, r.text


def test_seed_has_12_providers(s):
    r = s.get(f"{API}/providers")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 12, f"expected >=12 providers, got {len(data)}"


def test_providers_public_hides_email_and_phone(s):
    r = s.get(f"{API}/providers")
    assert r.status_code == 200
    for p in r.json():
        assert "email" not in p, f"email leaked in list: {p}"
        assert "phone" not in p, f"phone leaked in list: {p}"


def test_provider_detail_public_hides_email_and_phone(s):
    plist = s.get(f"{API}/providers").json()
    pid = plist[0]["id"]
    r = s.get(f"{API}/providers/{pid}")
    assert r.status_code == 200
    doc = r.json()
    assert "email" not in doc
    assert "phone" not in doc


def test_auth_me_includes_email_and_phone(s):
    r = s.post(f"{API}/auth/login", json={
        "email": "provider1@khedmapro.dz", "password": "password123"
    })
    tok = r.json()["access_token"]
    r2 = s.get(f"{API}/auth/me", headers=auth(tok))
    assert r2.status_code == 200
    me = r2.json()
    assert me["email"] == "provider1@khedmapro.dz"
    assert me.get("phone")  # provider has phone


def test_providers_have_seeded_reviews(s):
    plist = s.get(f"{API}/providers").json()
    # At least a few providers should have between 4 and 8 reviews with ~4-5 rating
    for p in plist[:5]:
        rc = p.get("reviews_count", 0)
        assert rc >= 4, f"provider {p['id']} has unexpected reviews_count={rc}"
        assert 3.5 <= p["rating"] <= 5.0, f"provider {p['id']} rating out of range: {p['rating']}"
        # Fetch reviews list
        rr = s.get(f"{API}/providers/{p['id']}/reviews").json()
        assert len(rr) >= 4


# ---------- Guest booking ----------
def test_booking_guest_ok(s):
    plist = s.get(f"{API}/providers").json()
    pid = plist[0]["id"]
    r = s.post(f"{API}/bookings", json={
        "provider_id": pid,
        "scheduled_date": "2026-02-15T10:00:00Z",
        "task_description": "TEST guest sink leak",
        "address": "TEST Rue 1, Algiers",
        "rate_type": "hourly",
        "estimated_hours": 2,
        "guest_name": "TEST Guest",
        "guest_phone": "+213555999999",
        "guest_email": "guest@test.dz",
    })
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["is_guest"] is True
    assert d["client_name"] == "TEST Guest"
    assert d["client_id"].startswith("guest:")
    assert d["status"] == "pending"


def test_booking_guest_missing_name_phone_rejected(s):
    plist = s.get(f"{API}/providers").json()
    pid = plist[0]["id"]
    r = s.post(f"{API}/bookings", json={
        "provider_id": pid,
        "scheduled_date": "2026-02-15T10:00:00Z",
        "task_description": "no guest info",
        "address": "x",
        "rate_type": "hourly",
    })
    assert r.status_code == 400, r.text


# ---------- Reviews ----------
def test_review_without_auth_rejected(s):
    plist = s.get(f"{API}/providers").json()
    pid = plist[0]["id"]
    r = s.post(f"{API}/reviews", json={
        "provider_id": pid, "rating": 5, "comment": "TEST no auth"
    })
    assert r.status_code == 401


@pytest.fixture(scope="module")
def client_ctx(s):
    email = f"TEST_client_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "password123",
        "role": "client", "full_name": "TEST Client"
    })
    assert r.status_code == 201, r.text
    return {"token": r.json()["access_token"], "email": email}


def test_review_direct_provider_id_ok(s, client_ctx):
    plist = s.get(f"{API}/providers").json()
    pid = plist[0]["id"]
    old_count = plist[0]["reviews_count"]
    r = s.post(f"{API}/reviews", headers=auth(client_ctx["token"]), json={
        "provider_id": pid, "rating": 5, "comment": "TEST direct review"
    })
    assert r.status_code == 201, r.text
    # Verify rating recomputed
    p = s.get(f"{API}/providers/{pid}").json()
    assert p["reviews_count"] == old_count + 1


def test_review_duplicate_provider_id_returns_409(s, client_ctx):
    plist = s.get(f"{API}/providers").json()
    pid = plist[0]["id"]
    r = s.post(f"{API}/reviews", headers=auth(client_ctx["token"]), json={
        "provider_id": pid, "rating": 4, "comment": "TEST dup"
    })
    assert r.status_code == 409, r.text
