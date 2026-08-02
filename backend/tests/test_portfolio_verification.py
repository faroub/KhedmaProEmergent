"""
Iteration 8 backend tests — three new feature groups:
  A) Rich Portfolios (PATCH /api/users/me/portfolio) with objects + legacy strings,
     cover-flag rules, and 900 KB size cap.
  B) Provider Verification flow (submit / list docs / delete / admin approve+reject).
  C) Admin seed integrity (admin@khedmapro.dz login + is_admin flag on /auth/me).

The suite runs against EXPO_PUBLIC_BACKEND_URL and cleans up all mutations at end
via a session-scoped Motor cleanup fixture so future test runs stay deterministic.
"""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

PROVIDER_EMAIL = "provider1@khedmapro.dz"
PROVIDER_PW = "password123"
ADMIN_EMAIL = "admin@khedmapro.dz"
ADMIN_PW = "admin123"


# ------------------------------- fixtures -------------------------------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def provider_token(s):
    return _login(s, PROVIDER_EMAIL, PROVIDER_PW)


@pytest.fixture(scope="session")
def admin_token(s):
    return _login(s, ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="session")
def provider_id(s, provider_token):
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {provider_token}"})
    assert r.status_code == 200
    return r.json()["id"]


# --------------------------- cleanup at teardown ---------------------------
@pytest.fixture(scope="session", autouse=True)
def _cleanup_db(provider_id):
    """
    Session teardown: reset provider1 portfolio & verification state so re-runs
    are deterministic.
    """
    yield
    async def _run():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.users.update_one(
            {"id": provider_id},
            {"$set": {
                "portfolio_images": [],
                "verification_documents": [],
                "verification_status": "unverified",
                "verification_reject_reason": None,
                "verification_submitted_at": None,
                "verification_reviewed_at": None,
                "verification_reviewer_id": None,
                "is_verified": False,
            }},
        )
        client.close()
    asyncio.run(_run())


