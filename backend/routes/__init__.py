"""khedmaPro API routers.

Each module exposes a `router = APIRouter(...)` that is composed by
`build_api_router()` into a single `/api` router mounted by the FastAPI app.
"""
from fastapi import APIRouter

from . import (
    auth,
    otp,
    users,
    providers,
    bookings,
    reviews,
    subscription,
    verification,
    schedule,
    messages,
    reports,
    metadata,
    seed,
    phone_and_flags,
    webhooks,
    push,
    categories_admin,
    admin_dashboard,
    ads,
    provider_analytics,
)


def build_api_router() -> APIRouter:
    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(otp.router)
    api.include_router(users.router)
    api.include_router(providers.router)
    api.include_router(bookings.router)
    api.include_router(reviews.router)
    api.include_router(subscription.router)
    api.include_router(verification.router)
    api.include_router(schedule.router)
    api.include_router(messages.router)
    api.include_router(reports.router)
    api.include_router(metadata.router)
    api.include_router(seed.router)
    api.include_router(phone_and_flags.router)
    api.include_router(webhooks.router)
    api.include_router(push.router)
    api.include_router(categories_admin.router)
    api.include_router(admin_dashboard.router)
    api.include_router(ads.router)
    api.include_router(provider_analytics.router)
    return api
