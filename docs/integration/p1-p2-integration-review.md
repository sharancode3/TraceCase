# Person 1 and Person 2 Subsystem Integration Review & Person 3 Compatibility Readiness

**Date:** 21 October 2026  
**Integration Branch:** `integration/person-1-person-2`  
**Base Commit (Person 1):** `297125b` (`origin/person-1`)  
**Merged Commit (Person 2):** `a7d9ffc` (`origin/person-2`)  
**Quality Status:** Clean build, 0 TypeScript errors (`tsc --noEmit`), 0 ESLint warnings/errors (`next lint`), 60 test files passed (487 passed tests, 6 skipped, 0 failed in ~12s).

---

## 1. Executive Summary

This document certifies the comprehensive runtime-integration correction and Person 3 compatibility readiness pass on the isolated development branch `integration/person-1-person-2`.

The previous integration checkpoint (`f9afd3d`) reconciled Git branches and basic test fixtures but relied on temporary placeholder contexts in adapter boundaries (hardcoded hashes, synthetic selectors, static reset headers). This pass completely eliminated fabricated adapter context, aligned the AI browser actor into the live Playwright execution loop, verified target reset and baseline readback against the real demo target application, wrapped AI provider invocations in atomic budget reservations, and validated frontend/evidence contract readiness for Person 3.

Neither `main`, `person-1`, nor `person-2` branch pointers were modified or pushed. No Person 3 branch (`person3`) was merged. No deployments or external submissions were executed.

---

## 2. Integrated Architecture & Runtime Corrections

### 2.1 Removal of Fabricated Adapter Context
All lossy placeholder adapters were eliminated across the three core AI roles:
1. **Role 1 (Clarification & Experiment Planning):**
   - Removed placeholder approved plan hash (`000...000`). Plans now compute authoritative SHA-256 fingerprints via `calculateAuthoritativePlanFingerprint`.
   - Replaced naive action mappings with fully validated `PlanStep` definitions supporting `wait_for_selector`, `navigate`, `click`, `fill`, `hover`, and `scroll`.
   - Multi-turn clarification dialogue now passes prior conversation rounds (`clarificationHistory`), preserving previously clarified facts without re-asking.
   - Clarification questions persist `explanation` and `suggestedOptions` in the database repository.
2. **Role 2 (Browser Action Proposer):**
   - Eliminated hardcoded fallback actions (`CLICK` with static 5000ms duration).
   - Replaced artificial CSS selector transformations with accessible element resolution (`ObservationManager.resolveTarget`) supporting role, accessible name, and coordinate bounds.
   - Connected `IntegratedBrowserInvestigationAgent` directly into `PlaywrightBrowserWorker.executeAttempt`, allowing dynamic step-by-step element resolution with fallback handling.
3. **Role 3 (Evidence Reviewer & Synthesis):**
   - Replaced hardcoded attempt 2 null evaluations and static 4000ms values with real `PairAssessment` outcomes and executed action history.
   - Strictly enforced invariant TC-INV-008: all model-generated hypotheses are stamped `isVerifiedFact: false`.
   - Wired `EvidenceReviewService.generateExplanation` into `InvestigationClaimHandler` following deterministic verification.

### 2.2 Atomic Budget Enforcement (`BudgetManager`)
All invocations across Role 1, Role 2, and Role 3 are wrapped with atomic pre-allocation and reservation accounting:
- `BudgetManager.reserveBudget` calculates estimated token costs against configured model pricing.
- `BudgetManager.commitUsage` records verified token and dollar expenditures.
- `BudgetManager.releaseReservation` prevents budget leakage when actions fail or complete under budget.
- Graceful in-memory fallback is provided for non-production test suites when PostgreSQL daemon is offline.

