#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iteration 7 — Account lifecycle + Offline bookings entry
### Backend
- task: "POST /api/users/me/deactivate, /reactivate, /delete"
  implemented: true
  working: true
  file: "/app/backend/server.py"
  stuck_count: 0
  priority: "high"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "13/13 new tests in /app/backend/tests/test_account_lifecycle.py — provider1 full lifecycle + fresh-client lifecycle. Deactivate flips is_manually_deactivated=true and hides from /api/providers; deactivated provider bookings return 410. Reactivate clears the flag. Delete blocks subsequent login (410) and /auth/me (410). All executed against EXPO_PUBLIC_BACKEND_URL. Restored provider1 via motor Mongo update for re-runs."
- task: "GET /api/subscription/status, POST /api/subscription/pay (MOCK)"
  implemented: true
  working: true
  file: "/app/backend/server.py"
  stuck_count: 0
  priority: "high"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "Status returns trial/active correctly with fee_dzd=1000, trial_months=3, days_until_due=89. Pay endpoint records subscription_payments doc, sets last_paid_at, clears manual deactivation, flips status to active, days_until_due≈30."

### Frontend
- task: "Provider Profile subscription card + Danger zone (deactivate/reactivate/delete/pay)"
  implemented: true
  working: true
  file: "/app/frontend/app/(client)/profile.tsx"
  stuck_count: 0
  priority: "high"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "subscription-card shows 'Free trial' + '89 days left'; pay-btn labeled 'Pay 1000 DZD'; deactivate-btn opens confirm-modal, confirm-ok flips UI to reactivate-btn + deact-banner; reactivate-btn restores state. Delete-btn cancel path (confirm-cancel) closes modal cleanly and preserves the account. Arabic language switch renders Arabic strings and visually right-aligns content (RN-web flexbox, not document.dir). Verified against http://localhost:3000 mobile viewport 390x844."

- task: "Offline-first bookings screen (last-sync, offline badge)"
  implemented: true
  working: true
  file: "/app/frontend/app/(client)/bookings.tsx"
  stuck_count: 0
  priority: "medium"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "Empty bookings loads without crash. [data-testid=last-sync] displays 'Last synced · HH:MM:SS'. offline-badge correctly absent while browser is online."

## agent_communication
  - agent: "testing"
    message: "iteration_7 complete. 56/56 backend tests pass sequentially (13 new lifecycle + 43 regression). All requested frontend flows verified end-to-end in web preview. No blocking issues. RTL is rendered via component-level flexbox rather than DOM `dir` attribute — visually correct, flagged as a soft nit only. Provider1 was restored in DB after the suite so re-runs are safe."

## Iteration 8 — Rich Portfolios + Provider Verification + Arabic زبون
### Backend
- task: "PATCH /api/users/me/portfolio (rich object + legacy strings + cover rules + 900 KB cap)"
  implemented: true
  working: true
  file: "/app/backend/server.py"
  stuck_count: 0
  priority: "high"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "6/6 pytest cases: objects with is_cover=true preserved (only first flagged wins), legacy strings normalized to {url,caption:null,tags:[],is_cover: i==0}, auto-cover falls back to index 0, oversize URL (>900KB) → 413, serialize_user + public /providers/{id} both return the rich shape, email/phone excluded from public detail."
- task: "Provider verification submit/status/delete + admin approve/reject/pending queue"
  implemented: true
  working: true
  file: "/app/backend/server.py"
  stuck_count: 0
  priority: "high"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "11/11 pytest cases: /verification/submit persists docs with server-assigned uuid + status='pending' + submitted_at; /verification/status reflects pending+documents; DELETE /verification/documents/{id} removes a doc; oversize doc → 413; /admin/verification/pending returns provider1, non-admin → 403; /admin/verification/{id} returns 200 (admin) / 403 (non-admin); reject sets verification_reject_reason; approve flips is_verified true on public /providers/{id}. All state rolled back via Motor cleanup fixture."
- task: "Admin seed (admin@khedmapro.dz / admin123, is_admin=true)"
  implemented: true
  working: true
  file: "/app/backend/server.py"
  stuck_count: 0
  priority: "high"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "3/3 pytest cases: login succeeds, /auth/me returns is_admin:true, provider1 /auth/me returns is_admin:false."

