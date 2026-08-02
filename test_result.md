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
