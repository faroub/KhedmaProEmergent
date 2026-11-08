"""P24 — ID documents and portfolio images live in object storage, not in
user records (N8).

- inline data-URI uploads are decoded into storage under a random,
  unguessable key; MongoDB keeps only the key + metadata
- content is gated by magic bytes (the declared type is advisory)
- verification documents are private: no key leaks into any response and
  only an admin can mint a short-lived signed URL
- the migration moves existing inline data out of user documents and the
  retention job deletes documents once their review window closes
"""
import asyncio
import base64
import os
import uuid
from datetime import datetime, timedelta, timezone

import requests
from bson import encode as bson_encode
from pymongo import MongoClient

from helpers import API, fresh_provider, make_admin

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
PNG_URI = f"data:image/png;base64,{PNG_B64}"
PNG_BYTES = base64.b64decode(PNG_B64)


def _db():
    return MongoClient(MONGO_URL)[DB_NAME]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _patch_portfolio(token, payload) -> requests.Response:
    return requests.patch(
        f"{API}/users/me/portfolio", json=payload, headers=_h(token), timeout=15
    )


class TestPortfolioStorage:
    def test_inline_image_becomes_storage_key_not_data_uri(self):
        provider = fresh_provider()
        token = provider["access_token"]
        pid = provider["user"]["id"]
        r = _patch_portfolio(token, {"portfolio_images": [PNG_URI]})
        assert r.status_code == 200, r.text
        items = r.json()["portfolio_images"]
        assert not items[0]["url"].startswith("data:"), "inline bytes must not come back"
        assert items[0]["is_cover"] is True

        # The stored user document keeps only the key — no base64 payload.
        doc = _db().users.find_one({"id": pid})
        raw = doc["portfolio_images"][0]
        assert raw.get("key", "").startswith("portfolio/")
        assert "url" not in raw
        assert "data:" not in str(doc)

    def test_public_file_is_served_without_auth(self):
        provider = fresh_provider()
        r = _patch_portfolio(provider["access_token"], {"portfolio_images": [PNG_URI]})
        assert r.status_code == 200, r.text
        url = r.json()["portfolio_images"][0]["url"]
        got = requests.get(url, timeout=15)
        assert got.status_code == 200, got.text[:200]
        assert got.content == PNG_BYTES

    def test_bad_content_is_rejected_by_magic_bytes(self):
        provider = fresh_provider()
        # Declared image/png, but the bytes are plain text — must be refused
        # even though the data-URI prefix claims an image.
        fake = "data:image/png;base64," + base64.b64encode(b"hello not an image").decode()
        r = _patch_portfolio(provider["access_token"], {"portfolio_images": [fake]})
        assert r.status_code == 400, r.text
        assert "unsupported file type" in r.json()["detail"]

    def test_external_urls_still_accepted(self):
        provider = fresh_provider()
        r = _patch_portfolio(
            provider["access_token"],
            {"portfolio_images": ["https://example.com/legacy.jpg"]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["portfolio_images"][0]["url"] == "https://example.com/legacy.jpg"

    def test_user_document_with_20_images_stays_small(self):
        provider = fresh_provider()
        pid = provider["user"]["id"]
        r = _patch_portfolio(provider["access_token"], {"portfolio_images": [PNG_URI] * 20})
        assert r.status_code == 200, r.text
        assert len(r.json()["portfolio_images"]) == 20
        doc = _db().users.find_one({"id": pid})
        assert len(bson_encode(doc)) < 16 * 1024 * 1024
        assert "data:" not in str(doc)


class TestVerificationPrivateDocs:
    def test_submit_stores_keys_and_no_key_is_exposed(self):
        provider = fresh_provider()
        token = provider["access_token"]
        pid = provider["user"]["id"]
        r = requests.post(
            f"{API}/verification/submit",
            headers=_h(token),
            json={"documents": [
                {"type": "id_recto", "url": PNG_URI, "note": "front"},
                {"type": "id_verso", "url": PNG_URI},
            ]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        for d in r.json()["verification_documents"]:
            assert "key" not in d and "url" not in d
            assert {"id", "type", "uploaded_at"} <= d.keys()

        status = requests.get(f"{API}/verification/status", headers=_h(token), timeout=15).json()
        assert len(status["documents"]) == 2
        for d in status["documents"]:
            assert "key" not in d

        raw = _db().users.find_one({"id": pid}).get("verification_documents") or []
        assert all(d["key"].startswith("verification/") for d in raw)

    def test_external_url_rejected_for_verification(self):
        provider = fresh_provider()
        r = requests.post(
            f"{API}/verification/submit",
            headers=_h(provider["access_token"]),
            json={"documents": [{"type": "id_recto", "url": "https://example.com/a.jpg"}]},
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "uploaded directly" in r.json()["detail"]

    def test_admin_signed_url_downloads_original_bytes(self):
        admin = make_admin()
        provider = fresh_provider()
        pid = provider["user"]["id"]
        r = requests.post(
            f"{API}/verification/submit",
            headers=_h(provider["access_token"]),
            json={"documents": [{"type": "id_recto", "url": PNG_URI}]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        doc_id = r.json()["verification_documents"][0]["id"]

        # The provider cannot mint a URL for their own documents.
        r = requests.get(
            f"{API}/admin/verification/{pid}/documents/{doc_id}/url",
            headers=_h(provider["access_token"]),
            timeout=15,
        )
        assert r.status_code == 403, r.text

        r = requests.get(
            f"{API}/admin/verification/{pid}/documents/{doc_id}/url",
            headers=_h(admin["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["expires_in"] > 0
        got = requests.get(body["url"], timeout=15)
        assert got.status_code == 200, got.text[:200]
        assert got.content == PNG_BYTES

        # A tampered signature must not fetch the file.
        url = body["url"]
        tampered = url[: url.rfind(".") + 1] + "0" * 64
        assert requests.get(tampered, timeout=15).status_code == 404

    def test_deleting_document_removes_the_file(self):
        provider = fresh_provider()
        token = provider["access_token"]
        pid = provider["user"]["id"]
        r = requests.post(
            f"{API}/verification/submit",
            headers=_h(token),
            json={"documents": [{"type": "id_recto", "url": PNG_URI}]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        doc_id = r.json()["verification_documents"][0]["id"]

        deleted = requests.delete(
            f"{API}/verification/documents/{doc_id}", headers=_h(token), timeout=15
        )
        assert deleted.status_code == 200, deleted.text

        # The stored object is gone: the admin can no longer mint a URL.
        admin = make_admin()
        r = requests.get(
            f"{API}/admin/verification/{pid}/documents/{doc_id}/url",
            headers=_h(admin["token"]),
            timeout=15,
        )
        assert r.status_code == 404, r.text


def _run_jobs(monkeypatch, module, **kwargs):
    async def go():
        from motor.motor_asyncio import AsyncIOMotorClient

        client = AsyncIOMotorClient(MONGO_URL)
        monkeypatch.setattr(module, "db", client[DB_NAME])
        try:
            return await module.run(**kwargs)
        finally:
            client.close()

    return asyncio.run(go())


class TestMigrationAndRetention:
    def _seed_user_with_inline_files(self) -> str:
        uid = f"p24-{uuid.uuid4().hex[:8]}"
        _db().users.insert_one({
            "id": uid,
            "role": "client",
            "email": f"{uid}@example.com",
            "full_name": "P24 Legacy",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "portfolio_images": [PNG_URI, {"url": "https://example.com/keep.jpg", "is_cover": True}],
            "verification_documents": [{"id": "d1", "type": "id_recto", "url": PNG_URI}],
        })
        return uid

    def test_migration_moves_inline_files_and_is_idempotent(self, monkeypatch):
        uid = self._seed_user_with_inline_files()
        import scripts.migrate as migrate_mod

        results = _run_jobs(monkeypatch, migrate_mod)
        counts = results["inline_files"]
        assert counts["portfolio_files"] == 1
        assert counts["verification_files"] == 1
        assert counts["users_updated"] == 1

        doc = _db().users.find_one({"id": uid})
        assert "data:" not in str(doc)
        portfolio = doc["portfolio_images"]
        assert portfolio[0].get("key", "").startswith("portfolio/")
        # External items are left untouched.
        assert portfolio[1] == {"url": "https://example.com/keep.jpg", "is_cover": True}
        assert doc["verification_documents"][0]["key"].startswith("verification/")

        # Second run finds nothing left to move.
        results2 = _run_jobs(monkeypatch, migrate_mod)
        assert results2["inline_files"]["portfolio_files"] == 0
        assert results2["inline_files"]["verification_files"] == 0

    def test_migration_dry_run_reports_without_writing(self, monkeypatch):
        uid = self._seed_user_with_inline_files()
        import scripts.migrate as migrate_mod

        results = _run_jobs(monkeypatch, migrate_mod, dry_run=True)
        assert results["inline_files"]["portfolio_files"] == 1
        assert results["inline_files"]["verification_files"] == 1
        doc = _db().users.find_one({"id": uid})
        # Nothing was written: the inline copies are still there.
        assert doc["portfolio_images"][0] == PNG_URI
        assert doc["verification_documents"][0]["url"] == PNG_URI

    def test_retention_job_deletes_reviewed_documents(self, monkeypatch):
        old_iso = (datetime.now(timezone.utc) - timedelta(days=100)).isoformat()
        fresh_iso = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        import scripts.retention_job as retention_mod
        import storage

        async def seed():
            key = await storage.put_bytes(
                PNG_BYTES, kind="verification",
                allow=("image/jpeg", "image/png", "image/webp", "application/pdf"),
                max_bytes=10_000_000,
            )
            return key

        key = asyncio.run(seed())
        uid = f"p24-{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        _db().users.insert_one({
            "id": uid,
            "role": "service_provider",
            "email": f"{uid}@example.com",
            "full_name": "P24 Retention Old",
            "created_at": now_iso,
            "verification_status": "rejected",
            "verification_reviewed_at": old_iso,
            "verification_documents": [{"id": "d1", "type": "id_recto", "key": key}],
        })
        # A pending provider and a recently-reviewed provider keep their docs.
        pending_uid = f"p24-{uuid.uuid4().hex[:8]}"
        _db().users.insert_one({
            "id": pending_uid,
            "role": "service_provider",
            "email": f"{pending_uid}@example.com",
            "full_name": "P24 Retention Pending",
            "created_at": now_iso,
            "verification_status": "pending",
            "verification_reviewed_at": None,
            "verification_documents": [{"id": "d2", "type": "id_recto", "key": "verification/x.png"}],
        })
        fresh_uid = f"p24-{uuid.uuid4().hex[:8]}"
        _db().users.insert_one({
            "id": fresh_uid,
            "role": "service_provider",
            "email": f"{fresh_uid}@example.com",
            "full_name": "P24 Retention Fresh",
            "created_at": now_iso,
            "verification_status": "verified",
            "verification_reviewed_at": fresh_iso,
            "verification_documents": [{"id": "d3", "type": "id_recto", "key": "verification/y.png"}],
        })

        counts = _run_jobs(monkeypatch, retention_mod)
        assert counts["providers"] == 1, counts
        assert counts["documents_deleted"] == 1

        assert _db().users.find_one({"id": uid})["verification_documents"] == []
        # Object deleted too.
        assert asyncio.run(storage.get_bytes(key)) is None
        # Untouched.
        assert _db().users.find_one({"id": pending_uid})["verification_documents"]
        assert _db().users.find_one({"id": fresh_uid})["verification_documents"]
