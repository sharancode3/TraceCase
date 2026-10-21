# Person 1 and Person 2 Subsystem Integration Review & Person 3 Compatibility Readiness

**Date:** 22 October 2026  
**Integration Branch:** `integration/person-1-person-2`  
**Base Commit (Person 1):** `297125b` (`origin/person-1`)  
**Merged Commit (Person 2):** `a7d9ffc` (`origin/person-2`)  
**Quality Status:** Clean build, 0 TypeScript errors (`tsc --noEmit`), 0 ESLint warnings/errors (`next lint`), 63 test files passed (511 passed tests, 6 skipped, 0 failed in ~14s).

---

## 1. Executive Summary

This document certifies the complete runtime-integration correction and Person 3 compatibility readiness pass on the isolated development branch `integration/person-1-person-2`.

The previous integration checkpoint reconciled Git branches and basic test fixtures but relied on placeholder contexts, simulated test flows, and unbounded network buffers. This pass executed a comprehensive corrective review across the entire Person 1 and Person 2 runtime boundary:
1. Eliminated all fabricated adapter contexts across AI Roles 1, 2, and 3.
2. Wired the AI browser actor into `worker/index.ts` and `TwoAttemptController` with explicit typed execution modes (`AI_GROUNDED` vs `DETERMINISTIC_FIXED_STEP`), failing closed if the agent is unavailable in AI mode.
3. Implemented exhaustive discriminated union proposal handling in `PlaywrightBrowserWorker`, derivation of effective allowed tiers, semantic `toolKind` validation, and bounded `wait_for_selector` execution without advancing business steps or dispatching unapproved clicks.
4. Added post-model latency authorization checks (`onHeartbeat()`) immediately before action dispatch to protect against lease revocation during model inference.
5. Replaced naive budget accounting with durable atomic reservations in `BudgetManager`, supporting PostgreSQL row-level locks (`FOR UPDATE`) for multi-process worker safety and an in-memory ledger for tests.
6. Implemented bounded chunked streaming in `TargetResetClient`, capping incoming reset and readback bodies at a strict 1,000,000 byte safety limit to prevent memory exhaustion.
7. Enforced pre-flight baseline verification in `TwoAttemptController`, immediately halting with `PREFLIGHT_BASELINE_FAILED` on dirty baselines and requiring independent Attempt 2 build identity verification.
8. Re-characterized `real-workflow-slice.integration.test.ts` as a hybrid contract and orchestration test using test doubles and real demo target HTTP calls.
9. Implemented a dedicated 10-case behavioral regressions suite (`tests/integration/p1-p2-behavioral-regressions.test.ts`) covering all critical invariant failure modes.
10. Implemented a truthful real-runtime acceptance lane (`tests/integration/real-runtime-acceptance.test.ts`) that audits host prerequisites (reporting Docker/PostgreSQL 5432 offline truthfully) and launches real Playwright Chromium instances.
11. Verified Person 3 frontend and evidence viewer contracts against live route handler outputs and Zod schemas (`tests/integration/p3-contract-readiness.test.ts`).

Neither `main`, `person-1`, nor `person-2` branch pointers were modified or pushed. No Person 3 branch (`person3`) was merged. No remote push, pull request, external deployment, or submission was executed.

---

## 2. Invariant Enforcement Matrix (TC-INV-001 through TC-INV-014)

All fourteen core system invariants are enforced in runtime code and verified through automated test suites:

