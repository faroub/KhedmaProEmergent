"""P8/P35 — dev seed gating + deterministic review counts.

Outside development the /api/seed route must require an admin token and must
never create accounts with known passwords — even when ALLOW_DEV_SEED=true is
set explicitly. P35 tightens this further: in production the route does not
exist at all (404 for admins too; scripts/seed_dev.py likewise refuses).
Repeated seeding produces identical review counts per provider
(the old hash() was salted per process).
"""
import asyncio
import os
import subprocess
import sys

import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

import routes.seed as seed_route
from config import MONGO_URL
from scripts.seed_dev import perform_seed, review_count_for

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_env = os.environ.copy()
_env.setdefault("MONGO_URL", "mongodb://localhost:27017")
_env.setdefault("DB_NAME", "test_database")
_env.setdefault("JWT_SECRET", "ci-test-secret-for-script-tests-only")


class _SeedRecorder:
    """Stands in for perform_seed so gate tests never touch the database."""

    def __init__(self):
        self.calls = []

    async def __call__(self, dev_passwords: bool):
        self.calls.append(dev_passwords)
        return {"ok": True, "dev_passwords": dev_passwords}


@pytest.fixture
def rec(monkeypatch):
    recorder = _SeedRecorder()
    monkeypatch.setattr(seed_route, "perform_seed", recorder)
    return recorder


def _set_env(monkeypatch, app_env: str, allow_dev_seed: bool):
    monkeypatch.setattr(seed_route, "APP_ENV", app_env)
    monkeypatch.setattr(seed_route, "ALLOW_DEV_SEED", allow_dev_seed)


def test_open_in_development_with_default_flag(monkeypatch, rec):
    _set_env(monkeypatch, "development", True)
    result = asyncio.run(seed_route.seed_data(admin=None))
    assert result["ok"] is True
    assert rec.calls == [True]


def test_unavailable_in_production_even_for_admin(monkeypatch, rec):
    _set_env(monkeypatch, "production", False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(seed_route.seed_data(admin=None))
    assert exc.value.status_code == 404
    # P35: even an admin token cannot reach the route in production.
    with pytest.raises(HTTPException) as exc:
        asyncio.run(seed_route.seed_data(admin={"id": "u1", "is_admin": True}))
    assert exc.value.status_code == 404
    assert rec.calls == []


def test_explicit_flag_cannot_reopen_route_in_production(monkeypatch, rec):
    _set_env(monkeypatch, "production", True)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(seed_route.seed_data(admin=None))
    assert exc.value.status_code == 404
    with pytest.raises(HTTPException) as exc:
        asyncio.run(seed_route.seed_data(admin={"id": "u1", "is_admin": True}))
    assert exc.value.status_code == 404
    assert rec.calls == []


def test_flag_off_in_development_requires_admin(monkeypatch, rec):
    _set_env(monkeypatch, "development", False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(seed_route.seed_data(admin=None))
    assert exc.value.status_code == 401
    asyncio.run(seed_route.seed_data(admin={"id": "u1", "is_admin": True}))
    assert rec.calls == [False]


def test_non_admin_is_forbidden_outside_open_dev_mode(monkeypatch, rec):
    # In production the route 404s outright; the admin check itself is only
    # reachable in non-production modes where dev seeding is disabled.
    _set_env(monkeypatch, "test", False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(seed_route.seed_data(admin={"id": "u1", "is_admin": False}))
    assert exc.value.status_code == 403


def test_script_refuses_to_run_in_production():
    env = dict(_env, APP_ENV="production")
    result = subprocess.run(
        [sys.executable, os.path.join(BACKEND_DIR, "scripts", "seed_dev.py")],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )
    assert result.returncode != 0
    assert "Refusing to seed" in result.stderr


def test_script_seeds_from_the_command_line():
    import pymongo

    db_name = "khedmapro_seed_script_test"
    sync = pymongo.MongoClient(_env["MONGO_URL"])
    sync.drop_database(db_name)
    try:
        env = dict(_env, APP_ENV="development", DB_NAME=db_name)
        result = subprocess.run(
            [sys.executable, os.path.join(BACKEND_DIR, "scripts", "seed_dev.py")],
            capture_output=True,
            text=True,
            env=env,
            timeout=120,
        )
        assert result.returncode == 0, result.stderr
        assert '"message": "Seeded"' in result.stdout
        count = sync[db_name].users.count_documents({"role": "service_provider"})
        assert count >= 13
    finally:
        sync.drop_database(db_name)
        sync.close()


def test_repeated_runs_produce_identical_review_counts():
    name = "khedmapro_seed_determinism_test"

    async def counts_by_email(db):
        providers = await db.users.find(
            {"email": {"$regex": r"^provider\d+@khedmapro\.dz$"}}, {"_id": 0}
        ).to_list(100)
        return {p["email"]: p["reviews_count"] for p in providers}

    async def scenario():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            await client.drop_database(name)
            db = client[name]

            first = await perform_seed(dev_passwords=False, db=db)
            assert first["credentials"], "one-time passwords must be returned"
            assert all(c["password"] != "password123" for c in first["credentials"])
            counts_after_first = await counts_by_email(db)
            assert set(counts_after_first) == {f"provider{i+1}@khedmapro.dz" for i in range(13)}

            # Re-run after clearing reviews: providers are skipped (emails
            # exist), and each provider must end up with exactly the same
            # review count as before.
            await db.reviews.delete_many({})
            second = await perform_seed(dev_passwords=False, db=db)
            assert second["message"] == "Seeded"
            return counts_after_first, await counts_by_email(db)
        finally:
            await client.drop_database(name)
            client.close()

    counts_after_first, counts_after_second = asyncio.run(scenario())
    assert counts_after_second == counts_after_first


def test_review_count_for_is_deterministic():
    sample = [str(i * 12345) for i in range(20)]
    counts = [review_count_for(pid) for pid in sample]
    assert all(4 <= c <= 8 for c in counts)
    assert counts == [review_count_for(pid) for pid in sample]
