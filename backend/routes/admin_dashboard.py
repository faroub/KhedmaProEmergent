"""Admin dashboard endpoints: stats, user management, bookings monitor,
revenue view, push broadcast, and CSV exports.
"""
import csv
import io
from datetime import datetime, timezone, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from database import db
from deps import current_user, require_admin
from routes.push import send_push
from schemas import Role
from subscription import compute_subscription, serialize_user

router = APIRouter(tags=["admin-dashboard"])


# =========================================================================
# STATS / KPIs
# =========================================================================
@router.get("/admin/stats")
async def admin_stats(user: Annotated[dict, Depends(current_user)]):
    """One-shot KPI payload for the admin dashboard hub."""
    require_admin(user)

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Users breakdown
    total_users = await db.users.count_documents({"is_deleted": {"$ne": True}})
    total_clients = await db.users.count_documents(
        {"role": Role.client.value, "is_admin": {"$ne": True}, "is_deleted": {"$ne": True}}
    )
    total_providers = await db.users.count_documents(
        {"role": Role.service_provider.value, "is_deleted": {"$ne": True}}
    )
    verified_providers = await db.users.count_documents(
        {"role": Role.service_provider.value, "verification_status": "verified", "is_deleted": {"$ne": True}}
    )
    pending_verifications = await db.users.count_documents(
        {"role": Role.service_provider.value, "verification_status": "pending"}
    )
    deactivated = await db.users.count_documents(
        {
            "$or": [
                {"is_manually_deactivated": True},
                {"is_auto_deactivated": True},
                {"is_deactivated": True},
            ],
            "is_deleted": {"$ne": True},
        }
    )
    flagged = await db.flags.count_documents({"resolved": False})

    # Bookings
    total_bookings = await db.bookings.count_documents({})
    bookings_month = await db.bookings.count_documents({"created_at": {"$gte": month_start}})
    completed_bookings = await db.bookings.count_documents({"status": "completed"})
    pending_bookings = await db.bookings.count_documents({"status": {"$in": ["pending", "awaiting_confirmation"]}})

    # Revenue this month (commission on completed bookings only)
    pipeline = [
        {"$match": {"status": "completed", "created_at": {"$gte": month_start}}},
        {
            "$group": {
                "_id": None,
                "commission": {"$sum": {"$ifNull": ["$platform_commission_dzd", 0]}},
                "gmv": {"$sum": {"$ifNull": ["$total_dzd", 0]}},
                "n": {"$sum": 1},
            }
        },
    ]
    agg = await db.bookings.aggregate(pipeline).to_list(1)
    commission_month = int(agg[0]["commission"]) if agg else 0
    gmv_month = int(agg[0]["gmv"]) if agg else 0

    # All-time commission
    all_pipeline = [
        {"$match": {"status": "completed"}},
        {
            "$group": {
                "_id": None,
                "commission": {"$sum": {"$ifNull": ["$platform_commission_dzd", 0]}},
            }
        },
    ]
    all_agg = await db.bookings.aggregate(all_pipeline).to_list(1)
    commission_total = int(all_agg[0]["commission"]) if all_agg else 0

    return {
        "users": {
            "total": total_users,
            "clients": total_clients,
            "providers": total_providers,
            "verified_providers": verified_providers,
            "deactivated": deactivated,
        },
        "queue": {
            "pending_verifications": pending_verifications,
            "open_flags": flagged,
            "pending_bookings": pending_bookings,
        },
        "bookings": {
            "total": total_bookings,
            "this_month": bookings_month,
            "completed": completed_bookings,
        },
        "revenue": {
            "commission_this_month_dzd": commission_month,
            "commission_total_dzd": commission_total,
            "gmv_this_month_dzd": gmv_month,
        },
        "generated_at": now.isoformat(),
    }


