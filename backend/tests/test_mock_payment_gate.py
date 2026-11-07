"""P9 — mock payments are opt-in and dev-only.

ALLOW_MOCK_PAYMENTS defaults to false and is honored only when APP_ENV is
development or test AND the variable is explicitly "true". Without it,
POST /api/subscription/pay returns 503 (Chargily unset) instead of silently
granting a subscription.
"""
import asyncio
import os
import subprocess
import sys

import pytest
from fastapi import HTTPException

from helpers import fresh_provider

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_env = os.environ.copy()
_env.setdefault("MONGO_URL", "mongodb://localhost:27017")
_env.setdefault("DB_NAME", "test_database")
_env.setdefault("JWT_SECRET", "ci-test-secret-for-script-tests-only")


def _config_flag(**extra) -> bool:
    """Import config in a fresh process with the given env overrides and
    report the resulting ALLOW_MOCK_PAYMENTS value."""
    env = {k: v for k, v in _env.items() if k not in ("ALLOW_MOCK_PAYMENTS", "APP_ENV")}
    env.update(extra)
    result = subprocess.run(
        [sys.executable, "-c", "import config; print(config.ALLOW_MOCK_PAYMENTS)"],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
        cwd=BACKEND_DIR,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip() == "True"


def test_defaults_off_in_development():
    assert _config_flag(APP_ENV="development") is False


def test_defaults_off_in_test():
    assert _config_flag(APP_ENV="test") is False


def test_explicit_true_enables_mock_in_development():
    assert _config_flag(APP_ENV="development", ALLOW_MOCK_PAYMENTS="true") is True


def test_explicit_true_is_refused_in_production():
    assert _config_flag(APP_ENV="production", ALLOW_MOCK_PAYMENTS="true") is False


def _call_pay(monkeypatch, user: dict, allow_mock: bool):
    import routes.webhooks as webhooks
    from routes.subscription import pay_subscription

    async def _no_chargily():
        return False

    monkeypatch.setattr(webhooks, "ALLOW_MOCK_PAYMENTS", allow_mock)
    monkeypatch.setattr(webhooks, "is_chargily_enabled", _no_chargily)
    # payments_enabled must stay on so 503 comes only from the mock gate
    monkeypatch.setattr(
        "routes.subscription.get_effective_settings",
        _effective_settings_with_payments,
    )
    return asyncio.run(pay_subscription(user))


async def _effective_settings_with_payments():
    return {"payments_enabled": True, "subscription_price_dzd": 1000}


def test_pay_returns_503_when_mock_disabled_and_no_chargily(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        _call_pay(monkeypatch, {"id": "no-such-user"}, allow_mock=False)
    assert exc.value.status_code == 503
    assert "not configured" in exc.value.detail


def test_pay_returns_mock_receipt_when_enabled(monkeypatch):
    provider = fresh_provider()
    result = _call_pay(monkeypatch, provider["user"], allow_mock=True)
    assert result["provider"] == "mock"
    assert result["success"] is True
    assert result["amount_dzd"] >= 0
