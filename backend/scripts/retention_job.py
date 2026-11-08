#!/usr/bin/env python3
"""Delete verification documents past their retention window (P24).

Verification scans serve one purpose: admin review. Once a review is finished
(verified or rejected) and `VERIFICATION_DOCS_RETENTION_DAYS` have passed,
the files and their records are deleted — pending submissions are never
touched, and providers who resubmit keep their current documents until the
next review window closes.

    python -m scripts.retention_job            # delete
    python -m scripts.retention_job --dry-run  # report only

Run it from cron or the platform scheduler (same cadence as the lifecycle
job; anything between daily and weekly is fine).
"""
import argparse
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from config import VERIFICATION_DOCS_RETENTION_DAYS
    from database import db
except KeyError as e:
    sys.exit(
        f"Environment variable {e} is not set — run this script with the same "
        "environment as the app (e.g. source the backend .env first)."
    )

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("retention")


async def run(dry_run: bool = False) -> dict:
    from datetime import datetime, timedelta, timezone

    from storage import delete_object

    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=VERIFICATION_DOCS_RETENTION_DAYS)
    ).isoformat()
    counts = {
        "providers": 0,
        "documents_deleted": 0,
        "objects_deleted": 0,
        "objects_failed": 0,
    }
    cursor = db.users.find(
        {
            "role": "service_provider",
            "verification_status": {"$in": ["verified", "rejected"]},
            "verification_reviewed_at": {"$lte": cutoff},
            "verification_documents.0": {"$exists": True},
        },
        {"_id": 0, "id": 1, "verification_documents": 1, "verification_status": 1},
    )
    async for user in cursor:
        docs = user.get("verification_documents") or []
        counts["providers"] += 1
        keys = [d.get("key") for d in docs if d.get("key")]
        counts["documents_deleted"] += len(docs)
        for key in keys:
            if dry_run:
                counts["objects_deleted"] += 1
                logger.info("[dry-run] would delete %s", key)
                continue
            try:
                await delete_object(key)
                counts["objects_deleted"] += 1
            except Exception as e:  # a missing file must not block the record cleanup
                counts["objects_failed"] += 1
                logger.warning("delete failed for %s: %s", key, e)
        if dry_run:
            continue
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"verification_documents": []}},
        )
        logger.info(
            "cleared %d documents for %s (status=%s)",
            len(docs), user["id"], user.get("verification_status"),
        )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete verification documents past retention.")
    parser.add_argument(
        "--dry-run", action="store_true", help="report what would be deleted without writing"
    )
    args = parser.parse_args()
    counts = asyncio.run(run(dry_run=args.dry_run))
    logger.info("retention (dry_run=%s): %s", args.dry_run, counts)


if __name__ == "__main__":
    main()
