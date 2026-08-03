# khedmaPro — Local Dev Guide

Full-stack marketplace for Algerian service providers. This guide covers running the **mobile app** (Expo SDK 54), the **backend API** (FastAPI + MongoDB), and the **marketing website** on your own machine.

---

## 📋 Prerequisites

Install these once:

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | ≥ 20 | https://nodejs.org (or `nvm install 20`) |
| **Yarn** | Classic (1.x) | `npm i -g yarn` |
| **Python** | 3.11 | https://python.org / `pyenv install 3.11` |
| **MongoDB** | ≥ 6 | https://www.mongodb.com/docs/manual/installation/ (Community Edition is fine) |
| **Expo Go** app on your phone | latest | App Store / Play Store |

Optional but nice: **VS Code**, **mongosh** (CLI for MongoDB).

---

## 🗂 Repo layout

```
/app
├── backend/                 # FastAPI + MongoDB + marketing site
│   ├── server.py            # entry point
│   ├── routes/*.py          # one file per feature area
│   ├── site/                # static marketing website (HTML + CSS)
│   ├── tests/               # pytest suite (~145 tests)
│   ├── requirements.txt
│   └── .env                 # local secrets (see below)
├── frontend/                # Expo (React Native) app
│   ├── app/                 # expo-router file-based routes
│   ├── src/                 # shared components, hooks, utils
│   ├── app.json             # Expo config
│   ├── package.json
│   └── .env                 # frontend env vars
└── README.md                # this file
```

---

## 🚀 One-time setup

**Choose one path:**

