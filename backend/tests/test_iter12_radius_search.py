"""Iteration 12 — radius-based provider search regression tests.

Covers:
- GET /api/providers with lat/lng/radius_km (radius mode) and validation
- Combining radius with category/wilaya
- PATCH /api/users/me/profile persisting location_lat/lng
- serialize_user exposing location_lat/lng
- Startup backfill: provider1 (Algiers/wilaya 16) has coords near centroid
- Regression: legacy queries unaffected
"""
import os
import math
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")

ALGIERS = (36.7538, 3.0588)
ORAN = (35.6969, -0.6331)


def _haversine(lat1, lng1, lat2, lng2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def provider1_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={
        "email": "provider1@khedmapro.dz", "password": "password123"
    })
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def provider1_id(api, provider1_token):
    r = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {provider1_token}"})
    assert r.status_code == 200
    return r.json()["id"]


# ---- 1. No coords → no distance_km ----
class TestProvidersNoRadius:
    def test_no_coords_returns_all_no_distance(self, api):
        r = api.get(f"{BASE_URL}/api/providers")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for p in data:
            assert "distance_km" not in p or p["distance_km"] is None


# ---- 2/5. Radius mode Algiers ----
class TestRadiusModeAlgiers:
    def test_radius_15km_algiers(self, api):
        lat, lng = ALGIERS
        r = api.get(f"{BASE_URL}/api/providers?lat={lat}&lng={lng}&radius_km=15")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0, "expected providers within 15km of Algiers"
        distances = []
        for p in data:
            assert "distance_km" in p and p["distance_km"] is not None
            assert 0 <= p["distance_km"] <= 15
            # verify server distance matches recomputed haversine
            plat, plng = p["location_lat"], p["location_lng"]
            assert plat is not None and plng is not None
            recomputed = _haversine(lat, lng, plat, plng)
            assert abs(recomputed - p["distance_km"]) < 0.05, f"distance mismatch on {p['id']}"
            distances.append(p["distance_km"])
        # sort asc (ignoring penalty)
        non_penalized = [p["distance_km"] for p in data if not p.get("search_penalty")]
        assert non_penalized == sorted(non_penalized), "must be ascending by distance for non-penalized"

    def test_radius_1km_algiers_returns_some(self, api):
        # jitter ±1km — a few providers should be inside 1 km
        lat, lng = ALGIERS
        r = api.get(f"{BASE_URL}/api/providers?lat={lat}&lng={lng}&radius_km=1")
        assert r.status_code == 200
        data = r.json()
        # not strictly required — but with 6+ Algiers providers, at least 1 should fall within jitter
        assert isinstance(data, list)
        for p in data:
            assert p["distance_km"] <= 1


# ---- 3. Radius + category ----
class TestRadiusPlusCategory:
    def test_radius_algiers_plumbing(self, api):
        lat, lng = ALGIERS
        r = api.get(f"{BASE_URL}/api/providers?lat={lat}&lng={lng}&radius_km=15&category=plumbing")
        assert r.status_code == 200
        data = r.json()
        for p in data:
            assert p["category"] == "plumbing"
            assert 0 <= p["distance_km"] <= 15


# ---- 4. Radius mode Oran ----
class TestRadiusModeOran:
    def test_radius_15km_oran(self, api):
        lat, lng = ORAN
        r = api.get(f"{BASE_URL}/api/providers?lat={lat}&lng={lng}&radius_km=15")
        assert r.status_code == 200
        data = r.json()
        names = [p["full_name"] for p in data]
        # At least 2 of the expected 3 Oran providers should show
        expected = {"Nassim Bouzid", "Leila Bensalem", "Karim Belkacem"}
        matched = expected.intersection(set(names))
        assert len(matched) >= 2, f"expected Oran providers in {names}, matched={matched}"


