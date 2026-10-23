# Person 1 — Phase 2-J Handoff: Unified Status and Enforced Approval/Start Gates

**Stage:** Phase 2 Stage J (`P1-2.5 / Phase J: Unify status and enforce real approval/start gates`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Problem Resolved

**Goal:** Ensure every screen (dashboard, investigation detail, plan review) explains the same persisted state across three orthogonal dimensions, and keep plan approval strictly separate from execution start under authoritative server gates.

### Core Problems Addressed
1. **Conflating Execution with Reproduction:** Previously, UI components could easily confuse an investigation completing its browser run (`COMPLETED` lifecycle) with a defect being successfully reproduced (`CONFIRMED_REPRODUCED` verdict). TraceCase now strictly isolates execution lifecycle, reproduction verdict, and evidence packaging readiness into three independent dimensions.
2. **Ad-hoc Next Action Guidance:** Operators previously had to guess the next valid action based on fragmented flags. A centralized, contract-driven helper (`getNextPermittedAction`) now computes the truthful next action for all lifecycle and review states (`DRAFT`, `CLARIFICATION_PENDING`, `AWAITING_APPROVAL`, `APPROVED`, `QUEUED`/`RUNNING`, `COMPLETED` with inconclusive vs. confirmed verdict, and evidence packaging).
3. **Approval Bound to Stale or Missing Plans:** Approval must never apply to a synthetic or placeholder plan. The plan review screen now loads authoritative server-persisted plans, validates exact revision and SHA-256 hash bindings, surfaces sandbox verification gates, and displays a prominent warning if prior approval was granted for an obsolete revision.
4. **Auto-Starting on Approval:** Approval was previously at risk of being conflated with execution launch. Under Stage J, plan approval solely records cryptographic approval and transitions review status to `APPROVED`. Starting execution remains a separately guarded, explicit user action invoking `/start` with plan revision and hash prerequisites.
5. **Missing Rejection and Revocation Flow:** Added client API methods and interactive operator dialogs for rejecting proposed plans or revoking previously granted approvals with mandatory operator justification reasons.
6. **No Placeholder Plans:** When a plan does not exist (404) or retrieval fails (401/403/500), the UI honestly displays the error state and next available step rather than rendering a synthetic mock plan.

---

## 2. Implementation Details

### A. Shared Contract-Driven Status Mappings (`src/contracts/status.ts`)
- **Tri-Dimensional Status Enums:**
  - `InvestigationLifecycleStatus`: `DRAFT`, `PLANNING`, `AWAITING_APPROVAL`, `APPROVED`, `QUEUED`, `RUNNING_ATTEMPT_1`, `RESETTING_TARGET`, `RUNNING_ATTEMPT_2`, `FINALIZING_EVIDENCE`, `COMPLETED`, `FAILED`, `CANCELLED`.
  - `ReproductionVerdict`: `PENDING`, `CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONSISTENT_OBSERVATIONS`, `INCONCLUSIVE`.
  - `EvidenceReadinessStatus`: `PENDING_GENERATION`, `PACKAGING_IN_PROGRESS`, `PUBLIC_SAFE_READY`, `QUARANTINED_LEAK_DETECTED`, `STORAGE_SYNC_FAILED`.
- **Verdict Helper:**
  - `isReproductionConfirmed(verdict)`: Evaluates to `true` strictly when `verdict === 'CONFIRMED_REPRODUCED'`. Returns `false` for `NOT_REPRODUCED`, `INCONCLUSIVE`, `INCONSISTENT_OBSERVATIONS`, or `undefined`.
- **Next Permitted Action Resolver (`getNextPermittedAction`):**
  - Evaluates inputs (`lifecycleStatus`, `reviewStatus`, `reproductionVerdict`, `evidenceReadiness`, `isApproved`, `planVersion`).
  - Returns `NextPermittedAction` containing:
    - `actionKind`: `GENERATE_PLAN`, `CLARIFY_DETAILS`, `REVIEW_AND_APPROVE`, `START_EXECUTION`, `MONITOR_RUN`, `AWAIT_EVIDENCE`, `INSPECT_RESULTS`, `REVISE_OR_RETRY`.
    - `label`: Truthful user-facing label (e.g. `"Review & Approve Plan"`, `"Start Execution"`, `"Inspect Inconclusive Run"`, `"Inspect Confirmed Evidence"`).
    - `description`: Actionable summary explaining why the action is permitted or what is currently processing.
    - `href`: Direct route to the relevant page (`/approve`, `/clarify`, `/live`, `/investigations/[id]`).
    - `isActionable`: `true` when a human operator action is permitted; `false` when the engine is performing background processing (e.g. `PACKAGING_IN_PROGRESS` or `PLANNING`).
    - `badgeClass`: Harmonious Tailwind styling aligned with design system tokens.

### B. Plan Review and Authoritative Gates (`src/app/investigations/[id]/approve/page.tsx`)
- **Real Current Proposal Display:**
  - Displays plan version (`v${plan.version}`) and SHA-256 hash (`plan.planHash`).
  - Displays target name, environment, base URL, and sandbox verification status.
  - Renders semantic browser action steps with safety tiers (`TIER_1_READ_ONLY`, `TIER_2_SAFE_INTERACTION`, `TIER_3_MUTATING_INTERACTION`, `TIER_4_DESTRUCTIVE`), tool kinds, selectors, target roles, accessible names, values, and step timeouts.
  - Lists deterministic typed assertions with subject references, operators, expected values, settling points (`AFTER_NETWORK_IDLE`), and human descriptions.
  - Lists reported failure signature and expected correct behavior observations.
  - Displays mutation warning banner if steps contain Tier 3 or Tier 4 mutating interactions.
- **Obsolete Approval Invalidation:**
  - Detects if `investigation.reviewStatus === 'APPROVED'` was granted for a prior revision or plan hash (`investigation.planVersion !== plan.version || investigation.approvedPlanHash !== plan.planHash`).
  - Renders prominent warning banner notifying the operator that the current plan revision has not been approved and requires re-authorization.
- **Sandbox Safety Guard:**
  - `isBlockedBySandbox`: Evaluates whether the plan contains `TIER_4_DESTRUCTIVE` actions while targeting an unverified sandbox (`target.isSandboxVerified === false`).
  - Disables approval button with an informative notice that destructive actions require sandbox verification.
- **Strict Approval / Start Gate Separation:**
  - Clicking `"Authorize Plan Execution"` submits `ApprovePlanCommand` with exact `planVersion` and `approvedPlanHash`.
  - On approval success, updates local state and sets review status to `APPROVED`. **It does not auto-start execution.**
  - Once approved, the `"Authorize Plan Execution"` button is replaced by the distinct `"Start Reproduction Run"` button.
  - Clicking `"Start Reproduction Run"` submits `StartInvestigationCommand` with `planVersion` and `approvedPlanHash` to `/api/v1/investigations/[id]/start`, redirecting to `/live` upon successful queue admission.
- **Reject and Revoke Modals:**
  - Operator rejection dialog requires `rejectionReason` (min 3 characters) calling `rejectInvestigationPlan`.
  - Operator revocation dialog requires `revocationReason` (min 3 characters) calling `revokeInvestigationPlan`.
- **Truthful Error Handling:**
  - If a plan is not found (404), displays a clear empty state explaining that Luna has not yet generated a plan or clarifications are pending, with direct link to generate or clarify.
  - Never renders placeholder or synthetic plans.

### C. API Client Enhancements (`src/features/investigations/api-client.ts`)
- Added `rejectInvestigationPlan(id, command: RejectPlanCommand): Promise<ApiResponse<InvestigationSnapshot>>` calling `POST /api/v1/investigations/[id]/reject`.
- Added `revokeInvestigationPlan(id, command: RevokeApprovalCommand): Promise<ApiResponse<InvestigationSnapshot>>` calling `POST /api/v1/investigations/[id]/revoke`.
- Validates payload schemas with `RejectPlanCommandSchema` and `RevokeApprovalCommandSchema`.

### D. Investigation Details Screen (`src/app/investigations/[id]/page.tsx`)
- Surfaced dedicated **Next Permitted Action Banner** directly beneath the Tri-Dimensional Status Metric Bar.
- Clearly displays action badge, descriptive guidance, and direct action button navigating to the appropriate workflow step.

### E. Dashboard Updates (`src/app/page.tsx`)
- Added **Next Permitted Action** column to the investigations data table, providing immediate visibility and deep-linking to the exact next step for every investigation.
- Updated filter tabs and search logic to accurately index and filter by `CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONCLUSIVE`, and `INCONSISTENT_OBSERVATIONS`.

---

## 3. Verification Report

### A. Implemented
- [x] Separate presentation of Lifecycle, Deterministic Reproduction Verdict, and Evidence Readiness across dashboard, investigation detail, and plan review.
- [x] Centralized contract-driven mappings via `getNextPermittedAction`, `getLifecyclePresentation`, `getVerdictPresentation`, and `getEvidencePresentation`.
- [x] Truthful next action descriptions for draft, clarification-pending, plan-ready, running, completed/inconclusive, and evidence-processing states.
- [x] Strict rule that "Completed" never equates to "Confirmed" (`isReproductionConfirmed`).
- [x] Authoritative plan review displaying current plan revision, target, semantic steps with safety tiers, deterministic assertions, expected observations, mutation warnings, and sandbox verification status.
- [x] Binding approval to exact persisted revision and SHA-256 hash using `ApprovePlanCommandSchema`.
- [x] Invalidation of obsolete approval display when a plan changes.
- [x] Full support for plan rejection and approval revocation with required operator reasons.
- [x] Strict separation of approval and execution start: approval sets `APPROVED` state but never auto-starts; start is a separately guarded explicit action.
- [x] Preservation of server ownership, stale-revision, sandbox, budget, and dispatch guards.
- [x] Truthful handling of missing plans (404), unauthorized states (401/403), duplicate clicks, and transitions without placeholder plans.

### B. Verified
- [x] `npm run typecheck`: Passed with 0 errors.
- [x] `npm run lint`: Passed with 0 errors or warnings.
- [x] New unit test suite `tests/person-1/phase-2/status-and-approval-gates.test.ts`: 20/20 tests passing.
  - Verified tri-dimensional status separation and `isReproductionConfirmed` logic.
  - Verified next permitted action mapping for all workflow branches.
  - Verified plan revision and hash binding validation.
  - Verified obsolete approval invalidation logic.
  - Verified reject and revoke command gate schemas.
  - Verified approval and start separation with inert dispatcher simulation.
- [x] All Phase 2 test suites (`tests/person-1/phase-2/*.test.ts`): 13 test files, 121 tests passing.
- [x] Onboarding tour test suite (`tests/onboarding-tour.test.ts`): 6 tests passing.

### C. Blocked / Not Carried Out
- None.

---

## 4. Required Constraint Note

Browser verification not run, per instruction.
