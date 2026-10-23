# Person 1 — Phase 2-E Handoff: Durable Report Save and Safe Planning Retries

**Stage:** Phase 2 Stage E (`P1-2.2 (part 3) / Phase E: Durable report save and safe planning retries`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Mental Model Delivered

Goal: **Save one report, then plan or retry planning against that same investigation.**

TraceCase report save and experiment planning are now decoupled into distinct, resilient operations:
1. **Decoupled Save & Plan Stages:** The bug report is saved and committed to persistence first, returning an authoritative investigation ID.
2. **Prominent "Report saved; preparing a plan." Banner:** When planning begins, the user is presented with a clear status indicator confirming the report is safely stored under its investigation ID while autonomous planning analyzes the symptoms.
3. **Safe, Single-Report Planning Retries:** If planning fails (or times out, or encounters a transient error), retrying planning targets the same existing `investigationId` and never re-creates or duplicates the bug report.
4. **Command Idempotency:** Added `extractIdempotencyKey` and `executeWithIdempotency` to `POST /api/v1/reports`, ensuring that duplicate clicks or network retries with the same client command key replay the cached 201 response instead of inserting duplicate rows.
5. **Durable Navigation Recovery:** When a report is saved, the URL is updated to `?investigationId=${invId}&targetId=${targetId}` via `window.history.replaceState`. If refreshed, the page inspects `fetchInvestigation(id)` to restore the saved state without storing sensitive report details in client-side storage.
6. **Centralized Typed Planning Orchestration (`src/features/investigations/planning-orchestration.ts`):** Handles all planner outcomes explicitly (`PROPOSAL_READY`, `CLARIFICATION_NEEDED`, `UNABLE_TO_PROCEED`, and `ERROR`).
7. **Authoritative Proposal Confirmation:** Proposal navigation to `/investigations/[id]/approve` is strictly gated on verifying that the authoritative experiment plan revision has actually been persisted and retrieved via `fetchPlan(id)`.
8. **Sanitized Error Messaging:** Raw database leaks, Postgres error codes (`PostgresError`, `SELECT`, `syntax error`), and internal stack traces are scrubbed and translated into clear, actionable guidance.
9. **No Permanent Spinners:** In-flight synchronization locks and monotonic sequence counters (`requestSeqRef`) discard stale responses from delayed requests and restore all interactive controls immediately on failure.

---

## 2. Implementation Summary

### A. Report Route Idempotency (`src/app/api/v1/reports/route.ts`)
- Integrated `extractIdempotencyKey` and `executeWithIdempotency` into `POST /api/v1/reports`.
- Uses `resourceId: payload.targetId`, `commandName: 'CREATE_REPORT'`, and payload fingerprinting.
- Replaying the same command key returns the cached 201 response containing the created report and `investigationId`.
- Key reuse with conflicting payload returns 409 `IDEMPOTENCY_KEY_REUSED`.
- Concurrent in-flight requests return 409 `IDEMPOTENCY_REQUEST_IN_PROGRESS`.

### B. Command Schemas & API Client
- Added optional `idempotencyKey` to `CreateReportCommandSchema`, `DraftReportIntakeSchema`, and `RequestPlanningCommandSchema` (`src/contracts/reports.ts` and `src/contracts/planning.ts`).
- Updated `submitBugReport` and `requestPlanning` in `src/features/investigations/api-client.ts` to accept and transmit `X-Idempotency-Key` headers.

### C. Centralized Planning Orchestrator (`src/features/investigations/planning-orchestration.ts`)
- Implemented `executePlanningTransition` and `formatSafePlanningError`:
  - **`PROPOSAL_READY`:** Confirms plan persistence via `fetchPlan(id)`. If confirmed, returns `navigationTarget: /investigations/${id}/approve`. If unconfirmed, fails safe with `code: 'PLAN_PERSISTENCE_UNCONFIRMED'`.
  - **`CLARIFICATION_NEEDED`:** Returns `navigationTarget: /investigations/${id}/clarify` with question count.
  - **`UNABLE_TO_PROCEED`:** Returns clean status with planner's `reason` and `missingPrerequisites`.
  - **`ERROR`:** Scrubs internal leaks, maps 401 to `SIGN_IN`, 409 to `RETRY` (after in-progress clears), 503 to `SERVICE_TEMPORARILY_UNAVAILABLE`, and network failure to actionable retry.

### D. Redesigned Intake & Clarify Pages
- **`src/app/investigations/new/page.tsx`:**
  - Manages distinct phases: `idle`, `saving_report`, `planning`, `planning_error`, `unable_to_proceed`.
  - Displays **"Report saved; preparing a plan."** banner with spinner during planning.
  - Retrying planning invokes `handleRequestPlanningForInvestigation(savedInvestigationId)` directly without touching report creation.
  - Replaced URL state with `?investigationId=${invId}` for durable reload recovery.
  - Discards stale responses via monotonic sequence counter (`requestSeqRef`).
- **`src/app/investigations/[id]/clarify/page.tsx`:**
  - Replaced blind routing to `/approve` with `executePlanningTransition`.
  - Handles `UNABLE_TO_PROCEED` and unconfirmed proposals safely.

---

## 3. Verification and Checks Passed

### A. Vitest Suite (Browser-Free)
Ran browser-free tests across idempotency, planning outcomes, and error handling:
- `tests/person-1/phase-2/durable-save-and-planning-retry.test.ts` (8/8 passed):
  - Separate report creation returns cached investigation on duplicate submission with same idempotency key without duplicate database rows.
  - Rejection of idempotency key reuse with different payload with 409 `IDEMPOTENCY_KEY_REUSED`.
  - Authoritative proposal confirmation before routing to approval.
  - Safe error return if proposal persistence cannot be confirmed.
  - Truthful `CLARIFICATION_NEEDED` handling with `/clarify` navigation target.
  - Truthful `UNABLE_TO_PROCEED` handling with reason and missing prerequisites.
  - Scrubbing of database internals and SQL leaks from error messages.
  - Mapping of 401 unauthenticated errors to `SIGN_IN` actionable state.
- `tests/person-1/phase-2/report-intake-resilience.test.ts` (7/7 passed).
- `tests/person-1/phase-2/target-selection-and-reuse.test.ts` (10/10 passed).
- `tests/person-1/phase-2/target-registration.test.ts` (10/10 passed).
- `tests/person-1/phase-2/live-api-persistence.test.ts` (3/3 passed).
- `tests/person-1/phase-2/jwt-auth.test.ts` (10/10 passed).
- `tests/person-1/phase-2/policy-regressions.test.ts` (5/5 passed).
- `tests/person-1/phase-2/repositories.test.ts` (6/6 passed).
**Total: 59 passed tests across 8 test files in `tests/person-1/phase-2/`**.

### B. Typecheck & Linting
- `npm run typecheck` (`tsc --noEmit`): Exited 0 with 0 errors.
- `npm run lint` (`next lint`): Exited 0 with "✔ No ESLint warnings or errors".

### C. Production Web Build
- `npm run build:web` (`next build`): Compiled successfully (14 static pages, 16 dynamic API routes).

---

## 4. Limitations and Non-Negotiable Boundaries Respected

1. **No Browser Automation:** Browser verification was not run, per instruction.
2. **No Real Model Calls:** No paid OpenAI Luna model invocations executed; deterministic doubles and contracts utilized.
3. **No Branch Switching or Commits:** All changes remain local and unstaged on active branch `testingupdate`.
4. **No Demo Target Modification:** `demo-target` remains untouched.
5. **No Client-Side Token/Report Caching:** No localStorage or sessionStorage introduced for sensitive report contents.

---

## 5. Next Step Dependencies

- **Phase F (`Stage P1-2.3` / Continued Clarification & Proposal Generation):**
  - Fix question index persistence collisions (`investigation_id, question_index`) in `clarifications.repository.ts`.
  - Implement append-only ordering that does not trust model question indices.
  - Harden clarification history assembly and replanning idempotency.

---

**Statement:** Browser verification not run, per instruction.
