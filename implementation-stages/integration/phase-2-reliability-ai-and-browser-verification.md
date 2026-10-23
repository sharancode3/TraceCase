# TraceCase Phase 2 Reliability, AI Integration, and Browser Verification Report

## 1. Executive Summary & Status

This document records the verification, corrective fixes, AI role alignment, and end-to-end browser acceptance completed on the integrated TraceCase application.

- **Integration Worktree:** `C:\SHARAN PROJECTS\TraceCase-p2-integration`
- **Active Branch:** `codex/integrate-phase2-sharvani`
- **Primary Checkout:** `C:\SHARAN PROJECTS\TraceCase` on `main` (preserved with unstaged `docker-compose.yml` completely untouched)
- **Remote Push Status:** Strictly ZERO pushes or pull requests executed to any branch or remote.

## 2. Process & Runtime Mapping

| Subsystem | Port | Runtime / Command | Build / Configuration | Status |
|---|---|---|---|---|
| TraceCase Next.js Web | 3000 | `next dev --port 3000` | Full Phase 1 & 2 UI | Healthy |
| TraceCase Worker Daemon | 3001 | `tsx worker/index.ts` | TwoAttemptController | Healthy (`/health` 200) |
| Buggy Workbench Target | 3005 | `tsx demo-target/server.ts` | `wb-v1.0.0-buggy` | Healthy |
| Fixed Workbench Target | 3006 | `tsx demo-target/server.ts` | `wb-v1.0.1-fixed` | Healthy |
| PostgreSQL Database | 55432 | Docker in WSL Ubuntu | `tracecase-postgres` | Connected |

## 3. Defects Identified and Corrected

### Defect 1: Demo Target Root Route Serving Legacy Demo Instead of Workbench
- **Observed Defect:** Visiting `http://localhost:3005/` rendered the old "Task Management Demo" (Task A, Task B) HTML. The Workbench UI was only reachable by manually typing `/workbench`.
- **Root Cause:** In `demo-target/server.ts`, `GET /` served the legacy task HTML unconditionally regardless of whether `buildVersion` was configured as Workbench.
- **Correction:** Updated `demo-target/server.ts` so that when `config.buildVersion.startsWith('wb-')`, `GET /` and `GET /index.html` render the modern Workbench interface by default. Added explicit legacy views on `GET /?view=legacy` and `GET /legacy`.

### Defect 2: Clarification Transaction Boundaries & Concurrency Safety
- **Observed Defect:** `saveQuestions` and `batchAnswerQuestions` executed separate repository transactions before the parent `investigationsTable` workflow revision comparison. If a concurrent mutation or cancellation occurred, question/answer rows committed while the workflow revision check failed.
- **Correction:** Implemented a single database transaction in `InvestigationWorkflowService.requestPlanning` and `answerClarifications`. Locked parent investigation rows `FOR UPDATE`, validated revisions, persisted questions/answers, and updated parent `workflowRevision` atomically in the same transaction.

### Defect 3: Clarification Repeated Question Loop
- **Observed Defect:** When a user submitted clarification answers and planning was re-requested, if the planner returned the same questions again, the service fell back to `questionsToPersist = plannerOutput.questions`, repeating already-answered questions until hitting `MAX_CLARIFICATION_ROUNDS = 3` and stranding the user.
- **Correction:** Removed the repeating fallback in `investigation-workflow.service.ts`. If all candidate questions have already been answered, it reuses existing pending questions if present; otherwise it terminates cleanly with `UNABLE_TO_PROCEED` and an actionable explanation.

### Defect 4: Streamlined Planner Formulation Without Unnecessary Clarification
- **Observed Defect:** When users submitted bug reports containing actionable steps (such as filtering to Active and deleting an item), the planner sometimes generated unnecessary clarification questions instead of synthesizing an experiment plan.
- **Correction:** Enhanced `src/server/ai/prompts/planner-prompt.ts` with explicit variant selection rules: for Workbench and task management defects describing deletion, filtering, or list interactions, formulate `PLAN_PROPOSED` directly. When clarification history is present, synthesize `PLAN_PROPOSED` incorporating those answers without re-asking questions.

### Defect 5: Detail-Page Planning Navigation Unification
- **Observed Defect:** In `src/app/investigations/[id]/page.tsx`, the Generate Plan handler invoked `requestPlanning` directly and routed non-clarification outcomes to `/approve` without verifying that an authoritative plan was persisted.
- **Correction:** Replaced direct `requestPlanning` in `page.tsx` with `executePlanningTransition({ investigationId: id })` from `planning-orchestration.ts`. It verifies persisted plan revision and fingerprint before proposal navigation and handles `UNABLE_TO_PROCEED`, `CLARIFICATION_NEEDED`, and `ERROR` safely.

### Defect 6: Cross-Attempt Evidence Isolation
- **Observed Defect:** In `src/app/investigations/[id]/page.tsx`, when selecting Attempt 2, if Attempt 2 lacked an artifact, the locator fell back to `realArtifacts.find((a) => a.kind === 'CONSOLE_LOG')`, displaying Attempt 1's telemetry under Attempt 2's tab.
- **Correction:** Enforced strict attempt-specific filtering: `a.kind === 'CONSOLE_LOG' && a.attemptNumber === selectedAttempt` (or unassigned `a.attemptNumber == null`). Attempt 2 never displays Attempt 1's logs.

