"""Tests for /api/register-push endpoint (Iteration 13, updated for auth).

The endpoint is authenticated and a user may only register a push token for
their OWN account — otherwise anyone could subscribe to another user's push
notifications (booking details, chat previews, verification decisions).

The Emergent push relay is external; with EMERGENT_PUSH_KEY=placeholder we
expect a mapped 500 (upstream 401) once authentication passes. We only assert
the endpoint is wired, enforces self-registration, and does NOT crash the app.
"""
import os
import uuid

import requests

API = os.environ.get("API_BASE", "http://localhost:8001/api")


def _register_and_login():
    """Create a throwaway client account; return (token, user_id)."""
    email = f"push-test-{uuid.uuid4().hex[:8]}@khedmapro.dz"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "password123",
            "role": "client",
            "full_name": "Push Test",
        },
        timeout=15,
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert me.status_code == 200, me.text
    return token, me.json()["id"]


def test_register_push_requires_auth():
    """Unauthenticated calls are rejected before touching the relay."""
    r = requests.post(
        f"{API}/register-push",
        json={"user_id": "u1", "platform": "android", "device_token": "dummy"},
        timeout=15,
    )
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


def test_register_push_rejects_other_user_id():
    token, _ = _register_and_login()
    r = requests.post(
        f"{API}/register-push",
        json={"user_id": "not-my-account", "platform": "android", "device_token": "dummy"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_register_push_route_exists_for_own_user():
    """Authenticated self-registration reaches the relay (500/502 with a
    placeholder key, or 2xx if a real key is configured)."""
    token, user_id = _register_and_login()
    try:
        r = requests.post(
            f"{API}/register-push",
            json={"user_id": user_id, "platform": "android", "device_token": "dummy"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
    except requests.exceptions.ReadTimeout:
        # Upstream (Emergent relay) is unreachable from this env — acceptable.
        return
    assert r.status_code in (500, 502, 201, 200), f"unexpected {r.status_code}: {r.text}"
    if r.status_code == 500:
        assert "EMERGENT_PUSH_KEY" in r.text


def test_register_push_rejects_incomplete_bodies():
    token, user_id = _register_and_login()
    for bad in (
        {"user_id": user_id, "platform": "android"},
        {"user_id": user_id, "device_token": "tok"},
        {"platform": "android", "device_token": "tok"},
    ):
        r = requests.post(
            f"{API}/register-push",
            json=bad,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        assert r.status_code == 422, f"expected 422 for {bad}, got {r.status_code}"