# =========================================================================
# USERS SEARCH + MANAGE
# =========================================================================
@router.get("/admin/users")
async def admin_search_users(
    user: Annotated[dict, Depends(current_user)],
    q: Optional[str] = Query(default=None, description="Match on name / email / phone"),
    role: Optional[str] = Query(default=None),
    wilaya: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, description="active | deactivated | pending | verified"),
    limit: int = Query(default=30, ge=1, le=100),
):
    require_admin(user)

    filt: dict = {"is_deleted": {"$ne": True}}
    if q:
        # Case-insensitive prefix search on name/email/phone.
        safe = q.strip()
        filt["$or"] = [
            {"full_name": {"$regex": safe, "$options": "i"}},
            {"email": {"$regex": safe, "$options": "i"}},
            {"phone": {"$regex": safe, "$options": "i"}},
        ]
    if role in {"client", "service_provider"}:
        filt["role"] = role
    if wilaya:
        filt["wilaya_code"] = wilaya
    if status == "deactivated":
        filt["$and"] = [
            {"$or": [
                {"is_manually_deactivated": True},
                {"is_auto_deactivated": True},
                {"is_deactivated": True},
            ]}
        ]
    elif status == "active":
        filt["is_manually_deactivated"] = {"$ne": True}
        filt["is_auto_deactivated"] = {"$ne": True}
    elif status == "pending":
        filt["verification_status"] = "pending"
    elif status == "verified":
        filt["verification_status"] = "verified"

    docs = await db.users.find(filt, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(limit)
    return [serialize_user(d) for d in docs]


class ForceVerifyIn(BaseModel):
    verified: bool = True


@router.post("/admin/users/{user_id}/deactivate")
async def admin_deactivate_user(
    user_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own admin account")
    res = await db.users.update_one(
        {"id": user_id, "is_deleted": {"$ne": True}},
        {"$set": {
            "is_manually_deactivated": True,
            "manually_deactivated_at": datetime.now(timezone.utc).isoformat(),
            "deactivated_reason": "admin_action",
            "deactivated_by": user["id"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}


@router.post("/admin/users/{user_id}/reactivate")
async def admin_reactivate_user(
    user_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    res = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_manually_deactivated": False,
            "is_auto_deactivated": False,
            "manually_deactivated_at": None,
            "deactivated_reason": None,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}


@router.post("/admin/users/{user_id}/force-verify")
async def admin_force_verify(
    user_id: str,
    body: ForceVerifyIn,
    user: Annotated[dict, Depends(current_user)],
):
    """Force-mark a provider as verified (or unverified) without the doc queue."""
    require_admin(user)
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") != Role.service_provider.value:
        raise HTTPException(status_code=400, detail="Only providers can be verified")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "verification_status": "verified" if body.verified else "unverified",
            "verification_reviewed_at": datetime.now(timezone.utc).isoformat(),
            "verification_reviewer_id": user["id"],
            "verification_reject_reason": None,
        }},
    )
    return {"success": True, "verified": body.verified}


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account")
    res = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user["id"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}


# =========================================================================
# BOOKINGS MONITOR
# =========================================================================
@router.get("/admin/bookings")
async def admin_bookings(
    user: Annotated[dict, Depends(current_user)],
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    require_admin(user)
    filt: dict = {}
    if status:
        filt["status"] = status
    rows = await db.bookings.find(filt, {"_id": 0}).sort("created_at", -1).to_list(limit)

    # Enrich each booking with client/provider basic info.
    async def _hydrate(row: dict) -> dict:
        pids = [pid for pid in (row.get("client_id"), row.get("provider_id")) if pid]
        cache = {}
        if pids:
            users = await db.users.find(
                {"id": {"$in": pids}},
                {"_id": 0, "id": 1, "full_name": 1, "email": 1, "category": 1},
            ).to_list(2)
            cache = {u["id"]: u for u in users}
        row["client"] = cache.get(row.get("client_id"))
        row["provider"] = cache.get(row.get("provider_id"))
        return row

    return [await _hydrate(r) for r in rows]


# =========================================================================
# REVENUE VIEW — monthly commission over last N months
# =========================================================================
@router.get("/admin/revenue")
async def admin_revenue(
    user: Annotated[dict, Depends(current_user)],
    months: int = Query(default=6, ge=1, le=24),
):
    require_admin(user)
    now = datetime.now(timezone.utc)
    # Compute the first-of-month iso for `months` back.
    first = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start = first - timedelta(days=32 * months)
    start = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"status": "completed", "created_at": {"$gte": start.isoformat()}}},
        {
            "$group": {
                "_id": {"$substr": ["$created_at", 0, 7]},  # YYYY-MM
                "commission": {"$sum": {"$ifNull": ["$platform_commission_dzd", 0]}},
                "gmv": {"$sum": {"$ifNull": ["$total_dzd", 0]}},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    rows = await db.bookings.aggregate(pipeline).to_list(months + 1)
    return [
        {
            "month": r["_id"],
            "commission_dzd": int(r["commission"]),
            "gmv_dzd": int(r["gmv"]),
            "completed_bookings": r["count"],
        }
        for r in rows
    ]


# =========================================================================
# PUSH BROADCAST
# =========================================================================
class BroadcastIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=200)
    audience: str = Field(description="all | clients | providers | wilaya")
    wilaya_code: Optional[str] = None
    action_url: Optional[str] = None


@router.post("/admin/broadcast")
async def admin_broadcast(
    body: BroadcastIn,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    filt: dict = {"is_deleted": {"$ne": True}}
    if body.audience == "clients":
        filt["role"] = Role.client.value
        filt["is_admin"] = {"$ne": True}
    elif body.audience == "providers":
        filt["role"] = Role.service_provider.value
    elif body.audience == "wilaya":
        if not body.wilaya_code:
            raise HTTPException(status_code=400, detail="wilaya_code required for audience=wilaya")
        filt["wilaya_code"] = body.wilaya_code

    ids = [d["id"] async for d in db.users.find(filt, {"_id": 0, "id": 1})]
    if not ids:
        return {"sent": 0, "recipients": 0}

    data = {"title": body.title, "message": body.message}
    if body.action_url:
        data["action_url"] = body.action_url
    try:
        await send_push(
            recipients=ids,
            data=data,
            idempotency_key=f"broadcast:{user['id']}:{datetime.now(timezone.utc).timestamp()}",
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Broadcast push error (non-fatal): %s", e)
    return {"sent": len(ids), "recipients": len(ids)}


# =========================================================================
# CSV EXPORT
# =========================================================================
_EXPORTS = {"users", "providers", "bookings"}


@router.get("/admin/export/{kind}")
async def admin_export(
    kind: str,
    user: Annotated[dict, Depends(current_user)],
):
    require_admin(user)
    if kind not in _EXPORTS:
        raise HTTPException(status_code=400, detail=f"Unknown export: {kind}")

    if kind == "users":
        cursor = db.users.find({"is_deleted": {"$ne": True}}, {"_id": 0, "password_hash": 0})
        fieldnames = ["id", "role", "full_name", "email", "phone", "wilaya_code", "city", "created_at"]
    elif kind == "providers":
        cursor = db.users.find(
            {"role": Role.service_provider.value, "is_deleted": {"$ne": True}},
            {"_id": 0, "password_hash": 0},
        )
        fieldnames = [
            "id", "full_name", "email", "phone", "category", "wilaya_code", "city",
            "verification_status", "rating", "reviews_count", "hourly_rate", "created_at",
        ]
    else:  # bookings
        cursor = db.bookings.find({}, {"_id": 0})
        fieldnames = [
            "id", "status", "client_id", "provider_id", "total_dzd",
            "platform_commission_dzd", "scheduled_for", "created_at",
        ]

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    async for row in cursor:
        writer.writerow({k: row.get(k, "") for k in fieldnames})
    buf.seek(0)
    fname = f"khedmapro_{kind}_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# =========================================================================
# SUBSCRIPTION TRACKING (provider 1000 DA/mo — Chargily-powered)
# =========================================================================
@router.get("/admin/subscriptions")
async def admin_subscriptions(
    user: Annotated[dict, Depends(current_user)],
    status: Optional[str] = Query(default=None, description="active | trial | due | deactivated"),
    limit: int = Query(default=100, ge=1, le=500),
):
    """List all providers with their current subscription state (computed
    on-the-fly from `last_paid_at` + `created_at`). Payment history is
    aggregated from `subscription_payments` for a quick lifetime total."""
    require_admin(user)
    docs = await db.users.find(
        {"role": Role.service_provider.value, "is_deleted": {"$ne": True}},
        {"_id": 0, "password_hash": 0},
    ).sort("created_at", -1).to_list(500)

    out = []
    for d in docs:
        sub = compute_subscription(d)
        # Lifetime payment stats.
        agg = await db.subscription_payments.aggregate([
            {"$match": {"provider_id": d["id"], "status": "paid"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount_dzd"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        lifetime = agg[0] if agg else {"total": 0, "count": 0}

        row = {
            "id": d["id"],
            "full_name": d.get("full_name"),
            "email": d.get("email"),
            "category": d.get("category"),
            "wilaya_code": d.get("wilaya_code"),
            "subscription_status": sub["subscription_status"],
            "active": sub["active"],
            "days_until_due": sub["days_until_due"],
            "trial_ends_at": sub["trial_ends_at"],
            "last_paid_at": d.get("last_paid_at"),
            "created_at": d.get("created_at"),
            "lifetime_paid_dzd": int(lifetime["total"]) if lifetime else 0,
            "payments_count": int(lifetime["count"]) if lifetime else 0,
            "is_manually_deactivated": bool(d.get("is_manually_deactivated")),
        }

        if status:
            if status == "active" and row["subscription_status"] != "active":
                continue
            if status == "trial" and row["subscription_status"] != "trial":
                continue
            if status == "due" and row["subscription_status"] not in {"due", "expired"}:
                continue
            if status == "deactivated" and not row["is_manually_deactivated"]:
                continue
        out.append(row)
        if len(out) >= limit:
            break
    return out


@router.get("/admin/subscriptions/{provider_id}/payments")
async def admin_provider_payments(
    provider_id: str,
    user: Annotated[dict, Depends(current_user)],
):
    """Full payment history for a single provider."""
    require_admin(user)
    rows = await db.subscription_payments.find(
        {"provider_id": provider_id},
        {"_id": 0},
    ).sort("paid_at", -1).to_list(200)
    return rows


class MarkPaidIn(BaseModel):
    amount_dzd: int = Field(default=1000, ge=1)
    note: Optional[str] = None


@router.post("/admin/subscriptions/{provider_id}/mark-paid")
async def admin_mark_paid(
    provider_id: str,
    body: MarkPaidIn,
    user: Annotated[dict, Depends(current_user)],
):
    """Manually mark a provider as paid (e.g. paid via bank transfer / cash).
    Inserts a payment row + refreshes `last_paid_at` and reactivates the profile."""
    import uuid
    require_admin(user)
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await db.users.update_one(
        {"id": provider_id, "role": Role.service_provider.value},
        {"$set": {
            "last_paid_at": now_iso,
            "is_manually_deactivated": False,
            "manually_deactivated_at": None,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.subscription_payments.insert_one({
        "id": str(uuid.uuid4()),
        "provider_id": provider_id,
        "amount_dzd": body.amount_dzd,
        "paid_at": now_iso,
        "method": "manual_admin",
        "status": "paid",
        "recorded_by": user["id"],
        "note": body.note,
    })
    return {"success": True, "amount_dzd": body.amount_dzd}
