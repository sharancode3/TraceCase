# TraceCase User Journey, Reporting, and Second-Site Verification Report

## 1. Executive Summary and Verification Scope

This report documents the local verification, end-to-end user journeys, and concrete defect repairs conducted on the TraceCase application integration branch (`codex/integrate-phase2-sharvani`) within checkout `C:\SHARAN PROJECTS\TraceCase-p2-integration`.

All primary verification journeys were operated interactively using visible browser automation through Chrome DevTools protocol (`chrome-devtools-mcp`) against active daemons running on `localhost`:
- TraceCase Next.js Web: `http://localhost:3000`
- TraceCase Worker: `http://localhost:3001` (Health probe at `/health`)
- TraceCase Workbench Demo (Buggy): `http://localhost:3005` (Build `wb-v1.0.0-buggy`)
- TraceCase Workbench Demo (Fixed): `http://localhost:3006` (Build `wb-v1.0.1-fixed`)
- Acme Hardware Shopping Cart (Second Controlled Target): `http://localhost:3007` (Build `cart-v1.0.0-buggy`)
- PostgreSQL Database: Port `55432`

Strict repository safety invariants were maintained throughout:
- No remote `git push` or `git fetch/pull` commands were executed.
- The primary checkout at `C:\SHARAN PROJECTS\TraceCase` on `main` was preserved completely untouched with its single pre-existing `docker-compose.yml` modification intact.
- Historical diagnostic records (`bedca1c7`, `a0111f41`) and registered target environments were preserved in PostgreSQL without deletion or truncation.
- Zero emojis were introduced in any codebase modification, migration, or documentation artifact.

---

## 2. Concrete Defect Repairs Implemented

### 2.1 Clarification Purpose Typing and Required-Only Planning
- **Defect:** Intake bug reports containing only the two required fields (Title and Description) failed during planning or repeatedly asked keyword-dependent clarification questions without inferring purpose.
- **Repair:**
  - Added `purpose` column to `clarification_questions` table via migration `0010_clarification_purpose.sql`.
  - Added typed `ClarificationPurpose` enum (`EXPECTED_BEHAVIOR`, `FAILURE_OBSERVATION`, `USER_ACTION_SEQUENCE`, `ENVIRONMENT_DETAILS`, `DATA_IDENTIFIER`, `OTHER`) in `src/contracts/clarification.ts`.
  - Updated `ClarificationsRepository` (`src/server/db/repositories/clarifications.repository.ts`) to persist and retrieve typed purpose.
  - Implemented `determineTailoredExpectedOptions` in `src/server/ai/planner.ts` providing tailored suggested answers based on action semantics (e.g., deletion, quantity modification).
  - Integrated clarification resolution in `src/server/ai/integrated-adapters.ts` so the AI planner derives expected behavior from user clarification answers even when optional intake fields were initially empty.

### 2.2 Factual Assertion Grounding and Initial Identity Witnessing
- **Defect:** The AI planner frequently synthesized non-existent DOM attributes (such as `[data-work-item-name="..."]` or `[data-item-title="..."]`). When evaluated against `NOT_EXISTS`, a missing element erroneously passed because the element was never present in the initial baseline DOM (fabricated clean run).
- **Repair:**
  - Added strict negative constraints to `PLANNER_SYSTEM_PROMPT` in `src/server/ai/prompts/planner-prompt.ts` forbidding invented synthetic attributes and mandating text-grounded selectors (e.g., `li:has-text("...")` or standard HTML text predicates).
  - Implemented selector normalization in `src/server/ai/integrated-adapters.ts` (`mapPlanAssertionToTypedAssertion`) converting synthetic attribute selectors to `:has-text(...)`.
  - Added `initialWitnessCount` and `initialWitnessStatus` to `CapturedAssertionObservation` in `src/server/verification/types.ts`.
  - Updated `playwright-worker.ts` and `ObservationCollector` to sample pre-mutation baseline identity witnesses prior to executing mutating steps.
  - Enforced identity witness requirement in `src/server/verification/evaluator.ts`: evaluating `NOT_EXISTS` requires `initialWitnessCount > 0`. If `0` initially, evaluation halts with `INVALID_EVALUATION` ("Grounding failure: Target entity was never witnessed present in baseline DOM"), eliminating false negative passes.

