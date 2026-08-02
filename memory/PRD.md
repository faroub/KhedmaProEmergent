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

## Non-goals (MVP)
- Real payment processor (Stripe) — subscription payment is currently a status-toggle endpoint (MOCKED PAYMENT).
- Chat/messaging between client & provider.
- Push notifications.
- Provider photo upload flow.
