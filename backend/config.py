"""Environment variables and app-wide constants."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", 1440))

# Business rules for the DZ marketplace.
TRIAL_MONTHS = 3
DEACTIVATION_MONTHS = 12
SUBSCRIPTION_FEE_DZD = 1000

# Payload guardrails
MAX_IMAGE_BYTES = 900_000  # ~900 KB per base64 image string

# Chargily Pay (all optional — MOCK fallback used when unset)
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
ALLOW_MOCK_PAYMENTS = os.environ.get("ALLOW_MOCK_PAYMENTS", "true").lower() == "true"

# Flagging thresholds
FLAG_CONSECUTIVE_NO_COMPLETE = 3
FLAG_CONFIRMED_WINDOW_DAYS = 14
FLAG_MIN_COMPLETION_RATE = 0.60
FLAG_RATE_WINDOW = 10  # last-N bookings for rate check
