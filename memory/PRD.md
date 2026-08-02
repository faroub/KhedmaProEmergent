# ServicePro — Product Requirements

## Overview
A professional, modern service marketplace mobile app (React Native Expo SDK 54) connecting service providers (Plumbing, Electrical, Cleaning, Carpentry, Painting, Landscaping, IT Support, Admin Education, Photography, Moving) with clients across Algeria.

## Design
Bold professional dark theme: navy (#0B1120) primary + gold (#D4AF37) accent, generous spacing, glassmorphic overlays on hero surfaces.

## User Roles
1. **Client** — browses providers, requests bookings, reviews providers after completion.
2. **Service Provider** — creates a professional profile, receives bookings, manages subscription.

## Core Features
- **Auth**: JWT-based email/password with bcrypt hashing (backend `pyjwt` + `bcrypt`). Token stored via Expo SecureStore.
- **Onboarding**: Role-branch onboarding hero → register/login.
- **Home (Client)**: Location header, search, promo banner, horizontal category chips (sticky), top-rated horizontal provider cards, full provider list.
- **Provider Detail**: Hero + avatar, verified badge, rating, bio, hourly + task rates, reviews list, sticky "Request Booking" CTA.
- **Booking Flow**: 14-day scrollable date picker, horizontal time-slot chips, hourly/task rate switch, task description, address, estimated total, confirm.
- **Bookings**: Both roles see their bookings with status tabs (pending/confirmed/completed). Providers accept/decline/complete. Clients cancel or leave review after completion.
- **Reviews**: 1–5 star rating + comment. Provider aggregate rating auto-computed.
- **Provider Dashboard**: Stats (earnings, completed, upcoming, pending), rating card, recent bookings, prominent **Subscription Banner**.

## Subscription Rules (Providers)
- **Trial**: 3 months free from registration.
- **Post-trial**: 1000 DZD/month to remain listed.
- **Payment**: `POST /api/subscription/pay` records `last_paid_at`; extends active status by 30 days.
- **Deactivation**: If unpaid after trial, `active=false` and provider is hidden from marketplace listings.
- **Deletion**: If deactivated for 12 months (no payment ever), status becomes `deactivated` (in this MVP we mark the flag; deletion job left as follow-up).

## Backend API (prefix `/api`)
- Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Public: `GET /categories`, `GET /providers`, `GET /providers/{id}`, `GET /providers/{id}/reviews`
- Client: `POST /bookings`, `GET /bookings/mine`, `POST /reviews`
- Booking mutations: `PATCH /bookings/{id}/status`
- Provider: `POST /subscription/pay`
- Dev: `POST /seed`

## Data Storage
MongoDB collections: `users`, `bookings`, `reviews`. All docs use UUID string `id`, `_id` excluded from responses.

## Business Enhancement
Subscription revenue model built-in: providers monetize the platform with a fair 3-month free trial then 1000 DZD/month recurring — the app auto-deactivates listings when unpaid, protecting client trust.

## Iteration 3 additions
- **Address autocomplete** on booking address field — powered by OpenStreetMap Nominatim (no API key), scoped to Algeria (countrycodes=dz), 350 ms debounce, min 3 chars.
- **Provider Schedule** (`/(provider)/schedule.tsx`) using `react-native-calendars` — working hours per day (Mon–Sun), open/closed toggle, time-picker modal, vacation days marker. Persists via `PUT /api/schedule`; publicly readable via `GET /api/schedule/{provider_id}`.
- **Offline cache** for both provider Schedule and per-user Bookings, using `@/src/utils/storage`. UI shows an "Offline · showing cached data" badge when the API is unreachable.
- **Real-time chat** via FastAPI WebSocket (`/api/ws/chat?token=<JWT>`) + REST fallback (`/api/chats/*`). Bubbles UI, safety banner ("no phone numbers needed"), Messages tab in both client and provider layouts. WebSocket manager is in-memory (single-instance only — needs Redis pub/sub for multi-replica).
- **RTL support** — `I18nManager.forceRTL()` toggled with the language; text-level RTL applied via `writingDirection: "rtl"` where needed. Full flex-direction RTL takes effect after an app restart on native.
- **Data safety** — public `/api/providers` endpoints omit `email` and `phone`. Passwords are bcrypt-hashed and must be ≥ 8 chars.

## Non-goals (still MVP)
- Real payment processor (Stripe/Chargily/EDAHABIA) — subscription payment is **MOCKED**.
- react-native-maps + live location tracking + background location — SKIPPED per user request.
- OTP phone-number authentication — planned for the next iteration.
- Push notifications.
- Provider photo upload.
