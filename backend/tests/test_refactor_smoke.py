"""
Iteration 10 — targeted smoke checks after backend modularization refactor.
Confirms endpoint URLs, response shapes, and business logic are preserved.
"""
import os
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


# --- 1. root ---
def test_root_endpoint():
    r = requests.get(f"{BASE_URL}/api/", timeout=10)
    assert r.status_code == 200
    assert r.json() == {"message": "khedmaPro API", "status": "ok"}


# --- 2. categories: 11 including admin_consulting + education ---
def test_categories_count_and_split():
    r = requests.get(f"{BASE_URL}/api/categories", timeout=10)
    assert r.status_code == 200
    cats = r.json()
    assert isinstance(cats, list)
    assert len(cats) == 11, f"expected 11 categories, got {len(cats)}: {[c.get('id') for c in cats]}"
    ids = {c["id"] for c in cats}
    assert "admin_consulting" in ids
    assert "education" in ids
    assert "admin_education" not in ids


# --- 3. wilayas: 58 ---
def test_wilayas_count():
    r = requests.get(f"{BASE_URL}/api/wilayas", timeout=10)
    assert r.status_code == 200
    wilayas = r.json()
    assert isinstance(wilayas, list)
    assert len(wilayas) == 58, f"expected 58 wilayas, got {len(wilayas)}"


# --- 4. admin login ---
def test_admin_login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@khedmapro.dz", "password": "admin123"},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["user"]["is_admin"] is True


# --- 5. provider1 login: trial + days_until_due > 0 ---
def test_provider1_login_trial():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "provider1@khedmapro.dz", "password": "password123"},
        timeout=10,
    )
    assert r.status_code == 200
    user = r.json()["user"]
    assert user["subscription_status"] == "trial", user
    assert user.get("days_until_due") is not None and user["days_until_due"] > 0, user


# --- 6. providers list: > 0 and object-shaped portfolio_images ---
def test_providers_list_portfolio_shape():
    r = requests.get(f"{BASE_URL}/api/providers", timeout=10)
    assert r.status_code == 200
    providers = r.json()
    assert isinstance(providers, list)
    assert len(providers) > 0
    for p in providers:
        assert "portfolio_images" in p, f"missing portfolio_images: {p.get('id')}"
        pi = p["portfolio_images"]
        assert isinstance(pi, list), f"portfolio_images should be list, got {type(pi)} for {p.get('id')}"
        # elements (if any) should be object-shaped
        for item in pi:
            assert isinstance(item, dict), f"portfolio_images items should be dicts (object shape), got {type(item)}"
        # privacy: public endpoint should NOT leak email/phone
        assert "email" not in p
        assert "phone" not in p


# --- 7. websocket auth ---
def test_ws_invalid_token_closes_1008():
    async def _run():
        url = f"{WS_URL}/api/ws/chat?token=invalid_token_xyz"
        try:
            async with websockets.connect(url) as ws:
                try:
                    await asyncio.wait_for(ws.recv(), timeout=3)
                except Exception:
                    pass
                # if still open, that's a failure — but usually server closes
                if ws.state.name == "OPEN":
                    return ("open_after_invalid", None)
                return ("closed", ws.close_code)
        except websockets.exceptions.InvalidStatus as e:
            return ("handshake_rejected", e.response.status_code)
        except websockets.exceptions.ConnectionClosed as e:
            return ("closed", e.code)

    result, code = asyncio.run(_run())
    if result == "handshake_rejected":
        assert code in (401, 403), f"unexpected handshake status {code}"
    elif result == "closed":
        assert code == 1008, f"expected close code 1008, got {code}"
    else:
        pytest.fail(f"WS with invalid token was not rejected: {result}")


def test_ws_valid_token_accepted():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "provider1@khedmapro.dz", "password": "password123"},
        timeout=10,
    )
    assert r.status_code == 200
    token = r.json()["access_token"]

    async def _run():
        url = f"{WS_URL}/api/ws/chat?token={token}"
        async with websockets.connect(url) as ws:
            state = ws.state.name
            await ws.close()
            return state

    state = asyncio.run(_run())
    assert state in ("OPEN", "CONNECTING"), f"WS not accepted, state={state}"