### Frontend
- task: "PortfolioManager on provider dashboard renders without runtime errors"
  implemented: true
  working: true
  file: "/app/frontend/src/PortfolioManager.tsx"
  stuck_count: 0
  priority: "medium"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "portfolio-manager + portfolio-add-btn testIDs render on /dashboard after provider1 login. Empty portfolio → no portfolio-thumb-{i}/cover/remove elements which is expected. Zero pageerror/console errors during load."
- task: "Provider public detail page — portfolio thumbs + verified-badge conditional"
  implemented: true
  working: true
  file: "/app/frontend/app/provider/[id].tsx"
  stuck_count: 0
  priority: "medium"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "verified-badge correctly absent for unverified provider1. detail-viewer-close + portfolio-{i} testIDs wired in source; not exercised because provider1 portfolio is empty (as allowed by the request)."
- task: "VerificationCard on provider profile (verify-open-uploader → sheet with 4 doc rows, verify-submit disabled)"
  implemented: true
  working: true
  file: "/app/frontend/src/VerificationCard.tsx"
  stuck_count: 0
  priority: "high"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "verification-card visible on provider1 profile with 'Not verified' badge and copy 'Trust & verification'. verify-open-uploader opens a modal exposing verify-doc-id_recto / verify-doc-id_verso / verify-doc-certification / verify-doc-background_check. verify-submit initially disabled (canSubmit=false because required docs missing)."
- task: "Admin panel link + /admin/verification queue screen"
  implemented: true
  working: true
  file: "/app/frontend/app/admin/verification.tsx"
  stuck_count: 0
  priority: "high"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "admin-panel-link visible on admin@khedmapro.dz profile only; tapping navigates to /admin/verification which renders 'Verification queue' header + 'No pending verifications 🎉' empty state + admin-refresh button. Provider1 hitting /admin/verification directly sees the 'Admin access required' locked empty state as designed."
- task: "Arabic terminology fix — عميل replaced with زبون"
  implemented: true
  working: true
  file: "/app/frontend/src/language.tsx"
  stuck_count: 0
  priority: "medium"
  needs_retesting: false
  status_history:
    - working: true
      agent: "testing"
      comment: "Ripgrep across /app/frontend confirms zero occurrences of عميل; all client-facing Arabic strings (auth.client, otp.roleClient, profile.guest*, review.needAccountSub, bookings.noteSub) now use زبون. After switching provider1 profile to Arabic, page HTML contains neither عميل (removed) nor زبون (not shown because provider1's role pill reads 'Provider')."

## agent_communication
  - agent: "testing"
    message: "iteration_8 complete. 20/20 new pytest cases pass in /app/backend/tests/test_portfolio_verification.py (report /app/test_reports/pytest/pytest_iter8.xml). All requested frontend testIDs verified on mobile viewport 390×844. All portfolio + verification mutations rolled back via session-scoped Motor cleanup — provider1 is back to unverified/empty for future test runs. No blocking issues found in Groups A/B/C. Note for future runs: on the web preview, JWT is in-memory only, so use in-app tab navigation to move between screens rather than `page.goto`, otherwise auth state is dropped."

## iteration_9 — admin_education category split (regression)
  - task_id: "category_split_regression"
    status: "PASS"
    scope: "backend GET /api/categories + /api/providers filter; frontend guest home chip strip in EN/FR/AR"
    backend: "5/5 pytest passing in /app/backend/tests/test_category_split.py (JUnit /app/test_reports/pytest/pytest_iter9_category_split.xml). Legacy admin_education absent from /api/categories and from Mongo (count_documents == 0). admin_consulting → Leila Bensalem, education → Nassim Bouzid. Legacy filter returns []."
    frontend: "10/10 Playwright assertions passing (mobile 390×844). Both cat-chip-admin_consulting and cat-chip-education render on the client home tab as guest. Legacy cat-chip-admin_education is gone. Tapping Education chip loads Nassim Bouzid; tapping Administrative Consultants loads Leila Bensalem. Localized labels verified in EN / FR (Consultants administratifs, Éducation (cours particuliers)) / AR (استشاريون إداريون, التعليم (دروس خصوصية)). Old Arabic string دعم إداري وتعليمي absent from AR home screen."