- **🐳 Docker (recommended for most devs)** — jump to [Docker Compose](#-docker-compose-one-command-dev).
- **🖥 Native (full control, best for Expo real-device testing)** — follow the steps below.

---

## 🐳 Docker Compose (one-command dev)

Skip installing MongoDB and juggling Python environments — just run:

```bash
docker compose up
```

That starts:

| Service | Port | What |
|---------|------|------|
| `mongo` | 27017 | MongoDB 6, persisted in a named volume |
| `backend` | 8001 | FastAPI with `--reload` (edits hot-reload) |

Everything is now at:
- API: http://localhost:8001
- Swagger: http://localhost:8001/docs
- Marketing site: http://localhost:8001/api/site/

### Seed sample data

```bash
curl -X POST http://localhost:8001/api/seed
```

### Include Metro/Expo too

Metro is intentionally NOT in the default profile because **Expo Go on your phone needs Metro reachable on your LAN** and Docker networking on some hosts makes that painful.

If you only want the web preview (or you're on Docker Desktop, which forwards ports transparently):

```bash
docker compose --profile expo up
```

Adds a `frontend` container exposing Metro on `http://localhost:8081`. For phone/QR scanning, edit `docker-compose.yml` and set `EXPO_PACKAGER_HOSTNAME` to your machine's LAN IP.

Otherwise, run the frontend natively (**recommended** — see [Native setup](#-native-setup) below):

```bash
cd frontend && yarn install && yarn expo start
```

### Common Docker commands

```bash
docker compose up -d                    # detached
docker compose logs -f backend          # tail backend logs
docker compose exec backend pytest -n 0 # run tests
docker compose exec mongo mongosh khedmapro
docker compose down                     # stop
docker compose down -v                  # stop + WIPE the mongo volume (fresh DB)
```

### File map for Docker

- `docker-compose.yml` — orchestration
- `backend/Dockerfile` — Python 3.11 slim + `uvicorn --reload`
- `frontend/Dockerfile` — Node 20 slim + `yarn expo start --host lan` (only when `--profile expo`)

---

## 🖥 Native setup

Same as Docker, but you install everything on the host — best for full Expo Go real-device testing.

### 1. Clone

```bash
git clone https://github.com/YOUR-ORG/khedmapro.git
cd khedmapro
```

### 2. Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` (or copy from any teammate) with at minimum:

```ini
MONGO_URL=mongodb://localhost:27017
DB_NAME=khedmapro
JWT_SECRET=change-me-to-a-32+-char-random-string
JWT_EXPIRE_MINUTES=1440
EMERGENT_PUSH_KEY=placeholder
# CHARGILY_SECRET_KEY=live_...     # optional — leave commented for mock payments
```

### 3. Frontend

```bash
cd ../frontend
yarn install
```

Create `frontend/.env` with:

```ini
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

If you're testing on a real phone, replace `localhost` with your machine's LAN IP (e.g., `http://192.168.1.42:8001`).

### 4. MongoDB

Start MongoDB:

- **macOS (Homebrew):** `brew services start mongodb-community`
- **Linux (systemd):** `sudo systemctl start mongod`
- **Windows:** MongoDB should run as a service after install.
- **Docker:** `docker run -d -p 27017:27017 --name khedmapro-mongo mongo:6`

Verify:

```bash
mongosh --eval 'db.runCommand({ping:1})'
```

---

## ▶️ Running everything

Open **three terminals** in the project root.

### Terminal 1 — Backend

```bash
cd backend
source .venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The API is now at **http://localhost:8001** and the marketing site at **http://localhost:8001/api/site/**.

### Terminal 2 — Frontend (Expo)

```bash
cd frontend
yarn expo start
```

You'll see a QR code in the terminal + a web preview URL.

- **On your phone**: open Expo Go and scan the QR code.
- **In a browser**: press `w` in the terminal to open web preview (usually http://localhost:8081).
- **iOS simulator**: press `i` (requires Xcode).
- **Android emulator**: press `a` (requires Android Studio).

### Terminal 3 — Seed data (optional but recommended)

The backend auto-seeds an admin account on first startup. For sample providers, use the built-in dev seed endpoint:

```bash
curl -X POST http://localhost:8001/api/seed
```

Default accounts (after seed):

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@khedmapro.dz` | `admin123` |
| Provider | `provider1@khedmapro.dz` | `password123` |
| OTP mock code | any phone number | `910428` |

---

## 🌐 Marketing website (static)

The website lives in `backend/site/` and is served by the same FastAPI process at `/api/site/*`.

Once the backend is running, visit:

- Home: http://localhost:8001/api/site/
- How it works: http://localhost:8001/api/site/how-it-works.html
- For providers: http://localhost:8001/api/site/for-providers.html
- Contact: http://localhost:8001/api/site/contact.html
- Terms of service: http://localhost:8001/api/site/terms.html
- Privacy policy: http://localhost:8001/api/site/privacy.html

To edit: just modify the HTML/CSS files under `backend/site/` — no build step, no framework. FastAPI serves them directly. Refresh the browser to see changes.

---

## 🧪 Testing

### Backend (pytest)

```bash
cd backend
source .venv/bin/activate
pytest -n 0                          # serial (recommended)
pytest -n 2 --dist loadscope         # parallel (default in CI)
pytest tests/test_iter14_*.py -v     # single file
```

Current suite: **145 tests passing**.

### Frontend (lint)

```bash
cd frontend
yarn tsc --noEmit                    # type check
yarn eslint app src --ext .ts,.tsx   # if eslint is configured
```

### End-to-end

Use the in-repo screenshot script or Playwright:

```bash
# Web preview at http://localhost:8081
# Use browser devtools mobile emulation (390x844) to test iPhone-like layouts.
```

---

## 🔑 Env var cheat sheet

**`backend/.env`**

| Var | Required | Purpose |
|-----|----------|---------|
| `MONGO_URL` | ✅ | MongoDB connection string |
| `DB_NAME` | ✅ | Database name (e.g., `khedmapro`) |
| `JWT_SECRET` | ✅ | 32+ char random string for signing tokens |
| `JWT_EXPIRE_MINUTES` | ❌ | Default `1440` (24h) |
| `EMERGENT_PUSH_KEY` | ❌ | Managed push relay key — leave as `placeholder` locally; auto-filled at deploy |
| `CHARGILY_SECRET_KEY` | ❌ | Real Chargily payment key. Leave unset for mock-mode payments |

**`frontend/.env`**

| Var | Required | Purpose |
|-----|----------|---------|
| `EXPO_PUBLIC_BACKEND_URL` | ✅ | Base URL of the API (http://localhost:8001 for local dev, LAN IP for real-device testing) |

Never commit real secrets. `.env` is in `.gitignore`.

---

## 🐛 Common problems

| Symptom | Fix |
|---------|-----|
| **"Cannot connect to MongoDB"** | Check `mongod` is running on port 27017. |
| **Expo blank screen** | Kill Metro, run `yarn expo start -c` to clear cache. |
| **"Network request failed" on real device** | Change `EXPO_PUBLIC_BACKEND_URL` to your machine's LAN IP (not `localhost`), and open firewall port 8001. |
| **OTP code not accepted** | In local dev the code is always `910428`. Check backend stdout for the real code if seed changed it. |
| **Push notifications don't fire** | Expected — they only work in production builds after `Publish → Generate build`. |
| **Chargily payments look fake** | You didn't set `CHARGILY_SECRET_KEY`. Mock mode is intentional for local dev. |
| **`admin@khedmapro.dz` not present** | Restart the backend once — it auto-seeds on first launch. |

---

## 🚢 Deploy

We use Emergent's built-in deploy flow. Click **Publish** (top-right) in the Emergent dashboard → **Deploy your app** → **Generate iOS and Android builds**.

The marketing site is deployed automatically alongside the API. Once deployed, it's reachable at `https://YOUR-DOMAIN/api/site/`.

For details on the deployment prerequisites (Firebase `google-services.json`, APNs `.p8` key, App Store / Play Store credentials), see `/app/test_result.md` under "Iteration 13/15".

---

## 📚 More reading

- `/app/test_result.md` — Iteration-by-iteration change log with test results.
- `/app/memory/test_credentials.md` — Every test account and default password.
- `/app/backend/tests/` — Living examples of every API contract.

Happy hacking! 🇩🇿