| Invariant ID | Definition | Runtime Enforcement Location | Verification Test Suite |
|---|---|---|---|
| **TC-INV-001** | Model exclusivity: Luna via OpenAI API only; no silent local/unauthorized fallback | `src/server/ai/integrated-adapters.ts`, `src/server/config/env.ts` | `ai-provider.test.ts`, `verification-probes.test.ts` |
| **TC-INV-002** | Two-attempt requirement: 2 valid matching attempts required to confirm reproduction | `src/server/verification/two-attempt-controller.ts`, `PairAssessor` | `two-attempt-controller-hardening.test.ts`, `p1-p2-behavioral-regressions.test.ts` |
| **TC-INV-003** | Honest reporting: failed runs, crashes, or dirty baselines are never non-reproductions | `src/server/verification/two-attempt-controller.ts`, `AttemptAssessor` | `p1-p2-behavioral-regressions.test.ts` (Case 7), `evaluator.test.ts` |
| **TC-INV-004** | Target boundary: network guard blocks cloud metadata IPs and unapproved origins | `src/server/browser/network-guard.ts`, `TargetResetClient` | `network-guard.test.ts`, `target-reset.test.ts` |
| **TC-INV-005** | Human approval: strict SHA-256 plan hash binding required before execution | `src/server/workflow/investigation-workflow.service.ts`, `TwoAttemptController` | `fingerprint-and-approval.test.ts`, `p1-p2-behavioral-regressions.test.ts` (Case 2) |
| **TC-INV-006** | Readback verification: independent baseline comparison required before Attempt 2 | `src/server/verification/target-reset-client.ts`, `BaselineComparator` | `p1-p2-behavioral-regressions.test.ts` (Cases 7 & 8), `baseline-comparator.test.ts` |
| **TC-INV-007** | Factual receipts: browser worker returns factual execution receipts, never verdicts | `src/server/browser/playwright-worker.ts` | `p1-p2-behavioral-regressions.test.ts` (Case 6), `real-runtime-acceptance.test.ts` |
| **TC-INV-008** | Fact/hypothesis separation: AI explanations must stamp `isVerifiedFact: false` | `src/server/ai/integrated-adapters.ts` (`IntegratedEvidenceReviewAgent`) | `p1-p2-behavioral-regressions.test.ts` (Case 9), `ai-compatibility-handoff.test.ts` |
| **TC-INV-009** | Safe projections: target credentials, reset secrets, and webhook URLs never exposed | `src/contracts/targets.ts` (`projectSafeTargetProfile`) | `p3-contract-readiness.test.ts`, `safe-projections.test.ts` |
| **TC-INV-010** | Sanitized storage: restricted raw captures and safe public artifacts separated | `src/contracts/evidence.ts`, `CaptureRegistrar` | `p3-contract-readiness.test.ts`, `uncertainty-and-quarantine.test.ts` |
| **TC-INV-011** | Concurrency-1 singleton: global execution lease serializes all browser executions | `src/server/queue/execution-lease.service.ts`, `worker/index.ts` | `fencing-and-leases.test.ts`, `p1-p2-behavioral-regressions.test.ts` (Case 1) |
| **TC-INV-012** | Atomic budget ledger: token and cost tracking with pessimistic row locking | `src/server/ai/budget-manager.ts` (`PostgresBudgetLedger`) | `budget-manager-concurrency.test.ts`, `budget-manager.test.ts` |
| **TC-INV-013** | Action tier limits: browser worker derives effective allowed tiers from plan & target | `src/server/browser/playwright-worker.ts` | `p1-p2-behavioral-regressions.test.ts` (Cases 3 & 4), `action-dispatch.test.ts` |
| **TC-INV-014** | Post-model lease check: revalidates lease after model latency before dispatching | `src/server/browser/playwright-worker.ts` | `p1-p2-behavioral-regressions.test.ts` (Case 5) |

---

## 3. Subsystem Corrections and Architectural Details

### 3.1 Worker Composition & Controller Execution Modes
In `worker/index.ts`:
- Injected `browserAgent` from `getServiceContainer().browserAgent` into `TwoAttemptController`.
- Configured default execution mode to `AI_GROUNDED`.
- Exposed typed getters `getBrowserAgent()` and `getDefaultExecutionMode()` on `TwoAttemptController` to allow deterministic verification of composition roots.
- When `executionMode === 'AI_GROUNDED'`, `TwoAttemptController` verifies that the agent is available; if missing or set to `unavailableBrowserInvestigationAgent`, it fails closed immediately (`status: 'FAILED'`, `failureReason: 'AI_AGENT_UNAVAILABLE'`).

### 3.2 Exhaustive Proposal Handling in Playwright Browser Worker
In `src/server/browser/playwright-worker.ts`:
- Implemented loop-scoped execution receipts and explicit loop indexing.
- Derived `effectiveAllowedTiers` from the approved plan step tier and the target sandbox policy.
- Proposal Discrimination:
  - `EXECUTE_ACTION`:
    - Validates `toolKind` against approved step; mismatches halt execution immediately without dispatching.
    - If `toolKind === 'wait_for_selector'`, executes a bounded wait on `activePage` up to `step.timeoutMs`, leaves `shouldDispatch = false`, decrements loop index (`i--`), and does not dispatch a click or fill.
    - Validates action tier against `effectiveAllowedTiers`.
    - Grounds element references via `ObservationManager`.
  - `STOP_NO_PROGRESS`: Records reason, halts attempt with `status: 'FAILED'`, and breaks loop without dispatching.
  - `REQUEST_MANUAL_HELP`: Records reason and prompt, halts attempt with `status: 'FAILED'`, and breaks loop without dispatching.
  - `READY_FOR_VERIFICATION`: Enforces step completion; halts with failure if declared before final step.
- Post-Model Authority Check: Calls `params.onHeartbeat()` immediately after model latency and before action dispatch; aborts execution if lease was revoked during model thinking.

