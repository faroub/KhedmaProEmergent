#!/usr/bin/env python3
"""Idempotent data migrations (H10).

The location backfill and the category rename used to run in server startup
(i.e. once per worker, on every deploy, racing the other workers). They live
here instead: run this script once before starting the workers.

    python -m scripts.migrate            # apply
    python -m scripts.migrate --dry-run  # report only, no writes

Every migration is idempotent: running it twice changes nothing the second
time. Index creation and the category seed stay at startup — both are
idempotent and cheap — while the migrations below touch user documents.
"""
import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    # importing database triggers config.py, which raises KeyError when an
    # app environment variable is missing — fail with an actionable message
    # rather than a traceback.
    from database import db
except KeyError as e:
    sys.exit(
        f"Environment variable {e} is not set — run this script with the same "
        "environment as the app (e.g. source the backend .env first)."
    )

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("migrate")


async def _ensure_unique_event_id_index(dry_run: bool) -> dict:
    """Webhook idempotency (P19): chargily_events.event_id must be unique so a
    concurrent delivery of the same event loses the insert and is skipped."""
    if dry_run:
        return {"unique_indexes": ["chargily_events.event_id"]}
    await db.chargily_events.create_index("event_id", unique=True)
    return {"unique_indexes": ["chargily_events.event_id"]}


async def _ensure_unique_report_window_index(dry_run: bool) -> dict:
    """Report dedup (P23): one report per (reporter, provider) per 30-day
    window — the application pre-checks, and this unique index closes the
    concurrent-insert race. Partial on window existence so legacy documents
    written before the field existed are not re-constrained."""
    keys = [("reporter_id", 1), ("provider_id", 1), ("window", 1)]
    name = "unique_report_window_index"
    if dry_run:
        return {"unique_indexes": [name]}
    await db.reports.create_index(
        keys,
        unique=True,
        name=name,
        partialFilterExpression={"window": {"$exists": True}},
    )
    return {"unique_indexes": [name]}


async def _migrate_location_backfill(dry_run: bool) -> dict:
    """Backfill approximate wilaya-centroid coordinates for providers that
    don't have location_lat/lng yet (with a tiny per-provider offset so they
    don't all collapse onto one map pin)."""
    from wilaya_geo import approx_coords_for

    counts = {"scanned": 0, "updated": 0}
    cursor = db.users.find(
        {
            "role": "service_provider",
            "wilaya_code": {"$exists": True, "$ne": None},
            "$or": [{"location_lat": None}, {"location_lat": {"$exists": False}}],
        },
        {"_id": 0, "id": 1, "wilaya_code": 1},
    )
    async for doc in cursor:
        counts["scanned"] += 1
        coords = approx_coords_for(doc["id"], doc.get("wilaya_code"))
        if not coords:
            continue
        counts["updated"] += 1
        if dry_run:
            logger.info("[dry-run] would set location for provider %s", doc.get("id"))
            continue
        await db.users.update_one(
            {"id": doc["id"]},
            {"$set": {
                "location_lat": coords[0],
                "location_lng": coords[1],
                "location_source": "wilaya_centroid",
            }},
        )
    return counts


async def _migrate_category_rename(dry_run: bool) -> dict:
    """Rename the legacy admin_education category to admin_consulting."""
    if dry_run:
        matched = await db.users.count_documents({"category": "admin_education"})
        return {"matched": matched, "modified": 0}
    result = await db.users.update_many(
        {"category": "admin_education"}, {"$set": {"category": "admin_consulting"}}
    )
    return {"matched": result.matched_count, "modified": result.modified_count}