# ============================================================
# Group C — Admin seed
# ============================================================
class TestAdminSeed:
    def test_admin_login_ok(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body

    def test_admin_me_is_admin(self, s, admin_token):
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        me = r.json()
        assert me.get("is_admin") is True, f"expected is_admin true, got {me}"

    def test_provider_me_not_admin(self, s, provider_token):
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {provider_token}"})
        assert r.status_code == 200
        assert bool(r.json().get("is_admin")) is False


# ============================================================
# Group A — Rich Portfolios
# ============================================================
class TestPortfolio:
    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_patch_objects_first_auto_cover(self, s, provider_token, provider_id):
        payload = {"portfolio_images": [
            {"url": "https://example.com/a.jpg", "caption": "Living room", "tags": ["residential", "interior"]},
            {"url": "https://example.com/b.jpg", "caption": None, "tags": []},
        ]}
        r = s.patch(f"{API}/users/me/portfolio", headers=self._headers(provider_token), json=payload)
        assert r.status_code == 200, r.text
        items = r.json()["portfolio_images"]
        assert len(items) == 2
        # First should be auto-cover; second should not.
        assert items[0]["is_cover"] is True
        assert items[1]["is_cover"] is False
        assert items[0]["caption"] == "Living room"
        assert items[0]["tags"] == ["residential", "interior"]

    def test_patch_explicit_cover_flag_only_first_wins(self, s, provider_token, provider_id):
        payload = {"portfolio_images": [
            {"url": "https://example.com/a.jpg", "is_cover": False},
            {"url": "https://example.com/b.jpg", "is_cover": True},
            {"url": "https://example.com/c.jpg", "is_cover": True},  # should be cleared
        ]}
        r = s.patch(f"{API}/users/me/portfolio", headers=self._headers(provider_token), json=payload)
        assert r.status_code == 200, r.text
        items = r.json()["portfolio_images"]
        covers = [i for i, it in enumerate(items) if it["is_cover"]]
        assert covers == [1], f"only index 1 should stay cover; got {covers}"

    def test_patch_legacy_strings_normalized(self, s, provider_token, provider_id):
        payload = {"portfolio_images": [
            "https://example.com/legacy1.jpg",
            "https://example.com/legacy2.jpg",
        ]}
        r = s.patch(f"{API}/users/me/portfolio", headers=self._headers(provider_token), json=payload)
        assert r.status_code == 200, r.text
        items = r.json()["portfolio_images"]
        assert items[0] == {"url": "https://example.com/legacy1.jpg",
                            "caption": None, "tags": [], "is_cover": True}
        assert items[1]["is_cover"] is False
        assert items[1]["caption"] is None
        assert items[1]["tags"] == []

    def test_serialize_user_returns_rich_shape(self, s, provider_token, provider_id):
        # /auth/me should surface the rich shape
        r = s.get(f"{API}/auth/me", headers=self._headers(provider_token))
        assert r.status_code == 200
        items = r.json().get("portfolio_images", [])
        assert isinstance(items, list) and len(items) >= 1
        for it in items:
            assert set(it.keys()) >= {"url", "caption", "tags", "is_cover"}

    def test_public_provider_returns_rich_shape(self, s, provider_id):
        r = s.get(f"{API}/providers/{provider_id}")
        assert r.status_code == 200, r.text
        prov = r.json()
        items = prov.get("portfolio_images", [])
        assert isinstance(items, list)
        for it in items:
            assert set(it.keys()) >= {"url", "caption", "tags", "is_cover"}
        # email/phone must NOT be exposed on public endpoint
        assert "email" not in prov
        assert "phone" not in prov

    def test_413_on_oversized_url(self, s, provider_token):
        big = "data:image/jpeg;base64," + ("A" * 900_050)
        r = s.patch(
            f"{API}/users/me/portfolio",
            headers=self._headers(provider_token),
            json={"portfolio_images": [{"url": big}]},
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code} {r.text[:200]}"


# ============================================================
# Group B — Provider Verification
# ============================================================
class TestVerification:
    def _h(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_status_initial(self, s, provider_token):
        # Reset via cleanup at end; but for isolation, submit & check.
        r = s.get(f"{API}/verification/status", headers=self._h(provider_token))
        assert r.status_code == 200
        body = r.json()
        assert set(body.keys()) >= {"status", "documents", "reject_reason", "submitted_at", "reviewed_at"}

    def test_submit_creates_pending(self, s, provider_token):
        docs = [
            {"type": "id_recto", "url": "https://example.com/id_recto.jpg", "note": "front"},
            {"type": "id_verso", "url": "https://example.com/id_verso.jpg"},
            {"type": "certification", "url": "https://example.com/cert.pdf"},
        ]
        r = s.post(f"{API}/verification/submit", headers=self._h(provider_token), json={"documents": docs})
        assert r.status_code == 200, r.text
        me = r.json()
        assert me["verification_status"] == "pending"
        # Private endpoint should include full documents payload
        vd = me.get("verification_documents") or []
        assert len(vd) == 3
        assert {d["type"] for d in vd} == {"id_recto", "id_verso", "certification"}
        for d in vd:
            assert "id" in d  # server-assigned uuid

    def test_status_reflects_submission(self, s, provider_token):
        r = s.get(f"{API}/verification/status", headers=self._h(provider_token))
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "pending"
        assert body["submitted_at"] is not None
        assert len(body["documents"]) == 3

    def test_delete_document(self, s, provider_token):
        st = s.get(f"{API}/verification/status", headers=self._h(provider_token)).json()
        # remove the certification doc
        target = next(d for d in st["documents"] if d["type"] == "certification")
        r = s.delete(f"{API}/verification/documents/{target['id']}", headers=self._h(provider_token))
        assert r.status_code == 200, r.text
        remaining = {d["type"] for d in r.json()["documents"]}
        assert "certification" not in remaining
        assert remaining == {"id_recto", "id_verso"}

    def test_413_on_oversized_doc(self, s, provider_token):
        big = "data:image/jpeg;base64," + ("A" * 900_050)
        payload = {"documents": [{"type": "id_recto", "url": big}]}
        r = s.post(f"{API}/verification/submit", headers=self._h(provider_token), json=payload)
        assert r.status_code == 413, f"expected 413, got {r.status_code}"

    def test_admin_pending_forbidden_for_non_admin(self, s, provider_token):
        r = s.get(f"{API}/admin/verification/pending", headers=self._h(provider_token))
        assert r.status_code == 403

    def test_admin_pending_lists_provider(self, s, admin_token, provider_id):
        r = s.get(f"{API}/admin/verification/pending", headers=self._h(admin_token))
        assert r.status_code == 200, r.text
        ids = {p["id"] for p in r.json()}
        assert provider_id in ids, f"provider1 should be in pending queue, got {ids}"

    def test_admin_get_provider_detail(self, s, admin_token, provider_id):
        r = s.get(f"{API}/admin/verification/{provider_id}", headers=self._h(admin_token))
        assert r.status_code == 200
        assert r.json()["id"] == provider_id

    def test_admin_get_provider_forbidden_for_non_admin(self, s, provider_token, provider_id):
        r = s.get(f"{API}/admin/verification/{provider_id}", headers=self._h(provider_token))
        assert r.status_code == 403

    def test_admin_reject_sets_reason(self, s, admin_token, provider_token, provider_id):
        r = s.post(
            f"{API}/admin/verification/{provider_id}/reject",
            headers=self._h(admin_token),
            json={"reason": "TEST_ documents unreadable"},
        )
        assert r.status_code == 200, r.text
        # Verify via provider status endpoint
        st = s.get(f"{API}/verification/status", headers=self._h(provider_token)).json()
        assert st["status"] == "rejected"
        assert st["reject_reason"] == "TEST_ documents unreadable"

    def test_admin_approve_sets_verified(self, s, admin_token, provider_id, provider_token):
        # Re-submit to move back to pending → approve
        docs = [
            {"type": "id_recto", "url": "https://example.com/id_recto.jpg"},
            {"type": "id_verso", "url": "https://example.com/id_verso.jpg"},
        ]
        r = s.post(f"{API}/verification/submit", headers=self._h(provider_token), json={"documents": docs})
        assert r.status_code == 200

        r = s.post(f"{API}/admin/verification/{provider_id}/approve", headers=self._h(admin_token))
        assert r.status_code == 200, r.text

        # Public endpoint should now flag is_verified true
        pub = s.get(f"{API}/providers/{provider_id}").json()
        assert pub["is_verified"] is True
        assert pub["verification_status"] == "verified"
