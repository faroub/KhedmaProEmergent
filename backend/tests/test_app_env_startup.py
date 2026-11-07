"""Unit tests for APP_ENV + production startup validation (P5).

`config.production_config_problems()` reports every condition that makes the
app unsafe to serve; `server._validate_startup_config()` turns that list into
a hard refusal when APP_ENV=production and into warnings otherwise. Defaults
are deliberately untouched by P5 — these tests pin the *reporting* of each
condition and the production/development split, not new defaults.
"""
import asyncio

import pytest

import config
import server

GOOD_SECRET = "production-jwt-secret-at-least-32-chars-long"


def _clean_config(monkeypatch):
    """Set every validated knob to a production-safe value."""
    monkeypatch.setattr(config, "JWT_SECRET", GOOD_SECRET)
    monkeypatch.setattr(config, "ALLOW_MOCK_PAYMENTS", False)
    monkeypatch.setattr(config, "ALLOW_DEV_SEED", False)
    monkeypatch.setattr(config, "SMS_PROVIDER", "twilio")
    monkeypatch.setattr(config, "EMERGENT_PUSH_KEY", "emergent-relay-key")


def _fake_status(provider: str):
    async def fake_get_provider_status():
        return {"provider": provider}

    return fake_get_provider_status


class TestProductionConfigProblems:
    def test_clean_config_reports_no_problems(self, monkeypatch):
        _clean_config(monkeypatch)
        assert config.production_config_problems() == []

    def test_short_jwt_secret(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "JWT_SECRET", "x" * 31)
        problems = config.production_config_problems()
        assert len(problems) == 1 and "32 characters" in problems[0]

    def test_placeholder_jwt_secret_change_me(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "JWT_SECRET", "change-me")
        problems = config.production_config_problems()
        assert len(problems) == 1 and "placeholder" in problems[0]

    def test_placeholder_jwt_secret_local_dev_prefix(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "JWT_SECRET", "local-dev-very-long-secret-value")
        problems = config.production_config_problems()
        assert len(problems) == 1 and "placeholder" in problems[0]

    def test_mock_payments_allowed(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "ALLOW_MOCK_PAYMENTS", True)
        problems = config.production_config_problems()
        assert len(problems) == 1 and "ALLOW_MOCK_PAYMENTS" in problems[0]

    def test_dev_seed_allowed(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "ALLOW_DEV_SEED", True)
        problems = config.production_config_problems()
        assert len(problems) == 1 and "ALLOW_DEV_SEED" in problems[0]

    def test_sms_provider_mock(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "SMS_PROVIDER", "mock")
        problems = config.production_config_problems()
        assert len(problems) == 1 and "'mock' or unset" in problems[0]

    def test_sms_provider_effective_override(self, monkeypatch):
        """A real provider passed explicitly wins even if the env var is mock
        (admin DB settings override the env — see sms._resolve_config)."""
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "SMS_PROVIDER", "mock")
        assert config.production_config_problems(sms_provider="twilio") == []
        assert config.production_config_problems(sms_provider="mock")

    def test_push_key_placeholder(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "EMERGENT_PUSH_KEY", "placeholder")
        problems = config.production_config_problems()
        assert len(problems) == 1 and "EMERGENT_PUSH_KEY" in problems[0]


class TestStartupEnforcement:
    def _check(self, monkeypatch, app_env: str):
        monkeypatch.setattr(server, "get_provider_status", _fake_status("twilio"))
        monkeypatch.setattr(config, "APP_ENV", app_env)
        asyncio.run(server._validate_startup_config())

    def test_production_refuses_unsafe_config(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "JWT_SECRET", "short")
        monkeypatch.setattr(server, "get_provider_status", _fake_status("twilio"))
        monkeypatch.setattr(config, "APP_ENV", "production")
        with pytest.raises(RuntimeError, match="Unsafe production configuration"):
            asyncio.run(server._validate_startup_config())

    def test_production_refuses_mock_sms_provider(self, monkeypatch):
        _clean_config(monkeypatch)
        monkeypatch.setattr(server, "get_provider_status", _fake_status("mock"))
        monkeypatch.setattr(config, "APP_ENV", "production")
        with pytest.raises(RuntimeError, match="SMS provider"):
            asyncio.run(server._validate_startup_config())

    def test_production_accepts_clean_config(self, monkeypatch):
        _clean_config(monkeypatch)
        self._check(monkeypatch, "production")

    def test_development_warns_but_starts(self, monkeypatch):
        """Every unsafe condition at once — development logs and still starts."""
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "JWT_SECRET", "short")
        monkeypatch.setattr(config, "ALLOW_MOCK_PAYMENTS", True)
        monkeypatch.setattr(config, "ALLOW_DEV_SEED", True)
        monkeypatch.setattr(config, "SMS_PROVIDER", "mock")
        monkeypatch.setattr(config, "EMERGENT_PUSH_KEY", "placeholder")
        self._check(monkeypatch, "development")

    def test_test_env_warns_but_starts(self, monkeypatch):
        """APP_ENV=test behaves like development for startup validation."""
        _clean_config(monkeypatch)
        monkeypatch.setattr(config, "JWT_SECRET", "short")
        self._check(monkeypatch, "test")