## agent_communication
  - agent: "testing"
    message: "iteration_9 complete. Read-only regression for the admin_education → admin_consulting + education split. Backend 5/5 and Frontend 10/10 all green. No mutations to seed data. See /app/test_reports/iteration_9.json for the full breakdown."

## Iteration 10 — Backend regression after server.py modular refactor (Jan 2026)

The 1658-line `server.py` was split into `config/database/schemas/reference_data/security/subscription/deps/phone/ws_manager` modules plus a `routes/` package (auth, otp, users, providers, bookings, reviews, subscription, verification, schedule, messages, reports, metadata, seed). Regression was run against the pre-existing pytest suite at `/app/backend/tests/`: **80/81 tests pass under the default `-n 2 --dist loadscope` xdist config**. The only two red items — `tests/test_category_split.py::test_mongo_no_admin_education_rows` (asyncio "no current event loop" on worker) and the session-scope `_cleanup_db` teardown from `tests/test_portfolio_verification.py` (same asyncio pattern, surfaces on the last case of `test_schedule_chat.py`) — are the reviewer-acknowledged pre-existing flakes; both **PASS in isolation** with `--override-ini="addopts=-n 0"`. All 8 targeted smoke checks in the newly added `/app/backend/tests/test_refactor_smoke.py` pass: `GET /api/` → `{message:"khedmaPro API",status:"ok"}`; `/api/categories` returns 11 entries with `admin_consulting` + `education` and no `admin_education`; `/api/wilayas` returns 58; admin login yields `user.is_admin=true`; provider1 login yields `subscription_status="trial"` with `days_until_due>0`; `/api/providers` returns providers whose `portfolio_images` is an object-shaped list (list of dicts) with `email`/`phone` correctly excluded; `/api/ws/chat?token=<invalid>` closes with code 1008 and `?token=<valid>` is accepted. No API contract, response shape, or business-logic regression detected — the refactor is safe. Frontend was intentionally not tested per the review request. JUnit reports: `/app/test_reports/pytest/pytest_iter10.xml`, `/app/test_reports/pytest/pytest_iter10_smoke.xml`, `/app/test_reports/pytest/pytest_iter10_full.xml`.

## Iteration 11 — 2026-01 — new features (phone-gate, 2-step completion, auto-flag, Chargily)
Backend: 18/18 pytest PASS in tests/test_iter11_new_features.py.
  * Phone reveal gated by booking status; 400 own-id; 403 no-booking; 200 after confirm; phone_reveals row persisted.
  * PATCH bookings/{id}/status two-step: provider pending→completed 400; provider confirmed→completed transitions to awaiting_confirmation with provider_marked_done_at; client awaiting_confirmation→completed with client_confirmed_done_at; client cannot set confirmed (403); client cannot complete before provider done (400).
  * Auto-flag: 3+ stale confirmed bookings trigger is_flagged=true, search_penalty=100, is_manually_deactivated=true, flags row; admin GET /admin/flags lists provider; admin POST /admin/flags/{id}/clear resolves and reactivates; non-admin 401/403.
  * Chargily webhook: missing signature 400 (in-suite); bogus signature 403 (verified out-of-band with CHARGILY_WEBHOOK_SECRET=test_dummy_key); valid HMAC → 400 "Invalid event" on empty payload. Env restored.
  * /subscription/pay mock unchanged: {provider:"mock", success:true, amount_dzd:1000, user}.
Frontend smoke (390x844): provider1 login → Profile → pay-btn tap flipped subscription from "Free trial · 89 days" to "Active subscription · Renews in 29 days" (mock success); bookings-tab-all testID + empty state present. No red screen, no console errors.
Cleanup verified: 0 leftover TEST bookings/clients/flags/reveals/mock payments; provider1 fully reset.
No defects. See /app/test_reports/iteration_11.json for details.

---
## Iteration 12 — Radius-based provider search (Aug 2026)

