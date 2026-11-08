"""P22 — public responses publish only the wilaya-level point (M16).

serialize_user(public=True) returns the wilaya centroid instead of the
provider's pinned coordinates (those stay visible to the account itself and
to admins). Radius search still selects by the real server-side distance and
exposes only a coarse 5 km band, so the exact position can't be recovered.
"""
import os
import uuid

import requests
from pymongo import MongoClient

from helpers import API, fresh_provider
from subscription import serialize_user
from wilaya_geo import WILAYA_CENTROIDS

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ALGIERS = (36.7538, 3.0588)
# Deliberately distinct from the wilaya centroid (~13.7 km away):
PINNED = (36.8000, 3.2000)


def _pin_location(provider, lat=PINNED[0], lng=PINNED[1]) -> None:
    MongoClient(MONGO_URL)[DB_NAME].users.update_one(
        {"id": provider["user"]["id"]},
        {"$set": {"location_lat": lat, "location_lng": lng}},
    )


def _provider_doc(provider) -> dict:
    return MongoClient(MONGO_URL)[DB_NAME].users.find_one({"id": provider["user"]["id"]}, {"_id": 0})


class TestPublicLocationCentroid:
    def test_detail_and_listing_expose_centroid_not_pin(self):
        provider = fresh_provider(full_name=f"TEST P22 {uuid.uuid4().hex[:6]}")
        _pin_location(provider)

        # Public detail endpoint
        r = requests.get(f"{API}/providers/{provider['user']['id']}", timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert (p["location_lat"], p["location_lng"]) == WILAYA_CENTROIDS["16"]
        assert (p["location_lat"], p["location_lng"]) != PINNED

        # Public listing
        r = requests.get(f"{API}/providers?search={p['full_name']}", timeout=15)
        assert r.status_code == 200
        rows = [x for x in r.json() if x["id"] == provider["user"]["id"]]
        assert rows, "provider missing from listing"
        assert (rows[0]["location_lat"], rows[0]["location_lng"]) == WILAYA_CENTROIDS["16"]

    def test_private_serialization_keeps_exact_pin(self):
        provider = fresh_provider()
        _pin_location(provider)
        doc = _provider_doc(provider)

        private = serialize_user(doc, public=False)
        assert (private["location_lat"], private["location_lng"]) == PINNED
        public = serialize_user(doc, public=True)
        assert (public["location_lat"], public["location_lng"]) == WILAYA_CENTROIDS["16"]

    def test_unknown_wilaya_has_no_public_point(self):
        provider = fresh_provider()
        _pin_location(provider)
        # A wilaya code with no known centroid (e.g. a legacy record) must not
        # fall back to publishing the real pin — no public point at all.
        MongoClient(MONGO_URL)[DB_NAME].users.update_one(
            {"id": provider["user"]["id"]}, {"$set": {"wilaya_code": "99"}}
        )
        public = serialize_user(_provider_doc(provider), public=True)
        assert public["location_lat"] is None and public["location_lng"] is None


class TestRadiusSearch:
    def test_radius_search_still_includes_nearby_provider(self):
        provider = fresh_provider()
        _pin_location(provider)
        pid = provider["user"]["id"]

        # ~13.7 km from the origin: inside a 20 km radius, outside a 5 km one.
        r = requests.get(
            f"{API}/providers?lat={ALGIERS[0]}&lng={ALGIERS[1]}&radius_km=20", timeout=15
        )
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json()), "provider missing from 20 km radius"

        r = requests.get(
            f"{API}/providers?lat={ALGIERS[0]}&lng={ALGIERS[1]}&radius_km=5", timeout=15
        )
        assert r.status_code == 200
        assert not any(p["id"] == pid for p in r.json()), "provider wrongly in 5 km radius"

    def test_distance_is_published_only_as_a_band(self):
        provider = fresh_provider()
        _pin_location(provider)
        pid = provider["user"]["id"]

        r = requests.get(
            f"{API}/providers?lat={ALGIERS[0]}&lng={ALGIERS[1]}&radius_km=20", timeout=15
        )
        rows = [p for p in r.json() if p["id"] == pid]
        assert rows
        dist = rows[0]["distance_km"]
        # The exact distance (~13.7 km) is not sent; only its 5 km band is.
        assert dist == 15, dist
        assert dist % 5 == 0
