"""Iteration 16 — Admin Dashboard hub, ads, categories tri-lang, marketing site i18n.

Focus: NEW endpoints only, per review request:
- GET /api/categories tri-language + painting=brush
- Admin categories CRUD + reorder (guarded)
- Admin stats KPI
- Admin users search + deactivate/reactivate/force-verify/delete
- Admin bookings monitor
- Admin revenue
- Admin broadcast
- CSV exports
- Public ads listing + impression/click counters
- Admin ads CRUD + reorder
- Auth guards: 401 unauth / 403 non-admin
- Marketing site HTML serves i18n.js (English default)
"""
import os
import uuid

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]


def _hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@khedmapro.dz", "password": "admin123"},
                      timeout=10)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_id(admin_token):
    r = requests.get(f"{API}/auth/me", headers=_hdr(admin_token), timeout=10)
    return r.json()["id"]


@pytest.fixture(scope="session")
def provider_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "provider1@khedmapro.dz", "password": "password123"},
                      timeout=10)
    if r.status_code != 200:
        pytest.skip(f"Provider login failed: {r.text}")
    return r.json()["access_token"]


# =========================================================================
# Categories: public tri-lang + painting=brush
# =========================================================================
class TestCategories:
    def test_categories_return_tri_language(self):
        r = requests.get(f"{API}/categories", timeout=10)
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list) and len(cats) > 0
        # Every category must have tri-language keys
        for c in cats:
            assert "name_en" in c and "name_fr" in c and "name_ar" in c
            assert "icon" in c and "id" in c

    def test_painting_icon_is_brush(self):
        r = requests.get(f"{API}/categories", timeout=10)
        cats = r.json()
        paint = next((c for c in cats if c["id"] == "painting"), None)
        assert paint is not None, "painting category missing"
        assert paint["icon"] == "brush", f"expected 'brush', got {paint['icon']}"


# =========================================================================
# Admin auth guards
# =========================================================================
class TestAuthGuards:
    def test_admin_stats_requires_auth(self):
        r = requests.get(f"{API}/admin/stats", timeout=10)
        assert r.status_code == 401

    def test_admin_stats_forbidden_for_non_admin(self, provider_token):
        r = requests.get(f"{API}/admin/stats", headers=_hdr(provider_token), timeout=10)
        assert r.status_code == 403

    def test_admin_users_forbidden_for_non_admin(self, provider_token):
        r = requests.get(f"{API}/admin/users", headers=_hdr(provider_token), timeout=10)
        assert r.status_code == 403

    def test_admin_categories_forbidden_for_non_admin(self, provider_token):
        r = requests.get(f"{API}/admin/categories", headers=_hdr(provider_token), timeout=10)
        assert r.status_code == 403

    def test_admin_ads_forbidden_for_non_admin(self, provider_token):
        r = requests.get(f"{API}/admin/ads", headers=_hdr(provider_token), timeout=10)
        assert r.status_code == 403