### Backend (14/14 passed sequentially)
- `GET /api/providers` (no coords) → all providers, no `distance_km`. ✅
- Radius mode Algiers 15 km → distances 0–15 km, haversine verified server-side, sorted ascending. ✅
- Radius + `category=plumbing` combo works. ✅
- Radius mode Oran 15 km → returns Nassim Bouzid, Leila Bensalem, Karim Belkacem. ✅
- Radius 1 km → all returned providers within 1 km (jitter admits a few). ✅
- Validation → 422 on `lat=200`, `radius_km=-5`, `radius_km=600`. ✅
- Partial params (only lat/lng or only radius) → radius mode NOT activated. ✅
- `PATCH /api/users/me/profile` persists `location_lat`/`location_lng`; `GET /api/auth/me` reflects; restored to backfilled values. ✅
- Regression: `?category=cleaning` and `?wilaya=16` still work, no `distance_km` leak. ✅
- Startup backfill: provider1 coords near (36.7538, 3.0588) with ±0.02 jitter. ✅

### Frontend smoke (390x844, geolocation @ Algiers)
- All 7 scope chips render with test IDs `scope-2/5/10/25/50/wilaya/country`.
- `scope-25` displays distance chips ("km away").
- `scope-country` shows 23 providers, no distance chips.
- `scope-wilaya` reveals `home-wilaya-picker`.
- Denied-location: app falls back gracefully to All Algeria (23 providers), no crash. `location-denied-hint` did not render but behavior is within spec.

### Notes
- One flaky race: `TestProfileLocationUpdate` + `TestBackfill` under pytest-xdist can conflict (both touch provider1). Run with `-o addopts=''` — see `/app/test_reports/iteration_12.json`.
- Non-blocking console warning: `props.pointerEvents is deprecated` — migrate to `style.pointerEvents`.

Report: `/app/test_reports/iteration_12.json`
JUnit: `/app/test_reports/pytest/pytest_iter12.xml`

---
## Iteration 13 — Push notifications (Emergent-managed relay) (Aug 2026)

### Backend
- New route `/api/register-push` (POST) added via `backend/routes/push.py`. Body `{user_id, platform, device_token}` → forwards to `POST /api/v1/push/users/register` with `X-Push-Key: $EMERGENT_PUSH_KEY`.
- `send_push(recipients, data, idempotency_key?)` helper: hits `POST /api/v1/push/trigger`. Skips guest recipient IDs (`guest:*`), dedupes, chunks at 100. Never raises to caller.
- Wired non-blocking `send_push` calls into event handlers:
  * Bookings: new booking → provider; PATCH status → counterpart (confirmed / awaiting_confirmation / completed / cancelled).
  * Messages: new chat message → recipient.
  * Reviews: new review → provider.
  * Verification: admin approve/reject → provider.
- `.env`: `EMERGENT_PUSH_KEY=placeholder` added (deployer replaces at build time).
- Regression: 120/120 tests pass serially (`-n 0`). The xdist-parallel failures on iter11 auth-flag classes are pre-existing (shared class state + `--dist loadscope`), not caused by push.

### Frontend
- `expo-notifications` (0.32.17) + `expo-device` (8.0.10) installed via `yarn expo install`.
- `app.json`: `expo.plugins` includes `expo-notifications` block; `expo.android.googleServicesFile: "./google-services.json"`; `POST_NOTIFICATIONS` permission added.
- `frontend/google-services.json` provisioned from user-uploaded artifact (Firebase project `khedmapro-69441`).
- `app/_layout.tsx`: module-scope `setNotificationHandler`, Android `setNotificationChannelAsync("default", MAX)`, `addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync` cold-start check, denied-permission weekly nudge via AsyncStorage. Web-guarded throughout.
- `src/push.ts`: `registerForPush(userId)` — requests permission → `getDevicePushTokenAsync()` (native, NOT Expo token) → POST `/api/register-push`.
- Called from `AuthProvider.login/register/refresh` and on bootstrap when a session exists.

