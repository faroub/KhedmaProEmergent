"""P13 — token revocation via token_version.

Every token records the user's token_version; a logout or deactivation bump
it, so tokens minted before the bump are rejected (401) on the next
authenticated request. Deleted accounts keep their lifecycle 410.
"""
import os

import requests
from pymongo import MongoClient

from helpers import API, fresh_client, fresh_provider, make_admin
from security import decode_token


def _users_collection():
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].users


def test_login_token_carries_version_and_12h_expiry():
    client = fresh_client()
    payload = decode_token(client["access_token"])
    assert payload["ver"] == 0
    assert payload["exp"] - payload["iat"] == 720 * 60


def test_token_issued_before_logout_is_rejected_after_logout():
    client = fresh_client()
    headers = {"Authorization": f"Bearer {client['access_token']}"}
    assert requests.get(f"{API}/auth/me", headers=headers).status_code == 200

    assert requests.post(f"{API}/auth/logout", headers=headers).status_code == 200
    me = requests.get(f"{API}/auth/me", headers=headers)
    assert me.status_code == 401

    # A fresh login mints a valid token again.
    r = requests.post(
        f"{API}/auth/login",
        json={"email": client["user"]["email"], "password": client["password"]},
        timeout=15,
    )
    assert r.status_code == 200
    new_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert requests.get(f"{API}/auth/me", headers=new_headers).status_code == 200


def test_token_rejected_after_admin_deactivation():
    admin = make_admin()
    victim = fresh_provider()
    headers = {"Authorization": f"Bearer {victim['access_token']}"}
    assert requests.get(f"{API}/auth/me", headers=headers).status_code == 200

    r = requests.post(
        f"{API}/admin/users/{victim['user']['id']}/deactivate",
        headers={"Authorization": f"Bearer {admin['token']}"},
        timeout=15,
    )
    assert r.status_code == 200
    assert requests.get(f"{API}/auth/me", headers=headers).status_code == 401


def test_self_deactivation_keeps_session_reactivatable():
    """Self-service deactivation is reversible — the user's own session stays
    valid so they can reactivate (admin deactivation is the one that revokes)."""
    client = fresh_client()
    headers = {"Authorization": f"Bearer {client['access_token']}"}
    assert requests.post(f"{API}/users/me/deactivate", headers=headers).status_code == 200
    assert requests.get(f"{API}/auth/me", headers=headers).status_code == 200
    assert requests.post(f"{API}/users/me/reactivate", headers=headers).status_code == 200


def test_deleted_user_token_still_reports_410():
    client = fresh_client()
    headers = {"Authorization": f"Bearer {client['access_token']}"}
    assert requests.post(f"{API}/users/me/delete", headers=headers).status_code == 200
    assert requests.get(f"{API}/auth/me", headers=headers).status_code == 410


def test_logout_requires_authentication():
    assert requests.post(f"{API}/auth/logout", timeout=15).status_code == 401


def test_token_version_bumps_are_persisted():
    client = fresh_client()
    headers = {"Authorization": f"Bearer {client['access_token']}"}
    assert _users_collection().find_one({"id": client["user"]["id"]})["token_version"] == 0
    assert requests.post(f"{API}/auth/logout", headers=headers).status_code == 200
    assert _users_collection().find_one({"id": client["user"]["id"]})["token_version"] == 1
