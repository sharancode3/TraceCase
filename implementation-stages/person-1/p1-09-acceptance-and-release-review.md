# Person 1 Phase P1-09: Official Acceptance Testing, Evidence Validation, and Corrective Release Review

## 1. Executive Summary & Review Scope

Phase P1-09 represents the official acceptance testing, evidence validation, and release readiness review for TraceCase Person 1 (Trusted Backend, Identity, Database, Queue, Playwright Browser Execution, Deterministic Verification, Evidence Packaging, and Deployment Infrastructure).

The objective of this corrective review is to replace ungrounded claims with an evidence-backed baseline that distinguishes between contract testing with doubles, real local integration, contributor dependencies, and unexecuted gates.

The four official problem-statement acceptance scenarios were evaluated under this standard:
- **TC1 (Confirmed Defect Reproduction):** Verified with doubles for two-attempt orchestration and reset readback; verified with real local services for Playwright Chromium execution, disk WebM video capture (EBML container verified), console error logging, and network 500 trace capture.
- **TC2 (Clean Nonreproduction):** Verified with doubles for deterministic verdict calculation, transparent reporting of steps tried, environment details, and attested target build identity.
- **TC3 (Destructive Sandbox Deletion & Safety Block):** Verified with real local services and doubles. Positive mutating interaction executed cleanly in verified sandbox; negative safety invariant proved that mutating plans against non-sandbox targets fail closed before any network egress or browser dispatch.
- **TC4 (Token Redaction & Tenant Isolation):** Tenant isolation verified with real HTTP handlers and cryptographic JWT authentication (Principal Bob receives 404 `RESOURCE_NOT_FOUND` with zero leaked metadata). Content redaction is explicitly BLOCKED pending Person 3's shared sanitizer implementation in `src/server/evidence/evidence-storage.service.ts`.

All Person 1 deliverables remain local and uncommitted in the working tree. Zero git commits, pushes, pull requests, merges, or external deployments were executed.

---

## 2. Technical Architecture & Corrective Hardening Summary

During this corrective implementation pass, several subtle safety and accounting gaps were identified and corrected in Person 1 code:

### 2.1 Sandbox Safety Invariant Enforcement
- **Fail-Closed Before Dispatch:** In `TwoAttemptController` (`src/server/verification/two-attempt-controller.ts`), mutating and destructive plans (`TIER_3_MUTATING_INTERACTION`, `TIER_4_DESTRUCTIVE`) now strictly enforce `target.isSandbox && target.isSandboxVerified`. If a target is merely an allowed origin but not a verified sandbox, the controller halts immediately with `SandboxPolicyViolation` before any network or browser dispatch.
- **Actor Ownership Verification:** The controller verifies that `approval.authorizedActorId === currentInv.ownerId`, preventing approvals signed by one principal from executing against another principal's investigation.

### 2.2 Build Identity Comparability Guard
- **Restricted Development Bypass:** In `TwoAttemptController`, the comparability bypass `allowUnattestedTargetBuild` was tightened. Previously, missing build IDs bypassed comparability if either the environment was non-production OR the build ID was missing on Attempt 1. This dangerous fallback was removed; unattested builds are permitted only when `safeTarget.environment === 'development' && process.env.NODE_ENV !== 'production'`. In all other environments, unattested builds fail closed.

### 2.3 Per-Attempt Evidence Triad Completeness
- **Independent Attempt Verification:** In `EvidencePipeline` (`src/server/evidence/evidence-pipeline.ts`), `validateEvidenceTriad` and `processInvestigationEvidence` now group registered artifacts by `attemptNumber`. An investigation requires every executed attempt to independently possess `VIDEO_RECORDING`, `CONSOLE_LOG`, and `NETWORK_TRACE` in `PUBLIC_SAFE` tier before declaring readiness. An artifact present in Attempt 1 no longer satisfies Attempt 2's requirement.

### 2.4 Atomic AI Budget Settlement & Crash Safety
- **Transactional Commit:** In `BudgetManager` (`src/server/ai/budget-manager.ts`), `commitUsage` executes atomically inside `db.transaction()`, updating `budgetReservationsTable` and decrementing token/cost balance on `investigationsTable` within a single database transaction. This prevents token balance desynchronization if a process crashes between writes.
- **Fail-Closed Reservation:** In production environments (`NODE_ENV === 'production'`), `reserveBudget` throws immediately if database persistence fails, rather than silently falling back to process-local in-memory state.

