"""P10 — SMS delivery fails loudly.

The mock provider is refused in production (an OTP code must never reach a
production log), and a failed delivery surfaces to the user as 503 with a
generic message — provider details stay in the server log.
"""
import asyncio

import pytest
from fastapi import HTTPException

import phone
import sms


def _cfg(**overrides) -> dict:
    base = {
        "provider": "mock",
        "message_template": sms.DEFAULT_MESSAGE_TEMPLATE,
        "twilio_account_sid": "",
        "twilio_auth_token": "",
        "twilio_from": "",
        "http_url": "",
        "http_method": "POST",
        "http_headers": {},
        "http_body_template": "",
        "http_content_type": "application/json",
    }
    base.update(overrides)
    return base


@pytest.fixture
def fixed_config(monkeypatch):
    """Freeze the SMS config so tests never touch platform_settings."""

    def install(**overrides):
        config = _cfg(**overrides)

        async def _resolve():
            return config

        monkeypatch.setattr(sms, "_resolve_config", _resolve)

    return install


def test_mock_succeeds_in_development(monkeypatch, fixed_config):
    monkeypatch.setattr(sms, "APP_ENV", "development")
    fixed_config(provider="mock")
    result = asyncio.run(sms.send_sms_otp("+213600000000", "123456"))
    assert result["ok"] is True
    assert result["provider"] == "mock"


def test_mock_is_refused_in_production(monkeypatch, fixed_config):
    monkeypatch.setattr(sms, "APP_ENV", "production")
    fixed_config(provider="mock")
    result = asyncio.run(sms.send_sms_otp("+213600000000", "123456"))
    assert result["ok"] is False
    assert "not allowed" in result["error"]


def test_mock_is_allowed_in_test(monkeypatch, fixed_config):
    monkeypatch.setattr(sms, "APP_ENV", "test")
    fixed_config(provider="mock")
    result = asyncio.run(sms.send_sms_otp("+213600000000", "123456"))
    assert result["ok"] is True


def test_http_provider_failure_reports_not_ok(monkeypatch, fixed_config):
    monkeypatch.setattr(sms, "APP_ENV", "development")
    fixed_config(provider="http")  # no http_url -> SMSSendError
    result = asyncio.run(sms.send_sms_otp("+213600000000", "123456"))
    assert result["ok"] is False
    assert result["provider"] == "http"


def test_twilio_without_credentials_reports_not_ok(monkeypatch, fixed_config):
    monkeypatch.setattr(sms, "APP_ENV", "production")
    fixed_config(provider="twilio")  # missing SID / token / from-number
    result = asyncio.run(sms.send_sms_otp("+213600000000", "123456"))
    assert result["ok"] is False
    assert result["provider"] == "twilio"


def test_send_otp_code_raises_503_with_generic_message(monkeypatch):
    async def _failing(phone_e164, code):
        return {
            "ok": False,
            "provider": "http",
            "error": "http: gateway returned 500: internal-secret-dump",
        }

    monkeypatch.setattr(phone, "send_sms_otp", _failing)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(phone.send_otp_code("+213600000000", "123456"))
    assert exc.value.status_code == 503
    # The message is generic; provider details must not leak.
    assert "internal-secret-dump" not in exc.value.detail
    assert "try again" in exc.value.detail


def test_send_otp_code_is_silent_on_success(monkeypatch):
    async def _ok(phone_e164, code):
        return {"ok": True, "provider": "mock", "sid": None}

    monkeypatch.setattr(phone, "send_sms_otp", _ok)
    assert asyncio.run(phone.send_otp_code("+213600000000", "123456")) is None


def test_http_provider_network_timeout_reports_not_ok(monkeypatch, fixed_config):
    import httpx
    monkeypatch.setattr(sms, "APP_ENV", "development")
    fixed_config(provider="http", http_url="http://example.com/sms", http_body_template='{"phone":"{phone}","msg":"{message}"}')

    class TimeoutClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def request(self, *args, **kwargs):
            raise httpx.ReadTimeout("Request timed out")

    monkeypatch.setattr(httpx, "AsyncClient", TimeoutClient)
    result = asyncio.run(sms.send_sms_otp("+213600000000", "123456"))
    assert result["ok"] is False
    assert result["provider"] == "http"
    assert "ReadTimeout" in result["error"]


def test_request_otp_delivery_failure_cleans_up_challenge(monkeypatch):
    import routes.otp as otp_mod

    deleted_challenges = []
    unsets = []

    async def _failing_send(phone, code):
        raise HTTPException(status_code=503, detail="SMS delivery failed")

    class FakeChallenges:
        async def delete_many(self, query): pass
        async def replace_one(self, query, doc, upsert=True): pass
        async def delete_one(self, query):
            deleted_challenges.append(query)

    class FakeRateLimits:
        async def find_one(self, query): return None
        async def update_one(self, query, update, upsert=True):
            if "$unset" in update:
                unsets.append((query, update["$unset"]))

    class FakeRateLimitsColl:
        async def find_one_and_update(self, *args, **kwargs):
            return {"count": 1}

    class FakeDB:
        otp_challenges = FakeChallenges()
        otp_rate_limits = FakeRateLimits()
        rate_limits = FakeRateLimitsColl()

    fake_db = FakeDB()
    monkeypatch.setattr(otp_mod, "db", fake_db)
    import database as db_mod
    import ratelimit as rl_mod
    monkeypatch.setattr(db_mod, "db", fake_db)
    monkeypatch.setattr(rl_mod, "db", fake_db)
    monkeypatch.setattr(otp_mod, "send_otp_code", _failing_send)

    class MockRequest:
        client = None

    class Body:
        phone = "0555123456"

    with pytest.raises(HTTPException) as exc:
        asyncio.run(otp_mod.request_otp(Body(), MockRequest()))
    assert exc.value.status_code == 503
    assert len(deleted_challenges) == 1
    assert len(unsets) == 1
