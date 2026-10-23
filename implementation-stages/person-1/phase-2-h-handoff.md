# Person 1 — Phase 2-H Handoff: Honest Clarification UI and Navigation

**Stage:** Phase 2 Stage H (`P1-2.3 (part 3) / Phase H: Honest clarification UI and navigation`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Problem Resolved

**Goal:** Users understand what needs answering and never reach approval without a real proposal.

### Core Problems Addressed
1. **Misleading Preview & Role Terminology:** The previous clarification interface displayed internal developer labels like `(Luna Role 1)` and a misleading `Preview Mode` badge. Users must understand that these questions are designed to prepare an initial experiment plan, not interactive execution-time chat.
2. **Fabricated Choices & Blanket Required Rules:** Previously, the UI assumed every question was strictly required and risked creating arbitrary synthetic options. Suggested options must strictly mirror server-provided data; free-text response paths must always be available; and unanswered/answered statuses must be preserved.
3. **Empty Success On Fetch Failure:** When network or server errors occurred while fetching questions, the UI previously caught the failure, set `questions = []`, and rendered an empty state with a green checkmark stating "No Pending Clarifications" alongside a direct link to `/approve`. Users could reach the approval gate with zero plan proposal.
4. **Answer Loss on Replanning Failure:** When answers were successfully persisted to the database but autonomous planning timed out or failed, users were previously forced to re-submit or re-type answers.
5. **No Proposal = No Plan Review:** The "Go to plan review" button must be gated on authoritative verification of a persisted plan revision (`version > 0`, non-empty `planHash`, and valid assertions).

---

## 2. Implementation Details

### A. Clarification Page Component (`src/app/investigations/[id]/clarify/page.tsx`)
- **Title and Guidance:**
  - Page title: `Clarify report details`.
  - Subtitle: *"These questions resolve ambiguities in the bug report to build a safe, testable reproduction plan. These answers prepare the initial experiment plan and are not interactive questions asked during execution."*
  - Breadcrumb: `Investigation / Clarify report details`.
  - Removed misleading `(Luna Role 1)` and `Preview Mode` badge.
- **Seven Distinct UI States:**
  1. `LOADING`: Clean skeleton / spinner with message *"Loading clarification details..."*.
  2. `FETCH_FAILED`: Red error alert with specific message, a *"Retry"* button, and a *"Back to Investigation"* link. **Never renders an empty success checkmark.**
  3. `NO_PENDING_QUESTIONS`: When no unanswered questions exist but an experiment plan is not yet proposed. Shows the truthful investigation review status (e.g. `PENDING_PLANNING`), provides a *"Generate experiment plan"* button, and **never** renders a false *"Go to plan review"* link.
  4. `QUESTIONS_READY`: Primary interactive form displaying questions grouped by clarification round.
  5. `SUBMITTING`: Displays loading state while answers are committed via the batch answer API.
  6. `PLANNING`: Displays loading state while the autonomous planner synthesizes the experiment proposal.
  7. `PROPOSAL_READY`: Displays success card with verified plan version and fingerprint only after authoritative proposal verification, with a prominent *"Go to plan review"* button linking to `/investigations/${id}/approve`.
  8. `CANNOT_PROCEED`: When autonomous planning halts (e.g. 3-round clarification limit reached), explains the specific reason and missing prerequisites honestly without navigation to approval.
- **Answer Persistence vs. Replanning Failure Recovery:**
  - If answer submission succeeds (`POST /api/v1/investigations/[id]/clarifications/answer`), answers are durably stored.
  - If subsequent planning fails, displays an actionable banner: *"Answers saved; planning retry available"*, providing a *"Retry planning now"* button that triggers planning directly without resubmitting answers.
- **Option Buttons & Free-Text Integrity:**
  - Suggested option buttons are rendered **only** if `q.suggestedOptions` is provided by the server and non-empty.
  - Preserves exact server option string contracts.
  - Textarea free-text path is always available.
- **Multi-Round History & Accepted Answer Preservation:**
  - Questions are grouped by `roundIndex` with round badges (`Answered` vs `Needs your input`).
  - Accepted answers are displayed in a clean read-only badge (`Accepted Answer: ...`), preventing users from losing sight of previous rounds.
  - Drafts are preserved in local state across recoverable network and server errors.
- **Accessibility & Focus:**
  - Semantic `<label htmlFor=...>` for every textarea.
  - Option buttons have `role="button"`, `aria-pressed`, and clear focus rings (`focus-visible:ring-2 focus-visible:ring-cobalt-action`).
  - Semantic heading hierarchy (`<h1>`, `<h2>`, `<h3>`).

### B. Clarification State Helper Module (`src/features/investigations/clarification-state.ts`)
- `groupQuestionsByRound`: Groups questions into ascending `roundIndex` buckets, sorting questions by `questionIndex`.
- `validateClarificationAnswers`: Validates drafts against `AnswerClarificationCommandSchema`. Associates answers with question UUIDs (not array positions), requiring at least one pending question to be answered.
- `hasAuthoritativeProposal`: Strictly verifies that an experiment plan object exists with `version > 0`, non-empty `planHash`, and valid non-empty assertions/steps.
- `determineInitialPageState`: Evaluates initial state from fetch responses, guaranteeing that fetch failures cannot transition to success or plan review.

### C. API Client Enhancements (`src/features/investigations/api-client.ts`)
- Added `questionIndex`, `roundIndex`, and `answeredAt` to `ClarificationQuestionItem`.
- Re-exported `InvestigationSnapshot` for consistent type imports.

---

## 3. Verification Report

### A. Implemented
- [x] Title "Clarify report details" and removed preview/role terminology.
- [x] Clear explanation that answers prepare a plan and are not execution-time chat.
- [x] Option buttons rendered exclusively from server-provided `suggestedOptions`.
- [x] Preserved option ID/value contract and provided free-text textarea path.
- [x] Zero invented options or synthetic choice synthesis.
- [x] Answers associated strictly with persisted question UUIDs, not array indices.
- [x] Preserved drafts on recoverable errors and showed accepted answers accurately.
- [x] Displayed multi-round progression without replacing history.
- [x] Distinct states: `LOADING`, `FETCH_FAILED`, `NO_PENDING_QUESTIONS`, `QUESTIONS_READY`, `SUBMITTING`, `PLANNING`, `PROPOSAL_READY`, `CANNOT_PROCEED`.
- [x] Fetch failures never treated as empty successes.
- [x] Recovery path for answers-saved/planning-failed without re-submitting accepted answers.
- [x] Verified current persisted proposal before showing or navigating "Go to plan review".
- [x] Handled direct navigation, refresh, and stale async responses with `isMountedRef`.
- [x] Accessible labels, keyboard controls, and focus indicators.

### B. Verified
- **Vitest Unit & State Transition Tests:**
  - `tests/person-1/phase-2/clarification-ui-and-navigation.test.ts` (17/17 passed):
    - `1. Multi-Round Question Grouping and Ordering`:
      - Groups questions by `roundIndex` in ascending order and preserves question ordering.
      - Defaults to Round 1 when `roundIndex` is undefined or 0.
      - Returns empty array when question list is empty.
    - `2. Answer Validation and Persisted ID Binding`:
      - Binds answers strictly to question UUIDs, not array indices.
      - Fails validation when zero answers are supplied across pending questions.
      - Ignores questions that are already answered when validating submission drafts.
    - `3. Proposal Verification Gate (No Proposal = No Plan Review)`:
      - Returns true when plan, version > 0, hash, and assertions exist.
      - Rejects null, undefined, or missing plans.
      - Rejects zero or negative plan versions.
      - Rejects empty or whitespace plan hashes.
      - Rejects plans with zero assertions or steps.
    - `4. Initial Page State Derivation & Fetch Failure Protection`:
      - `FETCH_FAILED`: Never treats a fetch failure as an empty success.
      - `PROPOSAL_READY`: Only derived when authoritative plan revision and `PROPOSAL_READY` review status exist.
      - `NO_PENDING_QUESTIONS`: Never routes to approval when no proposal exists.
      - `QUESTIONS_READY`: Correctly identifies when pending questions exist to answer.
    - `5. Suggested Option Integrity (No Invented Choices)`:
      - Questions without server-suggested options have empty or undefined options.
      - Preserves exact server-supplied option strings without modification.
  - Full Phase 2 Test Suite: `tests/person-1/phase-2/` (91/91 tests passed across 11 test files):
    - `clarification-ui-and-navigation.test.ts` (17 passed)
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
- **Static Quality Gates:**
  - `npm run typecheck` (`tsc --noEmit`): Passed with 0 errors.
  - `npm run lint` (`next lint`): Passed with 0 warnings or errors.

### C. Blocked
- None.

---

Browser verification not run, per instruction.