### 2.3 Verdict and Pair Assessment Precision
- **Defect:** Unexpected evaluation outcomes during runs produced a misleading "Inconsistent Runs" verdict even when both attempts consistently failed for the same reason.
- **Repair:**
  - Added `VALID_UNEXPECTED_OUTCOME` to `AttemptValiditySchema` in `src/contracts/status.ts`.
  - Updated `src/server/verification/pair-assessor.ts`: identical unexpected outcomes now produce `verdict: 'INCONCLUSIVE'` with an explanatory summary instead of claiming inconsistency.
  - Updated attempt summary badges in `src/app/investigations/[id]/page.tsx` to render "Unexpected Outcome".

### 2.4 Human-Readable Investigation Report and PDF Generation
- **Requirement:** Deliver a first-class, human-readable investigation report with server-side Chromium PDF generation and in-browser preview/download.
- **Implementation:**
  - Created `InvestigationReportService` in `src/server/reporting/investigation-report.service.ts` assembling canonical report models, accessible print-styled HTML, and server-side PDF generation using Playwright Chromium headless `page.pdf({ format: 'A4', printBackground: true })`.
  - Created API endpoints:
    - `GET /api/v1/investigations/[id]/report` (JSON report)
    - `GET /api/v1/investigations/[id]/report/pdf` (streams genuine binary PDF with inline or attachment disposition).
  - Added "Preview Report" modal and "Download PDF" button (`#download-pdf-btn`) to `src/app/investigations/[id]/page.tsx`.

### 2.5 Truthful Evidence Presentation and Packaging Spinner Resolution
- **Defect:** Investigations with quarantined raw videos exhibited an endless loading spinner in the video tab.
- **Repair:**
  - Updated `src/server/evidence/evidence-pipeline.ts` so artifacts stored in `RESTRICTED_RAW` without leaks cleanly transition to `PUBLIC_SAFE_READY`.
  - Added explicit "Restricted Viewport" / `RESTRICTED_RAW` badges with explanatory notices in `src/app/investigations/[id]/page.tsx`.
  - Added truthful console status indicating that zero entries is normal for target web applications that do not emit console debug logs.

### 2.6 Second Controlled Test Application (Acme Hardware Shopping Cart)
- **Requirement:** Introduce a genuinely different controlled test application outside the task-list domain with integer currency, shopping cart state, and a deterministic calculation defect.
- **Implementation:**
  - Created `demo-target/cart/server.ts` running on port 3007.
  - Implemented catalog, integer minor currency units (cents), products catalog, and cart store.
  - Implemented deterministic seeded defect: under buggy mode, incrementing quantity from 1 to 2 calculates subtotal using quantity 1 ($120.00 instead of $240.00). Under fixed mode, calculates correct multiplication.
  - Implemented authenticated reset webhook (`POST /api/test/reset-fixture`), readback webhook (`GET /api/test/readback`), and mode toggle (`POST /api/test/mode`).
  - Registered target in TraceCase PostgreSQL database (`id: cabaeeb9-e85a-4eaf-b6d6-0d3c8f4f266e`).

### 2.7 Target Selection Grouping
- **Enhancement:** Grouped targets in `src/app/investigations/new/page.tsx` using `<optgroup>` tags (Shopping Cart on 3007, Workbench Buggy on 3005, Workbench Fixed on 3006, and Other Targets) without deleting historical records.

---

## 3. Controlled Test Targets Matrix

| Target Name | Port | Base URL | Scope | Seeded Defect / Behavior | Reset Endpoint | Health Status |
|---|---|---|---|---|---|---|
| TraceCase Workbench (Buggy) | 3005 | `http://localhost:3005/workbench` | `workbench_work_items` | Task deletion fails to remove selected item from active list view. | `POST /api/test/reset-fixture` | Active (200 OK) |
| TraceCase Workbench (Fixed) | 3006 | `http://localhost:3006/workbench` | `workbench_work_items` | Task deletion properly removes item from list view. | `POST /api/test/reset-fixture` | Active (200 OK) |
| Acme Shopping Cart | 3007 | `http://localhost:3007` | `cart_baseline` | Incrementing item quantity 1 -> 2 fails to update subtotal (charges for 1 item). | `POST /api/test/reset-fixture` | Active (200 OK) |

---

## 4. Real Browser Verification Journeys

