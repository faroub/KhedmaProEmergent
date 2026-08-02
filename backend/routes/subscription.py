"""Subscription status + MOCK payment."""
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends

from config import DEACTIVATION_MONTHS, SUBSCRIPTION_FEE_DZD, TRIAL_MONTHS
from database import db
from deps import require_role
from schemas import Role
from subscription import compute_subscription, serialize_user

router = APIRouter(tags=["subscription"])


@router.get("/subscription/status")
async def subscription_status(user: Annotated[dict, Depends(require_role(Role.service_provider))]):
    sub = compute_subscription(user)
    return {
        "role": user["role"],
        "subscription_status": sub["subscription_status"],
        "active": sub["active"],
        "days_until_due": sub["days_until_due"],
        "trial_ends_at": sub["trial_ends_at"],
        "last_paid_at": user.get("last_paid_at"),
        "fee_dzd": SUBSCRIPTION_FEE_DZD,
        "trial_months": TRIAL_MONTHS,
        "auto_delete_months": DEACTIVATION_MONTHS,
        "is_manually_deactivated": bool(user.get("is_manually_deactivated")),
        "is_deleted": bool(user.get("is_deleted")),
    }


@router.post("/subscription/pay")
async def pay_subscription(user: Annotated[dict, Depends(require_role(Role.service_provider))]):
    """MOCK payment — records the fee and extends listing by 30 days.
    Also clears any manual deactivation. Slot a real gateway in here later.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "last_paid_at": now_iso,
            "is_manually_deactivated": False,
            "manually_deactivated_at": None,
        }},
    )
    await db.subscription_payments.insert_one({
        "id": str(uuid.uuid4()),
        "provider_id": user["id"],
        "amount_dzd": SUBSCRIPTION_FEE_DZD,
        "paid_at": now_iso,
        "method": "mock",
    })
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"success": True, "amount_dzd": SUBSCRIPTION_FEE_DZD, "user": serialize_user(updated)}
