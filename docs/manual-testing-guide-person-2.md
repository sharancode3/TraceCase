# TraceCase Person 2 Manual Testing Guide

**Date:** 21 October 2026  
**Scope:** Person 2 Verification (Target, Seeded Defect, Fixtures, AI Planning, Evaluation Harness, and TC4 Redaction)  
**Document Path:** `docs/manual-testing-guide-person-2.md`  

---

## 1. Running Services Status

The local development environment has been initialized. All background services were verified via HTTP health endpoints and process inspection without launching a browser or making external API calls.

| Service | Actual URL / Port | Process / Task ID | Status | Mode / Implementation Reality | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Demo Target (Buggy)** | `http://localhost:3005` | Task `task-2407` | **RUNNING** (HTTP 200) | **Live Functional** (`v1.0.0-buggy`) | Hosts seeded array index deletion defect and scoped webhooks. |
| **Demo Target (Fixed)** | `http://localhost:3006` | Task `task-2411` | **RUNNING** (HTTP 200) | **Live Functional** (`v1.0.1-fixed`) | Independent baseline instance confirming correct deletion behavior. |
| **Worker Daemon** | `http://localhost:3001` | Task `task-2415` | **RUNNING** (HTTP 200) | **Idle Diagnostic Scaffold** | Background worker health check (`status: "idle_waiting_queue"`). Live queue consumption and browser dispatch pending Person 1 Stage 4. |
| **Web Application** | `http://localhost:3000` | Task `task-2423` | **RUNNING** (HTTP 200) | **Preview / Synthetic** (`DEV_PREVIEW_MODE=true`) | Next.js UI frontend displaying mock investigation fixtures. |
| **Local Model Runtime** | `http://localhost:11434` | Pre-existing daemon | **RUNNING** (HTTP 200) | **Local Inference** (`qwen2.5-coder:3b`, `phi4-mini:latest`) | Zero-cost local Ollama inference runtime ($0.0000 API spend). |
| **PostgreSQL Database** | `localhost:5432` | Pre-existing (PID 8440) | **RUNNING** (Port open) | **Local Persistence** | Local database instance for Drizzle ORM migrations and queue persistence. |

---

## 2. Numbered "Start Here" Instructions

Follow these sequential steps to begin your manual verification:

1. **Verify Target Availability:**
   - In your browser or terminal, verify both demo target endpoints respond:
     - Buggy: `http://localhost:3005/api/health`
     - Fixed: `http://localhost:3006/api/health`
2. **Execute Section A Manual Tests:**
   - Follow **Test MT-01** through **MT-05** to test the demo target UI, array offset defect, fixed baseline, authenticated reset, readback verification, and TC4 diagnostic leak.
3. **Execute AI Planning Standalone Checks:**
   - Run the standalone CLI evaluation suite via **Test MT-06** to compare vague vs. complete bug report interpretations.
4. **Review Section B (Blocked Integrations):**
   - Confirm which end-to-end features (live approval button, browser execution, live artifact extraction) are currently blocked by pending Person 1/Person 3 modules.
5. **Fill the Results Table:**
   - Record your findings in Section 4.
6. **Perform Safe Shutdown:**
   - When finished testing, follow the shutdown commands in Section 6 to terminate only the background services started for this session.

---

## 3. Detailed Manual Test Checklist

### Section A: Tests You Can Perform Now

#### Test MT-01: Demo Target Initial State & Array Index Offset Defect (Buggy Build)
- **Purpose:** Verify the seeded bug in `v1.0.0-buggy`: with the "Active" filter applied, deleting the active task (Task B) deletes the completed task (Task A) instead.
- **Prerequisites:** Demo target running on `http://localhost:3005`.
- **Target URL:** `http://localhost:3005`
- **Initial Verification:**
  - View the task list under "All".
  - Confirm initial tasks:
    - **Task A** (`id="task_a"`): "Complete quarterly security audit" (Status: Completed, strike-through)
    - **Task B** (`id="task_b"`): "Update production dependencies" (Status: Active)
- **Step-by-Step Actions:**
  1. Click the **Active** filter button (`#filter-active`).
     - Expected: Task A is hidden; only Task B is visible.
  2. Click the **Delete** button next to Task B (`button[data-task-id="task_b"]`).
  3. Click the **All** filter button (`#filter-all`).
- **Expected Visible Result:**
  - Task B ("Update production dependencies") is **still present** in the list.
  - Task A ("Complete quarterly security audit") has been **unexpectedly deleted**.
