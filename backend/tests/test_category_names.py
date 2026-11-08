"""P33 — category translations live in reference_data, not server.py.

The _NAMES dict that used to be inline in server.on_startup moved to
reference_data.CATEGORY_NAMES. Acceptance: the seeded category documents
are identical before and after the move.
"""
import asyncio
import os

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
# A dedicated database so this test never depending on or touches state
# shared with the rest of the suite.
DB_NAME = os.environ.get("DB_NAME", "test_database") + "_p33_categories"


def _run_startup(monkeypatch):
    async def go():
        from motor.motor_asyncio import AsyncIOMotorClient

        import server as server_mod

        client = AsyncIOMotorClient(MONGO_URL)
        monkeypatch.setattr(server_mod, "db", client[DB_NAME])

        # Startup resolves the SMS provider status via the shared import-time
        # client — patch it so this transient loop never binds that client
        # ("Event loop is closed" for later in-process tests).
        async def fake_provider_status():
            return {"provider": "mock", "healthy": True}

        monkeypatch.setattr(server_mod, "get_provider_status", fake_provider_status)
        await server_mod.on_startup()

    asyncio.run(go())


class TestCategoryNamesFromReferenceData:
    def test_seeded_categories_match_reference_translations(self, monkeypatch):
        from pymongo import MongoClient
        from reference_data import CATEGORIES, CATEGORY_NAMES

        client = MongoClient(MONGO_URL)
        client.drop_database(DB_NAME)

        _run_startup(monkeypatch)

        docs = list(client[DB_NAME].categories.find({}, {"_id": 0}))
        assert len(docs) == len(CATEGORIES)
        for doc in docs:
            names = CATEGORY_NAMES[doc["id"]]
            assert doc["name_en"] == names["en"]
            assert doc["name_fr"] == names["fr"]
            assert doc["name_ar"] == names["ar"]

    def test_startup_seeding_is_idempotent(self, monkeypatch):
        from pymongo import MongoClient
        from reference_data import CATEGORIES

        client = MongoClient(MONGO_URL)
        client.drop_database(DB_NAME)

        _run_startup(monkeypatch)
        after_first = sorted(
            (d["id"], d["name_en"], d["name_fr"], d["name_ar"], d["order"])
            for d in client[DB_NAME].categories.find({}, {"_id": 0})
        )
        _run_startup(monkeypatch)
        after_second = sorted(
            (d["id"], d["name_en"], d["name_fr"], d["name_ar"], d["order"])
            for d in client[DB_NAME].categories.find({}, {"_id": 0})
        )

        assert len(after_first) == len(CATEGORIES)
        assert after_first == after_second