### Notes
- **Package name mismatch**: the user-supplied `google-services.json` targets `com.khedmapro.app`, while `app.json` has `com.emergent.serviceproapp.porjq5`. Android FCM registration will only succeed after either (a) regenerating the Firebase Android app with the correct package or (b) updating `expo.android.package`. This does NOT affect the code path — only the delivered notification will fail silently on Android until the package matches.
- Push notifications do NOT work in Expo Go or on web (all APIs guarded off). Must be tested on a production/dev-client build after `Publish` → `Generate`.
- `EMERGENT_PUSH_KEY` is intentionally left as `placeholder`; the deployer replaces this at build time. Do NOT edit.

### Iteration 13 test suite
- `backend/tests/test_iter13_push.py`: 3/3 pass. Endpoint reachable (returns mapped 500 with placeholder key), rejects malformed bodies (422).

---
## Iteration 14 — Admin Flags UI + Reveal Phone + Mandatory provider fields (Aug 2026)

### Backend
- **`routes/auth.py`**: provider registration now enforces
  * `phone` — required, must be a valid Algerian mobile (E.164 normalized via `normalize_dz_phone`)
  * `wilaya_code` — required, must be one of the 58 valid DZ wilayas
  * duplicate phone (409) is rejected
  * FIX: `phone_e164` is only added to the user doc when a normalized value exists (the sparse unique index rejects explicit `null`)
- Client registration remains unchanged (phone/wilaya optional).

### Frontend
- **New: `app/admin/flags.tsx`** — Admin-only screen mirroring the verification queue pattern. Lists all auto-flagged providers, shows a detail sheet with reason/timestamp/completion rate, exposes a "Clear flag & reactivate" action. Non-admin users see a locked-state UI with a "Back to app" CTA.
- **Profile → Admin section**: added second card that deep-links to `/admin/flags`.
- **New: `src/RevealPhoneButton.tsx`** — Reusable component that calls `GET /api/users/{id}/phone` and gracefully surfaces the "phone hidden — reveal after confirmation" state. Supports two variants (full-row for bookings, compact pill for chat header). Post-reveal shows a "Call" action via `Linking.openURL('tel:...')`.
- **`(client)/bookings.tsx`**: replaced the static `client_phone` inline display with the gated `RevealPhoneButton` for every booking that has a real (non-guest) counterpart. Provider-side auth-bookings still show the raw `client_phone` where the API returns it (for backwards compatibility).
- **`chat/[otherId].tsx`**: compact `RevealPhoneButton` docked in the header, replacing the empty spacer.
- **`(auth)/register.tsx`**: for providers, the phone field label switches to "Phone (required)"; a `WilayaPicker` is now inline. Client-side validation:
  * DZ mobile regex (accepts +213, 00213, or leading-0 forms; strips whitespace/punctuation)
  * wilaya_code must be selected
- **Language keys** (EN/FR/AR): `flags.*`, `reveal.*`, `auth.phoneRequired`, `auth.wilayaRequired`, `auth.errPhoneProvider`, `auth.errWilaya`.

### Iteration 14 test suite
- `backend/tests/test_iter14_flags_reveal_register.py`: **10/10 pass** covering
  * 4x provider registration validation (missing phone, missing wilaya, invalid wilaya code, bad phone format)
  * 2x happy paths (provider with valid phone+wilaya → 201; client with no phone → 201)
  * 2x admin flags endpoint contract (admin 200, non-admin 403)
  * 2x reveal-phone endpoint contract (own id 400, no active booking 403)
- `test_schedule_chat.py::test_default_schedule_returned_when_none_saved` updated to include phone+wilaya (new mandatory fields).

### Regression
**Full suite: 133/133 pass** serially (`-n 0`, deselecting one pre-existing seed test). Zero regressions across all previous iterations.

### Frontend verification
- Web preview at `localhost:3000` renders cleanly.
- Provider registration screen screenshot confirms `Phone (required)` label, `Wilaya (required)` picker + service category are all present.
- Admin-forbidden state screenshot on `/admin/flags` confirms the guard works for non-admin users (localised copy visible).

### Notes for the user
- The DZ phone regex accepts any of: `+213555010101`, `00213555010101`, `0555010101`. Landlines (leading 2/3/4) are rejected — providers must have a mobile number.
- Wilaya selection uses the shared `WilayaPicker` (already used on the client home). Search + 58 wilayas supported in EN/FR/AR.
- Reveal endpoint contract unchanged — only unlocks the phone when at least one booking between the two parties is in `confirmed`, `awaiting_confirmation`, or `completed` state.

