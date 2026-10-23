# Person 1 — Phase 2-G Handoff: Grounded Luna Planning and Recoverable Answer Transitions

**Stage:** Phase 2 Stage G (`P1-2.3 (part 2) / Phase G: Grounded Luna planning and recoverable answer transitions`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Problem Resolved

**Goal:** Useful persisted answers lead to another grounded clarification round, a persisted proposal, or an honest recoverable outcome.

### Core Problems Addressed
1. **Fact Provenance Separation:** Reporter claims, target environment configurations, model interpretations, and browser observations were previously blended in unstructured string representations. Provenance must be explicitly tracked (`[Target Config]`, `[Reporter Claim]`, `[User Clarification Round X QY]`).
2. **Repeating Questions:** If Luna returned questions identical to those already answered, user effort was duplicated. Answered questions must be filtered out unless a genuine follow-up is requested.
3. **Clarification Bound Policy:** Clarification rounds must not spin indefinitely. The authoritative system limit (`MAX_CLARIFICATION_ROUNDS = 3`) must be enforced, transitioning the investigation to `UNABLE_TO_PROCEED` (review status: `BLOCKED`) when exceeded.
4. **Validation Rejection of Malformed AI Output:** Model outputs must conform strictly to `ReportPlannerOutputSchema`. Fabricated statuses, missing assertions, or invalid shapes must fail validation and must never reach `PROPOSAL_READY`.
5. **Database Transaction Decoupling:** External LLM calls (e.g., OpenAI Luna) must **never** be held open inside database transactions. Model calls occur completely outside database transactions.
6. **Optimistic Concurrency & Delayed Response Protection:** Slow or delayed competing planner responses must not overwrite newer workflow state. Updates verify `where and(eq(id), eq(workflowRevision, initialWorkflowRevision))`, throwing `ConflictError` on stale revisions.
7. **Answer Persistence & Downstream Failure Recovery:** Accepted user answers are committed prior to replanning. If downstream planning fails (e.g., timeout, network partition), stored answers remain intact, and subsequent retries succeed without asking users to resubmit.
8. **Answer Ownership and Round Validation:** Answers submitted to `answerClarifications` must belong to the target investigation, exist, have non-empty text, and prevent answering prior completed rounds when a newer round is active.

---

## 2. Implementation Details

### A. Provenance-Explicit Planning Fact Ledger (`src/server/workflow/investigation-workflow.service.ts`)
- In `requestPlanning`:
  - Builds `knownFacts` with explicit tags:
    - `[Target Config] Base URL`, `[Target Config] Environment`, `[Target Config] Allowed Origins`
    - `[Reporter Claim] Bug Title`, `[Reporter Claim] Bug Description`, `[Reporter Claim] Claimed Expected Behavior`, `[Reporter Claim] Claimed Failure Signature`, `[Reporter Claim] Suspected Steps`
    - `[User Clarification Round X QY] <questionText>`: `<answerText>`
  - Collects `answeredQuestionTexts` to prevent repeated questions.
  - Reconstructs `clarificationHistory` passed to `planner.generateProposal`:
    - `questionId`, `questionText`, `selectedOption`, `customText`.

### B. Authoritative Clarification Limits (`src/server/workflow/investigation-workflow.service.ts`)
- Enforces `MAX_CLARIFICATION_ROUNDS = 3`.
- Before accepting another round of clarification questions, checks `activeRound >= MAX_CLARIFICATION_ROUNDS`.
- If the limit is reached, transitions the investigation to:
  - `reviewStatus: 'BLOCKED'`
  - Emits `PLANNING_BLOCKED` event with reason `"Maximum clarification rounds (3) reached without resolving reproduction parameters."`
  - Returns `{ status: 'UNABLE_TO_PROCEED', reason: '...', missingPrerequisites: [...] }`.

### C. Runtime Planner Output Validation (`src/server/workflow/investigation-workflow.service.ts`)
- Validates model output using `ReportPlannerOutputSchema.safeParse(plannerOutput)`.
- If validation fails, throws `ValidationFailedError` with detailed Zod issues.
- Does not persist an experiment proposal and does not advance the investigation to `PROPOSAL_READY`.

### D. Concurrency & Revision Protection (`src/server/workflow/investigation-workflow.service.ts`)
- In `requestPlanning` and `answerClarifications`:
  - Captures `initialWorkflowRevision = inv.workflowRevision`.
  - Executes the model request outside of all database transactions.
  - On update, specifies `where: and(eq(investigationsTable.id, inv.id), eq(investigationsTable.workflowRevision, initialWorkflowRevision))`.
  - Throws `ConflictError('Investigation workflow revision changed concurrently during planning', 'CONCURRENT_WORKFLOW_MUTATION')` if zero rows are updated.

### E. Answer Ownership & Round Validation (`src/server/workflow/investigation-workflow.service.ts`)
- In `answerClarifications`:
  - Verifies investigation ownership and lifecycle state.
  - Validates `answers` array is non-empty and answer text is non-empty.
  - Loads existing questions: verifies each question belongs to the investigation.
  - If question ID is missing or belongs to another investigation, throws `NotFoundError`.
  - Detects active pending round: if user attempts to answer a question belonging to a prior completed round, throws `ConflictError('Question belongs to prior round which is already answered', 'PRIOR_ROUND_QUESTION')`.

### F. Plan Fingerprint & Atomic Persistence (`src/server/workflow/investigation-workflow.service.ts`)
- When proposal is valid:
  - Generates immutable plan revision with `calculateAuthoritativePlanFingerprint`.
  - Persists revision into `experimentPlanRevisionsTable` and transitions `investigationsTable` to `PROPOSAL_READY` inside a single atomic transaction.
  - Emits `PLAN_PUBLISHED` event.

### G. Schema Alignment & Contracts (`src/contracts/clarification.ts`, `src/contracts/ai.ts`)
- Added compatibility field aliases in `ProposedClarificationQuestionSchema`:
  - `questionId`, `options`, `whyItMatters`, `purpose`, `blocksExecution`.
- Added default to `preliminaryUnderstanding` in `ClarificationProposalSchema`.
- Updated `ClarificationsRepository.answerQuestion` to throw `NotFoundError` if question is not found.

---

## 3. Verification Report

### A. Implemented
- [x] Assembled planning fact ledger with distinct provenance tags for reporter claims, target configuration, and user clarification rounds.
- [x] Filtered out duplicate questions already answered in previous rounds.
- [x] Enforced authoritative 3-round clarification limit with clean transition to `UNABLE_TO_PROCEED` and `BLOCKED` status.
- [x] Runtime validation of planner output using `ReportPlannerOutputSchema.safeParse`, throwing `ValidationFailedError` on invalid output.
- [x] Validated answer ownership, non-empty text, question existence, and active round boundaries.
- [x] Executed external model call strictly outside database transactions.
- [x] Optimistic concurrency control preventing delayed competing planner responses from overwriting newer workflow state.
- [x] Durable answer persistence surviving downstream planning failures, allowing safe retries.
- [x] Atomic persistence of valid proposals with real revision and hash before returning `PROPOSAL_READY`.

### B. Verified
- **Vitest Unit & Integration Suites:**
  - `tests/person-1/phase-2/grounded-planning-and-answer-transitions.test.ts` (9/9 tests passed):
    1. `Fact Ledger Assembly & Provenance`: Verifies `[Target Config]` and `[Reporter Claim]` provenance tags are passed to Luna double.
    2. `Answer Validation & Persistence`: Verifies option and custom text answers persist and update question records.
    3. `Multi-Round Clarification Progression`: Verifies answered questions rebuild fact ledger with `[User Clarification Round 1 Q0]` and appends Round 2 questions.
    4. `Clarification Round Limit Enforced`: Verifies exceeding 3 rounds halts planning with `UNABLE_TO_PROCEED` and updates investigation status to `BLOCKED`.
    5. `Avoid Repeating Answered Questions`: Verifies answered questions are filtered out from subsequent rounds.
    6. `Preservation Across Failure`: Verifies answered questions survive downstream planner failure (504 timeout), and subsequent retry succeeds with stored answers.
    7. `Answer Ownership & Round Boundaries`: Verifies unknown question ID throws `NotFoundError`, stale revision throws `ConflictError`, and answering prior round questions throws `ConflictError`.
    8. `Malformed Luna Output`: Verifies malformed planner output throws `ValidationFailedError` without creating plan revisions or setting `PROPOSAL_READY`.
    9. `Concurrency Protection`: Verifies delayed competing planner response throws `ConflictError` when workflow revision was concurrently advanced.
  - Full Phase 2 Test Suite: `tests/person-1/phase-2/` (74/74 tests passed across 10 test files):
    - `policy-regressions.test.ts` (5 passed)
    - `repositories.test.ts` (6 passed)
    - `target-registration.test.ts` (10 passed)
    - `target-selection-and-reuse.test.ts` (10 passed)
    - `report-intake-resilience.test.ts` (7 passed)
    - `durable-save-and-planning-retry.test.ts` (8 passed)
    - `jwt-auth.test.ts` (10 passed)
    - `live-api-persistence.test.ts` (3 passed)
    - `clarification-ordering-and-concurrency.test.ts` (6 passed)
    - `grounded-planning-and-answer-transitions.test.ts` (9 passed)
  - `tests/person-1/phase-3/end-to-end-workflow.test.ts`: Passed (1 passed).
- **Static Quality Gates:**
  - `npm run typecheck` (`tsc --noEmit`): Passed with 0 errors.
  - `npm run lint` (`next lint`): Passed with 0 warnings or errors.

### C. Blocked
- None.

---

## 4. Operational & Design Invariants
1. **Transaction Duration:** No external AI model calls are ever executed inside a database transaction (`db.transaction`).
2. **Answer Durability:** Accepted answers are committed to PostgreSQL prior to initiating replanning. Replanning failure never rolls back accepted user answers.
3. **Workflow Revision Monotonicity:** Every state change (answering clarifications, publishing plan revision, blocking on limits) increments `workflowRevision` by exactly 1 and verifies revision parity.
4. **Truthful Status:** The investigation only enters `PROPOSAL_READY` when the experiment plan revision row is safely committed with its computed SHA-256 fingerprint.
