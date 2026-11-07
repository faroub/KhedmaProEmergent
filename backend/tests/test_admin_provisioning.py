"""P7 — admin provisioning tests.

Startup must never create or promote accounts (the historical
admin@khedmapro.dz / admin123 startup seed is gone). Admins are provisioned
explicitly via scripts/create_admin.py, which enforces a minimum password
length of 12 characters.
"""
import os
import subprocess
import sys
import uuid

import requests
from pymongo import MongoClient

from helpers import API

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_env = os.environ.copy()
_env.setdefault("MONGO_URL", "mongodb://localhost:27017")
_env.setdefault("DB_NAME", "test_database")
# config.py requires JWT_SECRET (same environment as the app).
_env.setdefault("JWT_SECRET", "ci-test-secret-for-script-tests-only")


def _run_create_admin(email: str, password: str) -> subprocess.CompletedProcess:
    env = dict(_env, ADMIN_EMAIL=email, ADMIN_PASSWORD=password)
    return subprocess.run(
        [sys.executable, os.path.join(BACKEND_DIR, "scripts", "create_admin.py")],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )


def _users_collection():
    return MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]].users


def test_startup_creates_no_default_admin():
    """The server started before this suite ran; on a fresh database the
    removed startup seed would have left admin@khedmapro.dz behind."""
    assert _users_collection().find_one({"email": "admin@khedmapro.dz"}) is None


def test_create_admin_script_creates_account_and_login_works():
    email = f"prov_admin_{uuid.uuid4().hex[:8]}@example.com"
    password = f"ScriptAdminPw-{uuid.uuid4().hex[:6]}"

    result = _run_create_admin(email, password)
    assert result.returncode == 0, result.stderr

    doc = _users_collection().find_one({"email": email}, {"_id": 0})
    assert doc is not None and doc["is_admin"] is True

    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()


def test_create_admin_script_rejects_short_password():
    email = f"prov_admin_{uuid.uuid4().hex[:8]}@example.com"

    result = _run_create_admin(email, "short123")
    assert result.returncode != 0
    assert "at least 12" in result.stderr
    assert _users_collection().find_one({"email": email}) is None


def test_create_admin_script_promotes_existing_user():
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": f"prov_promote_{uuid.uuid4().hex[:8]}@example.com",
            "password": "SuperStrongPw1!",
            "role": "client",
            "full_name": "Future Admin",
        },
        timeout=15,
    )
    assert r.status_code == 201, r.text
    email = r.json()["user"]["email"]
    password = f"PromotedAdmin-{uuid.uuid4().hex[:6]}"

    result = _run_create_admin(email, password)
    assert result.returncode == 0, result.stderr

    doc = _users_collection().find_one({"email": email}, {"_id": 0})
    assert doc is not None and doc["is_admin"] is True

    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
