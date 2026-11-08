#!/usr/bin/env python3
"""Daily account-lifecycle job.

Soft-deletes providers whose subscription has been unpaid past the
deactivation deadline (auto_unpaid_12mo): sets is_deleted/deleted_at/
deleted_reason and bumps token_version so their sessions die. This used to
happen inside enforce_lifecycle on every authenticated request (a write on
the read path); it is owned by this job now.

Read paths still deny access to eligible accounts immediately (read-only
gate in subscription.enforce_lifecycle), so skipping or delaying this job
never restores access — it only delays the persisted flags and revocation.

Usage (from the backend directory):
    python -m scripts.lifecycle_job            # apply
    python -m scripts.lifecycle_job --dry-run  # report only, no writes

Run once a day from cron or the platform scheduler.
"""
import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    # importing database/subscription triggers config.py, which raises
    # KeyError when an app environment variable is missing — fail with an
    # actionable message rather than a traceback.
    from database import db
    from subscription import compute_subscription, refresh_trial_days_cache
except KeyError as e:
    sys.exit(
        f"Environment variable {e} is not set — run this script with the same "
        "environment as the app (e.g. source the backend .env first)."
    )

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("lifecycle_job")

REASON = "auto_unpaid_12mo"


async def run(dry_run: bool = False) -> dict:
    """Scan active providers and soft-delete overdue ones. Returns counts."""
    await refresh_trial_days_cache()
    now_iso = datetime.now(timezone.utc).isoformat()
    counts = {"scanned": 0, "soft_deleted": 0}

    cursor = db.users.find(
        {"role": "service_provider", "is_deleted": {"$ne": True}},
        {"_id": 0, "password_hash": 0},
    )
    async for doc in cursor:
        counts["scanned"] += 1
        if not compute_subscription(doc).get("should_soft_delete"):
            continue
        counts["soft_deleted"] += 1
        if dry_run:
            logger.info("[dry-run] would soft-delete %s (%s)", doc.get("id"), doc.get("email"))
            continue
        await db.users.update_one(
            {"id": doc["id"]},
            {
                "$set": {"is_deleted": True, "deleted_at": now_iso, "deleted_reason": REASON},
                "$inc": {"token_version": 1},
            },
        )
        logger.info("soft-deleted %s (%s)", doc.get("id"), doc.get("email"))

    logger.info(
        "lifecycle job complete (dry_run=%s): scanned=%d soft_deleted=%d",
        dry_run,
        counts["scanned"],
        counts["soft_deleted"],
    )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Soft-delete overdue provider accounts.")
    parser.add_argument(
        "--dry-run", action="store_true", help="report what would change without writing"
    )
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
