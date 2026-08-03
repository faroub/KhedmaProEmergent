"""Smoke tests for /api/register-push endpoint (Iteration 13).

The Emergent push relay is external; with EMERGENT_PUSH_KEY=placeholder we
expect a mapped 500 (upstream 401). We only assert the endpoint is wired,
accepts a valid body, rejects malformed bodies, and does NOT crash the app.
"""
import os

import requests

API = os.environ.get("API_BASE", "http://localhost:8001/api")


def test_register_push_route_exists():
    """Endpoint should be reachable (returns 500/502 with placeholder key, NOT 404)."""
    try:
        r = requests.post(
            f"{API}/register-push",
            json={"user_id": "u1", "platform": "android", "device_token": "dummy"},
            timeout=15,
        )
    except requests.exceptions.ReadTimeout:
        # Upstream (Emergent relay) is unreachable from this env — acceptable.
        return
    # Placeholder key → 500 with our exact detail (or 502 if upstream unavailable).
    assert r.status_code in (500, 502, 201, 200), f"unexpected {r.status_code}: {r.text}"
    if r.status_code == 500:
        assert "EMERGENT_PUSH_KEY" in r.text


def test_register_push_rejects_empty_body():
    r = requests.post(f"{API}/register-push", json={}, timeout=10)
    assert r.status_code == 422  # pydantic validation error


def test_register_push_requires_all_three_fields():
    for bad in (
        {"user_id": "u1", "platform": "android"},
        {"user_id": "u1", "device_token": "tok"},
        {"platform": "android", "device_token": "tok"},
    ):
        r = requests.post(f"{API}/register-push", json=bad, timeout=10)
        assert r.status_code == 422, f"expected 422 for {bad}, got {r.status_code}"
