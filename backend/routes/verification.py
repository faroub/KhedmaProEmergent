"""Provider verification submissions + admin review."""
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from config import MAX_IMAGE_BYTES
from database import db
from deps import current_user, require_admin, require_role
from schemas import Role, VerificationRejectIn, VerificationSubmitIn
from subscription import serialize_user

router = APIRouter(tags=["verification"])


@router.get("/verification/status")
async def verification_status(user: Annotated[dict, Depends(require_role(Role.service_provider))]):
    return {
        "status": user.get("verification_status", "unverified"),
        "documents": user.get("verification_documents", []),
        "reject_reason": user.get("verification_reject_reason"),
        "submitted_at": user.get("verification_submitted_at"),
        "reviewed_at": user.get("verification_reviewed_at"),
    }


@router.post("/verification/submit")
async def verification_submit(
    body: VerificationSubmitIn,
    user: Annotated[dict, Depends(require_role(Role.service_provider))],
):
    if not body.documents:
        raise HTTPException(status_code=400, detail="At least one document is required")
    now_iso = datetime.now(timezone.utc).isoformat()
    docs = []
    for d in body.documents:
        if len(d.url) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Document too large, please compress further")
        docs.append({
            "id": str(uuid.uuid4()),
            "type": d.type.value,
            "url": d.url,
            "note": d.note,
            "uploaded_at": now_iso,
        })
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "verification_documents": docs,
            "verification_status": "pending",
            "verification_submitted_at": now_iso,
            "verification_reject_reason": None,
            "verification_reviewed_at": None,
        }},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return serialize_user(updated)


@router.delete("/verification/documents/{doc_id}")
async def verification_remove_doc(
    doc_id: str,
    user: Annotated[dict, Depends(require_role(Role.service_provider))],
):
    status = user.get("verification_status")
    if status == "verified":
        raise HTTPException(status_code=409, detail="Cannot modify documents on a verified account")
    docs = [d for d in (user.get("verification_documents") or []) if d.get("id") != doc_id]
    await db.users.update_one({"id": user["id"]}, {"$set": {"verification_documents": docs}})
    return {"success": True, "documents": docs}


# ---- Admin review endpoints ----
@router.get("/admin/verification/pending")
async def admin_list_pending(user: Annotated[dict, Depends(current_user)]):
    require_admin(user)
    docs = await db.users.find(
        {"role": Role.service_provider.value, "verification_status": "pending"},
        {"_id": 0, "password_hash": 0},
    ).to_list(200)
    return [serialize_user(d) for d in docs]


@router.get("/admin/verification/{provider_id}")
async def admin_get_provider_verification(
    provider_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    doc = await db.users.find_one(
        {"id": provider_id, "role": Role.service_provider.value},
        {"_id": 0, "password_hash": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Provider not found")
    return serialize_user(doc)


@router.post("/admin/verification/{provider_id}/approve")
async def admin_verify_approve(
    provider_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await db.users.update_one(
        {"id": provider_id, "role": Role.service_provider.value},
        {"$set": {
            "verification_status": "verified",
            "verification_reviewed_at": now_iso,
            "verification_reviewer_id": user["id"],
            "verification_reject_reason": None,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Provider not found")
    updated = await db.users.find_one({"id": provider_id}, {"_id": 0})
    return serialize_user(updated)


@router.post("/admin/verification/{provider_id}/reject")
async def admin_verify_reject(
    provider_id: str,
    body: VerificationRejectIn,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await db.users.update_one(
        {"id": provider_id, "role": Role.service_provider.value},
        {"$set": {
            "verification_status": "rejected",
            "verification_reviewed_at": now_iso,
            "verification_reviewer_id": user["id"],
            "verification_reject_reason": body.reason,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Provider not found")
    updated = await db.users.find_one({"id": provider_id}, {"_id": 0})
    return serialize_user(updated)