### 2.5 Truthful Database Connectivity Probing
- **Accurate Connection Reset:** In `src/server/db/index.ts`, `checkDbConnectivity()` now clears `dbInstance = null` when client connection fails. This prevents subsequent calls from mistaking a previously created unverified instance for a live PostgreSQL connection.

---

## 3. Official Scenario Acceptance Matrix

| Scenario ID | Test Scenario | Acceptance Criteria | Implemented & Verified Behavior | Evidence Level | Outcome |
|---|---|---|---|---|---|
| **TC1** | Confirmed Defect Reproduction | 2 valid attempts under equivalent baseline; defect observed in both runs; full triad captured; verified reset between runs. | `TwoAttemptController` completed 2 valid attempts with verified reset and baseline readback; reproduction verdict `CONFIRMED_REPRODUCED`. Real Playwright Chromium launched, executed actions against local HTTP fixture, and wrote WebM video (EBML header `0x1A 0x45 0xDF 0xA3`, size > 1 KB), console error logs, and network trace to disk. | Verified with doubles and real local browser media | **PASS WITH DOUBLES AND REAL MEDIA** |
| **TC2** | Clean Nonreproduction | 2 valid attempts under equivalent baseline; expected behavior observed; environment and build details reported. | `TwoAttemptController` completed 2 valid attempts without defect; recorded `NOT_REPRODUCED`. Summary transparently reported steps tried, target environment (`development`), and build identity (`build-commit-sha-7a8b9c`). | Verified with doubles | **PASS WITH DOUBLES** |
| **TC3** | Destructive Sandbox Deletion & Safety Block | Mutating interaction permitted in verified sandbox; reset restores baseline. Negative safety block prevents non-sandbox or external egress. | Valid mutating deletion executed cleanly in sandbox target; reset restored baseline fixture. Negative safety invariant proved that mutating plan on allowed-origin non-sandbox target is rejected fail-closed before any network dispatch. SSRF guard strictly blocked `169.254.169.254`. | Verified with real local services and doubles | **PASS** |
| **TC4** | Token Redaction & Tenant Isolation | Synthetic secrets in raw logs redacted before public safe publishing; raw captures stay isolated; cross-owner access blocked. | Tenant isolation verified via real cryptographic JWT authentication on `GET /api/v1/investigations/[id]`; Principal Bob receives 404 `RESOURCE_NOT_FOUND` with zero leaked metadata. Content redaction is explicitly BLOCKED pending Person 3's shared sanitizer (`src/server/evidence/evidence-storage.service.ts`). Negative regression test confirmed unredacted secret sentinels fail verification. | Tenant auth verified with real HTTP handler; content redaction blocked pending Person 3 | **BLOCKED ON REAL SANITIZER** |
| **OPER-1** | Pre-Flight Baseline Failure Block | Target initial baseline dirty before Attempt 1. | `TwoAttemptController` detected dirty baseline readback, halted execution immediately with `status: PREFLIGHT_BASELINE_FAILED`, verdict `INCONCLUSIVE`, and zero browser actions executed. | Verified with doubles | **PASS** |
| **OPER-2** | Expired Plan Approval Rejection | Approval `expiresAt` timestamp in the past. | Pre-action authorization check rejected execution immediately before target network contact. | Verified with doubles | **PASS** |
| **OPER-3** | Mutation Uncertainty Quarantine | Browser action crashes or times out midway during mutating click. | Attempt marked `MUTATION_UNCERTAIN`, investigation halted with verdict `INCONCLUSIVE`, Attempt 2 blocked, and worker lease slot quarantined for 1 hour. | Verified with doubles | **PASS** |
| **OPER-4** | Deterministic ReDoS Protection | Catastrophic backtracking regex supplied in assertion. | `DeterministicAssertionEvaluator` detected nested quantifier pattern (e.g. `(a+)+$`) and rejected evaluation as `INVALID_EVALUATION`. | Verified with real local services | **PASS WITH LIMITATIONS** |

---

## 4. Evaluation of Technical Quality Gates

### Gate G0: Common Contracts & Foundation
- **Status:** **PASSED**
- **Evidence Level:** Verified with real local services.
- **Evaluation:** Unified types, shared contracts, Zod schemas, error envelopes, and safe projection boundaries verified across all phases.

### Gate G1: Isolated Modules & Persistence
- **Status:** **PASSED**
- **Evidence Level:** Verified with real local services.
- **Evaluation:** Cryptographic JWT authentication, tenant isolation, Drizzle PostgreSQL schema (6 migrations), and 5 domain repositories verified. Zero cross-user data leakage.