### 2.3 Outbound Target Reset & Readback Verification
- Aligned `TargetResetClient` with both Person 1 and Person 2 target conventions:
  - Header scheme: Sends `X-TraceCase-Reset-Auth`, `X-TraceCase-Reset-Secret`, and `Authorization: Bearer <secret>`.
  - Body payload: Includes `targetId`, `attemptPairId`, and explicit `fixtureScope` (e.g. `'tasks'`).
  - Strict network guard: Enforces redirect prevention (`redirect: 'error'`), 10-second timeout, 1MB response limit, and SSRF address blocking (`169.254.169.254` blocked).
  - Pre-flight baseline capture: Reads clean state prior to Attempt 1 and verifies exact baseline equivalence post-reset before admitting Attempt 2.

### 2.4 Person 3 Contract Readiness
Verified that all shared contracts for Person 3's frontend, state stream, and evidence viewer conform to strict Zod specifications (`tests/integration/p3-contract-readiness.test.ts`):
- **Safe Projections:** `SafeTargetProfileSchema` and `SafeModelTargetContextSchema` project sanitized target views with truth-telling `hasResetCapability` while stripping internal reset secrets, endpoints, and credentials.
- **Command Envelopes:** Validated `DraftReportIntakeSchema`, `AnswerClarificationCommandSchema`, `BatchAnswerClarificationsCommandSchema`, and `ApprovePlanCommandSchema`.
- **Response Envelopes:** Standardized `SafeSuccessEnvelopeSchema` and `SafeErrorEnvelopeSchema` (categorized error envelopes without leaking raw call stacks).
- **State Snapshots & Event Stream:** Validated `InvestigationSnapshotSchema` and `InvestigationProgressEventSchema` with strictly discriminated lifecycle states, reproduction verdicts, and evidence readiness flags.
- **Evidence References & Access Grants:** Validated `FinalizedCaptureReferenceSchema` (with SHA-256 checksums) and time-limited `ArtifactAccessGrantSchema`.

---

## 3. Test Suites & Quality Verification

Across the unified repository, all test suites execute cleanly:

| Suite Category | Files | Tests | Status | Notes |
|---|---|---|---|---|
| Full Repository Suite (`pnpm test`) | 60 files | 487 passed, 6 skipped | **PASS** | 0 failed |
| Real Workflow Slice (`real-workflow-slice.integration.test.ts`) | 1 file | 1 passed | **PASS** | Complete 8-stage flow with live demo target server |
| Integrated Flow (`p1-p2-integrated-flow.test.ts`) | 1 file | 6 passed | **PASS** | Roles 1-3, target reset, budget reservations |
| Person 3 Contract Readiness (`p3-contract-readiness.test.ts`) | 1 file | 11 passed | **PASS** | Target profiles, commands, snapshots, grants |
| Person 1 Acceptance (`phase-9/real-acceptance.integration.test.ts`) | 1 file | 4 passed | **PASS** | Real Playwright Chromium launch & WebM capture |
| Verification Probes (`verification-probes.test.ts`) | 1 file | 8 passed | **PASS** | Ephemeral target server, offline Ollama fail-closed |
| AI Evaluation CLI (`ai-evaluation-cli.test.ts`) | 1 file | 14 passed | **PASS** | Subprocess CLI invocations and arg validation |
| Demo Target Fixture (`demo-target.test.ts`) | 1 file | 26 passed | **PASS** | Store, state machines, reset endpoints, readback |
| AI Role Unit Suites (`ai-*.test.ts`) | 7 files | 147 passed | **PASS** | Planner, Actor, Reviewer, Observation Pruner |
| TypeScript Compiler (`pnpm typecheck`) | - | 0 errors | **PASS** | `tsc --noEmit` exit 0 |
| ESLint (`pnpm lint`) | - | 0 warnings | **PASS** | `next lint` clean |

---

## 4. Quality Gate Status (G0 - G5)

