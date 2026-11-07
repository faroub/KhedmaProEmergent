#!/usr/bin/env python3
"""Provision an admin account explicitly.

This replaces the removed startup default-admin seed: server startup never
creates or promotes accounts anymore (P7), so an admin is provisioned once,
deliberately, with a strong password.

Usage (from the backend directory):
    ADMIN_EMAIL=ops@khedmapro.dz ADMIN_PASSWORD='...' python scripts/create_admin.py

Credentials are read from the environment or prompted interactively
(the password via getpass, so it never lands in shell history).

- If the email is unknown, a new admin account is created.
- If a user with that email already exists, it is promoted to admin and its
  password is reset to the provided one.

The password must be at least 12 characters long.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# config.py (imported by security) requires the app environment; fail with an
# actionable message rather than a KeyError traceback.
if not os.environ.get("JWT_SECRET"):
    sys.exit(
        "JWT_SECRET is not set — run this script with the same environment as the app "
        "(e.g. source the backend .env first)."
    )

import getpass
import uuid
from datetime import datetime, timezone

from pymongo import MongoClient
from security import hash_password
from schemas import Role

MIN_PASSWORD_LENGTH = 12


def main() -> int:
    email = (os.environ.get("ADMIN_EMAIL") or input("Admin email: ")).strip().lower()
    password = os.environ.get("ADMIN_PASSWORD")
    if password is None:
        password = getpass.getpass(f"Password for {email} (>= {MIN_PASSWORD_LENGTH} chars): ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.",
            file=sys.stderr,
        )
        return 2

    db = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[
        os.environ.get("DB_NAME", "test_database")
    ]
    now_iso = datetime.now(timezone.utc).isoformat()
    existing = db.users.find_one({"email": email})
    if existing is None:
        db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "email": email,
                "phone": None,
                "password_hash": hash_password(password),
                "full_name": os.environ.get("ADMIN_FULL_NAME", "Admin"),
                "role": Role.client.value,  # placeholder role; is_admin gates admin endpoints
                "city": None,
                "is_admin": True,
                "rating": 0.0,
                "reviews_count": 0,
                "created_at": now_iso,
                "profile_complete": True,
                "auth_methods": ["password"],
            }
        )
        print(f"Created admin account {email}")
    else:
        db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"is_admin": True, "password_hash": hash_password(password)}},
        )
        print(f"Promoted existing user {email} to admin and reset its password")
    return 0


if __name__ == "__main__":
    sys.exit(main())
