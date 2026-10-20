# Person 1, Phase P1-06: Deterministic Assertions, Attempt Validity, Verified Fixture Restoration, and Two-Attempt Assessment — Handoff

## Phase Status: Completed

All deliverables for **Phase P1-06** have been implemented, verified, and integrated into the local working tree without committing or pushing.

---

## 1. What Was Built in Phase P1-06

1. **Pure Deterministic Assertion Evaluator (`DeterministicAssertionEvaluator`)**:
   - Evaluates frozen predicates against structured observations without I/O or AI inference.
   - Vocabulary: `ENTITY_PRESENCE` (`EXISTS`, `NOT_EXISTS`), `VALUE_COMPARISON` (`EQUALS`, `NOT_EQUALS`, `CONTAINS`, `NOT_CONTAINS`, `GREATER_THAN`, `LESS_THAN`, `MATCHES_REGEX`), `READBACK_STATE` (nested dot-paths), `NETWORK_OBSERVATION` (HTTP status codes), `CONSOLE_LOG_OBSERVATION` (text pattern matching).
   - Strict numeric safety: rejects `NaN`, `Infinity`, and empty string coercion.
   - Acquisition failure fail-closed: `NOT_EXISTS` does not pass on acquisition failure or timeout.

2. **Target Baseline Readback & Canonical Equivalence Comparator (`BaselineComparator`)**:
   - Recursively normalizes expected and observed states with sorted keys.
   - Prunes declared volatile fields (`timestamp`, `createdAt`, `updatedAt`, `lastModified`, `sessionId`, `etag`, `_ts`).
   - Computes deterministic SHA-256 digests.
   - Identifies discrepancies in values, logical entity IDs, missing keys, and unexpected keys.

3. **Scoped HTTP Target Reset Coordinator (`TargetResetClient`)**:
   - Authenticated POST request to target's reset endpoint with secret header `X-TraceCase-Reset-Secret`.
   - Independent GET request to readback baseline endpoint.
   - Prevents fake reset proof: HTTP 200 on reset fails if readback baseline remains dirty or altered.
   - Enforces `TargetNetworkGuard` to prevent cloud metadata or unauthorized egress.

4. **Attempt Validity Assessor (`AttemptAssessor`)**:
   - Evaluates 4-point validity: Preconditions Met, Target Scope Adhered, Procedure Completed Cleanly, and Required Observations Available.
   - Resolves 5 attempt findings: `REPORTED_FAILURE`, `EXPECTED_BEHAVIOR`, `CONTRADICTORY` (marked invalid), `UNEXPECTED_OUTCOME`, `UNRESOLVED`.

5. **Master Pair Assessor (`PairAssessor`)**:
   - Implements the complete 16-scenario decision table.
   - Confirmation strictly requires 2 independent valid matching runs under verified baseline conditions (TC-INV-002).
   - Clean nonreproduction requires 2 valid clean runs showing expected behavior.
   - Intermittent or divergent runs resolve to `INCONSISTENT_OBSERVATIONS`.
   - Interrupted or unverified runs resolve to `INCONCLUSIVE`.

6. **Two-Attempt Controller Orchestrator (`TwoAttemptController`)**:
   - Owns Attempt 1, Reset Gate, and Attempt 2 in fresh isolated contexts.
   - Blocks Attempt 2 if target reset fails or readback indicates dirty state.
   - Quarantines lease if mutating action encounters uncertainty.
   - Persists execution facts, reset receipts, evaluations, and pair assessments to PostgreSQL.

7. **Database Migrations and Repositories**:
   - Migration `0004_parched_bucky.sql` applied.
   - Added tables: `investigation_attempts`, `assertion_evaluations`, `reset_receipts`, `pair_assessments`.
   - Added persistent quarantine tracking to `global_execution_leases`.

---

## 2. Information for Person 2 (Controlled Target & AI Roles)

### Target Reset and Readback Contract

Person 2's controlled target application must implement the following authenticated HTTP endpoints:

