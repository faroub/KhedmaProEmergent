"""Scheme guards for admin/user-supplied URLs (N9).

javascript:, data:, and other non-http(s) schemes must never reach the client
as clickable links or image sources.
"""
from typing import Annotated

from pydantic import StringConstraints


def is_http_url(url: str) -> bool:
    """True only for absolute http(s) URLs."""
    return url.startswith("http://") or url.startswith("https://")


def is_https_url(url: str) -> bool:
    """True only for absolute https URLs."""
    return url.startswith("https://")


# Inline image upload (decoded into object storage) or an https CDN reference.
# Required fields only: the pattern has no optional group, so a plain
# re.match cannot fall through to an empty match.
DataOrHttpsText = Annotated[str, StringConstraints(pattern=r"^(data:.+|https://.+)")]
