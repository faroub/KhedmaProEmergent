# ServicePro — Product Requirements

## Overview
A professional, modern service marketplace mobile app (React Native Expo SDK 57) connecting service providers (Plumbing, Electrical, Cleaning, Carpentry, Painting, Landscaping, IT Support, Admin Education, Photography, Moving) with clients across Algeria.

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

## Iteration 4 additions — OTP phone authentication
- **New endpoints**: `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `PATCH /api/users/me/profile`
- **Mock SMS sender** — the 6-digit code is logged to backend stderr (`MOCK OTP for +213…`). Swap `send_otp_code()` to plug in Twilio Verify / Firebase Phone Auth / a local Algerian SMS gateway.
- Algerian phone normalization: accepts `+213555000000`, `00213555000000`, `0555000000`, or `555000000` → `+213XXXXXXXXX`.
- Codes are 6-digit, expire in 5 minutes, bcrypt-hashed, single-use (atomic delete), and phone-scoped rate-limited (1 per 30 s, max 5 per hour). MongoDB TTL index cleans up stale challenges.
- Same JWT issuer as email/password login — the rest of the app works unchanged.
- New-user flow: OTP creates the user with a placeholder email `+213XXXXXXXXX@phone.khedmapro.dz`, then the app routes to a profile completion screen (name + city + provider category/rates when applicable). Role captured on first verify is never overwritten on subsequent OTP sign-ins.
- Frontend: new `/(auth)/otp.tsx` (2-step: phone → 6-digit code with a 30 s resend timer) and `/(auth)/complete-profile.tsx`. "Continue with phone" entry points added on onboarding and on the sign-in screen.

## Iteration 5 additions — Wilaya + Pin Drop + Portfolio + Reports + Booking Type
- **58 Algerian wilayas** (province code + EN/FR/AR names) served by `GET /api/wilayas`. Users pick a wilaya + free-text baladiya on their profile.
- **`/api/providers?wilaya=<code>`** — matches providers whose home wilaya matches OR who have `cross_wilaya=true`. Prevents an IT tech in Algiers from being offered a job in Blida unless they opt in.
- **Interactive pin-drop map** on the booking screen — Leaflet + OpenStreetMap tiles inside a WebView (native) / iframe (web). Works in Expo Go, web preview, and native builds without any API key. Sends `location_lat` / `location_lng` to the booking.
- **Booking type toggle** — Instant book (listed rate) vs Request quote (custom price for complex jobs).
- **Provider portfolio gallery** — `PATCH /api/users/me/portfolio` accepts up to 12 base64 JPEGs. Client-side compression via `expo-image-manipulator` (resize 1200px + quality 0.7) before upload; per-image 900 KB cap enforced server-side. Gallery rendered horizontally on the provider detail screen.
- **Report a Provider** — flag icon in the provider header opens a modal with 6 reason chips + optional details. `POST /api/reports` requires client auth and stores a moderation entry with `status: open`.
- Fresh DB reset — reseeded 12 providers with `wilaya_code` + `cross_wilaya` + baladiya on each.

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

## Iteration 16 — Expo SDK 57 upgrade
- Upgraded Expo SDK 54 → 57 (React Native 0.81 → 0.86, React 19.1 → 19.2, TypeScript 6, Reanimated 4.5, Gesture Handler 2.32, Screens 4.26). Requires Node ≥ 22.13.
- `app.json`: removed `newArchEnabled` / `edgeToEdgeEnabled` (now mandatory defaults in SDK 55+); added `@react-native-vector-icons/ionicons` config plugin.
- Icons migrated from deprecated `@expo/vector-icons` to `@react-native-vector-icons/ionicons` (41 files). Icon-name typing now uses `IoniconsIconName`. Dropped the CDN icon-font loader hook (`use-icon-fonts.ts`) — the new package loads its font itself in Expo Go.
- RN 0.86 API fixes: `StyleSheet.absoluteFillObject` removed → inline absolute style; style-factory function moved out of `StyleSheet.create` in client profile; `StatusBar backgroundColor` (no-op on edge-to-edge) removed.
- Existing native builds (APK/IPA) must be regenerated via Publish after this upgrade.

## Iteration 17 — Today's jobs reminder + category chips
- **Provider dashboard**: `src/TodayJobsCard.tsx` shows every booking with `status=confirmed` scheduled for today (local date) — time pill, client name, task, tappable address (opens Maps), and a one-tap **Call** button (`tel:` link to `client_phone`, only revealed once confirmed). Hidden when there are no jobs today. EN/FR/AR strings `dash.today*`.
- **Client home**: horizontal category chip row (All + every active category with its Ionicon) under the "Categories" title; tapping a chip filters providers (`selectedCat`), synced with the Filters sheet.
- **Client bookings tab**: `src/TodayVisitCard.tsx` — matching reminder for clients listing today's confirmed visits (provider avatar/name/category, time pill, address) with a **Message** button (opens chat) and the gated **Reveal phone** pill. EN/FR/AR strings `bookings.today*`. Test client: client.today@khedmapro.dz / password123.
- **"On my way" (provider)**: on each today's job in `TodayJobsCard`, providers tap **On my way** → pick an ETA (10/20/30/45/60 min) → an instant chat message "🚗 I'm on my way! … about {minutes} minutes (around {time})" is sent to the client via `POST /api/chats/{client_id}/messages` (also triggers the existing push). Card then shows "Client notified · arriving in ~N min" with an Update link. Hidden for guest bookings (no chat account). Strings `dash.onMyWay*` (EN/FR/AR).
- **Arrived check-in → `in_progress` status**: new `BookingStatus.in_progress`. Provider transition `confirmed → in_progress` (`PATCH /bookings/{id}/status {status:"in_progress"}`, stamps `arrived_at`, requires phone_verified); `in_progress → completed` (→ awaiting_confirmation) allowed. Server pushes "Provider arrived" and drops a chat message "📍 I've arrived and I'm starting the job now." into the client's thread (registered clients only). Phone-reveal + completion-rate logic include `in_progress`. UI: **I've arrived** button in `TodayJobsCard` (then "Checked in at HH:MM · in progress" + "Mark work done"), `arrived-*` button in provider bookings list, "In progress" translated status pill (all statuses now translated), Confirmed tab shows confirmed + in_progress, client `TodayVisitCard` shows "Provider arrived · job in progress". Admin bookings filter/colour added.
- **Bug fix**: removed a function-local `from datetime import …` in `update_booking_status` that shadowed the module import and made EVERY booking status change 500 (UnboundLocalError). 12 previously failing backend tests now pass (24 remaining failures are pre-existing: provider registration now requires a phone-verification token, tests predate that).

## Iteration 18 — Backend test suite brought back to green (179 passed, 2 skipped)
- New `backend/tests/helpers.py`: `phone_verification_token()` / `with_phone_token()` seed a deterministic OTP challenge and exchange it via `/auth/otp/verify-for-registration` — the same flow the app uses — so provider-registration tests satisfy the phone-verified requirement. `skip_if_real_payment_provider()` skips the MOCK-receipt assertions when Chargily is configured (real checkout / unreachable sandbox).
- Updated tests: iter14 happy path, iter15 (`_fresh_provider` + "new provider is verified" semantics + `_mark_unverified` for the legacy gate test), schedule_chat provider registration, otp_auth log regex (`[MOCK SMS] to=… code is NNNNNN`), account_lifecycle (`trial_days == 90`), category_split (`name_en`), iter16 marketing site (only `/api/site/`), khedmapro_api seeded-reviews lower bound, iter11 unique phone + `setdefault("booking_ids")` for xdist class distribution, portfolio_verification approve check via `/auth/me`.
- Suite is green both serially (`-n 0`) and with the configured `-n 2 --dist loadscope`. Occasional flake possible only when the preview proxy returns 502 under load.
