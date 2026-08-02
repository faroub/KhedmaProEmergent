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