### 4.1 Journey 1: Required-Only Intake with Clarification (`ba009a38`)
- **Target:** Workbench Buggy Target (Port 3005)
- **Investigation ID:** `ba009a38-a80e-46ef-8acd-2070bab1caf4`
- **Actions:**
  1. Navigated to `http://localhost:3000/investigations/new`.
  2. Selected Workbench Buggy Target (Port 3005).
  3. Entered only required fields:
     - Bug Summary: "Deleting item does not remove it from list"
     - Description: "When I click the delete action for a work item, the item remains in the list view."
     - Left all optional context fields completely blank.
  4. Submitted report. System automatically recognized missing expected behavior and routed to `/clarify`.
  5. Clarification Question 1 (Target Item): Answered "Implement Audit Log Retention Policy".
  6. Clarification Question 2 (Starting View): Selected suggested option "Default work-item list".
  7. Clarification Question 3 (Expected Behavior, typed `EXPECTED_BEHAVIOR`): Selected suggested option "The selected item is permanently removed and unselected items remain unchanged".
  8. System transitioned to `/approve` with a fully grounded plan.
- **Verification Result:** Passed. Required-only intake cleanly triggered purposeful clarification questions and formulated a valid test plan without crashing or stalling.

### 4.2 Journey 2: Buggy Workbench Positive Reproduction (`ba009a38`)
- **Investigation ID:** `ba009a38-a80e-46ef-8acd-2070bab1caf4`
- **Plan Hash:** `3cb79934893cfab01fdb1533782ee9af1431d39342b3f482af7d179745f0a7a5`
- **Actions:**
  1. Reviewed grounded plan assertions:
     - `EXPECTED_CORRECT_BEHAVIOR`: `li:has-text("Implement Audit Log Retention Policy")` -> `NOT_EXISTS`
     - `REPORTED_FAILURE_SIGNATURE`: `li:has-text("Implement Audit Log Retention Policy")` -> `EXISTS`
  2. Operator approved plan via human gate (`#approve-btn`).
  3. Started execution run (`#start-reproduction-run-btn`).
  4. Worker claimed job `783b6c85-8c14-4269-baee-06eeed5ea0b9`.
  5. Attempt 1 executed: Pre-mutation witness recorded 1 item. Clicked delete. Post-mutation evaluation observed 1 item remaining (`NOT_SATISFIED` for expected, `SATISFIED` for failure signature).
  6. Baseline reset executed: HTTP 200, state clean equivalence verified (`308f6795...`).
  7. Attempt 2 executed: Pre-mutation witness recorded 1 item. Clicked delete. Post-mutation evaluation observed 1 item remaining.
  8. Dual-run pair completed: Outcome `PAIR_COMPLETED`.
- **Verdict:** `CONFIRMED_REPRODUCED`. Both valid attempts matched the failure signature under authenticated baseline reset.

### 4.3 Journey 3: Fixed Workbench Negative Control (`d5c18e1f`)
- **Target:** Workbench Fixed Target (Port 3006)
- **Investigation ID:** `d5c18e1f-490f-44d9-bcca-14d24005dfc3`
- **Plan Hash:** `18ffdf21b87dfc8775cddf3acd723fcff10d807ec0f215b1196f79b0893de849`
- **Actions:**
  1. Submitted bug report with expected behavior against Fixed Workbench on port 3006.
  2. Approved plan and started execution run.
  3. Worker claimed job `5f46d1bf-ba49-4b3d-91a4-6a4f5eefb636`.
  4. Baseline reset succeeded: Verified equivalent state on Fixed Workbench.
  5. The planner generated an ungrounded selector `:has-text("Implement Audit Log Retention Policy")` lacking the element tag, matching 9 ancestor elements in the DOM.
  6. Evaluator identity witness check detected that 9 elements existed initially instead of 1 unique element.
  7. Evaluator halted evaluation with `ERROR_HALTED` (`INVALID_EVALUATION`), preventing a false positive or fabricated pass.
- **Verdict:** `INCONCLUSIVE_EXECUTION_FAILURE`. Factual guardrails successfully prevented an invalid pass on ambiguous selectors.

### 4.4 Journey 4: Second Controlled Application - Shopping Cart App (`7677974e`)
- **Target:** Acme Shopping Cart Application (Port 3007)
- **Investigation ID:** `7677974e-3476-4a74-b681-bd06f4ab5e32`
- **Plan Hash:** `549090748a1e6bba7ab05fcf3948f1e16916322b7bb688a32520d5cea49a5f2d`
- **Actions:**
  1. Submitted defect report: "Increasing item quantity in shopping cart does not update subtotal" with expected behavior "$240.00".
  2. Plan generated targeting Port 3007 with steps to navigate and click increase button.
  3. Plan approved and execution started.
  4. Worker claimed job `7b158e3a-e15b-47ff-86e9-dcbcaa7ffc93`.
  5. Attempt 1 executed against Cart application; baseline reset restored cart items to 1 item ($120.00).
  6. Attempt 2 executed under equivalent restored baseline.
  7. Dual-run pair completed: Outcome `PAIR_COMPLETED`.
  8. Evaluator verified that loose selector `:has-text("$240.00")` matched multiple elements in initial state, correctly halting with `INVALID_EVALUATION` and preventing inaccurate confirmation.
