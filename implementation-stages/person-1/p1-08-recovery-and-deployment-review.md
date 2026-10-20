# Person 1 Phase P1-08: Failure Recovery, Operational Hardening, and Deployment Preparation - Review

## 1. Phase Objective & Overview
Phase P1-08 completes the server-side, queue, verification, operational hardening, and deployment preparation work for TraceCase Person 1. The objective is to make the existing trusted execution system recover safely from failures, report its capabilities truthfully without masking missing components, enforce resource bounds and process boundaries, and provide reproducible deployment candidates for both the web application and the background worker daemon.

All changes are local and uncommitted, strictly preserving existing uncommitted work across all previous phases.

---

## 2. Completed Capabilities & Technical Architecture

### 2.1 Worker Heartbeat & Daemon Liveness Probing
- **Schema & Migration:**
  - Added `worker_heartbeats` table in `src/server/db/schema.ts` tracking `worker_id`, `status` (`ACTIVE`, `DRAINING`, `OFFLINE`), `active_jobs`, `hostname`, `pid`, `last_heartbeat_at`, and `started_at`.
  - Generated and applied Drizzle migration `drizzle/migrations/0006_lumpy_iron_patriot.sql`.
- **Worker Heartbeat Service:**
  - Implemented `WorkerHeartbeatService` (`src/server/queue/worker-heartbeat.service.ts`).
  - Integrated into `worker/index.ts` with initial heartbeat registration, periodic updates every 10 seconds, graceful drain on `SIGTERM`/`SIGINT`, and clean `OFFLINE` status registration on shutdown.
  - Provided `isAnyWorkerActive(maxAgeMs)` for operational readiness checks.

### 2.2 Outbox Relay Crash Recovery & Deduplication
- **In-Flight Abandonment Recovery:**
  - Implemented `recoverAbandonedProcessingMessages(maxAgeMs)` in `OutboxRelayService` (`src/server/queue/outbox-relay.service.ts`).
  - Automatically identifies outbox entries stuck in `PROCESSING` status beyond timeout due to worker process crashes and resets them to `PENDING` with retry increment.
- **Atomic Conditional Claiming:**
  - Hardened outbox claiming with atomic conditional updates: `WHERE id = ? AND status = 'PENDING'` using `.returning()`, preventing duplicate concurrent relay dispatches.

### 2.3 Durable Cross-Process AI Budget Reservation
- **Schema & Storage:**
  - Added `budget_reservations` table (`src/server/db/schema.ts`) recording `investigation_id`, `ticket_id`, `reserved_usd`, `status`, `actual_cost_usd`, `created_at`, `expires_at`, and `settled_at`.
- **Cross-Process Coordination:**
  - Hardened `AIBudgetManager` (`src/server/ai/budget-manager.ts`) to query database-backed active unexpired reservations across process boundaries before granting spend allowance, preventing lost updates across web and worker nodes.

### 2.4 Investigation Claim Handler Hardening & Terminal Deduplication
- **Terminal Duplicate Rejection:**
  - Hardened `InvestigationClaimHandler` (`src/server/queue/investigation-claim-handler.ts`).
  - Immediately rejects duplicate deliveries for execution requests in terminal (`COMPLETED`, `FAILED`, `CANCELLED`) or active (`CLAIMED`, `ACTIVE`) states with `ALREADY_TERMINAL` or `ALREADY_CLAIMED`.
- **Payload Identity Binding:**
  - Verifies identity binding (`investigationId`, `planVersion`, `planHash`) against persisted database records before admitting worker execution.
- **Post-Verification Pipeline:**
  - Connected the complete post-verification sequence: registers attempt captures from directory, packages public-safe evidence, and updates lifecycle state to `COMPLETED` without conflating reproduction verdicts (TC-INV-007).

### 2.5 Verification Layer Hardening & ReDoS Safety
- **Global Lease Heartbeat & Loss Detection:**
  - In `TwoAttemptController` (`src/server/verification/two-attempt-controller.ts`), added periodic 15-second lease renewal background timer with `try/finally` cleanup and checks return status of lease renewal, failing closed if lease is revoked.
