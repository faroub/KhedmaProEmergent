"""khedmaPro FastAPI entry point.

This file used to be a 1650-line monolith. It's now a thin composition root:
- Wires the aggregated `/api` router (built in `routes/__init__.py`).
- Registers the WebSocket chat handler on the app directly (WS routes cannot
  live inside a mounted APIRouter with a prefix).
- Adds CORS.
- Runs startup/shutdown hooks (indexes, one-shot migration).

Feature code has moved to focused modules:
- `config.py`         — env vars + business constants
- `database.py`       — Motor/Mongo client (`db`)
- `schemas.py`        — every Pydantic model + enums
- `reference_data.py` — CATEGORIES, WILAYAS, DEFAULT_HOURS
- `security.py`       — bcrypt + JWT helpers
- `subscription.py`   — subscription math + `serialize_user`
- `deps.py`           — FastAPI auth dependencies (current_user, admin gate…)
- `phone.py`          — DZ phone normalization + mock OTP sender
- `ws_manager.py`     — WebSocket registry (in-process, optional Redis fan-out)
- `routes/*.py`       — one file per feature area
"""
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from database import client, db
from routes import build_api_router
from routes.messages import ws_chat
from security import verify_password
from ws_manager import ws_manager

from config import CORS_ORIGINS
from sms import get_provider_status


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _validate_startup_config() -> None:
    """Fail closed in production, warn in development/test (P5).

    Production must not serve with a weak/placeholder JWT secret, mock
    payments, the dev seed route, the mock SMS provider, or a placeholder
    push key. Outside production the same conditions only produce warnings
    so local development keeps working with the defaults.
    """
    import config

    problems = config.production_config_problems(
        sms_provider=(await get_provider_status()).get("provider", "")
    )
    if config.APP_ENV == "production" and problems:
        for p in problems:
            logger.error("Refusing to start: %s", p)
        raise RuntimeError(
            "Unsafe production configuration (set APP_ENV=development to "
            "override): " + "; ".join(problems)
        )
    for p in problems:
        logger.warning("Development-mode config issue (APP_ENV=%s): %s", config.APP_ENV, p)


async def on_startup():
    """Validate startup config, create indexes, migrate data."""
    await _validate_startup_config()
    # Attach the Redis fan-out bus when REDIS_URL is set; no-op otherwise.
    await ws_manager.start()
    # Push relay: refuse the placeholder loudly in every environment (P26) —
    # production already fails to start via _validate_startup_config (P5);
    # elsewhere this is the first thing to check when pushes don't arrive.
    import config as _config

    if _config.EMERGENT_PUSH_KEY == "placeholder":
        logger.error(
            "EMERGENT_PUSH_KEY is unset or 'placeholder' — push notifications "
            "will fail (register-push returns 500 and no delivery leaves the app)"
        )
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    await db.users.create_index("category")
    await db.bookings.create_index("client_id")
    await db.bookings.create_index("provider_id")
    await db.reviews.create_index("provider_id")
    await db.messages.create_index("thread_id")
    await db.messages.create_index([("thread_id", 1), ("created_at", 1)])
    await db.schedules.create_index("provider_id", unique=True)
    await db.users.create_index("phone_e164", unique=True, sparse=True)
    await db.otp_challenges.create_index("phone_e164", unique=True)
    await db.otp_challenges.create_index("expires_at", expireAfterSeconds=0)
    await db.users.create_index("wilaya_code")
    await db.reports.create_index("provider_id")
    # TTL index: expired rate-limit buckets delete themselves.
    await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    # TTL index: consumed phone-verification jtis expire after the token's own
    # lifetime (15 min) plus grace — single-use tokens (P14) self-clean.
    await db.used_phone_tokens.create_index("created_at", expireAfterSeconds=1200)
    await db.users.create_index("verification_status")
    await db.users.create_index([("location_lat", 1), ("location_lng", 1)])
    await db.categories.create_index("id", unique=True)
    await db.categories.create_index("order")
    await db.ads.create_index("order")
    await db.ads.create_index("active")

    # Seed the categories collection from the static list on first boot.
    # Idempotent: only inserts categories whose id isn't already in the DB.
    try:
        from reference_data import CATEGORIES, CATEGORY_NAMES

        now_iso = datetime.now(timezone.utc).isoformat()
        for idx, c in enumerate(CATEGORIES):
            existing = await db.categories.find_one({"id": c["id"]}, {"_id": 0, "id": 1})
            if existing:
                continue
            names = CATEGORY_NAMES.get(c["id"], {})
            await db.categories.insert_one({
                "id": c["id"],
                "icon": c["icon"],
                "name_en": names.get("en", c["name"]),
                "name_fr": names.get("fr", c["name"]),
                "name_ar": names.get("ar", c["name"]),
                "order": idx,
                "active": True,
                "created_at": now_iso,
                "updated_at": now_iso,
            })
    except Exception as e:
        logger.warning("Category seed skipped: %s", e)

    # One-shot data migrations (location backfill, category renames) live in
    # scripts/migrate.py — run once per deploy before starting the workers,
    # not once per worker on every boot. Startup keeps only idempotent,
    # cheap work: indexes, the static category seed, and read-only checks.

    # Warn (never block) if an admin account still uses the historical default
    # password "admin123" from the removed startup seed. Operators should
    # rotate it: scripts/create_admin.py sets a new password.
    async for admin in db.users.find(
        {"is_admin": True}, {"_id": 0, "email": 1, "password_hash": 1}
    ):
        if admin.get("password_hash") and verify_password("admin123", admin["password_hash"]):
            logger.warning(
                "Admin account %s uses the default password 'admin123' — "
                "rotate it with scripts/create_admin.py immediately.",
                admin.get("email"),
            )


# FastAPI's modern lifecycle: replace the deprecated @app.on_event pair used
# before the P30 FastAPI upgrade. Runs once per worker process (uvicorn runs
# the lifespan in each worker; the work here is idempotent — see P18).
@asynccontextmanager
async def _lifespan(app: FastAPI):
    await on_startup()
    yield
    await ws_manager.stop()
    client.close()


app = FastAPI(title="khedmaPro API", lifespan=_lifespan)
app.include_router(build_api_router())

# Marketing website (static HTML). Mounted at /api/site because Kubernetes
# ingress routes /api/* to this backend service. html=True enables directory
# index resolution so /api/site/ serves index.html.
_site_dir = os.path.join(os.path.dirname(__file__), "site")
if os.path.isdir(_site_dir):
    app.mount("/api/site", StaticFiles(directory=_site_dir, html=True), name="site")

# Marketing ad creatives generated by /app/scripts/gen_ads.py — served under
# /api/static/ads/ so the admin can browse them from anywhere.
_ads_dir = os.path.join(os.path.dirname(__file__), "static", "ads")
if os.path.isdir(_ads_dir):
    app.mount("/api/static/ads", StaticFiles(directory=_ads_dir, html=False), name="ads-static")

# WebSocket chat lives on the app directly (path already includes /api).
app.add_api_websocket_route("/api/ws/chat", ws_chat)

app.add_middleware(
    CORSMiddleware,
    # Bearer tokens only — no cookies are set or read anywhere in the app, so
    # credentials are never echoed. This keeps `Access-Control-Allow-Credentials`
    # out of responses and prevents credentialed cross-origin requests from
    # origins the operator did not list.
    allow_credentials=False,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