- **Gate G0 (Hygiene & Type Safety):** **PASSED.** Clean typecheck and linting across all integrated files. Zero compile-time errors.
- **Gate G1 (Security & Auth Boundaries):** **PASSED.** Cryptographic JWT verification, tenant isolation, network guard SSRF protection (`169.254.169.254` blocked), reset secret validation.
- **Gate G2 (Two-Attempt Deterministic Verification):** **PASSED.** Deterministic assertion evaluator, independent baseline comparator, pair decision matrix, and two-attempt controller verified with test doubles and local fixtures.
- **Gate G3 (AI Proposal Integration & Agentic Loop):** **READY FOR LIVE KEYS / VALIDATED WITH TEST DOUBLES.**
  - Runtime adapters bridge all three AI roles to trusted ports without placeholder context.
  - Fail-closed constraints strictly prohibit unauthorized models or local models in production.
  - Live OpenAI inference calls require a valid `OPENAI_API_KEY` with access to `gpt-6-luna`.
- **Gate G4 (Full Evidence Triad):** **PARTIALLY VALIDATED / PENDING PERSON 3.**
  - Genuine WebM video recording, console error capture, and network trace capture verified locally with Playwright Chromium.
  - Finalized public packaging and shared text redaction remain pending Person 3's shared sanitizer.
- **Gate G5 (Official Acceptance Benchmark):** **READY FOR DEPLOYED RUN.**
  - Scenarios TC1, TC2, TC3, and TC4 verified locally with test doubles and real browser media capture.
  - Real end-to-end workflow slice confirmed against live demo target server.

---

## 5. Invariant Status (TC-INV-001 through TC-INV-014)

- **TC-INV-001 (Single Authorized Model):** Enforced in `env.ts` and `provider.ts`. Only `gpt-6-luna` permitted.
- **TC-INV-002 (Explicit User Approval):** Enforced in `InvestigationWorkflowService`. No execution without immutable plan approval.
- **TC-INV-003 (Deterministic Verification):** Enforced in `DeterministicAssertionEvaluator`. Pure functions, no model-assisted assertion scoring.
- **TC-INV-004 (Independent Target Reset):** Enforced in `TargetResetClient` and `BaselineComparator`. Verified against `demo-target`.
- **TC-INV-005 (Fail-Closed Provider Security):** Enforced. Missing API key returns `ServiceUnavailableError`; local models rejected in production.
- **TC-INV-006 (Bounded Execution Leases):** Enforced in `ExecutionLeaseService`. Monotonic epochs and heartbeat renewals prevent split-brain.
- **TC-INV-007 (Atomic Budget Enforcement):** Enforced in `BudgetManager`. Pre-allocation and hard token limits halt unbounded loops.
- **TC-INV-008 (Hypothesis Non-Fact Separation):** Enforced in `Reviewer` and `IntegratedEvidenceReviewAgent`. `isVerifiedFact: false` strictly required.
- **TC-INV-009 (SSRF & Network Isolation):** Enforced in `TargetNetworkGuard`. Cloud metadata and private ranges blocked.
- **TC-INV-010 (Tenant Isolation):** Enforced in all API endpoints and repositories. Principal-scoped queries.
- **TC-INV-011 (Secret Redaction):** Invariant specified; live redaction implementation pending Person 3's shared sanitizer.
- **TC-INV-012 (EBML Header Video Verification):** Enforced in `real-acceptance.integration.test.ts`. WebM byte header validated.
- **TC-INV-013 (Immutable Event Replay):** Enforced in `ProgressReporter` and `outbox_messages`. Serialized progress counter.
- **TC-INV-014 (Two-Attempt Comparability):** Enforced in `PairAssessor`. Target build identity and environmental comparability required.

---

## 6. Person 3 Integration Readiness

With the completion of this pass, Person 3 will encounter:
1. Stable, typed API command schemas (`DraftReportIntake`, `AnswerClarificationCommand`, `ApprovePlanCommand`).
2. Predictable, categorized response envelopes (`SafeSuccessEnvelope`, `SafeErrorEnvelope`).
3. Clean state snapshots (`InvestigationSnapshot`) with clear separation of execution lifecycle status, reproduction verdict, and evidence readiness.
4. Strongly-typed live progress events (`InvestigationProgressEvent`).
5. Truthful target projections (`SafeTargetProfile`) omitting backend reset secrets.
6. Evidence access grants (`ArtifactAccessGrant`) for time-limited authenticated viewing.