- **Pre-Flight Target Baseline Verification:**
  - Halts execution immediately with `PREFLIGHT_BASELINE_FAILED` / `INCONCLUSIVE` if pre-flight baseline readback fails before Attempt 1 actions run, preventing dirty fixture contamination.
- **Deterministic Assertion Evaluator Hardening:**
  - In `DeterministicAssertionEvaluator` (`src/server/verification/evaluator.ts`), added catastrophic backtracking nested quantifier detection (`/\([^)]*(\+|\*|\{\d+,?\d*\})[^)]*\)(\+|\*|\{\d+,?\d*\})/`) to prevent ReDoS attacks.
  - Bounded evaluation string length to 5000 characters and regex pattern length to 200 characters.
- **Comparability & Target Build Identity:**
  - In `PairAssessor` (`src/server/verification/pair-assessor.ts`), added build identity verification across attempts. If both build IDs are provided and differ, comparability fails closed (`buildsMatch = false`) with limitation recording mid-experiment deployment change.
  - Respects `allowUnattestedTargetBuild` for development and demo environments.

### 2.6 Truthful Readiness Probing
- **Truthful Readiness Endpoint (`/api/ready`):**
  - Probes live database connectivity, worker heartbeat freshness, queue adapter health, and OpenAI configuration.
  - Truthfully returns HTTP 503 `DEGRADED` or `NOT_READY` when worker daemons are inactive, queue is offline, or database is unreachable, never pretending offline components are operational.

### 2.7 Containerization & Deployment Preparation
- **Dockerfile.web:** Multi-stage production build for Next.js application, non-root `nextjs` user (UID 1001), healthcheck via `/api/health`, port 3000 exposed.
- **Dockerfile.worker:** Multi-stage production build for worker daemon, Debian Bookworm base with Playwright Chromium OS packages installed, non-root `tcworker` user (UID 1001), worker healthcheck on port 3001, port 3001 exposed.
- **docker-compose.yml:** Full local deployment candidate profile with `postgres` (PostgreSQL 15), `web`, and `worker` services with healthchecks, environment mapping, and dependency ordering.
- **.github/workflows/ci.yml:** Upgraded to Node 22 LTS, disposable PostgreSQL service container, database migration step, unit and integration tests, web and worker builds, and worker entrypoint verification.

---

## 3. Verification & Quality Gates

| Check | Tool / Command | Result |
|---|---|---|
| TypeScript Typechecking | `pnpm typecheck` | Passed (0 errors) |
| ESLint Code Quality | `pnpm lint` | Passed (0 warnings, 0 errors) |
| Vitest Unit & Integration Test Suite | `pnpm test` (`vitest run`) | Passed (43 test files, 225 tests passed) |
| Next.js Production Build | `pnpm build:web` | Passed (all pages static/dynamic compiled) |
| Worker Daemon Production Bundle | `pnpm build:worker` | Passed (tsup ESM dist/worker/index.mjs generated) |
| Worker Run-Once Verification | `WORKER_RUN_ONCE=true node dist/worker/index.mjs` | Passed (exit code 0) |

---

## 4. Invariant Compliance
- **TC-INV-007 (Triad Separation):** Lifecycle state (`COMPLETED`), reproduction verdict (`CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONCLUSIVE`), and evidence readiness (`PUBLIC_SAFE_READY`, `PENDING_GENERATION`) remain orthogonal in schema, models, services, and APIs.
- **TC-INV-011 (Concurrency-1 Singleton):** Worker respects single-slot global execution lease.
- **TC-INV-013 (Mutation Uncertainty):** Evaluator and claim handler preserve mutation uncertainty states (`NONE`, `MUTATION_CONFIRMED`, `MUTATION_UNCERTAIN`).
- **Emoji Free:** Zero emojis across all code, tests, docs, and logs.