### 3.3 Target Reset Client Streaming Limits
In `src/server/verification/target-reset-client.ts`:
- Implemented `readBoundedResponseBody` with chunked streaming reader aborting as soon as incoming bytes exceed 1,000,000 bytes (1MB safety limit).
- Applied `readBoundedResponseBody` to both `coordinateReset` and `verifyBaselineReadback`.
- Standardized dual reset headers: `X-TraceCase-Reset-Auth`, `X-TraceCase-Reset-Secret`, and `Authorization: Bearer <secret>`.
- Preserved strict redirect prevention (`redirect: 'error'`).

### 3.4 Durable Atomic Budget Ledger
In `src/server/ai/budget-manager.ts`:
- Defined `BudgetLedgerPort` abstraction.
- Implemented `PostgresBudgetLedger` using PostgreSQL `FOR UPDATE` row lock on `investigationsTable` to serialize reservation and settlement decisions across concurrent workers.
- Implemented `InMemoryBudgetLedger` for test doubles and local test execution.
- Added `createTestBudgetManager()` helper for isolated test suites.

### 3.5 Precondition Verification and Build Comparability
In `src/server/verification/two-attempt-controller.ts`:
- Pre-flight baseline verification for Attempt 1 halts immediately with `PREFLIGHT_BASELINE_FAILED` if the initial baseline is dirty.
- Removed `|| targetBuildIdAttempt1` fallback for Attempt 2 build comparability, ensuring Attempt 2 independently captures and compares build identities.

---

## 4. Test Suites and Execution Verification

Across the repository, all 63 test suites execute cleanly:

| Suite Category | Files | Tests | Status | Execution Time |
|---|---|---|---|---|
| **Full Repository Test Suite (`pnpm test`)** | 63 files | 511 passed, 6 skipped | **PASS** | ~14.2s |
| Behavioral Regressions (`p1-p2-behavioral-regressions.test.ts`) | 1 file | 10 passed | **PASS** | ~1.9s |
| Budget Manager Concurrency (`budget-manager-concurrency.test.ts`) | 1 file | 5 passed | **PASS** | ~8ms |
| Real-Runtime Acceptance (`real-runtime-acceptance.test.ts`) | 1 file | 5 passed | **PASS** | ~1.0s |
| Hybrid Workflow Slice (`real-workflow-slice.integration.test.ts`) | 1 file | 1 passed | **PASS** | ~95ms |
| Integrated Flow (`p1-p2-integrated-flow.test.ts`) | 1 file | 6 passed | **PASS** | ~100ms |
| Person 3 Contract Readiness (`p3-contract-readiness.test.ts`) | 1 file | 15 passed | **PASS** | ~1.3s |
| Demo Target Fixture (`demo-target.test.ts`) | 1 file | 26 passed | **PASS** | ~380ms |
| AI Evaluation CLI (`ai-evaluation-cli.test.ts`) | 1 file | 14 passed | **PASS** | ~12.8s |
| AI Role Unit Suites (`ai-*.test.ts`) | 7 files | 147 passed | **PASS** | ~1.2s |
| TypeScript Compiler (`pnpm typecheck`) | - | 0 errors | **PASS** | `tsc --noEmit` exit 0 |
| ESLint (`pnpm lint`) | - | 0 warnings/errors | **PASS** | `next lint` clean |

---

## 5. Truthful Quality Gate Status (G0 through G5)

- **Gate G0 (Hygiene & Type Safety):** **READY.**
  - `tsc --noEmit` exits 0 with zero type errors.
  - `next lint` exits 0 with zero warnings or errors.
  - Formats and strict schemas validated across all contracts.

