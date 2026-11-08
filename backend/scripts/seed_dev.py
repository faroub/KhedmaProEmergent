#!/usr/bin/env python3
"""Seed the database with sample providers and fake reviews (development data).

Run from the backend directory:

    python scripts/seed_dev.py

Refuses to run when APP_ENV=production — the seed data is dev-only. The
/api/seed route calls the same perform_seed() so the CLI and the endpoint
stay in sync; outside development the route additionally requires an admin
token (the CLI just refuses).

When ALLOW_DEV_SEED is true (its default in development/test) the seeded
providers get the well-known dev password `password123` documented in the
script; otherwise each provider gets a random password that is printed once.
"""
import asyncio
import hashlib
import json
import os
import secrets
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from config import ALLOW_DEV_SEED, APP_ENV, DB_NAME, MONGO_URL
except KeyError as e:
    sys.exit(
        f"Environment variable {e} is not set — run this script with the same "
        "environment as the app (e.g. source the backend .env first)."
    )

from schemas import Role
from security import hash_password
from wilaya_geo import approx_coords_for


SEED_PROVIDERS = [
    {"full_name": "Ahmed Boumediene", "category": "plumbing", "hourly_rate": 800, "task_rate": 2500, "city": "Algiers", "wilaya_code": "16", "baladiya": "Bab Ezzouar", "cross_wilaya": False, "bio": "10+ years experience in residential plumbing. Fast, clean and reliable.", "avatar_url": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400"},
    {"full_name": "Karim Belkacem", "category": "electrical", "hourly_rate": 1000, "task_rate": 3000, "city": "Oran", "wilaya_code": "31", "baladiya": "Bir El Djir", "cross_wilaya": True, "bio": "Certified electrician for homes and small businesses. Safe wiring guaranteed.", "avatar_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400"},
    {"full_name": "Amina Cherif", "category": "cleaning", "hourly_rate": 500, "task_rate": 2000, "city": "Algiers", "wilaya_code": "16", "baladiya": "Hydra", "cross_wilaya": False, "bio": "Deep home & office cleaning with eco-friendly products.", "avatar_url": "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400"},
    {"full_name": "Youcef Mansouri", "category": "carpentry", "hourly_rate": 900, "task_rate": 3500, "city": "Constantine", "wilaya_code": "25", "baladiya": "Constantine Centre", "cross_wilaya": True, "bio": "Custom furniture, doors, and interior finishes.", "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"},
    {"full_name": "Sofiane Kaci", "category": "painting", "hourly_rate": 700, "task_rate": 2800, "city": "Algiers", "wilaya_code": "16", "baladiya": "Kouba", "cross_wilaya": True, "bio": "Interior/exterior painting, decorative finishes.", "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400"},
    {"full_name": "Nadia Haddad", "category": "landscaping", "hourly_rate": 600, "task_rate": 2200, "city": "Blida", "wilaya_code": "09", "baladiya": "Blida Centre", "cross_wilaya": True, "bio": "Garden design and maintenance for villas.", "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400"},
    {"full_name": "Riad Zerouki", "category": "it_support", "hourly_rate": 1500, "task_rate": 4000, "city": "Algiers", "wilaya_code": "16", "baladiya": "Cheraga", "cross_wilaya": False, "bio": "PC repair, network setup, remote support.", "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400"},
    {"full_name": "Leila Bensalem", "category": "admin_consulting", "hourly_rate": 1200, "task_rate": 3500, "city": "Oran", "wilaya_code": "31", "baladiya": "Oran Centre", "cross_wilaya": False, "bio": "Administrative consultant — help with paperwork, permits, university applications.", "avatar_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400"},
    {"full_name": "Mehdi Fares", "category": "photography", "hourly_rate": 2000, "task_rate": 8000, "city": "Algiers", "wilaya_code": "16", "baladiya": "Alger Centre", "cross_wilaya": True, "bio": "Wedding, event, and portrait photography.", "avatar_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400"},
    {"full_name": "Salim Ouhadj", "category": "moving", "hourly_rate": 1200, "task_rate": 5000, "city": "Algiers", "wilaya_code": "16", "baladiya": "Bab El Oued", "cross_wilaya": True, "bio": "Careful moving service with team & truck.", "avatar_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400"},
    {"full_name": "Fatima Zohra", "category": "cleaning", "hourly_rate": 550, "task_rate": 2100, "city": "Setif", "wilaya_code": "19", "baladiya": "Sétif Centre", "cross_wilaya": False, "bio": "Reliable home cleaning, deep-clean specialist.", "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400"},
    {"full_name": "Bilal Rahmani", "category": "electrical", "hourly_rate": 950, "task_rate": 2900, "city": "Algiers", "wilaya_code": "16", "baladiya": "El Harrach", "cross_wilaya": False, "bio": "Emergency electrical services, 24/7 available.", "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400"},
    {"full_name": "Nassim Bouzid", "category": "education", "hourly_rate": 1000, "task_rate": 3000, "city": "Oran", "wilaya_code": "31", "baladiya": "Oran Centre", "cross_wilaya": True, "bio": "Private tutor for math, physics and BAC prep. All levels.", "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400"},
]

FAKE_REVIEW_TEXTS = [
    "Excellent work, very professional and on time!",
    "Highly recommended. Fair pricing and clean job.",
    "Quick, polite and skilled. Will hire again.",
    "Good service overall, minor delay but great result.",
    "Absolutely satisfied. Fixed everything on the first visit.",
    "Nice communication and quality workmanship.",
    "Reasonable rates and honest advice — a rare find.",
    "Very thorough, left the place spotless.",
]

FAKE_CLIENT_NAMES = [
    "Yasmine A.", "Omar B.", "Sara D.", "Hakim E.",
    "Linda F.", "Redouane K.", "Nassima M.", "Zineb T.",
]


def review_count_for(provider_id: str) -> int:
    """Deterministic 4–8 reviews per provider.

    `hash()` is salted per process (PYTHONHASHSEED), which made review counts
    change between runs even for the same provider id; sha1 is stable.
    """
    return 4 + (int(hashlib.sha1(provider_id.encode()).hexdigest(), 16) % 5)


async def perform_seed(dev_passwords: bool, db=None) -> dict:
    """Seed sample providers + fake reviews.

    `db` defaults to the application's database; a caller may pass its own
    Motor database handle. With `dev_passwords=True` providers get the
    well-known dev password `password123` (development mode only); otherwise
    each gets a random password returned once in the response so it can be
    handed out.
    """
    if db is None:
        from database import db as _db

        db = _db

    existing = await db.users.count_documents({"role": Role.service_provider.value})
    reviews_count = await db.reviews.count_documents({})
    if existing > 0 and reviews_count > 0:
        return {"message": "Already seeded", "providers": existing, "reviews": reviews_count}

    credentials = []
    for i, p in enumerate(SEED_PROVIDERS):
        if await db.users.find_one({"email": f"provider{i+1}@khedmapro.dz"}):
            continue
        password = "password123" if dev_passwords else secrets.token_urlsafe(12)
        now_iso = datetime.now(timezone.utc).isoformat()
        coords = approx_coords_for(f"seed-{i}", p["wilaya_code"])
        doc = {
            "id": str(uuid.uuid4()),
            "email": f"provider{i+1}@khedmapro.dz",
            "password_hash": hash_password(password),
            "role": Role.service_provider.value,
            "phone": f"+21355500{i+1:04d}",
            "phone_verified": True,  # seeded providers are pre-verified
            "phone_verified_at": now_iso,
            "rating": round(3.8 + (i % 5) * 0.25, 2),
            "reviews_count": 5 + i * 2,
            "created_at": now_iso,
            "last_paid_at": None,
            **p,
        }
        if coords:
            doc["location_lat"], doc["location_lng"] = coords
            doc["location_source"] = "wilaya_centroid"
        await db.users.insert_one(doc)
        if not dev_passwords:
            credentials.append({"email": doc["email"], "password": password})

    provider_docs = await db.users.find({"role": Role.service_provider.value}, {"_id": 0}).to_list(500)
    for pdoc in provider_docs:
        num_reviews = review_count_for(pdoc["id"])
        ratings = []
        for j in range(num_reviews):
            rating = 4 + (j % 2)
            ratings.append(rating)
            review_doc = {
                "id": str(uuid.uuid4()),
                "booking_id": None,
                "provider_id": pdoc["id"],
                "client_id": f"seed-client-{j}",
                "client_name": FAKE_CLIENT_NAMES[j % len(FAKE_CLIENT_NAMES)],
                "rating": rating,
                "comment": FAKE_REVIEW_TEXTS[j % len(FAKE_REVIEW_TEXTS)],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.reviews.insert_one(review_doc)
        avg = sum(ratings) / len(ratings)
        await db.users.update_one(
            {"id": pdoc["id"]},
            {"$set": {"rating": round(avg, 2), "reviews_count": len(ratings)}},
        )

    return {"message": "Seeded", "providers": len(SEED_PROVIDERS), "credentials": credentials}


async def _amain() -> dict:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(MONGO_URL)
    try:
        return await perform_seed(dev_passwords=ALLOW_DEV_SEED, db=client[DB_NAME])
    finally:
        client.close()


def main() -> int:
    if APP_ENV == "production":
        print(
            "Refusing to seed: APP_ENV is production (the seed data is dev-only).",
            file=sys.stderr,
        )
        return 2
    print(json.dumps(asyncio.run(_amain()), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