1. **Scoped Reset Endpoint**:
   - **Method**: `POST`
   - **URL**: Configured on target profile (`fixtureResetEndpoint`), e.g., `/api/test/reset-fixture`.
   - **Headers**: `X-TraceCase-Reset-Secret: <configured_secret>`, `Content-Type: application/json`.
   - **Body**:
     ```json
     {
       "targetId": "<target-uuid>",
       "fixtureScope": "default",
       "attemptPairId": "<execution-request-uuid>"
     }
     ```
   - **Expected Status**: `HTTP 200 OK`.

2. **Independent Baseline Readback Endpoint**:
   - **Method**: `GET`
   - **URL**: Configured on target profile or `${baseUrl}/api/test/baseline`.
   - **Headers**: `Accept: application/json`, `X-TraceCase-Reset-Secret: <configured_secret>`.
   - **Expected Body**: Clean JSON state projection containing:
     - `targetId`: string matching target UUID.
     - `environment`: `'staging' | 'development' | 'demo'`.
     - `buildVersion`: stable version/hash string (must remain identical between attempts).
     - Application entities (e.g. `balance`, `accounts`, `items`) matching initial expected state.
   - **Notice**: Do not rely on returning `{ "isRestored": true }`. The host independently compares observed values against the approved baseline.

### Proposal Oracle Vocabulary for AI Role 1 (Luna)

When proposing assertions in `AuthoritativeExperimentPlan`, AI Role 1 must strictly choose from:
- `kind`: `'ENTITY_PRESENCE' | 'VALUE_COMPARISON' | 'READBACK_STATE' | 'NETWORK_OBSERVATION' | 'CONSOLE_LOG_OBSERVATION'`
- `operator`: `'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'NOT_CONTAINS' | 'GREATER_THAN' | 'LESS_THAN' | 'MATCHES_REGEX'`
- `purpose`: `'EXPECTED_CORRECT_BEHAVIOR' | 'REPORTED_FAILURE_SIGNATURE' | 'PRECONDITION'`
- Note: Both an `EXPECTED_CORRECT_BEHAVIOR` assertion and a `REPORTED_FAILURE_SIGNATURE` assertion must be provided so the verifier can discriminate between valid confirmation and clean nonreproduction.

---

## 3. Information for Person 3 (Frontend & Evidence Pipeline)

### Three-Dimensional State Model (TC-INV-007)

Person 3's UI and evidence consumers must observe three distinct state dimensions:

1. **Lifecycle Status (`investigations.lifecycleStatus`)**:
   - Progresses through: `DRAFT` -> `CLARIFYING` -> `PLAN_PROPOSED` -> `APPROVED` -> `QUEUED` -> `CLAIMED` -> `RUNNING_ATTEMPT_1` -> `RESETTING_TARGET` -> `RUNNING_ATTEMPT_2` -> `FINALIZING_EVIDENCE` -> `COMPLETED` (or `FAILED` / `CANCELLED`).
2. **Reproduction Verdict (`investigations.reproductionVerdict`)**:
   - `CONFIRMED_REPRODUCED`: Two valid matching runs under verified baseline.
   - `NOT_REPRODUCED`: Two valid clean runs under verified baseline.
   - `INCONSISTENT_OBSERVATIONS`: Observed in one run or divergent errors.
   - `INCONCLUSIVE`: Reset failed, run invalid, observation unavailable, or cancelled.
   - `UNRESOLVED`: Pre-execution default.
3. **Evidence Readiness (`captures.status` & `investigations.evidenceReadiness`)**:
   - Staged captures remain `PRIVATE_STAGED` until Person 3's shared sanitizer redacts sensitive fields and verifies playable screen recordings.
   - A verdict of `CONFIRMED_REPRODUCED` can coexist with incomplete evidence if video processing is pending.

### Relational Persistence Query Endpoints

- Attempts: query `investigation_attempts` by `investigationId`.
- Assertion Evaluations: query `assertion_evaluations` by `investigationId` and `attemptId`.
- Reset Receipts: query `reset_receipts` by `investigationId`.
- Pair Assessment: query `pair_assessments` by `investigationId`.

---

## 4. Entry Conditions for Phase P1-07

Phase P1-07 (Autonomous AI Investigation & End-to-End Orchestration) can build directly on:
- `TwoAttemptController` for executing bounded pairs.
- `TargetResetClient` for automated reset coordination.
- `attemptsRepository` and `eventsRepository` for durable state recording.
- Re-verified queue processing with lease fencing in `worker/index.ts`.
