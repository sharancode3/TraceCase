# Phase P1-04: Durable Queue, Worker Ownership, Global Execution Admission, Recovery Boundaries, and Replayable Progress — Review

## 1. Executive Summary

Phase P1-04 establishes the durable background-job infrastructure, single-slot global execution lease with monotonic epoch fencing, persistent worker daemon, and replayable progress event stream for TraceCase.

All components adhere strictly to the project rules:
- Zero emojis in code, logs, and documentation.
- No git commits, pushes, merges, or deployments.
- Complete preservation of Person 2's AI and controlled target implementations.
- Complete preservation of Person 3's UI, styling, and evidence storage components.
- Truthful reporting: Browser reproduction execution is explicitly gated and reported as unavailable, as scheduled for Phase P1-05. The entire queue, lease, and worker pipeline is proven end-to-end using a harmless internal diagnostic job (`system-diagnostic`).

---

## 2. Implemented Architecture and Components

### 2.1 Pinned pg-boss Version Compatibility
- Selected and installed `pg-boss@10.4.2`, which provides strict compatibility with Node 20 (matching `.github/workflows/ci.yml`).
- Configured dedicated queue schema separation (`schema: 'pgboss'`) preventing queue maintenance structures from cluttering application domain tables.

### 2.2 Transactional Outbox Pattern
To prevent dual-write failure modes (where database updates succeed but queue submission fails, or vice versa), the application implements the Transactional Outbox Pattern:
- Table: `outbox_messages` (`id`, `queue_name`, `payload`, `singleton_key`, `status`, `attempts`, `error_message`, `created_at`, `sent_at`).
- Admission writes: The HTTP start boundary creates an `execution_requests` row, emits an `EXECUTION_ADMITTED` progress event, and inserts an outbox message within a single database transaction.
- Service: `OutboxRelayService` scans pending messages, dispatches them via the queue adapter, and marks them `SENT`.

### 2.3 Global Execution Lease and Epoch Fencing
To enforce the platform-wide invariant that at most one active execution may run at any time across all distributed worker processes:
- Table: `global_execution_leases` (`slot_name = 'GLOBAL_SLOT_SINGLETON'`, `worker_instance_id`, `execution_request_id`, `investigation_id`, `ownership_epoch`, `lease_expires_at`, `acquired_at`, `updated_at`).
- Monotonic Epoch Fencing: Each acquisition increments `ownership_epoch`.
- Service: `ExecutionLeaseService` handles atomic acquisition, heartbeat renewal, and fenced write validation (`assertFencingEpoch`). Stale worker writes from expired leases or displaced nodes are strictly rejected via `StaleWorkerFencingError`.

### 2.4 Harmless Diagnostic Job (`system-diagnostic`)
- Service: `DiagnosticJobHandler` executes harmless diagnostic runs.
- Table: `diagnostic_runs` (`id`, `job_id`, `worker_instance_id`, `status`, `fencing_epoch`, `started_at`, `completed_at`, `details`).
- Proves end-to-end queue claiming, global lease acquisition, monotonic epoch verification, and receipt logging without executing untrusted browser steps.
- CLI Operational Script: `scripts/run-diagnostic.ts` provides single-command trigger and verification.

### 2.5 Claim-Time Precondition Verification and Recovery Boundaries
- Service: `InvestigationClaimHandler` re-verifies owned resources at worker claim:
  - If human approval was revoked while queued, the job is cancelled without execution.
  - If the investigation was cancelled prior to claim, the execution request is marked `CANCELLED`.
  - Truthfully reports `EXECUTOR_UNAVAILABLE` when default live browser worker is invoked, while supporting injected mock executors for test harnesses.

### 2.6 Serialized Progress Events, Cursor Replay, and SSE Streaming
- Column: `event_sequence_counter` on `investigations` table provides strictly serialized sequence indices.
- Service: `investigationWorkflowService.emitEvent` atomically increments the counter and emits ordered events.
- Read Model: `getInvestigationSnapshot` surfaces `eventWatermark` reflecting the latest counter value.
- Replay Endpoint: `GET /api/v1/investigations/[id]/events` supports `afterSequence` cursor pagination.
- Streaming Endpoint: `GET /api/v1/investigations/[id]/stream` delivers live Server-Sent Events (`text/event-stream`) with `id: <sequenceIndex>`, `event: <eventType>`, backlog playback, 15-second heartbeat pings, and clean abort-signal disconnect handling.

### 2.7 Persistent Background Worker Runtime
- File: `worker/index.ts`.
- Manages queue lifecycle, subscribes to diagnostic and investigation queues, runs periodic outbox relays, exposes a private health probe on `WORKER_PORT` (default 3001), and handles graceful shutdown on `SIGTERM` and `SIGINT` with job draining.
- Supports `WORKER_RUN_ONCE=true` for deterministic CI execution.

### 2.8 Truthful System Readiness Probe
- Endpoint: `GET /api/ready` reports:
  - `database`: PostgreSQL connectivity.
  - `executionQueue`: Configured, outbox relay ready, diagnostic ready.
  - `browserAutomation`: Truthfully marked `driverAvailable: false`, `status: 'runtime_deferred_p1_05'`.

---

## 3. Verification and Test Results

### 3.1 Test Suite Breakdown
1. `tests/person-1/phase-4/fencing-and-leases.test.ts`:
   - Initial acquisition at epoch 1.
   - Slot occupied rejection for competing workers.
   - Heartbeat renewal with matching epoch.
   - Monotonic epoch increment on expired lease takeover.
   - Strict rejection of stale worker writes via `StaleWorkerFencingError`.
   - Clean lease release.
2. `tests/person-1/phase-4/outbox-and-dispatch.test.ts`:
   - Outbox message and execution request insertion.
   - Approval requirement validation.
   - Outbox relay delivery and status transition to `SENT`.
   - Retry tracking and `FAILED` transition after threshold.
3. `tests/person-1/phase-4/diagnostic-job.test.ts`:
   - Diagnostic claim, lease acquisition, receipt writing, and release.
   - Idempotent duplicate delivery handling.
   - Rejection when slot is occupied.
4. `tests/person-1/phase-4/progress-and-replay.test.ts`:
   - Monotonic event sequence counter increments.
   - Cursor-based replay via `eventsRepository`.
   - HTTP GET `/events` cursor query.
   - SSE streaming route with backlog and event framing.
5. `tests/person-1/phase-4/cancellation-and-recovery.test.ts`:
   - Revocation at claim cancellation.
   - Pre-claim cancellation handling.
   - Truthful unavailable executor reporting.
   - Injected mock browser worker execution.
6. `tests/person-1/phase-4/real-db-integration.test.ts`:
   - Live PostgreSQL connectivity verification; fails informatively when offline with clear actionable guidance.

### 3.2 Automated Check Results
- Vitest suite: 25 test files passed, 131 tests passed (0 failures).
- TypeScript: `tsc --noEmit` passed with 0 errors.
- ESLint: `next lint` passed with 0 warnings and 0 errors.
- Build: `next build` and `tsup worker/index.ts` completed with exit code 0.