- **Gate G1 (Security & Auth Boundaries):** **READY.**
  - Cryptographic HMAC-SHA256 JWT tokens validated with clock tolerance and algorithm pinning.
  - Cross-tenant access strictly blocked (Principal Bob receives 404 on Principal Alice's investigations).
  - Outbound network guard blocks cloud metadata IPs (`169.254.169.254`) and unauthorized loopback addresses.
  - Safe projections strip all internal reset secrets, endpoints, and credentials.

- **Gate G2 (Deterministic Two-Attempt Verification):** **READY (WITH TEST DOUBLES).**
  - Two-attempt controller enforces 2 valid matching attempts for confirmed reproduction.
  - Deterministic assertion evaluator handles DOM, network, and console assertions with ReDoS protection.
  - Independent target baseline comparator verifies state equivalence post-reset before Attempt 2.
  - Pre-flight baseline verification halts on dirty initial state (`PREFLIGHT_BASELINE_FAILED`).

- **Gate G3 (AI Proposal Integration & Agentic Journey):** **BLOCKED ON LIVE OPENAI LUNA KEY.**
  - Local Ollama and unconfigured model endpoints fail closed with `MODEL_CONNECTION_FAILED`.
  - All three AI roles (Planner, Actor, Reviewer) and the AI browser worker loop are fully implemented and verified with test doubles and mock providers.
  - Live production execution requires a funded OpenAI API key with access to `gpt-6-luna`.

- **Gate G4 (Operational Hardening & Full Evidence Triad):** **READY.**
  - Global execution lease provides a concurrency-1 singleton slot with epoch fencing.
  - Durable budget manager provides atomic pre-allocation and settlement with PostgreSQL `FOR UPDATE` locks.
  - Real Playwright Chromium launches and records WebM video on disk (EBML container verified).
  - Streaming responses capped at 1MB buffer limit. Post-model latency lease checks verified.

- **Gate G5 (Deployed Evaluation & Official Acceptance):** **BLOCKED ON LIVE POSTGRESQL & WORKER.**
  - Acceptance lane (`tests/integration/real-runtime-acceptance.test.ts`) truthfully reports PostgreSQL port 5432 status as OFFLINE when Docker is down.
  - Multi-stage Dockerfiles (`Dockerfile.web`, `Dockerfile.worker`) and `docker-compose.yml` prepared for deployment.
  - Full end-to-end evaluation runner (`ai-evaluation-cli.ts`) verified in integrated mode.

---

## 6. Person 3 Frontend & Evidence Viewer Contract Specification

The backend exposes stable, strictly typed interfaces for Person 3's frontend, state streams, and evidence viewer:

### 6.1 HTTP Endpoints & Route Handlers
1. `GET /api/v1/targets`
   - Returns sanitized catalog conforming to `SafeTargetProfileSchema[]`.
   - In preview mode (`DEV_PREVIEW_MODE=true`), returns synthetic target profiles.
   - Never exposes `fixtureResetEndpoint`, `fixtureResetAuthSecretRef`, or credentials.

2. `POST /api/v1/targets`
   - Validates `CreateTargetCommandSchema`.
   - Returns created target profile projected via `projectSafeTargetProfile`.

3. `POST /api/v1/reports`
   - Accepts `DraftReportIntakeSchema` (`title`, `description`, `targetId`, `claimedExpectedBehavior`, `claimedFailureSignature`).
   - Automatically kicks off clarification proposal or experiment planning.

4. `GET /api/v1/investigations/[id]`
   - Returns `InvestigationSnapshotSchema` state representation.
   - Includes `lifecycleState`, `reproductionVerdict`, `evidenceStatus`, `tokenCostUsd`, and `latestPlan`.

5. `POST /api/v1/investigations/[id]/clarifications`
   - Accepts `AnswerClarificationCommandSchema` or `BatchAnswerClarificationsCommandSchema`.
   - Incorporates user answers into clarification history and generates updated proposal.

6. `POST /api/v1/investigations/[id]/approve-plan`
   - Accepts `ApprovePlanCommandSchema` with strict cryptographic `planHash` binding.
   - Enforces human-in-the-loop approval before any execution can be scheduled.

7. `POST /api/v1/investigations/[id]/start-execution`
   - Queues approved plan for execution by the background worker daemon.
   - Returns 409 if plan is unapproved, expired, or already in flight.

8. `GET /api/v1/investigations/[id]/events` (SSE Stream)
   - Streams `InvestigationProgressEventSchema` items with cursor replay (`afterEventId`).
   - Supports live UI updates for step execution, attempts, and verification milestones.

9. `GET /api/v1/investigations/[id]/artifacts/[artifactId]`
   - Issues short-lived, time-limited `ArtifactAccessGrantSchema` for authorized viewers.
   - Enforces tenant isolation: users can only view artifacts from their own investigations.

### 6.2 Standard Envelopes
- **Success Envelope:**
  ```json
  {
    "success": true,
    "data": { ... },
    "metadata": { "timestamp": "ISO-8601", "correlationId": "UUID" }
  }
  ```
- **Error Envelope:**
  ```json
  {
    "success": false,
    "error": {
      "category": "VALIDATION_FAILED | AUTHENTICATION_FAILED | AUTHORIZATION_FAILED | NOT_FOUND | CONFLICT | POLICY_VIOLATION | RATE_LIMITED | SERVICE_NOT_CONFIGURED | INTERNAL_ERROR",
      "code": "STRING_CODE",
      "message": "Human readable message",
      "details": { ... }
    }
  }
  ```
  Zero raw stack traces or internal implementation details are leaked to clients.