- **What Counts as Failure:**
  - Task B is deleted and Task A remains.
  - Both tasks remain or an unhandled 500 server crash occurs.
- **Evidence to Record:**
  - Screenshot of the task list after switching back to "All" showing Task B present and Task A missing.
- **Restoration:**
  - Execute MT-03 (Authenticated Reset) to restore Task A and Task B.

---

#### Test MT-02: Demo Target Fixed Baseline Verification (Fixed Build)
- **Purpose:** Verify the fixed build (`v1.0.1-fixed`) on port 3006 correctly deletes Task B when filtered by "Active" without affecting Task A.
- **Prerequisites:** Demo target running on `http://localhost:3006`.
- **Target URL:** `http://localhost:3006`
- **Initial Verification:**
  - Confirm initial tasks under "All": Task A (Completed) and Task B (Active).
  - Verify footer displays `Build: v1.0.1-fixed`.
- **Step-by-Step Actions:**
  1. Click the **Active** filter button (`#filter-active`).
     - Expected: Only Task B is visible.
  2. Click the **Delete** button next to Task B.
  3. Click the **All** filter button (`#filter-all`).
- **Expected Visible Result:**
  - Task B is **gone**.
  - Task A ("Complete quarterly security audit") **remains intact**.
- **What Counts as Failure:**
  - Task A is deleted instead of Task B.
  - Task B remains visible.
- **Evidence to Record:**
  - Screenshot showing Task A present and Task B removed under `v1.0.1-fixed`.
- **Restoration:**
  - Execute MT-03 against port 3006.

---

#### Test MT-03: Authenticated Fixture Reset & Readback Verification
- **Purpose:** Verify that reset requires authorization, resets task identities and statuses, and readback returns verifiable entity details (not merely HTTP 200).
- **Prerequisites:** Terminal with `curl` or PowerShell.
- **Commands to Run:**

1. **Unauthorized Reset Attempt (Negative Check):**
   ```bash
   curl -s -X POST http://localhost:3005/api/test/reset-fixture -H "Content-Type: application/json" -d "{\"fixtureScope\": \"default\"}"
   ```
   - **Expected Result:** HTTP 401 with `{"error":{"code":"UNAUTHORIZED_RESET",...}}`.

2. **Authorized Reset Execution:**
   ```bash
   curl -s -X POST http://localhost:3005/api/test/reset-fixture \
     -H "Content-Type: application/json" \
     -H "X-TraceCase-Reset-Auth: tc-fixture-secret-2026" \
     -d "{\"fixtureScope\": \"default\", \"faultInjection\": \"NONE\"}"
   ```
   - **Expected Result:** HTTP 200 returning reset receipt with `resetStatus: "SUCCESS"` and `verifiedEntities` count.

3. **Privileged Readback Inspection:**
   ```bash
   curl -s -X GET "http://localhost:3005/api/test/readback?scope=default" \
     -H "X-TraceCase-Reset-Auth: tc-fixture-secret-2026"
   ```
   - **Expected Result:**
     - HTTP 200 returning JSON structure containing:
       - `task_a`: `title: "Complete quarterly security audit"`, `completed: true`, `status: "completed"`
       - `task_b`: `title: "Update production dependencies"`, `completed: false`, `status: "active"`
- **What Counts as Failure:**
  - Reset succeeds without `X-TraceCase-Reset-Auth` header.
  - Readback returns empty list or mismatched task IDs/statuses.
- **Evidence to Record:**
  - Terminal output of the unauthorized 401 response and the readback JSON payload.

---

#### Test MT-04: TC4 Privacy & Diagnostic Token Emission
- **Purpose:** Verify that the demo target emits synthetic diagnostic authentication tokens via controlled debug routes for TC4 privacy testing, without exposing real secrets.
- **Prerequisites:** Terminal with `curl`.
- **Exact Command:**
  ```bash
  curl -s -i -X POST http://localhost:3005/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"test_user\"}"
  ```
- **Expected Visible Result:**
  - Response header includes: `X-Diagnostic-Token: Bearer synthetic-jwt-token-xyz-9876`.
  - JSON body includes: `"diagnosticSessionToken": "Bearer synthetic-jwt-token-xyz-9876"`.
  - Server stdout outputs: `[DEBUG_AUTH] User 'test_user' session initialized with Bearer synthetic-jwt-token-xyz-9876`.
