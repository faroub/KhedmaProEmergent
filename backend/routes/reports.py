"""Report a provider (spam / no-show / fraud etc.)."""
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import current_user
from schemas import ReportIn, Role

router = APIRouter(tags=["reports"])


@router.post("/reports", status_code=201)
async def report_provider(
    body: ReportIn,
    user: Annotated[dict, Depends(current_user)],
):
    provider = await db.users.find_one(
        {"id": body.provider_id, "role": Role.service_provider.value}, {"_id": 0}
    )
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    doc = {
        "id": str(uuid.uuid4()),
        "provider_id": body.provider_id,
        "reporter_id": user["id"],
        "reporter_name": user["full_name"],
        "reporter_role": user["role"],
        "reason": body.reason,
        "details": body.details,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "open",
    }
    await db.reports.insert_one(doc)
    doc.pop("_id", None)
    return doc
