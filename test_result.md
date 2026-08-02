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