# =========================================================================
# Admin stats KPI
# =========================================================================
class TestAdminStats:
    def test_stats_payload_shape(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        # Users block
        for k in ("total", "clients", "providers", "verified_providers", "deactivated"):
            assert k in d["users"], f"missing users.{k}"
        # Queue block
        for k in ("pending_verifications", "open_flags", "pending_bookings"):
            assert k in d["queue"]
        # Bookings block
        for k in ("total", "this_month", "completed"):
            assert k in d["bookings"]
        # Revenue block
        for k in ("commission_this_month_dzd", "commission_total_dzd", "gmv_this_month_dzd"):
            assert k in d["revenue"]
            assert isinstance(d["revenue"][k], int)
        assert "generated_at" in d


# =========================================================================
# Admin users search + management
# =========================================================================
class TestAdminUsers:
    def test_search_users_default(self, admin_token):
        r = requests.get(f"{API}/admin/users", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_search_users_by_role(self, admin_token):
        r = requests.get(f"{API}/admin/users?role=service_provider&limit=10",
                         headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert all(u["role"] == "service_provider" for u in rows) or len(rows) == 0

    def test_search_users_by_q(self, admin_token):
        r = requests.get(f"{API}/admin/users?q=provider1", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200

    def test_admin_cannot_deactivate_self(self, admin_token, admin_id):
        r = requests.post(f"{API}/admin/users/{admin_id}/deactivate",
                          headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 400

    def test_admin_cannot_delete_self(self, admin_token, admin_id):
        r = requests.delete(f"{API}/admin/users/{admin_id}",
                            headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 400

    def test_deactivate_reactivate_flow(self, admin_token):
        # Create a throwaway client to deactivate
        tag = uuid.uuid4().hex[:8]
        reg = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_iter16_deact_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": f"Deact {tag}",
        }, timeout=10)
        assert reg.status_code == 201, reg.text
        uid = reg.json()["user"]["id"]
        try:
            r = requests.post(f"{API}/admin/users/{uid}/deactivate",
                              headers=_hdr(admin_token), timeout=10)
            assert r.status_code == 200
            doc = _db.users.find_one({"id": uid})
            assert doc.get("is_manually_deactivated") is True

            r2 = requests.post(f"{API}/admin/users/{uid}/reactivate",
                               headers=_hdr(admin_token), timeout=10)
            assert r2.status_code == 200
            doc2 = _db.users.find_one({"id": uid})
            assert doc2.get("is_manually_deactivated") is False
        finally:
            _db.users.delete_one({"id": uid})

    def test_force_verify_provider_only(self, admin_token):
        # Cannot force-verify a client
        tag = uuid.uuid4().hex[:8]
        reg = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_iter16_fv_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": f"FV {tag}",
        }, timeout=10)
        assert reg.status_code == 201
        uid = reg.json()["user"]["id"]
        try:
            r = requests.post(f"{API}/admin/users/{uid}/force-verify",
                              json={"verified": True},
                              headers=_hdr(admin_token), timeout=10)
            assert r.status_code == 400
        finally:
            _db.users.delete_one({"id": uid})

    def test_force_verify_unknown_user_404(self, admin_token):
        r = requests.post(f"{API}/admin/users/nonexistent-id-xyz/force-verify",
                          json={"verified": True},
                          headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 404

    def test_delete_soft_deletes(self, admin_token):
        tag = uuid.uuid4().hex[:8]
        reg = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_iter16_del_{tag}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": f"Del {tag}",
        }, timeout=10)
        assert reg.status_code == 201
        uid = reg.json()["user"]["id"]
        try:
            r = requests.delete(f"{API}/admin/users/{uid}",
                                headers=_hdr(admin_token), timeout=10)
            assert r.status_code == 200
            doc = _db.users.find_one({"id": uid})
            assert doc.get("is_deleted") is True
        finally:
            _db.users.delete_one({"id": uid})


# =========================================================================
# Admin bookings monitor + revenue
# =========================================================================
class TestAdminBookings:
    def test_admin_bookings_returns_list(self, admin_token):
        r = requests.get(f"{API}/admin/bookings?limit=10",
                         headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_bookings_status_filter(self, admin_token):
        r = requests.get(f"{API}/admin/bookings?status=completed&limit=5",
                         headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert all(b["status"] == "completed" for b in rows) or len(rows) == 0

    def test_admin_revenue(self, admin_token):
        r = requests.get(f"{API}/admin/revenue?months=6",
                         headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        for row in rows:
            assert "month" in row and "commission_dzd" in row \
                   and "gmv_dzd" in row and "completed_bookings" in row


# =========================================================================
# Admin broadcast — validation
# =========================================================================
class TestAdminBroadcast:
    def test_broadcast_wilaya_requires_code(self, admin_token):
        r = requests.post(f"{API}/admin/broadcast", json={
            "title": "T", "message": "M", "audience": "wilaya"
        }, headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 400
        assert "wilaya" in r.text.lower()

    def test_broadcast_all_audience_ok(self, admin_token):
        r = requests.post(f"{API}/admin/broadcast", json={
            "title": "TEST broadcast",
            "message": "This is a test.",
            "audience": "all"
        }, headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        assert "sent" in r.json() and "recipients" in r.json()


# =========================================================================
# CSV exports
# =========================================================================
class TestCSVExports:
    def test_export_users(self, admin_token):
        r = requests.get(f"{API}/admin/export/users", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("text/csv")
        assert "attachment" in r.headers.get("content-disposition", "")
        # First line = header
        assert r.text.split("\n", 1)[0].startswith("id,role,full_name")

    def test_export_providers(self, admin_token):
        r = requests.get(f"{API}/admin/export/providers", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "category" in r.text.split("\n", 1)[0]

    def test_export_bookings(self, admin_token):
        r = requests.get(f"{API}/admin/export/bookings", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_export_unknown_kind(self, admin_token):
        r = requests.get(f"{API}/admin/export/foo", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 400


# =========================================================================
# Admin categories CRUD + reorder
# =========================================================================
class TestAdminCategories:
    def test_admin_list_categories(self, admin_token):
        r = requests.get(f"{API}/admin/categories", headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_update_delete_category(self, admin_token):
        tag = uuid.uuid4().hex[:6]
        cid = f"test-{tag}"
        try:
            r = requests.post(f"{API}/admin/categories", json={
                "id": cid, "icon": "hammer",
                "name_en": "Test", "name_fr": "Test", "name_ar": "اختبار",
            }, headers=_hdr(admin_token), timeout=10)
            assert r.status_code == 201, r.text
            body = r.json()
            assert body["id"] == cid
            assert body["icon"] == "hammer"

            # Duplicate id → 409
            r2 = requests.post(f"{API}/admin/categories", json={
                "id": cid, "icon": "hammer",
                "name_en": "T", "name_fr": "T", "name_ar": "ت",
            }, headers=_hdr(admin_token), timeout=10)
            assert r2.status_code == 409

            # Update
            r3 = requests.patch(f"{API}/admin/categories/{cid}",
                                json={"name_en": "Test v2"},
                                headers=_hdr(admin_token), timeout=10)
            assert r3.status_code == 200
            assert r3.json()["name_en"] == "Test v2"

            # Delete
            r4 = requests.delete(f"{API}/admin/categories/{cid}",
                                 headers=_hdr(admin_token), timeout=10)
            assert r4.status_code == 200
        finally:
            _db.categories.delete_one({"id": cid})

    def test_delete_category_in_use_blocked(self, admin_token):
        # 'plumbing' is in use by seeded providers → must 409
        r = requests.delete(f"{API}/admin/categories/plumbing",
                            headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 409, r.text

    def test_reorder_categories(self, admin_token):
        # Get current order, reverse, apply, and verify
        r = requests.get(f"{API}/admin/categories", headers=_hdr(admin_token), timeout=10)
        cats = r.json()
        ids = [c["id"] for c in cats]
        if len(ids) < 2:
            pytest.skip("Not enough categories to reorder")
        reversed_ids = list(reversed(ids))
        r2 = requests.post(f"{API}/admin/categories/reorder",
                           json={"order": reversed_ids},
                           headers=_hdr(admin_token), timeout=10)
        assert r2.status_code == 200
        new_ids = [c["id"] for c in r2.json()]
        assert new_ids == reversed_ids
        # Restore original order
        requests.post(f"{API}/admin/categories/reorder",
                      json={"order": ids},
                      headers=_hdr(admin_token), timeout=10)


# =========================================================================
# Ads: public + admin
# =========================================================================
class TestAds:
    def test_public_ads_no_auth(self):
        r = requests.get(f"{API}/ads", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_ads_crud_full_flow(self, admin_token):
        # Create
        r = requests.post(f"{API}/admin/ads", json={
            "title": "TEST Ad",
            "subtitle": "sub",
            "image_url": "https://example.com/x.png",
            "link_url": "https://example.com/",
            "active": True,
        }, headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 201, r.text
        ad = r.json()
        ad_id = ad["id"]
        assert ad["impressions"] == 0 and ad["clicks"] == 0
        try:
            # Update
            r2 = requests.patch(f"{API}/admin/ads/{ad_id}",
                                json={"title": "TEST Ad v2"},
                                headers=_hdr(admin_token), timeout=10)
            assert r2.status_code == 200
            assert r2.json()["title"] == "TEST Ad v2"

            # Impression + click increment (no auth)
            r3 = requests.post(f"{API}/ads/{ad_id}/impression", timeout=10)
            assert r3.status_code == 204
            r4 = requests.post(f"{API}/ads/{ad_id}/click", timeout=10)
            assert r4.status_code == 204
            doc = _db.ads.find_one({"id": ad_id})
            assert doc["impressions"] >= 1 and doc["clicks"] >= 1

            # Public list shows this active ad
            r5 = requests.get(f"{API}/ads", timeout=10)
            assert any(a["id"] == ad_id for a in r5.json())

            # Deactivate → hidden from public
            requests.patch(f"{API}/admin/ads/{ad_id}",
                           json={"active": False},
                           headers=_hdr(admin_token), timeout=10)
            r6 = requests.get(f"{API}/ads", timeout=10)
            assert not any(a["id"] == ad_id for a in r6.json())
        finally:
            requests.delete(f"{API}/admin/ads/{ad_id}",
                            headers=_hdr(admin_token), timeout=10)

    def test_admin_ad_patch_unknown_404(self, admin_token):
        r = requests.patch(f"{API}/admin/ads/nonexistent-id",
                           json={"title": "X"},
                           headers=_hdr(admin_token), timeout=10)
        assert r.status_code == 404


# =========================================================================
# Marketing site — i18n.js + English default
# =========================================================================
class TestMarketingSite:
    def test_site_index_serves_html(self):
        # Marketing site is served at /api/site/ per review request
        # Try /site/ first, then /api/site/ — both patterns exist in the code.
        for path in ("/api/site/", "/api/site/index.html"):
            r = requests.get(f"{BASE_URL}{path}", timeout=10, allow_redirects=True)
            if r.status_code == 200 and "<html" in r.text.lower():
                # Check i18n.js is referenced and language selector present
                assert "i18n.js" in r.text or "site-lang-select" in r.text, \
                    f"i18n.js not found in {path}"
                return
        pytest.fail("Marketing site index not reachable at /api/site")

    def test_site_i18n_js_reachable(self):
        for path in ("/site/i18n.js", "/api/site/i18n.js"):
            r = requests.get(f"{BASE_URL}{path}", timeout=10)
            if r.status_code == 200 and "khedmapro_site_lang" in r.text:
                # Sanity: dict must have en/fr/ar keys
                assert '"en"' in r.text or "en:" in r.text
                assert "fr:" in r.text or '"fr"' in r.text
                assert "ar:" in r.text or '"ar"' in r.text
                return
        pytest.fail("i18n.js not reachable")