---
## Iteration 15 — Package rename + best-effort phone verification + wilaya backfill (Aug 2026)

### Package rename (P0)
- `app.json`: `ios.bundleIdentifier` and `android.package` both changed from `com.emergent.serviceproapp.porjq5` to **`com.khedmapro.app`** (matches user-provided `google-services.json`).

### Best-effort phone verification (P2)
- **Schema**: added `phone_verified: bool` + `phone_verified_at` to user docs. `serialize_user` exposes `phone_verified`.
- **OTP flow (`routes/otp.py`)**: `POST /auth/otp/verify` now sets `phone_verified=True` for both the new-user and existing-user branches.
- **New endpoint** `POST /auth/verify-my-phone` — authenticated user submits a code to verify the phone already on file. Reuses the existing OTP challenge; does NOT mint a new token. Returns updated serialized user.
- **Booking gate** (`routes/bookings.py::update_booking_status`): providers cannot transition a booking to `confirmed`, `awaiting_confirmation`, or `completed` unless `phone_verified=True`. Providers CAN still `cancel` (never dead-end the user).
- **Seed** (`routes/seed.py`): seeded providers get `phone_verified=True` + `phone_verified_at` so demo flows work out of the box. Existing DB providers migrated via one-shot mongosh update.
- **Frontend**:
  * `src/PhoneVerifyBanner.tsx` — full red banner + modal flow (Send code → Enter 6-digit → Verify). Rendered on provider dashboard AND at the top of the shared bookings list (only visible when `user.role === "service_provider" && !phone_verified`). Screenshot confirmed on the dashboard.
  * `src/api.ts::verifyMyPhone(code)` helper.
  * `User` type extended with `phone_verified?: boolean`.
  * EN/FR/AR strings for the entire flow.
- **Testing note**: OTP remains MOCKED — deterministic bcrypt hash of code `910428` is inserted directly in `iter15` tests to avoid depending on backend stdout.

### Wilaya backfill endpoint (P2)
- **New endpoint** `POST /api/admin/backfill/wilaya` (admin only). Body: `{default_wilaya: "16", dry_run: false}`.
  * Validates the wilaya against the 58-entry list → 400 on bad codes.
  * `dry_run=true` returns `{dry_run, would_update, default_wilaya}` without writing.
  * Live run returns `{updated, default_wilaya}` and stamps `wilaya_backfilled_at`.
  * Idempotent — subsequent runs return `updated: 0`.
- Called once via `mongosh` on the test DB to backfill existing seeded providers.

### Iteration 15 test suite
- `backend/tests/test_iter15_phone_verify_backfill.py`: **12/12 pass**
  * `phone_verified=False` at registration.
  * `verify-my-phone` happy path (deterministic mock OTP), invalid code (401), malformed body (422), unauthenticated (401).
  * Booking confirmation blocked for unverified provider (403) with human-readable detail; cancels remain allowed.
  * Verified provider can confirm (200).
  * Backfill: admin-only (403), dry-run no-write, live write, idempotency, rejects bad code.

### Regression
**Full suite: 145/145 pass** serially (`-n 0`). Zero regressions.

### Next Action Items
- ⏭ Real SMS provider — currently OTP is MOCKED (fixed code `910428`). For prod launch, integrate an SMS gateway (Twilio, Vonage, or a local Algerian provider).
- ⏭ Optional: expose a shortcut on the profile screen to trigger phone verification without leaving the tab.

## Iteration 18 — Test suite repair (Sep 2026)
- Root causes of the 24 stale failures: (1) provider registration now requires an OTP `phone_verification_token`; (2) MOCK SMS log format changed; (3) settings renamed `trial_months`→`trial_days`; (4) categories are tri-lingual (`name_en`); (5) Chargily test key configured → `/subscription/pay` no longer returns the mock receipt; (6) `/site/` on the public URL is the Expo app, marketing site lives at `/api/site/`; (7) review counts polluted by other suites.
- Fixes live in `backend/tests/helpers.py` + targeted edits per file. Result: **179 passed, 2 skipped** (parallel + serial), verified 4× in a row.
