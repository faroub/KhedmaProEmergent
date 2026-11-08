# Backend — Quick Start

FastAPI + MongoDB + static marketing site. See `/app/README.md` for the full guide.

## Run with Docker (easiest)

From the repo root:

```bash
docker compose up
```

This spins up MongoDB and the backend together. API on http://localhost:8001, marketing site at http://localhost:8001/api/site/.

## Run locally (native)

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Requires MongoDB running on `mongodb://localhost:27017` (or set `MONGO_URL` in `.env`).

## URLs (once running)

| What | URL |
|------|-----|
| API base | http://localhost:8001 |
| API docs (Swagger) | http://localhost:8001/docs |
| Marketing site | http://localhost:8001/api/site/ |

## Env vars (`.env`)

```ini
MONGO_URL=mongodb://localhost:27017
DB_NAME=khedmapro
JWT_SECRET=change-me
JWT_EXPIRE_MINUTES=720
EMERGENT_PUSH_KEY=placeholder
# CHARGILY_SECRET_KEY=live_...   # optional
```

## Tests

```bash
pytest -n 0                     # serial (recommended)
pytest tests/test_iter15_*.py   # single file
```

Current suite: **212 tests passing** (serial `-n 0`, fresh database). The two
payment-receipt assertions skip only when `CHARGILY_SECRET_KEY` is set.

## Seed sample data

```bash
python scripts/seed_dev.py        # or: curl -X POST http://localhost:8001/api/seed
```

This only seeds sample providers — it does **not** create an admin account.
Admins are provisioned explicitly with `python scripts/create_admin.py`
(minimum 12-character password, or the script exits with an error).

The seed is development-only. `ALLOW_DEV_SEED` defaults to `true` only when
`APP_ENV` is `development` or `test`, and `scripts/seed_dev.py` refuses to run
in production outright. Outside development the endpoint requires an admin
token and seeded providers get random one-time passwords (returned in the
response) instead of the documented dev password:

```bash
curl -X POST http://localhost:8001/api/seed -H "Authorization: Bearer <ADMIN_JWT>"
```
