# Person 1 — Phase 2-D Handoff: Short, Resilient Report Intake

**Stage:** Phase 2 Stage D (`P1-2.2 (part 2) / Phase D: Short, resilient report intake`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Mental Model Delivered

Goal: **A user can submit a useful report with minimal effort and without losing input.**

TraceCase report intake now provides:
1. A small primary form containing only the essential fields: selected saved target, concise bug title, and description of what went wrong.
2. A prominent explainer clarifying that **uncertainty is completely okay**—reporters do not need to diagnose root causes or provide perfect reproduction steps.
3. Progressive disclosure for optional context: expected/observed behaviors, suspected steps, reported environment notes, and paste diagnostics.
4. Clean displacement of the misleading file attachment picker with an honest paste-diagnostics textarea.
5. Strict preservation of entered input across validation errors, authentication rejections, and network failures.
6. In-flight duplicate submission prevention with immediate control restoration after recoverable errors.
7. Clear distinction between reporter-supplied environment notes and actual worker observations.

---

## 2. Implementation Summary

### A. Redesigned Report Intake UI (`src/app/investigations/new/page.tsx`)
- **Primary Form Structure:**
  - Selected Target Application (carrying Phase C's exact selection, zero-target alert, and visible identity card).
  - Bug Summary / Short Title (minimum 3 characters, labeled with clear helper text).
  - Description of What Went Wrong (minimum 5 characters).
- **"Uncertainty is Okay" Explainer:**
  - Placed immediately below the problem description:
    > *"You do not need to know exact reproduction steps, root causes, or build commit hashes. Autonomous planning will clarify any missing preconditions and explore deterministic reproduction steps before proposing a test plan."*
- **Progressive Disclosure Accordion:**
  - Clean collapsible section toggled via: *"Additional Context & Diagnostics (Optional) — Expected/Observed Behavior, Steps, Environment & Logs"*.
  - Hidden by default to keep the default intake short and low-effort.
  - Houses:
    - Expected Correct Behavior (Optional, up to 2000 chars).
    - Observed Erroneous Behavior (Optional, up to 2000 chars).
    - Suspected Steps to Reproduce (Optional, up to 20 lines).
    - Reported Browser Environment & Build Version.
    - Paste Diagnostic Logs / Stack Trace textarea.
- **Distinction Between Reporter Metadata and Worker Observations:**
  - Explicit advisory note rendered above environment inputs:
    > *"Reporter Metadata Notice: Any browser or build values provided below represent reporter-observed notes. During autonomous reproduction, the execution worker independently verifies and records actual browser user agents, viewports, and target build receipts."*
- **Removal of Misleading Attachment Simulator:**
  - Removed the simulated paperclip attachment box which implied file upload support.
  - Replaced with a real text-based *"Paste Diagnostic Logs or Stack Traces (Optional)"* field with honest plain-language guidance:
    > *"File uploads are not supported. If you have terminal output, error logs, or stack traces, paste them directly here. Diagnostic text will be included with your problem description."*
- **Resilient Error Recovery & Form State Preservation:**
  - `formData` is strictly preserved on validation, authentication, and network errors.
  - In-flight submit button is disabled while `isSubmitting: true` to prevent duplicate submissions.
  - Controls are re-enabled immediately upon any error.
  - If a report was already created and planning failed, the saved investigation ID is preserved to allow a safe "Retry Planning" request without duplicating the bug report row.

### B. Payload Alignment & Schema Compliance (`DraftReportIntakeSchema`)
- Sanitizes and formats payload to strictly conform to `DraftReportIntakeSchema`:
  - `targetId`: valid UUID.
  - `title`: trimmed string (3–200 characters).
  - `rawDescription`: cleanly combines bug description with any pasted diagnostic logs within the schema's 5000 character limit.
  - Optional fields (`expectedBehavior`, `observedBehavior`, `suspectedSteps`, `browserEnvironment`, `buildVersion`) are conditionally included only when non-empty.

---

## 3. Verification and Checks Passed

### A. Vitest Suite (Browser-Free)
Ran browser-free tests across schema validation, payload formatting, error handling, and API persistence:
- `tests/person-1/phase-2/report-intake-resilience.test.ts` (7/7 passed):
  - Minimal reports containing only `targetId`, `title`, and `rawDescription` satisfy `DraftReportIntakeSchema`.
  - Rejection of titles < 3 characters or descriptions < 5 characters.
  - Full report validation with optional fields.
  - Successful persistence of minimal draft report returning `investigationId`.
  - Persistence of report with combined diagnostic logs and optional context.
  - Rejection of invalid payload missing description with 400 `INVALID_REPORT_PAYLOAD`.
- `tests/person-1/phase-2/target-selection-and-reuse.test.ts` (10/10 passed).
- `tests/person-1/phase-2/target-registration.test.ts` (10/10 passed).
- `tests/person-1/phase-2/live-api-persistence.test.ts` (3/3 passed).
- `tests/person-1/phase-1/safe-projections.test.ts` (4/4 passed).
- `tests/person-1/phase-1/api-boundaries.test.ts` (7/7 passed).
- `tests/api-client.test.ts` (14/14 passed).
**Total: 55 passed tests across 7 test suites.**

### B. Typecheck & Linting
- `npm run typecheck` (`tsc --noEmit`): Exited 0 with 0 errors.
- `npm run lint` (`next lint`): Exited 0 with "✔ No ESLint warnings or errors".

### C. Web Build
- `npm run build:web` (`next build`): Compiled successfully with all routes generated.

---

## 4. Limitations and Non-Negotiable Boundaries Respected

1. **No Browser Automation:** Browser verification was not run, per instruction.
2. **No Object Storage / Fake Uploads:** No mock object storage or fake file uploads introduced; paste diagnostics offered honestly.
3. **No Duplicate Embedded Forms:** No second target-registration form embedded inside report intake.
4. **No Secret Exposure:** No secrets or credentials leaked in errors or form state.
5. **No Branch Switching or Commits:** All changes remain local and unstaged on the active branch.
6. **No External Model Calls:** No paid OpenAI Luna calls were executed.

---

## 5. Next Step Dependencies

- **Phase E (`Stage P1-2.3`):** Make Luna clarification and plan generation deterministic to the user:
  - Fix question index persistence collisions (`investigation_id, question_index`).
  - Append-only question ordering strategy that does not trust local model indices.
  - Reliable proposal persistence before routing to plan approval.

---

**Statement:** Browser verification not run, per instruction.
