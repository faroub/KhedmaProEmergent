"""P18 — migrations run once per deploy, not once per worker (H10).

- server startup no longer performs the location backfill or the category
  rename (they were per-worker writes racing on every boot)
- scripts/migrate.py owns them: idempotent, logged, --dry-run capable
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _insert_setup():
    """A provider missing location coords and a legacy-category user."""
    coll = MongoClient(MONGO_URL)[DB_NAME]
    provider_id = f"p18-{uuid.uuid4().hex[:8]}"
    legacy_id = f"p18-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    for uid, name in ((provider_id, "P18 Provider"), (legacy_id, "P18 Legacy")):
        coll.users.insert_one({
            "id": uid,
            "role": "service_provider",
            "wilaya_code": "16",
            "full_name": name,
            "email": f"{uid}@example.com",  # the email index is unique
            "created_at": now_iso,
        })
    coll.users.update_one({"id": legacy_id}, {"$set": {"category": "admin_education"}})
    return provider_id, legacy_id


class TestStartupPerformsNoMigrationWrites:
    def test_on_startup_leaves_migrations_alone(self, monkeypatch):
        pid, lid = _insert_setup()
        coll = MongoClient(MONGO_URL)[DB_NAME]

        async def go():
            from motor.motor_asyncio import AsyncIOMotorClient

            import server as server_mod

            client = AsyncIOMotorClient(MONGO_URL)
            monkeypatch.setattr(server_mod, "db", client[DB_NAME])

            # Startup also resolves the SMS provider status, which reads the
            # shared import-time client — patch it so this transient loop
            # never binds that client ("Event loop is closed" for later
            # in-process tests).
            async def fake_provider_status():
                return {"provider": "mock", "healthy": True}

            monkeypatch.setattr(server_mod, "get_provider_status", fake_provider_status)
            await server_mod.on_startup()

        asyncio.run(go())

        prov = coll.users.find_one({"id": pid})
        assert prov.get("location_lat") is None
        assert "location_source" not in prov
        legacy = coll.users.find_one({"id": lid})
        assert legacy.get("category") == "admin_education"


def _run_migrations(monkeypatch, dry_run=False) -> dict:
    async def go():
        from motor.motor_asyncio import AsyncIOMotorClient

        import scripts.migrate as migrate_mod

        client = AsyncIOMotorClient(MONGO_URL)
        monkeypatch.setattr(migrate_mod, "db", client[DB_NAME])
        return await migrate_mod.run(dry_run=dry_run)

    return asyncio.run(go())


class TestMigrations:
    def test_migrate_applies_and_is_idempotent(self, monkeypatch):
        pid, lid = _insert_setup()
        coll = MongoClient(MONGO_URL)[DB_NAME]

        results = _run_migrations(monkeypatch)
        assert results["location_backfill"]["updated"] >= 1
        assert results["category_rename"]["modified"] >= 1

        prov = coll.users.find_one({"id": pid})
        assert prov.get("location_lat") is not None
        assert prov.get("location_lng") is not None
        assert prov.get("location_source") == "wilaya_centroid"
        legacy = coll.users.find_one({"id": lid})
        assert legacy.get("category") == "admin_consulting"

        # P23: the report-window unique index exists (partial on `window`).
        idx = coll.reports.index_information().get("unique_report_window_index")
        assert idx is not None and idx["unique"] is True

        # Second run changes nothing.
        results2 = _run_migrations(monkeypatch)
        assert results2["location_backfill"]["updated"] == 0
        assert results2["category_rename"]["matched"] == 0

    def test_dry_run_writes_nothing(self, monkeypatch):
        pid, lid = _insert_setup()
        coll = MongoClient(MONGO_URL)[DB_NAME]

        results = _run_migrations(monkeypatch, dry_run=True)
        assert results["location_backfill"]["updated"] >= 1
        assert results["category_rename"]["matched"] >= 1

        prov = coll.users.find_one({"id": pid})
        assert prov.get("location_lat") is None
        legacy = coll.users.find_one({"id": lid})
        assert legacy.get("category") == "admin_education"


class TestWilayaBackfillMigration:
    """P35 — the wilaya backfill lives in scripts/migrate.py. It was an admin
    endpoint (/api/admin/backfill/wilaya) before dev-only routes were pulled
    out of the production surface."""

    def _insert_provider_without_wilaya(self) -> str:
        import uuid

        coll = MongoClient(MONGO_URL)[DB_NAME]
        uid = f"p35-{uuid.uuid4().hex[:8]}"
        coll.users.insert_one({
            "id": uid,
            "role": "service_provider",
            "full_name": "P35 Legacy Provider",
            "email": f"{uid}@example.com",  # the email index is unique
            "category": "plumbing",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return uid

    def test_wilaya_backfill_assigns_default_and_is_idempotent(self, monkeypatch):
        uid = self._insert_provider_without_wilaya()
        coll = MongoClient(MONGO_URL)[DB_NAME]

        results = _run_migrations(monkeypatch)
        assert results["wilaya_backfill"]["updated"] >= 1
        doc = coll.users.find_one({"id": uid})
        assert doc["wilaya_code"] == "16"
        assert doc.get("wilaya_backfilled_at")

        # Second run finds nothing left to fix.
        results2 = _run_migrations(monkeypatch)
        assert results2["wilaya_backfill"]["updated"] == 0

    def test_wilaya_backfill_dry_run_writes_nothing(self, monkeypatch):
        uid = self._insert_provider_without_wilaya()
        coll = MongoClient(MONGO_URL)[DB_NAME]

        results = _run_migrations(monkeypatch, dry_run=True)
        assert results["wilaya_backfill"]["would_update"] >= 1
        doc = coll.users.find_one({"id": uid})
        assert doc.get("wilaya_code") is None
        assert "wilaya_backfilled_at" not in doc
