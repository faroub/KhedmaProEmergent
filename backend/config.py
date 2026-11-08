"""Environment variables and app-wide constants."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", 720))

# Deployment environment: development (default) | test | production.
# Production fails closed at startup when the config is unsafe (see
# `production_config_problems`); development/test only log warnings.
# An invalid value fails loudly at import time rather than silently acting
# permissive when the operator mistypes "production".
APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
if APP_ENV not in ("development", "test", "production"):
    raise ValueError(
        f"APP_ENV must be one of development|test|production, got {APP_ENV!r}"
    )

# Fallback SMS provider (admin DB settings override this; see sms.py). "mock"
# only logs codes — development-only; refused at startup in production.
SMS_PROVIDER = (os.environ.get("SMS_PROVIDER") or "mock").strip().lower()

# Emergent push-relay key (routes/push.py reads this). Unset → "placeholder";
# production refuses to start with it (P5) and logs an error (P26).
EMERGENT_PUSH_KEY = (os.environ.get("EMERGENT_PUSH_KEY") or "placeholder").strip()

# Business rules for the DZ marketplace.
TRIAL_MONTHS = 3
DEACTIVATION_MONTHS = 12
SUBSCRIPTION_FEE_DZD = 1000

# Payload guardrails
MAX_IMAGE_BYTES = 900_000  # ~900 KB per base64 image string

# Chargily Pay (all optional). When it is not configured, /subscription/pay
# falls back to a MOCK receipt — that fallback is dev-only: it is enabled only
# when APP_ENV is development/test AND the variable is explicitly "true".
# Otherwise unconfigured payments fail closed with 503 instead of silently
# granting subscriptions.
CHARGILY_SECRET_KEY = os.environ.get("CHARGILY_SECRET_KEY", "").strip()
CHARGILY_WEBHOOK_SECRET = (os.environ.get("CHARGILY_WEBHOOK_SECRET") or CHARGILY_SECRET_KEY).strip()
CHARGILY_MODE = os.environ.get("CHARGILY_MODE", "test").strip().lower()
CHARGILY_BASE_URL = (
    "https://pay.chargily.net/api/v2"
    if CHARGILY_MODE == "live"
    else "https://pay.chargily.net/test/api/v2"
)
API_PUBLIC_URL = os.environ.get("API_PUBLIC_URL", "http://localhost:8001").rstrip("/")
APP_RETURN_URL = os.environ.get("APP_RETURN_URL", "khedmapro://payment-return")
ALLOW_MOCK_PAYMENTS = (
    os.environ.get("ALLOW_MOCK_PAYMENTS", "false").lower() == "true"
    and APP_ENV in ("development", "test")
)

# CORS: comma-separated list of browser origins allowed to call the API with
# credentials. The marketing site is served by this backend (same origin), so
# the defaults only cover the Expo web preview.("*" + credentials is invalid
# per the CORS spec — enumerate explicitly.)
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:8081,http://localhost:8001").split(",")
    if o.strip()
]

# Dev-only helpers. /api/seed is unauthenticated + writes test data with known
# passwords, so it must stay off in production. The flag therefore defaults to
# true only in development/test; outside development the route requires an
# admin token regardless (and generates passwords instead of using the known
# one). scripts/seed_dev.py refuses to run in production outright.
ALLOW_DEV_SEED = os.environ.get(
    "ALLOW_DEV_SEED", "true" if APP_ENV in ("development", "test") else "false"
).lower() == "true"

# Rate limits (max actions per window; windows are set at the call sites).
# Env-overridable so CI / load tests can raise them without touching code.
RATE_LIMIT_LOGIN_IP = int(os.environ.get("RATE_LIMIT_LOGIN_IP", "60"))
RATE_LIMIT_OTP_IP = int(os.environ.get("RATE_LIMIT_OTP_IP", "60"))
RATE_LIMIT_GUEST_BOOKING_IP = int(os.environ.get("RATE_LIMIT_GUEST_BOOKING_IP", "20"))
RATE_LIMIT_MESSAGE_USER = int(os.environ.get("RATE_LIMIT_MESSAGE_USER", "60"))
RATE_LIMIT_PUSH_USER = int(os.environ.get("RATE_LIMIT_PUSH_USER", "30"))
RATE_LIMIT_REPORT_USER = int(os.environ.get("RATE_LIMIT_REPORT_USER", "10"))

# Reports: one report per (reporter, provider) per window, backed by a unique
# index on (reporter_id, provider_id, window) — see scripts/migrate.py.
REPORT_WINDOW_DAYS = int(os.environ.get("REPORT_WINDOW_DAYS", "30"))
# A report from this many distinct reporters within the window is marked
# auto_flagged for admin review. Account action still stays with the admin.
REPORTS_AUTO_FLAG_THRESHOLD = int(os.environ.get("REPORTS_AUTO_FLAG_THRESHOLD", "3"))

# Flagging thresholds
FLAG_CONSECUTIVE_NO_COMPLETE = 3
FLAG_CONFIRMED_WINDOW_DAYS = 14
FLAG_MIN_COMPLETION_RATE = 0.60
FLAG_RATE_WINDOW = 10  # last-N bookings for rate check


def production_config_problems(sms_provider: str | None = None) -> list[str]:
    """Configuration conditions that make serving traffic unsafe.

    Called once at startup (server.py): in `production` any returned problem is
    fatal (the process refuses to boot); in development/test each is logged as
    a warning. `sms_provider` is the *effective* SMS provider (DB settings
    override the env var) when the caller knows it; without it, the env-level
    `SMS_PROVIDER` is checked. This only reports — defaults are unchanged.
    """
    problems: list[str] = []
    # Placeholder check first: a placeholder is also short, but the actionable
    # message is "you left the default secret in place".
    if JWT_SECRET == "change-me" or JWT_SECRET.startswith("local-dev"):
        problems.append("JWT_SECRET matches a known placeholder value")
    elif len(JWT_SECRET) < 32:
        problems.append("JWT_SECRET is shorter than 32 characters")
    if ALLOW_MOCK_PAYMENTS:
        problems.append("ALLOW_MOCK_PAYMENTS is enabled (mock payments are dev-only)")
    if ALLOW_DEV_SEED:
        problems.append("ALLOW_DEV_SEED is enabled (dev seed route is dev-only)")
    provider = (sms_provider if sms_provider is not None else SMS_PROVIDER).lower()
    if provider == "mock":
        problems.append("SMS provider is 'mock' or unset (codes are logged, never sent)")
    if EMERGENT_PUSH_KEY == "placeholder":
        problems.append("EMERGENT_PUSH_KEY is unset or 'placeholder'")
    return problems