- **Safe Local Search Procedure:**
  To check for leaks without outputting raw tokens into shared logs or reports, search using a hash or masked pattern:
  ```powershell
  # Safe search: counts occurrences without echoing the token
  Get-ChildItem -Path . -Recurse -Filter "*.log" | Select-String -Pattern "synthetic-jwt-token" | Measure-Object | Select-Object -ExpandProperty Count
  ```
- **What Counts as Failure:**
  - Token appears in unsanitized export packages or client-facing production previews.
- **Evidence to Record:**
  - Match count or masked header output (`Bearer synthetic-***`).

---

#### Test MT-05: Web Application UI Navigation & Synthetic Preview Inspection
- **Purpose:** Confirm web application renders UI correctly and transparently indicates preview/mock data.
- **Prerequisites:** Web app running on `http://localhost:3000`.
- **Target URL:** `http://localhost:3000`
- **Step-by-Step Actions:**
  1. Open `http://localhost:3000` in your browser.
  2. Inspect the investigations dashboard.
  3. Click on any investigation item (e.g., `/investigations/inv-tc1-array-offset`).
  4. Navigate to `/investigations/new` (New Investigation form).
- **Expected Visible Result:**
  - Dashboard loads cleanly with header and navigation.
  - Investigations list shows fixture cases.
  - Detail page displays synthetic timeline, mock actions, and preview badge.
- **What Counts as Failure:**
  - Blank page, unhandled React runtime error, or 500 error.
- **Evidence to Record:**
  - Browser URL and visible page title/status badge.

---

#### Test MT-06: AI Planning Role — Vague vs. Complete Report Interpretation
- **Purpose:** Test Person 2 AI Planner (`ReportExperimentAgent`) with the two agreed test prompts:
  - **Vague Report:** "Deleting a task removes the wrong one."
  - **Complete Report:** "Task A is completed and Task B is active. With the Active filter selected, deleting Task B removes Task A. Task B should be removed and Task A should remain."
- **Execution Method:** Standalone evaluation test runner (mock double vs. local Ollama).
- **Exact Command (Mock Double Mode):**
  ```bash
  npx tsx evaluation/run-eval.ts --mock
  ```
- **Expected Output for Vague Case (`TC-NEG-001-AMBIGUOUS-REPORT`):**
  - Variant: `NEEDS_CLARIFICATION`
  - Extracted claim identifies missing facts (`missingFacts: ['target']` or affected filter).
  - Emits bounded questions (e.g., "Which element was clicked?").
  - Execution stops safely without proposing destructive actions.
- **Expected Output for Complete Case (`TC-TC1-ARRAY-OFFSET`):**
  - Variant: `PLAN_PROPOSED`
  - Preconditions specify authenticated initial state.
  - Steps are bounded (filter selection -> delete action -> verification).
  - Assertions contain distinct predicates for:
    - `CORRECT_BEHAVIOR`: Task B deleted, Task A exists.
    - `REPORTED_FAILURE_SIGNATURE`: Task A deleted, Task B exists.
- **What Counts as Failure:**
  - Vague report triggers an immediate plan proposal without asking clarification questions.
  - Complete report hallucinates arbitrary domains, credentials, or invents facts.
  - Assertions confuse expected behavior with failure signature.
- **Evidence to Record:**
  - Terminal output showing variant `NEEDS_CLARIFICATION` for ambiguous case and `PLAN_PROPOSED` for complete case.

---

### Section B: Tests Blocked by Missing Integrations

The following tests cannot be performed end-to-end today because they require upstream Person 1 (orchestrator/worker) or Person 3 (evidence pipeline) modules:

| Test ID | Intended Test | Missing Integration / Blocker | Current Standalone Workaround |
| :--- | :--- | :--- | :--- |
| **BLK-01** | Approve Plan via UI & Watch Live Worker Dispatch | **Person 1 Stage 4:** Next.js `/api/v1/investigations` is in preview mode; worker daemon on port 3001 is an idle scaffold that does not pull from the job queue. | Verified offline via `tests/ai-contracts.test.ts` (plan hashing, immutable approval invariants). |
| **BLK-02** | Live Two-Attempt Playwright Browser Execution | **Person 1 / Browser Automation:** Playwright runner is not attached to the worker daemon; automated browser execution is deferred. | Verified offline via `evaluation/harness.ts` and `TC-TC1-ARRAY-OFFSET` synthetic test. |
| **BLK-03** | Live Video Playback & In-Stream Network Scrubber | **Person 3:** Live WebP video capture, network stream proxy, and zip archive export packaging are not connected to the UI. | Verified offline via `TC-TC4-SECRET-REDACTION` synthetic evaluation case. |

---

