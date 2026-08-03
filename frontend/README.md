# Frontend — Quick Start

Expo SDK 54 + expo-router + TypeScript. See `/app/README.md` for the full guide.

## Run locally (recommended — Expo Go real-device testing works out of the box)

```bash
cd frontend
yarn install
yarn expo start
```

Once Metro is up:
- Press `w` for **web preview** (http://localhost:8081)
- Press `i` for **iOS simulator** (requires Xcode)
- Press `a` for **Android emulator** (requires Android Studio)
- Scan the QR code with **Expo Go** on your phone

## Env vars (`.env`)

```ini
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

**⚠ Real-device testing:** replace `localhost` with your machine's LAN IP (e.g., `http://192.168.1.42:8001`) and open firewall port 8001.

## File layout

```
app/                      # expo-router file-based routes
├── index.tsx             # landing page
├── (auth)/               # login, register, OTP
├── (client)/             # client tabs: home / bookings / messages / profile
├── (provider)/           # provider tabs: dashboard / bookings / etc.
├── admin/                # admin verification + flags queues
├── booking/, chat/,      # detail screens
└── provider/[id].tsx     # public provider profile

src/                      # everything else
├── api.ts                # typed API client
├── auth.tsx              # auth context
├── language.tsx          # i18n (EN/FR/AR) with RTL support
└── *.tsx                 # shared components
```

## Testing

```bash
yarn tsc --noEmit                    # TypeScript type check
yarn eslint app src --ext .ts,.tsx   # lint (if configured)
```

## Common issues

| Problem | Fix |
|---------|-----|
| Blank screen | `yarn expo start -c` (clear cache) |
| "Network request failed" | Set `EXPO_PUBLIC_BACKEND_URL` to LAN IP, not localhost |
| Push notifications don't fire | Expected — only work in production builds |

## Run with Docker (optional)

Metro can also run inside Docker via the `expo` profile:

```bash
# from repo root
docker compose --profile expo up
```

⚠️ **Real-device (phone) testing works better natively** because Expo Go needs Metro reachable on your LAN. Docker Desktop (macOS/Windows) usually forwards ports fine, but on native Linux Docker you may need to set `EXPO_PACKAGER_HOSTNAME` to your machine's LAN IP in `docker-compose.yml`.
