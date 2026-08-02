"""Iteration 9 — Regression test for admin_education category split.

The legacy `admin_education` category has been split into two brand-new
categories: `admin_consulting` and `education`. Existing providers migrated:
  - Leila Bensalem → admin_consulting
  - Nassim Bouzid → education
"""
import os
import asyncio
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- 1. Categories list ----------
def test_categories_endpoint_split(api):
    r = api.get(f"{BASE_URL}/categories", timeout=15)
    assert r.status_code == 200, r.text
    cats = r.json()
    assert isinstance(cats, list) and len(cats) > 0
    ids = [c["id"] for c in cats]
    assert "admin_education" not in ids, f"legacy admin_education still present: {ids}"
    assert ids.count("admin_consulting") == 1
    assert ids.count("education") == 1
    ac = next(c for c in cats if c["id"] == "admin_consulting")
    ed = next(c for c in cats if c["id"] == "education")
    assert ac["name"] == "Administrative Consultants", ac
    assert ed["name"] == "Education (Private Tutoring)", ed


# ---------- 2. providers?category=admin_consulting ----------
def test_providers_admin_consulting(api):
    r = api.get(f"{BASE_URL}/providers", params={"category": "admin_consulting"}, timeout=15)
    assert r.status_code == 200, r.text
    providers = r.json()
    assert isinstance(providers, list) and len(providers) >= 1, providers
    for p in providers:
        assert p["category"] == "admin_consulting", p
    names = [p.get("full_name") for p in providers]
    assert any("Leila Bensalem" in (n or "") for n in names), names


# ---------- 3. providers?category=education ----------
def test_providers_education(api):
    r = api.get(f"{BASE_URL}/providers", params={"category": "education"}, timeout=15)
    assert r.status_code == 200, r.text
    providers = r.json()
    assert isinstance(providers, list) and len(providers) >= 1, providers
    for p in providers:
        assert p["category"] == "education", p
    names = [p.get("full_name") for p in providers]
    assert any("Nassim Bouzid" in (n or "") for n in names), names


# ---------- 4. providers?category=admin_education (legacy, must be empty) ----------
def test_providers_legacy_admin_education_empty(api):
    r = api.get(f"{BASE_URL}/providers", params={"category": "admin_education"}, timeout=15)
    assert r.status_code == 200, r.text
    providers = r.json()
    assert providers == [], f"legacy category still returns rows: {providers}"


# ---------- 5. Optional Mongo deep-check ----------
def test_mongo_no_admin_education_rows():
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _count():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        c = await db.users.count_documents({"category": "admin_education"})
        client.close()
        return c

    n = asyncio.run(_count())
    assert n == 0, f"still {n} users with legacy category admin_education"