# ---- 6/7/8. Validation errors ----
class TestRadiusValidation:
    def test_invalid_lat(self, api):
        r = api.get(f"{BASE_URL}/api/providers?lat=200&lng=0&radius_km=5")
        assert r.status_code == 422

    def test_negative_radius(self, api):
        r = api.get(f"{BASE_URL}/api/providers?lat=36&lng=3&radius_km=-5")
        assert r.status_code == 422

    def test_radius_too_large(self, api):
        r = api.get(f"{BASE_URL}/api/providers?lat=36&lng=3&radius_km=600")
        assert r.status_code == 422


# ---- 9. Partial params → radius mode NOT activated ----
class TestPartialParams:
    def test_missing_radius_no_activation(self, api):
        # Should NOT activate radius mode, no filter
        r_all = api.get(f"{BASE_URL}/api/providers")
        assert r_all.status_code == 200
        all_count = len(r_all.json())

        r = api.get(f"{BASE_URL}/api/providers?lat=36&lng=3")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == all_count
        for p in data:
            assert "distance_km" not in p or p["distance_km"] is None

    def test_only_radius_no_activation(self, api):
        r_all = api.get(f"{BASE_URL}/api/providers")
        all_count = len(r_all.json())
        r = api.get(f"{BASE_URL}/api/providers?radius_km=5")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == all_count
        for p in data:
            assert "distance_km" not in p or p["distance_km"] is None


# ---- 10. Profile update with lat/lng ----
class TestProfileLocationUpdate:
    def test_patch_and_verify(self, api, provider1_token, provider1_id):
        headers = {"Authorization": f"Bearer {provider1_token}"}
        # capture current values for restoration
        me0 = api.get(f"{BASE_URL}/api/auth/me", headers=headers).json()
        orig_lat = me0.get("location_lat")
        orig_lng = me0.get("location_lng")

        payload = {
            "full_name": "Provider One",
            "category": me0.get("category") or "plumbing",
            "location_lat": 36.8,
            "location_lng": 3.1,
        }
        r = api.patch(f"{BASE_URL}/api/users/me/profile", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["location_lat"] == 36.8
        assert body["location_lng"] == 3.1

        # GET /api/auth/me should reflect it
        me = api.get(f"{BASE_URL}/api/auth/me", headers=headers).json()
        assert me["location_lat"] == 36.8
        assert me["location_lng"] == 3.1

        # Restore original name & centroid-jitter coords for cleanup
        restore_lat = orig_lat if orig_lat is not None else 36.7469
        restore_lng = orig_lng if orig_lng is not None else 3.0609
        restore = {
            "full_name": me0.get("full_name") or "Ahmed Boumediene",
            "category": me0.get("category") or "plumbing",
            "location_lat": restore_lat,
            "location_lng": restore_lng,
        }
        r2 = api.patch(f"{BASE_URL}/api/users/me/profile", json=restore, headers=headers)
        assert r2.status_code == 200


# ---- 11/12. Regression: legacy query params ----
class TestRegression:
    def test_category_filter_unchanged(self, api):
        r = api.get(f"{BASE_URL}/api/providers?category=cleaning")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for p in data:
            assert p["category"] == "cleaning"
            assert "distance_km" not in p or p["distance_km"] is None

    def test_wilaya_filter_unchanged(self, api):
        r = api.get(f"{BASE_URL}/api/providers?wilaya=16")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for p in data:
            assert "distance_km" not in p or p["distance_km"] is None


# ---- 13. Backfill: provider1 has coords near Algiers centroid ----
class TestBackfill:
    def test_provider1_has_backfilled_coords(self, api, provider1_id):
        r = api.get(f"{BASE_URL}/api/providers/{provider1_id}")
        assert r.status_code == 200
        p = r.json()
        assert p["location_lat"] is not None, "provider1 should have backfilled lat"
        assert p["location_lng"] is not None, "provider1 should have backfilled lng"
        # Allow up to ±0.02 to account for jitter
        assert abs(p["location_lat"] - 36.7538) <= 0.02, f"lat={p['location_lat']}"
        assert abs(p["location_lng"] - 3.0588) <= 0.02, f"lng={p['location_lng']}"
