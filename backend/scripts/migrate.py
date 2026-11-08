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


MIGRATIONS = [
    ("unique_event_id_index", _ensure_unique_event_id_index),
    ("unique_report_window_index", _ensure_unique_report_window_index),
    ("location_backfill", _migrate_location_backfill),
    ("category_rename", _migrate_category_rename),
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