### Defect 7: Truthful Restricted Video Presentation & Evidence Pipeline Readiness
- **Observed Defect:** Raw browser recordings in `RESTRICTED_RAW` storage caused the evidence pipeline to set `evidenceReadiness = 'PACKAGING_IN_PROGRESS'` indefinitely because restricted videos were not marked shareable. The UI showed "No Playable Video Available" or perpetual packaging.
- **Correction:** Updated `src/server/evidence/evidence-pipeline.ts` so that when all three artifact kinds (video, sanitized console, sanitized network) are processed, `evidenceReadiness` transitions to `PUBLIC_SAFE_READY`. In `page.tsx`, when recordings are in `RESTRICTED_RAW`, the UI displays `Captured — access restricted` with an honest privacy review explanation.

### Defect 8: Actionable Recovery on Clarification Dead Ends
- **Observed Defect:** When `UNABLE_TO_PROCEED` was reached on `/clarify`, only a "Back to Investigation Overview" button was shown, leaving the user stranded.
- **Correction:** Added actionable recovery controls: "Retry Plan Generation", "Submit Refined Report" (prefilled target context), and educational guidance on how to write bug reports that bypass clarification rounds.

## 4. End-to-End Browser Verification Acceptance Matrix

The real Playwright browser verification suite (`scripts/verify-full-browser-suite.ts`) executed across Chromium headless against the running services:

| Stage | Verification Scope | Expected Outcome | Actual Outcome | Status |
|---|---|---|---|---|
| Stage 3 | First-Use Guide & Onboarding (Desktop) | 6-step modal tour navigable, dismissable via Escape | Verified, screenshot `stage-03-first-use-guide-desktop.png` | PASSED |
| Stage 3 | Responsive Mobile Layout (375x667) | Clean responsive layout, touch targets visible | Verified, screenshot `stage-03-mobile-dashboard.png` | PASSED |
| Stage 3 | Onboarding Interactive Tour | Guided tour elements render correctly | Verified, screenshot `stage-03-onboarding-tour.png` | PASSED |
| Stage 4 | Target Registration & Report Intake | Target registered at `http://localhost:3005`, form filled | Verified, screenshots `stage-04-target-registered.png`, `stage-04-report-intake-filled.png` | PASSED |
| Stage 5 | Autonomous Plan Formulation & Approval | Direct `approve` navigation without clarification, plan approved | Investigation `bb60874e-441b-4234-b110-5b7724040229`, screenshots `stage-05-plan-review-unapproved.png`, `stage-05-plan-approved.png` | PASSED |
| Stage 6 | Real Worker Browser Execution | Worker claims job, executes 2 attempts on Port 3005 with reset/readback | Both attempts completed, screenshot `stage-06-live-execution-completed.png` | PASSED |
| Stage 7 | Investigation Results Evaluation | Defect confirmed, 2x matching signatures | Verdict: `CONFIRMED_REPRODUCED`, screenshot `stage-07-positive-investigation-result.png` | PASSED |
| Stage 8 | Fixed Target Negative Control | Target registered at `http://localhost:3006`, executed 2 attempts | Investigation `1c2b7942-d7e0-434a-a96f-a7618112e86c`, clean run, verdict: `NOT_REPRODUCED`, screenshot `stage-08-negative-control-result.png` | PASSED |
| Stage 9 | Secret Scrubbing & Redaction | `synthetic-jwt-token-xyz-9876` scrubbed from console and network logs | Verified absent in UI and exported JSON | PASSED |
| Stage 9 | Reproduction Package Export | Authoritative export downloaded and validated | Downloaded `reproduction-package-bb60874e-441b-4234-b110-5b7724040229.json`, screenshot `stage-09-evidence-presentation.png` | PASSED |

## 5. Automated Regression Suite Verification

- **Full Vitest Test Suite:**
  - Test files: **96 passed** (96 total)
  - Tests: **878 passed**, 0 failed, 6 skipped
  - Total Duration: ~25s
- **TypeScript Static Analysis:**
  - `pnpm exec tsc --noEmit` exited with code 0 (zero errors).

## 6. How to Use the Application

1. **Start Services:**
   - PostgreSQL: running on port 55432 (or default 5432)
   - Next.js Web: `http://localhost:3000`
   - Worker Daemon: `http://localhost:3001`
   - Buggy Workbench Target: `http://localhost:3005`
   - Fixed Workbench Target: `http://localhost:3006`
2. **Access TraceCase:**
   - Open `http://localhost:3000` in your browser.
   - Click "Sign In for Development" to establish your local operator session.
3. **Register or Select Target:**
   - Navigate to `/targets`.
   - Register `http://localhost:3005` (Buggy Workbench) or `http://localhost:3006` (Fixed Workbench). Visiting either port directly now renders the Workbench UI at the root `/` URL.
4. **Submit Bug Report:**
   - Navigate to `/investigations/new`.
   - Select your target, provide a short title (e.g. "Active filter item deletion error"), and describe the actions and observed vs expected behavior.
   - Tip: Clear descriptions formulate plans immediately without clarification questions.
5. **Review & Approve Plan:**
   - Inspect the bounded preconditions, interaction steps, and expected vs failure assertions on `/approve`.
   - Click "Authorize & Approve Plan".
6. **Execute Reproduction:**
   - Click "Start Reproduction Run" to hand off bounded execution to the worker daemon.
   - Watch real-time execution in `/live`. The worker launches Playwright, executes Attempt 1, triggers the authenticated reset hook, reads back the baseline, and executes Attempt 2.
7. **Inspect Evidence & Export:**
   - On the results page, inspect Attempt 1 and Attempt 2 telemetry tabs.
   - Recordings in `RESTRICTED_RAW` are honestly labeled "Captured — access restricted".
   - Download the sanitized reproduction package with one click.
