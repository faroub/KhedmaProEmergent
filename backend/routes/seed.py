"""Dev-only seed endpoint — populates providers and fake reviews.

Access modes (P8, tightened by P35):
- `APP_ENV` in development/test AND `ALLOW_DEV_SEED` (its default there):
  anyone may call it, and the seeded providers get the well-known
  dev password (see scripts/seed_dev.py).
- Otherwise (production, or the flag explicitly turned off): requires an
  admin token, and providers get random passwords returned once in the
  response so they can be handed out.
- `APP_ENV=production`: the route does not exist at all — 404 for everyone,
  admins included (scripts/seed_dev.py likewise refuses to run). Staging
  data must come from the CLI or a non-production APP_ENV.

The seeding logic lives in scripts/seed_dev.py so it can also run from the
command line — where it refuses APP_ENV=production outright.
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException

from config import ALLOW_DEV_SEED, APP_ENV
from deps import optional_current_user, require_admin
from scripts.seed_dev import perform_seed

router = APIRouter(tags=["seed"])


@router.post("/seed")
async def seed_data(admin: Annotated[Optional[dict], Depends(optional_current_user)] = None):
    if APP_ENV == "production":
        raise HTTPException(status_code=404, detail="Not found")
    # Outside development the route is admin-only and never creates accounts
    # with known passwords, even when ALLOW_DEV_SEED=true is set explicitly.
    dev_mode = APP_ENV in ("development", "test") and ALLOW_DEV_SEED
    if not dev_mode:
        if admin is None:
            raise HTTPException(status_code=401, detail="Seeding is disabled — admin access required")
        require_admin(admin)
    return await perform_seed(dev_passwords=dev_mode)