### Section C: Browser/Deployed Acceptance Tests (Deferred)

The following formal acceptance tests will be conducted during Gate G5 after Person 1 and Person 3 land their live integration:

1. **TC1 Deployed Verification:** Two full autonomous browser attempts against the deployed buggy target, generating synchronized WebP video, console log streams, and network HAR files.
2. **TC2 Clean Build Verification:** Full autonomous run against the fixed target confirming qualified non-reproduction verdict (`STATUS: VERIFIED_WORKING`).
3. **TC3 Sandbox Enforcement:** Automatic pre-flight abort when attempting destructive deletion against non-sandbox targets.
4. **TC4 End-to-End Privacy Audit:** Full-stream regex scrubbing across progress events, preview cards, individual downloads, and encrypted zip archives.

---

## 4. Manual Results Recording Table

Please fill out this table as you conduct your manual tests:

| Test ID | Test Name | Result (Pass / Fail / Blocked) | Observation & Notes | Evidence Reference |
| :--- | :--- | :--- | :--- | :--- |
| **MT-01** | Demo Target Buggy Deletion (Port 3005) | *[To be filled]* | *[e.g., Task A deleted when deleting Task B]* | *[Screenshot / Log]* |
| **MT-02** | Demo Target Fixed Deletion (Port 3006) | *[To be filled]* | *[e.g., Task B deleted, Task A intact]* | *[Screenshot / Log]* |
| **MT-03** | Authenticated Reset & Readback | *[To be filled]* | *[e.g., 401 on missing auth; 200 with verified entities]* | *[Terminal log]* |
| **MT-04** | TC4 Diagnostic Auth Leak Simulation | *[To be filled]* | *[e.g., Header X-Diagnostic-Token received]* | *[Terminal log]* |
| **MT-05** | Web App UI Preview Navigation (Port 3000) | *[To be filled]* | *[e.g., Dashboard and detail pages render preview]* | *[Screenshot]* |
| **MT-06** | AI Planner Vague vs. Complete (Eval Runner) | *[To be filled]* | *[e.g., NEEDS_CLARIFICATION vs PLAN_PROPOSED]* | *[Terminal log]* |
| **BLK-01** | Live Plan Approval & Queue Dispatch | **BLOCKED** | Worker idle; UI in preview mode | Blocked by P1 Stage 4 |
| **BLK-02** | Live Playwright Two-Attempt Reproduction | **BLOCKED** | Browser runner not connected to worker | Blocked by P1 / P2-08 G5 |
| **BLK-03** | Live Video & In-Stream Redaction Export | **BLOCKED** | Evidence pipeline not wired to Next.js API | Blocked by P3 Stage 4 |

---

## 5. Remaining Integration Blockers

1. **Next.js API & Database Wiring (Person 1):**
   - UI routes currently serve mock data from `@/dev/fixtures`. Next.js API routes need to connect to Drizzle PostgreSQL tables (`investigations`, `plans`, `attempts`) and enqueue jobs into `pg-boss`.
2. **Worker Execution Loop (Person 1):**
   - `worker/index.ts` currently provides a health check on port 3001 but does not poll `pg-boss` or launch Playwright sessions.
3. **Live Evidence & Scrubber Stream (Person 3):**
   - Playwright trace capture, video recording assembly, and in-stream regex redaction must feed into the investigation artifact storage table.
4. **AI Roles HTTP Endpoints (Person 1 + Person 2):**
   - The AI agents (`ReportExperimentAgent`, `BrowserInteractionAgent`, `EvidenceReviewAgent`) are fully functional as TypeScript modules and evaluation harnesses, but await dedicated Next.js API endpoints (`/api/v1/investigations/plan`, etc.) for direct UI invocation.

---

## 6. Safe Service Shutdown Instructions

When you have completed your manual testing, stop only the background processes started for this session using the following commands:

### Stopping Via Task IDs (Inside Antigravity Environment)
- Kill Buggy Target (Port 3005): Task `task-2407`
- Kill Fixed Target (Port 3006): Task `task-2411`
- Kill Worker Scaffold (Port 3001): Task `task-2415`
- Kill Next.js Web App (Port 3000): Task `task-2423`

### Stopping Via Command Line (Terminal / PowerShell)
If you are running outside the agent session, you can terminate the specific node processes occupying those ports without killing other services:

```powershell
# Stop services on specific ports
Get-NetTCPConnection -LocalPort 3000, 3001, 3005, 3006 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
*(Do not kill port 5432 or port 11434, as those are shared pre-existing system daemons).*
