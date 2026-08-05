"""Platform settings — a single mutable document that overlays env defaults.

`get_effective_settings()` is the single read entry-point used by:
- subscription.py  → subscription_price_dzd, trial_days, payments_enabled
- webhooks.py       → chargily_mode + chargily_secret_key_override + chargily_webhook_secret_override

DB layer:
  db.platform_settings.findOne({id: "global"}) — may be missing on fresh installs.

Env fallbacks come from `config.py`. If a DB override is empty/null the env
value wins. This keeps the "real" secret key primarily in .env for security,
while still allowing the admin UI to override for emergencies / dev.
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import (
    CHARGILY_SECRET_KEY as ENV_CHARGILY_SECRET_KEY,
    CHARGILY_WEBHOOK_SECRET as ENV_CHARGILY_WEBHOOK_SECRET,
    CHARGILY_MODE as ENV_CHARGILY_MODE,
    SUBSCRIPTION_FEE_DZD as ENV_SUBSCRIPTION_FEE_DZD,
    TRIAL_MONTHS as ENV_TRIAL_MONTHS,
)
from database import db
from deps import current_user, require_admin

router = APIRouter(tags=["admin-settings"])

# Effective-settings cache is intentionally NOT memoized — settings are read
# at most once per request and Motor caches connection pooling. Simpler.


def _base_url_for(mode: str) -> str:
    return "https://pay.chargily.net/api/v2" if mode == "live" else "https://pay.chargily.net/test/api/v2"


async def get_effective_settings() -> dict:
    """Merged env + DB settings. Always returns a full payload with sensible
    defaults so callers never have to guess."""
    doc = await db.platform_settings.find_one({"id": "global"}, {"_id": 0}) or {}

    mode = (doc.get("chargily_mode") or ENV_CHARGILY_MODE or "test").lower()
    secret_override = (doc.get("chargily_secret_key_override") or "").strip()
    webhook_override = (doc.get("chargily_webhook_secret_override") or "").strip()

    effective_secret = secret_override or ENV_CHARGILY_SECRET_KEY
    effective_webhook = webhook_override or ENV_CHARGILY_WEBHOOK_SECRET or effective_secret

    # SMS subsystem status (imported lazily to avoid a circular import).
    from sms import get_provider_status  # noqa: WPS433
    sms_status = await get_provider_status()
    sms_doc = doc.get("sms") or {}

    # Social media handles (all optional). Empty strings mean "hide".
    social_doc = doc.get("social") or {}

    # Marketing website content (editable from admin — hero + contact for now).
    site_doc = doc.get("site") or {}

    return {
        "subscription_price_dzd": int(doc.get("subscription_price_dzd") or ENV_SUBSCRIPTION_FEE_DZD),
        "trial_days": int(doc.get("trial_days") or (ENV_TRIAL_MONTHS * 30)),
        "payments_enabled": bool(doc.get("payments_enabled", True)),
        "chargily_mode": mode,
        "chargily_base_url": _base_url_for(mode),
        "chargily_secret_key_source": "db" if secret_override else ("env" if ENV_CHARGILY_SECRET_KEY else "none"),
        "chargily_webhook_secret_source": "db" if webhook_override else ("env" if ENV_CHARGILY_WEBHOOK_SECRET else "none"),
        # Never return the raw secret; only return a masked hint.
        "chargily_secret_key_masked": _mask(effective_secret),
        "_secret_key": effective_secret,          # used internally by webhooks / checkout
        "_webhook_secret": effective_webhook,     # ditto
        # SMS block — safe subset only; auth tokens are NEVER returned.
        "sms": {
            **sms_status,
            "message_template": sms_doc.get("message_template") or "",
            # Twilio public fields
            "twilio_from": sms_doc.get("twilio_from") or "",
            "twilio_account_sid_masked": _mask(sms_doc.get("twilio_account_sid") or ""),
            # HTTP public fields
            "http_url": sms_doc.get("http_url") or "",
            "http_method": sms_doc.get("http_method") or "POST",
            "http_body_template": sms_doc.get("http_body_template") or "",
            "http_content_type": sms_doc.get("http_content_type") or "application/json",
            # Header keys only (values redacted so we don't leak API keys).
            "http_header_keys": list((sms_doc.get("http_headers") or {}).keys()),
        },
        "social": {
            "facebook_url": social_doc.get("facebook_url") or "",
            "instagram_url": social_doc.get("instagram_url") or "",
            "tiktok_url": social_doc.get("tiktok_url") or "",
        },
        "site": {
            # Hero block per language
            "hero_title_en": site_doc.get("hero_title_en") or "",
            "hero_title_fr": site_doc.get("hero_title_fr") or "",
            "hero_title_ar": site_doc.get("hero_title_ar") or "",
            "hero_sub_en": site_doc.get("hero_sub_en") or "",
            "hero_sub_fr": site_doc.get("hero_sub_fr") or "",
            "hero_sub_ar": site_doc.get("hero_sub_ar") or "",
            # Contact info
            "contact_email": site_doc.get("contact_email") or "",
            "contact_phone": site_doc.get("contact_phone") or "",
            "contact_whatsapp": site_doc.get("contact_whatsapp") or "",
            # Section-visibility toggles (default: everything visible).
            "show_features": bool(site_doc.get("show_features", True)),
            "show_stats": bool(site_doc.get("show_stats", True)),
            "show_testimonials": bool(site_doc.get("show_testimonials", True)),
            "show_final_cta": bool(site_doc.get("show_final_cta", True)),
            # Overridable content
            "features": site_doc.get("features") or [],
            "testimonials": site_doc.get("testimonials") or [],
            # Footer tagline overrides
            "footer_tagline_en": site_doc.get("footer_tagline_en") or "",
            "footer_tagline_fr": site_doc.get("footer_tagline_fr") or "",
            "footer_tagline_ar": site_doc.get("footer_tagline_ar") or "",
            # Advertise CTA overrides
            "advertise_h2_en": site_doc.get("advertise_h2_en") or "",
            "advertise_h2_fr": site_doc.get("advertise_h2_fr") or "",
            "advertise_h2_ar": site_doc.get("advertise_h2_ar") or "",
            "advertise_body_en": site_doc.get("advertise_body_en") or "",
            "advertise_body_fr": site_doc.get("advertise_body_fr") or "",
            "advertise_body_ar": site_doc.get("advertise_body_ar") or "",
        },
    }


def _mask(v: str) -> str:
    if not v:
        return ""
    if len(v) <= 12:
        return "•" * len(v)
    return f"{v[:8]}•••{v[-4:]}"


# ---------- Public admin surface ----------
class SmsConfigPatch(BaseModel):
    provider: Optional[str] = Field(default=None, pattern="^(mock|twilio|http)$")
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_from: Optional[str] = None
    http_url: Optional[str] = None
    http_method: Optional[str] = Field(default=None, pattern="^(GET|POST|PUT)$")
    http_headers: Optional[dict] = None
    http_body_template: Optional[str] = None
    http_content_type: Optional[str] = None
    message_template: Optional[str] = None


class SocialConfigPatch(BaseModel):
    facebook_url: Optional[str] = None
    instagram_url: Optional[str] = None
    tiktok_url: Optional[str] = None


class SiteConfigPatch(BaseModel):
    hero_title_en: Optional[str] = None
    hero_title_fr: Optional[str] = None
    hero_title_ar: Optional[str] = None
    hero_sub_en: Optional[str] = None
    hero_sub_fr: Optional[str] = None
    hero_sub_ar: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_whatsapp: Optional[str] = None
    # Section-visibility toggles (default True everywhere).
    show_features: Optional[bool] = None
    show_stats: Optional[bool] = None
    show_testimonials: Optional[bool] = None
    show_final_cta: Optional[bool] = None
    # Feature blurbs — array of up to 6 { title_en/fr/ar, desc_en/fr/ar }.
    # Overrides the built-in 6 feature cards in `home.f1..f6` translations.
    features: Optional[list] = None
    # Testimonials — array of { name, role, quote_en/fr/ar, avatar_url? }.
    testimonials: Optional[list] = None
    # Footer tagline (per lang)
    footer_tagline_en: Optional[str] = None
    footer_tagline_fr: Optional[str] = None
    footer_tagline_ar: Optional[str] = None
    # "Advertise with us" CTA block on contact.html (per lang)
    advertise_h2_en: Optional[str] = None
    advertise_h2_fr: Optional[str] = None
    advertise_h2_ar: Optional[str] = None
    advertise_body_en: Optional[str] = None
    advertise_body_fr: Optional[str] = None
    advertise_body_ar: Optional[str] = None


class SettingsPatch(BaseModel):
    subscription_price_dzd: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    trial_days: Optional[int] = Field(default=None, ge=0, le=365)
    payments_enabled: Optional[bool] = None
    chargily_mode: Optional[str] = Field(default=None, pattern="^(test|live)$")
    chargily_secret_key_override: Optional[str] = None      # empty string clears
    chargily_webhook_secret_override: Optional[str] = None  # empty string clears
    sms: Optional[SmsConfigPatch] = None
    social: Optional[SocialConfigPatch] = None
    site: Optional[SiteConfigPatch] = None


# --------- Public (unauthenticated) settings endpoint ---------
@router.get("/public/settings")
async def public_settings():
    """Returns only the client-safe subset — social handles + site content.
    Consumed by the mobile app footer + the marketing site HTML."""
    eff = await get_effective_settings()
    return {
        "social": eff.get("social") or {},
        "site": eff.get("site") or {},
    }


@router.get("/admin/settings")
async def admin_get_settings(user: Annotated[dict, Depends(current_user)]):
    """Return effective settings + source annotations (env vs db)."""
    require_admin(user)
    eff = await get_effective_settings()
    # Never leak the raw secrets to the client.
    eff.pop("_secret_key", None)
    eff.pop("_webhook_secret", None)
    return eff


@router.patch("/admin/settings")
async def admin_update_settings(
    body: SettingsPatch,
    user: Annotated[dict, Depends(current_user)],
):
    """Update platform settings. An explicit empty string clears an override
    (falls back to env). Secret-key overrides trigger an audit log entry."""
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()

    updates: dict = {"updated_at": now_iso, "updated_by": user["id"]}
    audit_changes: list[str] = []

    if body.subscription_price_dzd is not None:
        updates["subscription_price_dzd"] = body.subscription_price_dzd
        audit_changes.append(f"price={body.subscription_price_dzd}")
    if body.trial_days is not None:
        updates["trial_days"] = body.trial_days
        audit_changes.append(f"trial_days={body.trial_days}")
    if body.payments_enabled is not None:
        updates["payments_enabled"] = body.payments_enabled
        audit_changes.append(f"payments_enabled={body.payments_enabled}")
    if body.chargily_mode is not None:
        updates["chargily_mode"] = body.chargily_mode
        audit_changes.append(f"mode={body.chargily_mode}")
    if body.chargily_secret_key_override is not None:
        updates["chargily_secret_key_override"] = body.chargily_secret_key_override.strip()
        audit_changes.append("secret_key_override_changed")
    if body.chargily_webhook_secret_override is not None:
        updates["chargily_webhook_secret_override"] = body.chargily_webhook_secret_override.strip()
        audit_changes.append("webhook_secret_override_changed")

    if body.sms is not None:
        # Merge SMS block over the existing one so callers can PATCH one key.
        existing = (await db.platform_settings.find_one({"id": "global"}, {"_id": 0}) or {}).get("sms") or {}
        merged = dict(existing)
        patch_data = body.sms.model_dump(exclude_none=True)
        for k, v in patch_data.items():
            # Empty string ⇒ clear the key. `None` was already excluded above.
            if isinstance(v, str) and v == "":
                merged.pop(k, None)
            else:
                merged[k] = v
        updates["sms"] = merged
        audit_changes.append(f"sms_provider={merged.get('provider') or 'mock'}")

    if body.social is not None:
        existing = (await db.platform_settings.find_one({"id": "global"}, {"_id": 0}) or {}).get("social") or {}
        merged_social = dict(existing)
        for k, v in body.social.model_dump(exclude_none=True).items():
            if isinstance(v, str) and v.strip() == "":
                merged_social.pop(k, None)
            else:
                merged_social[k] = v.strip() if isinstance(v, str) else v
        updates["social"] = merged_social
        audit_changes.append("social_links_updated")

    if body.site is not None:
        existing = (await db.platform_settings.find_one({"id": "global"}, {"_id": 0}) or {}).get("site") or {}
        merged_site = dict(existing)
        for k, v in body.site.model_dump(exclude_none=True).items():
            # Empty string clears; empty list keeps as empty list (means "no items").
            if isinstance(v, str) and v == "":
                merged_site.pop(k, None)
            else:
                merged_site[k] = v
        updates["site"] = merged_site
        audit_changes.append("site_content_updated")

    if not audit_changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db.platform_settings.update_one(
        {"id": "global"},
        {"$set": {"id": "global", **updates}},
        upsert=True,
    )
    # Best-effort audit trail (never blocks response).
    try:
        await db.platform_settings_audit.insert_one({
            "at": now_iso,
            "actor_id": user["id"],
            "changes": audit_changes,
        })
    except Exception:
        pass
    return await get_effective_settings() | {"_secret_key": None, "_webhook_secret": None}


@router.get("/admin/settings/chargily-health")
async def admin_chargily_health(user: Annotated[dict, Depends(current_user)]):
    """Try a lightweight GET against Chargily using the effective secret key.
    Returns which key was tried (env vs db) so the admin knows what's live."""
    require_admin(user)
    eff = await get_effective_settings()
    key = eff.pop("_secret_key", "")
    eff.pop("_webhook_secret", None)

    if not key:
        return {**eff, "healthy": False, "detail": "No secret key configured"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{eff['chargily_base_url']}/balance",
                headers={"Authorization": f"Bearer {key}"},
            )
        if resp.status_code == 200:
            return {**eff, "healthy": True, "detail": "Connected", "http_status": 200}
        if resp.status_code == 401:
            return {**eff, "healthy": False, "detail": "Invalid or expired key", "http_status": 401}
        return {
            **eff,
            "healthy": False,
            "detail": f"Chargily returned {resp.status_code}",
            "http_status": resp.status_code,
        }
    except httpx.HTTPError as e:
        return {**eff, "healthy": False, "detail": f"Network error: {e.__class__.__name__}"}



class SmsTestIn(BaseModel):
    phone: str


@router.post("/admin/settings/sms/test")
async def admin_test_sms(
    body: SmsTestIn,
    user: Annotated[dict, Depends(current_user)],
):
    """Fire a real test SMS via the CURRENTLY effective SMS provider.
    Payload: `{ phone: "+2135XXXXXXXX" }`."""
    require_admin(user)
    # Lazy import to avoid a circular reference with `phone.py` / `sms.py`.
    from phone import normalize_dz_phone  # noqa: WPS433
    from sms import send_test_sms  # noqa: WPS433

    try:
        phone = normalize_dz_phone(body.phone)
    except HTTPException:
        return {"ok": False, "error": "Invalid Algerian phone number"}
    result = await send_test_sms(phone)
    return result
