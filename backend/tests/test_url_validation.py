"""P29 — URL scheme validation on admin/user-supplied URLs (N9).

javascript:, data:, and other non-http(s) schemes must never be stored as ad
images/links, social links, SMS gateway URLs, or portfolio references. The
marketing-site JS guards (site/i18n.js) still protect values already in the
database; these tests pin the write-time rejection.
"""
import os

import pytest
import requests

from helpers import fresh_provider, make_admin

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token() -> str:
    return make_admin()["token"]


class TestAdsUrls:
    """Banner images/links are https-only (data: URIs no longer accepted)."""

    def _create(self, admin_token, **overrides):
        payload = {"title": "TEST P29 ad", "image_url": "https://example.com/x.png"}
        payload.update(overrides)
        return requests.post(
            f"{API}/admin/ads", json=payload, headers=_hdr(admin_token), timeout=15
        )

    def test_javascript_and_data_image_rejected(self, admin_token):
        for bad in ["javascript:alert(1)", "data:image/png;base64,iVBOR", "http://example.com/x.png"]:
            r = self._create(admin_token, image_url=bad)
            assert r.status_code == 422, (bad, r.text)

    def test_javascript_and_data_link_rejected(self, admin_token):
        for bad in ["javascript:alert(1)", "data:text/html,<script>1</script>"]:
            r = self._create(admin_token, link_url=bad)
            assert r.status_code == 422, (bad, r.text)

    def test_valid_https_ad_round_trip(self, admin_token):
        r = self._create(admin_token, link_url="https://example.com/promo")
        assert r.status_code == 201, r.text
        ad_id = r.json()["id"]
        try:
            # PATCH with a bad scheme must also fail.
            r2 = requests.patch(
                f"{API}/admin/ads/{ad_id}",
                json={"link_url": "javascript:alert(1)"},
                headers=_hdr(admin_token),
                timeout=15,
            )
            assert r2.status_code == 422, r2.text
        finally:
            requests.delete(
                f"{API}/admin/ads/{ad_id}", headers=_hdr(admin_token), timeout=15
            )


class TestSettingsUrls:
    """Social links, SMS gateway URL, and the WhatsApp link are http(s)-only."""

    def _patch(self, admin_token, block: str, payload: dict):
        return requests.patch(
            f"{API}/admin/settings",
            json={block: payload},
            headers=_hdr(admin_token),
            timeout=15,
        )

    def test_social_javascript_rejected(self, admin_token):
        r = self._patch(admin_token, "social", {"facebook_url": "javascript:alert(1)"})
        assert r.status_code == 422, r.text

    def test_sms_data_url_rejected(self, admin_token):
        r = self._patch(admin_token, "sms", {"http_url": "data:text/html,x"})
        assert r.status_code == 422, r.text

    def test_whatsapp_javascript_rejected(self, admin_token):
        r = self._patch(admin_token, "site", {"contact_whatsapp": "javascript:1"})
        assert r.status_code == 422, r.text

    def test_valid_social_round_trip(self, admin_token):
        r = self._patch(admin_token, "social", {"instagram_url": "https://instagram.com/khedmapro"})
        assert r.status_code == 200, r.text
        try:
            public = requests.get(f"{API}/public/settings", timeout=15).json()
            assert public["social"]["instagram_url"] == "https://instagram.com/khedmapro"
        finally:
            # Clear so the shared settings doc is left untouched.
            self._patch(admin_token, "social", {"instagram_url": ""})

    def test_valid_sms_http_gateway(self, admin_token):
        # Internal SMS gateways may legitimately be plain http.
        r = self._patch(admin_token, "sms", {"http_url": "http://10.0.0.5/sms/send"})
        assert r.status_code == 200, r.text
        self._patch(admin_token, "sms", {"http_url": ""})


class TestPortfolioUrls:
    """External portfolio references are https-only; inline data URIs (which
    are decoded into object storage by P24) remain accepted."""

    def _portfolio(self, token, images):
        return requests.patch(
            f"{API}/users/me/portfolio",
            json={"portfolio_images": images},
            headers=_hdr(token),
            timeout=30,
        )

    def test_bad_scheme_string_rejected(self):
        provider = fresh_provider()
        for bad in ["javascript:alert(1)", "http://example.com/a.jpg"]:
            r = self._portfolio(provider["access_token"], [bad])
            assert r.status_code == 422, (bad, r.text)

    def test_data_uri_still_accepted(self):
        # Inline uploads are decoded into object storage (P24) — keep working.
        provider = fresh_provider()
        png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        r = self._portfolio(provider["access_token"], [png])
        assert r.status_code == 200, r.text

    def test_bad_scheme_object_rejected(self):
        provider = fresh_provider()
        r = self._portfolio(
            provider["access_token"],
            [{"url": "javascript:alert(1)", "caption": "x"}],
        )
        assert r.status_code == 422, r.text

    def test_https_reference_round_trip(self):
        provider = fresh_provider()
        r = self._portfolio(
            provider["access_token"],
            [{"url": "https://cdn.example.com/a.jpg", "caption": "sink"}],
        )
        assert r.status_code == 200, r.text
        items = r.json()["portfolio_images"]
        assert any(
            it.get("caption") == "sink" or it.get("url") == "https://cdn.example.com/a.jpg"
            for it in items
        )