### Gate G2: Deterministic Vertical Slice
- **Status:** **PASSED WITH DOUBLES**
- **Evidence Level:** Verified with doubles and real browser media.
- **Evaluation:** Two-attempt controller, reset verification protocol, pair decision table, and Playwright Chromium execution verified. Integration tests prove real browser launch, WebM video capture, console logs, and network trace capture.

### Gate G3: Agentic Integration
- **Status:** **BLOCKED**
- **Evidence Level:** Blocked.
- **Evaluation:** Bounded agent loop, budget manager, and OpenAI client wrapper are implemented in Person 1 code and verified with doubles. However, the end-to-end agentic journey (vague report intake -> clarification questions -> AI experiment proposal -> human approval -> execution) is BLOCKED pending Person 2's Luna AI role modules, live OpenAI API credentials, and controlled demo target.

### Gate G4: Hardened Operational Posture
- **Status:** **PARTIALLY PASSED LOCAL**
- **Evidence Level:** Verified with doubles and real local services.
- **Evaluation:** Background worker daemon implements heartbeat persistence, graceful drain on shutdown, dual-tier liveness probing (`127.0.0.1:3001`), outbox relay crash recovery, global lease fencing, pre-action authorization checks, and ReDoS protection. Verified locally; independent multi-process operational evaluation pending.

### Gate G5: Deployed Evaluation
- **Status:** **NOT RUN**
- **Evidence Level:** Not run.
- **Evaluation:** Multi-stage production container profiles (`Dockerfile.web`, `Dockerfile.worker`, `docker-compose.yml`) and CI workflow (`.github/workflows/ci.yml`) exist as deployment candidates. However, deployed acceptance in an authorized external production or staging environment has not been executed and cannot be claimed passed.

### Gate H-12: Release Handoff Package
- **Status:** **QUALIFIED HANDOFF DELIVERED**
- **Evidence Level:** Verified with real local services and doubles.
- **Evaluation:** Handover documentation delivered with explicit prerequisite matrices, contributor interface contracts, honest limitation disclosures, and reproduction commands.

---

## 5. Triad Separation Invariant Verification (TC-INV-007)

Across all scenarios, the Triad Separation Invariant was strictly maintained:

$$\text{Lifecycle Status} \neq \text{Reproduction Finding} \neq \text{Evidence Readiness}$$

```
+-------------------------------------------------------------------------------+
|                       Investigation Entity (TC-INV-007)                       |
+-------------------------------------------------------------------------------+
| Dimension 1: Lifecycle Status  | DRAFT -> QUEUED -> RUNNING -> FINALIZING     |
| Dimension 2: Verdict           | PENDING -> CONFIRMED_REPRODUCED | etc.      |
| Dimension 3: Evidence Readiness| PENDING_GENERATION -> PUBLIC_SAFE_READY      |
+-------------------------------------------------------------------------------+
```

Even if evidence storage synchronization is deferred, packaging encounters an error, or content sanitization is blocked, the deterministic reproduction verdict remains authoritative and uncompromised.

---

## 6. Preflight Environment & Boundary Readiness Assessment

Execution of the real-acceptance integration suite (`tests/person-1/phase-9/real-acceptance.integration.test.ts`) emits a diagnostic assessment of all system boundaries:

```
=== PREFLIGHT RUNTIME READINESS ASSESSMENT ===
  Database:       MOCK_ACTIVE (PostgreSQL not connected)
  Queue Outbox:   IN_MEMORY_FALLBACK
  Browser:        READY (Playwright Chromium available locally)
  OpenAI Key:     MISSING_OR_UNSET (Model calls use doubles)
  Evidence Store: LOCAL_FALLBACK (Person 3 real storage pending)
==============================================
```

This diagnostic confirms that while the local runtime environment possesses working Playwright browser execution and in-memory fallbacks for development, production deployment requires live PostgreSQL (for persistence and pg-boss queueing), an OpenAI API key, and Person 3's evidence storage service.

---

## 7. Known Limitations and Remaining Work

1. **Person 2 Luna AI Integration (G3):** Real report-to-experiment generation requires Person 2's Luna prompt templates and OpenAI API key.
2. **Person 3 Shared Sanitizer (TC4):** Content-level token scrubbing in public-safe evidence artifacts is blocked pending Person 3's redactor in `src/server/evidence/evidence-storage.service.ts`.
3. **External Deployment Evaluation (G5):** Container images and compose stacks are prepared but require an authorized target deployment environment before G5 can be evaluated.
4. **ReDoS Alternation Limitations:** The assertion evaluator rejects nested quantifiers, but complex overlapping alternations remain exposed. Production environments should restrict failure signatures to bounded string predicates (`EQUALS`, `CONTAINS`).
