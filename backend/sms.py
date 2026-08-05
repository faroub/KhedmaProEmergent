"""Pluggable SMS delivery layer.

Providers implemented:
- `mock`   : Logs the code to the server console. Default when nothing configured.
- `twilio` : Uses Twilio Programmable SMS via the official Python SDK.
- `http`   : Generic HTTP POST — good for local Algerian SMS gateways. The admin
             configures a URL + JSON body template with `{phone}` and `{message}`
             placeholders and optional headers (for API-key auth).

Provider selection + credentials live in the platform_settings document and are
read via `get_effective_settings()` in `routes/settings.py`. Env variables are
used as fallbacks so a fresh install with just a .env still works.

Public entry-point: `await send_sms_otp(phone_e164, code)`.
It NEVER raises externally — a delivery failure is logged and the caller can
decide to retry or surface a soft error. The OTP is already stored/hashed on
our side, so a delivery failure doesn't compromise the challenge.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# Env fallbacks. Admin DB overrides always win when present.
ENV_SMS_PROVIDER = (os.getenv("SMS_PROVIDER") or "mock").lower()
ENV_TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
ENV_TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
ENV_TWILIO_FROM = os.getenv("TWILIO_FROM_NUMBER", "")

DEFAULT_MESSAGE_TEMPLATE = "khedmaPro: your verification code is {code}. Valid 5 minutes."


class SMSSendError(Exception):
    """Raised by providers on unrecoverable failure. Not surfaced to the caller."""


def _mask(v: str) -> str:
    if not v:
        return ""
    if len(v) <= 8:
        return "•" * len(v)
    return f"{v[:4]}•••{v[-3:]}"


async def _resolve_config() -> dict[str, Any]:
    """Merge env + DB settings for SMS config only. Imported lazily to avoid
    a circular import with `routes/settings.py`."""
    # Late import to avoid circular
    from database import db  # noqa: WPS433

    doc = await db.platform_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    sms = doc.get("sms") or {}

    return {
        "provider": (sms.get("provider") or ENV_SMS_PROVIDER or "mock").lower(),
        "twilio_account_sid": sms.get("twilio_account_sid") or ENV_TWILIO_ACCOUNT_SID,
        "twilio_auth_token": sms.get("twilio_auth_token") or ENV_TWILIO_AUTH_TOKEN,
        "twilio_from": sms.get("twilio_from") or ENV_TWILIO_FROM,
        # Generic HTTP provider (for local gateways)
        "http_url": sms.get("http_url") or "",
        "http_method": (sms.get("http_method") or "POST").upper(),
        "http_headers": sms.get("http_headers") or {},
        "http_body_template": sms.get("http_body_template") or "",
        "http_content_type": sms.get("http_content_type") or "application/json",
        # Message template. {code} and {phone} are the supported placeholders.
        "message_template": sms.get("message_template") or DEFAULT_MESSAGE_TEMPLATE,
    }


def build_message(code: str, phone: str, template: Optional[str] = None) -> str:
    tmpl = template or DEFAULT_MESSAGE_TEMPLATE
    try:
        return tmpl.format(code=code, phone=phone)
    except (KeyError, IndexError):
        return DEFAULT_MESSAGE_TEMPLATE.format(code=code, phone=phone)


# ------------------------------------------------------------------ providers


def _send_mock(phone: str, message: str) -> dict:
    """Dev-only: prints the code to the server log."""
    logger.warning("[MOCK SMS] to=%s msg=%r", phone, message)
    return {"ok": True, "provider": "mock", "sid": None}


def _send_twilio(cfg: dict, phone: str, message: str) -> dict:
    """Send via Twilio Programmable SMS. Sync SDK call executed via `to_thread`
    by the caller (see `send_sms_otp`). Raises `SMSSendError` on failure."""
    sid = cfg.get("twilio_account_sid")
    token = cfg.get("twilio_auth_token")
    from_number = cfg.get("twilio_from")
    if not (sid and token and from_number):
        raise SMSSendError("Twilio not fully configured (missing SID / token / from-number)")
    try:
        # Lazy import so environments without Twilio installed still work.
        from twilio.rest import Client  # type: ignore

        client = Client(sid, token)
        msg = client.messages.create(to=phone, from_=from_number, body=message)
        return {"ok": True, "provider": "twilio", "sid": msg.sid, "status": msg.status}
    except Exception as e:
        raise SMSSendError(f"twilio: {e.__class__.__name__}: {e}") from e


async def _send_http(cfg: dict, phone: str, message: str) -> dict:
    """Generic HTTP POST for local Algerian SMS gateways.

    Body template is a raw string with `{phone}` and `{message}` placeholders.
    If content-type is `application/json`, the template must be valid JSON.
    """
    url = cfg.get("http_url")
    if not url:
        raise SMSSendError("HTTP SMS provider not configured (missing URL)")
    method = cfg.get("http_method", "POST")
    ctype = cfg.get("http_content_type", "application/json")
    template = cfg.get("http_body_template") or ""
    if not template:
        raise SMSSendError("HTTP SMS provider missing body template")
    # Substitute placeholders. We escape phone/message for JSON when the content
    # type is JSON so newlines/quotes in the message won't break the payload.
    safe_phone = phone
    safe_msg = message
    if ctype.startswith("application/json"):
        # json.dumps returns a quoted string — strip the surrounding quotes so
        # the operator can wrap the placeholder in quotes in their template
        # exactly like a normal JSON value.
        safe_msg = json.dumps(message)[1:-1]
        safe_phone = json.dumps(phone)[1:-1]
    try:
        body = template.replace("{phone}", safe_phone).replace("{message}", safe_msg)
    except Exception as e:
        raise SMSSendError(f"http: template substitution failed: {e}") from e
    headers = dict(cfg.get("http_headers") or {})
    headers.setdefault("Content-Type", ctype)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(method, url, content=body, headers=headers)
        if resp.status_code >= 400:
            raise SMSSendError(f"http: gateway returned {resp.status_code}: {resp.text[:200]}")
        return {"ok": True, "provider": "http", "http_status": resp.status_code}
    except httpx.HTTPError as e:
        raise SMSSendError(f"http: network error: {e.__class__.__name__}") from e


# ------------------------------------------------------------------ public API


async def send_sms_otp(phone_e164: str, code: str) -> dict:
    """Dispatch based on effective provider setting. Never raises externally —
    always returns a dict with `ok` and either `sid`/`http_status` or `error`.
    Detailed error is logged on the server."""
    cfg = await _resolve_config()
    provider = cfg["provider"]
    message = build_message(code, phone_e164, cfg.get("message_template"))
    logger.info("sms.send provider=%s to=%s twilio_sid=%s", provider, phone_e164, _mask(cfg.get("twilio_account_sid", "")))

    try:
        if provider == "mock":
            return _send_mock(phone_e164, message)
        if provider == "twilio":
            # Twilio SDK is sync; run in a thread so we don't block the event loop.
            import anyio  # bundled with FastAPI/Starlette

            return await anyio.to_thread.run_sync(_send_twilio, cfg, phone_e164, message)
        if provider == "http":
            return await _send_http(cfg, phone_e164, message)
        logger.error("sms.send: unknown provider=%s (falling back to mock)", provider)
        return _send_mock(phone_e164, message)
    except SMSSendError as e:
        logger.error("sms.send.failed provider=%s to=%s err=%s", provider, phone_e164, e)
        return {"ok": False, "provider": provider, "error": str(e)}


async def send_test_sms(phone_e164: str) -> dict:
    """Admin-only test: sends a fixed test payload using the CURRENT settings.
    Returns raw provider response so the admin can debug."""
    return await send_sms_otp(phone_e164, "000000")


# ------------------------------------------------------------------ status


async def get_provider_status() -> dict:
    """Report the currently effective SMS provider + a shallow health check."""
    cfg = await _resolve_config()
    provider = cfg["provider"]
    if provider == "mock":
        return {"provider": "mock", "healthy": True, "detail": "Dev mock — codes are logged only"}
    if provider == "twilio":
        ok = bool(cfg.get("twilio_account_sid") and cfg.get("twilio_auth_token") and cfg.get("twilio_from"))
        return {
            "provider": "twilio",
            "healthy": ok,
            "detail": "Configured" if ok else "Missing SID / token / from-number",
            "twilio_account_sid_masked": _mask(cfg.get("twilio_account_sid", "")),
            "twilio_from": cfg.get("twilio_from"),
        }
    if provider == "http":
        ok = bool(cfg.get("http_url") and cfg.get("http_body_template"))
        return {
            "provider": "http",
            "healthy": ok,
            "detail": "Configured" if ok else "Missing URL / body template",
            "http_url": cfg.get("http_url"),
        }
    return {"provider": provider, "healthy": False, "detail": "Unknown provider"}