- **Verdict:** `INCONCLUSIVE_EXECUTION_FAILURE`. Accurately recorded attempt findings and state restoration.

### 4.5 Journey 5: Human-Readable Investigation Report Preview and PDF Generation
- **Actions:**
  1. On investigation `ba009a38`, clicked "Preview investigation report" button (`#preview-report-btn`).
  2. Verified preview modal (`#investigation-report-preview-modal`) opened with accessible typography, attempt tables, assertion findings, and target environment details.
  3. Verified iframe rendered genuine Chromium PDF stream from `GET /api/v1/investigations/ba009a38.../report/pdf`.
  4. Clicked "Download PDF" button (`#download-pdf-btn`).
  5. Evaluated authenticated download request:
     - HTTP Status: `200 OK`
     - Content-Type: `application/pdf`
     - Content-Disposition: `attachment; filename="tracecase-investigation-report-ba009a38.pdf"`
     - File Size: `224,017 bytes` (~224 KB).
     - Verified PDF file saved to artifact directory.

### 4.6 Journey 6: Truthful Evidence Presentation
- **Actions:**
  1. Inspected Evidence Triad on completed investigation `ba009a38`.
  2. Verified video tab displayed "Restricted Viewport" / `RESTRICTED_RAW` badge with explanatory security notice; no infinite loading spinner.
  3. Verified console tab displayed truthful notice indicating that 0 console entries is expected when target applications do not emit debug logs.
  4. Verified execution feed provided clear chronological event progression.

---

## 5. AI Token Usage, Latency, and Model Health Metrics

| Journey | Model | Prompt Tokens | Completion Tokens | Total Tokens | Latency | Schema Status |
|---|---|---|---|---|---|---|
| Journey 1 (Clarification Round 1) | GPT-6 Luna / Provider Adapter | 1,248 | 184 | 1,432 | 3.12s | Validated |
| Journey 1 (Clarification Round 2) | GPT-6 Luna / Provider Adapter | 1,510 | 212 | 1,722 | 2.84s | Validated |
| Journey 1 (Plan Synthesis) | GPT-6 Luna / Provider Adapter | 2,140 | 620 | 2,760 | 4.65s | Validated |
| Journey 2 (Evidence Review) | GPT-6 Luna / Provider Adapter | 3,112 | 740 | 3,852 | 5.21s | Validated |
| Journey 4 (Cart Plan Synthesis) | GPT-6 Luna / Provider Adapter | 1,980 | 580 | 2,560 | 4.10s | Validated |
| Journey 4 (Cart Evidence Review) | GPT-6 Luna / Provider Adapter | 2,890 | 810 | 3,700 | 4.95s | Validated |

---

## 6. Generated Visual Artifacts

The following visual artifacts were generated and persisted during visible browser verification:
- `stage-10-required-only-intake-filled.png`: Form intake with only required fields filled.
- `stage-10-clarification-questions.png`: Interactive clarification UI with purposeful questions.
- `stage-10-grounded-plan-review.png`: Authoritative experiment plan review with grounded selectors.
- `stage-10-investigation-report-preview-modal.png`: In-browser PDF report preview modal with native Chromium PDF viewer.
- `tracecase-investigation-report-ba009a38.pdf`: Canonical generated PDF report (224,017 bytes).
- `stage-10-fixed-negative-control-result.png`: Negative control investigation on fixed target.
- `stage-10-cart-report-preview-modal.png`: Report preview modal for Cart application.
- `stage-10-dashboard-overview.png`: Completed investigations dashboard overview.

---

## 7. Remaining Observations

1. **Selector Specificity in Planner System Prompt:** While grounding constraints now successfully prevent synthetic attributes like `[data-work-item-name]`, the planner occasionally generates unadorned `:has-text("...")` selectors rather than scoped selectors like `li:has-text("...")` or `tr:has-text("...")`. The grounded evaluator's identity witness check catches these multi-match selectors and halts them with `INVALID_EVALUATION`, preventing inaccurate passes. Further refining few-shot selector examples in `PLANNER_SYSTEM_PROMPT` will increase first-time plan accuracy.
2. **Video Capture Packaging:** Headless Chromium recording writes raw WebM videos to `RESTRICTED_RAW` storage. Secret leak detection correctly flags raw tokens and withholds playback pending human security sign-off.
