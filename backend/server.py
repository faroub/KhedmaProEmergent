"""khedmaPro FastAPI entry point.

This file used to be a 1650-line monolith. It's now a thin composition root:
- Wires the aggregated `/api` router (built in `routes/__init__.py`).
- Registers the WebSocket chat handler on the app directly (WS routes cannot
  live inside a mounted APIRouter with a prefix).
- Adds CORS.
- Runs startup/shutdown hooks (indexes, one-shot migration, admin seed).

Feature code has moved to focused modules:
- `config.py`         — env vars + business constants
- `database.py`       — Motor/Mongo client (`db`)
- `schemas.py`        — every Pydantic model + enums
- `reference_data.py` — CATEGORIES, WILAYAS, DEFAULT_HOURS
- `security.py`       — bcrypt + JWT helpers
- `subscription.py`   — subscription math + `serialize_user`
- `deps.py`           — FastAPI auth dependencies (current_user, admin gate…)
- `phone.py`          — DZ phone normalization + mock OTP sender
- `ws_manager.py`     — in-memory WebSocket registry
- `routes/*.py`       — one file per feature area
"""
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from database import client, db
from routes import build_api_router
from routes.messages import ws_chat
from schemas import Role
from security import hash_password


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


app = FastAPI(title="khedmaPro API")
app.include_router(build_api_router())

# Marketing website (static HTML). Mounted at /api/site because Kubernetes
# ingress routes /api/* to this backend service. html=True enables directory
# index resolution so /api/site/ serves index.html.
_site_dir = os.path.join(os.path.dirname(__file__), "site")
if os.path.isdir(_site_dir):
    app.mount("/api/site", StaticFiles(directory=_site_dir, html=True), name="site")

# WebSocket chat lives on the app directly (path already includes /api).
app.add_api_websocket_route("/api/ws/chat", ws_chat)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    """Create indexes, migrate legacy data, and seed a default admin account."""
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
    await db.users.create_index("verification_status")
    await db.users.create_index([("location_lat", 1), ("location_lng", 1)])

    # One-shot: backfill approximate location coordinates for existing providers
    # from their wilaya's centroid (nudged with a tiny per-provider offset so
    # they don't all collapse onto a single map pin). Runs only for providers
    # who don't yet have `location_lat`/`location_lng` set.
    try:
        from wilaya_geo import WILAYA_CENTROIDS
        import hashlib

        missing = db.users.find(
            {
                "role": Role.service_provider.value,
                "wilaya_code": {"$exists": True, "$ne": None},
                "$or": [{"location_lat": None}, {"location_lat": {"$exists": False}}],
            },
            {"_id": 0, "id": 1, "wilaya_code": 1},
        )
        async for doc in missing:
            centroid = WILAYA_CENTROIDS.get(doc.get("wilaya_code") or "")
            if not centroid:
                continue
            # Deterministic ~±0.01° (~1 km) offset from the wilaya centroid.
            h = int(hashlib.sha1(doc["id"].encode()).hexdigest(), 16)
            lat_off = ((h % 200) - 100) / 10000.0
            lng_off = (((h // 200) % 200) - 100) / 10000.0
            await db.users.update_one(
                {"id": doc["id"]},
                {"$set": {
                    "location_lat": centroid[0] + lat_off,
                    "location_lng": centroid[1] + lng_off,
                    "location_source": "wilaya_centroid",
                }},
            )
    except Exception as e:
        logger.warning("Location backfill skipped: %s", e)
    try:
        migrated = await db.users.update_many(
            {"category": "admin_education"},
            {"$set": {"category": "admin_consulting"}},
        )
        if migrated.modified_count:
            logger.info(
                "Migrated %d providers from admin_education → admin_consulting",
                migrated.modified_count,
            )
    except Exception as e:
        logger.warning("Category migration skipped: %s", e)

    # Seed a default admin account if none exists — powers manual verification review.
    admin = await db.users.find_one({"is_admin": True})
    if not admin:
        admin_email = "admin@khedmapro.dz"
        existing = await db.users.find_one({"email": admin_email})
        now_iso = datetime.now(timezone.utc).isoformat()
        if existing:
            await db.users.update_one({"id": existing["id"]}, {"$set": {"is_admin": True}})
        else:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": admin_email,
                "phone": None,
                "password_hash": hash_password("admin123"),
                "full_name": "khedmaPro Admin",
                "role": Role.client.value,  # placeholder role; is_admin gates admin endpoints
                "city": "Alger",
                "is_admin": True,
                "rating": 0.0,
                "reviews_count": 0,
                "created_at": now_iso,
                "profile_complete": True,
                "auth_methods": ["password"],
            })
            logger.info("Seeded default admin account (email=%s)", admin_email)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
