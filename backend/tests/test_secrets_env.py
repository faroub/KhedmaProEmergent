"""P25 — secrets are environment-only, never stored in the database (H8).

- Chargily key/webhook overrides, the Twilio auth token and SMS gateway
  headers can no longer be written through PATCH /admin/settings
- GET /admin/settings never returns secret values (masked hints only), even
  when plaintext copies exist in the database
- sms._resolve_config reads credentials from the environment (SMS_HTTP_HEADERS
  as JSON); leftover DB fields are ignored
- the migrate.py strip_platform_secrets migration deletes leftover plaintext
  fields (idempotent; --dry-run reports counts)
"""
import asyncio
import os

import requests
from pymongo import MongoClient

from helpers import API, make_admin

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

PLAINTEXT = "sk_live_p25_plains text secret value"


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_platform_secrets() -> None:
    MongoClient(MONGO_URL)[DB_NAME].platform_settings.update_one(
        {"id": "global"},
        {
            "$set": {
                "id": "global",
                "chargily_secret_key_override": PLAINTEXT,
                "chargily_webhook_secret_override": PLAINTEXT,
                "sms": {
                    "provider": "twilio",
                    "twilio_account_sid": "AC-p25-sid",
                    "twilio_auth_token": PLAINTEXT,
                    "http_headers": {"Authorization": PLAINTEXT},
                },
            }
        },
        upsert=True,
    )


def _platform_doc() -> dict:
    return MongoClient(MONGO_URL)[DB_NAME].platform_settings.find_one(
        {"id": "global"}, {"_id": 0}
    ) or {}


class TestAdminSettingsSecrets:
    def test_db_plaintext_never_reaches_the_response(self):
        _seed_platform_secrets()
        admin = make_admin()
        r = requests.get(f"{API}/admin/settings", headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.text
        assert PLAINTEXT not in body
        settings = r.json()
        assert settings["chargily_secret_key_source"] != "db"
        assert settings["chargily_webhook_secret_source"] != "db"
        # The masked SID comes from the resolved provider status (env or DB
        # value, masked) — it is the intended admin hint, not a leak.
        sms = settings["sms"]
        assert PLAINTEXT not in str(sms)
        assert PLAINTEXT not in r.text
        assert "http_header_keys" not in sms

    def test_secret_override_fields_are_rejected_by_patch(self):
        # Clean baseline: no settings document at all.
        MongoClient(MONGO_URL)[DB_NAME].platform_settings.delete_many({"id": "global"})
        admin = make_admin()
        r = requests.patch(
            f"{API}/admin/settings",
            headers=_h(admin["token"]),
            json={
                "chargily_secret_key_override": PLAINTEXT,
                "chargily_webhook_secret_override": PLAINTEXT,
                "sms": {"twilio_auth_token": PLAINTEXT, "http_headers": {"X-Api-Key": PLAINTEXT}},
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # The unknown/removed fields are ignored: none of the secrets land in
        # the stored document or the response.
        assert PLAINTEXT not in r.text
        doc = _platform_doc()
        assert not doc.get("chargily_secret_key_override")
        assert not doc.get("chargily_webhook_secret_override")
        assert not (doc.get("sms") or {}).get("twilio_auth_token")
        assert not (doc.get("sms") or {}).get("http_headers")

    def test_non_secret_sms_config_still_patchable(self):
        admin = make_admin()
        r = requests.patch(
            f"{API}/admin/settings",
            headers=_h(admin["token"]),
            json={"sms": {"provider": "http", "http_url": "https://sms.example.com/send"}},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        sms = _platform_doc().get("sms") or {}
        assert sms.get("provider") == "http"
        assert sms.get("http_url") == "https://sms.example.com/send"
        assert "twilio_auth_token" not in sms
        assert "http_headers" not in sms


class TestSmsResolveConfigEnvOnly:
    def test_credentials_come_from_env_not_db(self, monkeypatch):
        _seed_platform_secrets()
        import sms

        monkeypatch.setattr(sms, "ENV_TWILIO_AUTH_TOKEN", "env-token-p25")
        monkeypatch.setattr(sms, "ENV_SMS_HTTP_HEADERS", '{"Authorization": "Bearer env-header"}')

        async def go():
            from motor.motor_asyncio import AsyncIOMotorClient

            client = AsyncIOMotorClient(MONGO_URL)
            monkeypatch.setattr("database.db", client[DB_NAME])
            try:
                return await sms._resolve_config()
            finally:
                client.close()

        cfg = asyncio.run(go())
        # DB plaintext ignored, env value honoured.
        assert cfg["twilio_auth_token"] == "env-token-p25"
        assert cfg["http_headers"] == {"Authorization": "Bearer env-header"}
        # Non-secret DB config still wins over (empty) env defaults.
        assert cfg["twilio_account_sid"] == "AC-p25-sid"
        assert cfg["provider"] == "twilio"

    def test_malformed_headers_env_is_ignored(self, monkeypatch):
        import sms

        monkeypatch.setattr(sms, "ENV_SMS_HTTP_HEADERS", "{not json")

        async def go():
            from motor.motor_asyncio import AsyncIOMotorClient

            client = AsyncIOMotorClient(MONGO_URL)
            monkeypatch.setattr("database.db", client[DB_NAME])
            try:
                return await sms._resolve_config()
            finally:
                client.close()

        cfg = asyncio.run(go())
        assert cfg["http_headers"] == {}


def _run_migrations(monkeypatch, dry_run=False) -> dict:
    async def go():
        from motor.motor_asyncio import AsyncIOMotorClient

        import scripts.migrate as migrate_mod

        client = AsyncIOMotorClient(MONGO_URL)
        monkeypatch.setattr(migrate_mod, "db", client[DB_NAME])
        return await migrate_mod.run(dry_run=dry_run)

    return asyncio.run(go())


class TestStripSecretsMigration:
    def test_dry_run_counts_without_writing(self, monkeypatch):
        _seed_platform_secrets()
        results = _run_migrations(monkeypatch, dry_run=True)
        assert results["strip_platform_secrets"]["secret_fields_found"] == 4
        doc = _platform_doc()
        assert doc.get("chargily_secret_key_override") == PLAINTEXT
        assert (doc.get("sms") or {}).get("twilio_auth_token") == PLAINTEXT

    def test_migration_strips_fields_and_is_idempotent(self, monkeypatch):
        _seed_platform_secrets()
        results = _run_migrations(monkeypatch)
        counts = results["strip_platform_secrets"]
        assert counts["modified"] >= 1
        doc = _platform_doc()
        assert not doc.get("chargily_secret_key_override")
        assert not doc.get("chargily_webhook_secret_override")
        sms = doc.get("sms") or {}
        assert not sms.get("twilio_auth_token")
        assert not sms.get("http_headers")
        # Non-secret SMS config survives.
        assert sms.get("twilio_account_sid") == "AC-p25-sid"

        # Second run: nothing left to strip.
        results2 = _run_migrations(monkeypatch)
        assert results2["strip_platform_secrets"]["modified"] == 0