async def _migrate_inline_files(dry_run: bool) -> dict:
    """Move base64 portfolio/verification files out of user documents (P24).

    Decode the inline data URI → store it in object storage under a random
    key → verify the upload round-trips → then replace the inline copy with
    the key. A second run finds no data: URIs, so it is idempotent."""
    from config import MAX_DOC_BYTES, MAX_PORTFOLIO_BYTES
    from storage import StorageError, decode_data_uri, get_bytes, put_bytes

    allow_images = ("image/jpeg", "image/png", "image/webp", "image/gif")
    allow_docs = allow_images + ("application/pdf",)
    counts = {"portfolio_files": 0, "verification_files": 0, "users_updated": 0}

    async def _store(uri: str, kind: str, allow: tuple, max_bytes: int):
        try:
            data = decode_data_uri(uri)
            key = await put_bytes(data, kind=kind, allow=allow, max_bytes=max_bytes)
            if await get_bytes(key) is None:  # verify before deleting inline
                logger.error("stored object not readable: %s", key)
                return None
            return key
        except StorageError as e:
            logger.warning("skipping inline file (%s)", e)
            return None

    cursor = db.users.find(
        {
            "$or": [
                {"portfolio_images": {"$regex": "^data:"}},
                {"verification_documents.url": {"$regex": "^data:"}},
            ]
        },
        {"_id": 0, "id": 1, "portfolio_images": 1, "verification_documents": 1},
    )
    async for doc in cursor:
        changed = False
        portfolio = doc.get("portfolio_images") or []
        has_cover = any(
            isinstance(p, dict) and p.get("is_cover") for p in portfolio
        )
        new_portfolio = []
        for i, p in enumerate(portfolio):
            if isinstance(p, str) and p.startswith("data:"):
                key = None if dry_run else await _store(p, "portfolio", allow_images, MAX_PORTFOLIO_BYTES)
                if dry_run or key:
                    counts["portfolio_files"] += 1
                    changed = True
                    new_portfolio.append({
                        "key": key or "dry-run",
                        "caption": None,
                        "tags": [],
                        "is_cover": i == 0 and not has_cover,
                    })
                    continue
            elif isinstance(p, dict) and str(p.get("url") or "").startswith("data:"):
                key = None if dry_run else await _store(p["url"], "portfolio", allow_images, MAX_PORTFOLIO_BYTES)
                if dry_run or key:
                    counts["portfolio_files"] += 1
                    changed = True
                    p = {k: v for k, v in p.items() if k != "url"}
                    p["key"] = key or "dry-run"
            new_portfolio.append(p)
        docs = doc.get("verification_documents") or []
        new_docs = []
        for d in docs:
            if str(d.get("url") or "").startswith("data:"):
                key = None if dry_run else await _store(d["url"], "verification", allow_docs, MAX_DOC_BYTES)
                if dry_run or key:
                    counts["verification_files"] += 1
                    changed = True
                    d = {k: v for k, v in d.items() if k != "url"}
                    d["key"] = key or "dry-run"
            new_docs.append(d)
        if not changed or dry_run:
            continue
        await db.users.update_one(
            {"id": doc["id"]},
            {"$set": {"portfolio_images": new_portfolio, "verification_documents": new_docs}},
        )
        counts["users_updated"] += 1
    return counts


async def _strip_platform_secrets(dry_run: bool) -> dict:
    """Remove legacy plaintext secrets from platform_settings (H8/P25).

    Chargily key overrides, webhook overrides, the Twilio auth token and SMS
    gateway headers were previously editable from the admin UI and stored in
    plaintext. Credentials are environment-only now, so this migration deletes
    the stored values (they no longer take effect regardless). Back up the
    collection before running it in production, and rotate any key that was
    ever shown in the admin UI or logs."""
    fields = {
        "chargily_secret_key_override": "",
        "chargily_webhook_secret_override": "",
        "sms.twilio_auth_token": "",
        "sms.http_headers": "",
    }
    if dry_run:
        coll = db.platform_settings
        count = 0
        async for doc in coll.find({}, {"_id": 1, **{f: 1 for f in fields}}):
            present = [
                f for f in fields
                if f.split(".", 1)[0] in doc and (
                    "." not in f or f.split(".", 1)[1] in doc.get(f.split(".", 1)[0], {})
                )
            ]
            count += len(present)
        return {"secret_fields_found": count}
    result = await db.platform_settings.update_many(
        {}, {"$unset": dict.fromkeys(fields, "")}
    )
    return {"matched": result.matched_count, "modified": result.modified_count}


async def _migrate_wilaya_backfill(dry_run: bool) -> dict:
    """Assign a default wilaya ("16" = Alger) to providers missing one.

    One-shot data repair for legacy accounts, kept here (P35) instead of a
    always-on admin endpoint: idempotent, so repeat runs are no-ops.
    """
    from reference_data import WILAYAS

    default_wilaya = "16"
    assert default_wilaya in {w["code"] for w in WILAYAS}

    q = {
        "role": "service_provider",
        "$or": [
            {"wilaya_code": {"$exists": False}},
            {"wilaya_code": None},
            {"wilaya_code": ""},
        ],
    }
    count = await db.users.count_documents(q)
    if dry_run:
        return {"would_update": count, "default_wilaya": default_wilaya}
    if count == 0:
        return {"updated": 0, "default_wilaya": default_wilaya}
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await db.users.update_many(
        q,
        {"$set": {
            "wilaya_code": default_wilaya,
            "wilaya_backfilled_at": now_iso,
        }},
    )
    return {"updated": res.modified_count, "default_wilaya": default_wilaya}


MIGRATIONS = [
    ("unique_event_id_index", _ensure_unique_event_id_index),
    ("unique_report_window_index", _ensure_unique_report_window_index),
    ("wilaya_backfill", _migrate_wilaya_backfill),
    ("location_backfill", _migrate_location_backfill),
    ("category_rename", _migrate_category_rename),
    ("inline_files", _migrate_inline_files),
    ("strip_platform_secrets", _strip_platform_secrets),
]


async def run(dry_run: bool = False) -> dict:
    """Run every migration, log counts, return a per-migration summary."""
    results = {}
    for name, migration in MIGRATIONS:
        try:
            results[name] = await migration(dry_run)
            logger.info("%s (dry_run=%s): %s", name, dry_run, results[name])
        except Exception as e:  # one failed migration must not hide the rest
            logger.exception("%s failed", name)
            results[name] = {"error": str(e)}
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Run idempotent data migrations.")
    parser.add_argument(
        "--dry-run", action="store_true", help="report what would change without writing"
    )
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
