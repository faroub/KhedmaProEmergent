"""P11 — CORS lockdown.

The API uses Bearer tokens, not cookies, so `allow_credentials` is False: an
allowed origin gets an Access-Control-Allow-Origin echo but never a
credentials echo, and a disallowed origin gets no CORS headers at all.
"""
import os

import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001").rstrip("/")
ALLOWED_ORIGIN = "http://localhost:8081"  # part of config.py's default CORS_ORIGINS
DISALLOWED_ORIGIN = "http://evil.example"


def _lower_headers(r: requests.Response) -> dict:
    return {k.lower(): v for k, v in r.headers.items()}


def test_disallowed_origin_preflight_gets_no_allow_origin():
    r = requests.options(
        f"{BASE}/api/categories",
        headers={"Origin": DISALLOWED_ORIGIN, "Access-Control-Request-Method": "GET"},
        timeout=15,
    )
    assert "access-control-allow-origin" not in _lower_headers(r)


def test_disallowed_origin_actual_request_gets_no_allow_origin():
    r = requests.get(f"{BASE}/api/categories", headers={"Origin": DISALLOWED_ORIGIN}, timeout=15)
    assert r.status_code == 200
    assert "access-control-allow-origin" not in _lower_headers(r)


def test_allowed_origin_preflight_gets_allow_origin():
    r = requests.options(
        f"{BASE}/api/categories",
        headers={"Origin": ALLOWED_ORIGIN, "Access-Control-Request-Method": "GET"},
        timeout=15,
    )
    headers = _lower_headers(r)
    assert headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


def test_credentials_are_never_echoed():
    r = requests.options(
        f"{BASE}/api/categories",
        headers={"Origin": ALLOWED_ORIGIN, "Access-Control-Request-Method": "GET"},
        timeout=15,
    )
    assert "access-control-allow-credentials" not in _lower_headers(r)
    r = requests.get(f"{BASE}/api/categories", headers={"Origin": ALLOWED_ORIGIN}, timeout=15)
    assert "access-control-allow-credentials" not in _lower_headers(r)
