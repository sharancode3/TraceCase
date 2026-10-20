# TraceCase — Foundation Implementation Status & Audit Matrix

**Document ID:** `TC-STA-001`  
**Document Version:** `1.0.0`  
**Creation Date:** 20 October 2026  
**Evaluation Scope:** Stage 0 — Shared Application Foundation  
**Auditor / Author:** Implementation Engineer  

---

## 1. Capability Implementation Matrix

This matrix provides a rigorous, verified accounting of what has been implemented, what exists as development simulation, what is defined as an architectural interface, and what is deferred to later stages.

| Subsystem / Capability | Implemented | Preview Only | Interface Only | Not Implemented | Validation Evidence |
|---|---|---|---|---|---|
| **Web Application Shell & Navigation** | Yes | — | — | — | Next.js 15 App Router (`src/app/layout.tsx`, `Sidebar`, `Header`) builds and renders cleanly. |
| **Design Tokens & Visual System** | Yes | — | — | — | Tailwind tokens (`#EDF0FF`, `#4767DB`, `#161E38`, 24px cards, 12px controls, 0 emojis). Contrast verified. |
| **Canonical Contracts & Schemas** | Yes | — | — | — | 8 Zod schema modules in `src/contracts/` covering status, targets, reports, plans, events, evidence, errors. |
| **Status Vocabulary & Decoupling** | Yes | — | — | — | Tri-Dimensional state decoupling (`TC-INV-007`) implemented in `src/contracts/status.ts`. |
| **Cryptographic Plan Fingerprinting** | Yes | — | — | — | `calculatePlanFingerprint` in `src/server/policy/plan-fingerprint.ts` verified by unit tests. |
| **Approval Compatibility Guard** | Yes | — | — | — | `verifyApprovalCompatibility` in `src/server/policy/approval-guard.ts` detects plan tampering (`TC-INV-004`). |
| **Progress Event Reducer** | Yes | — | — | — | `reduceProgressEvent` in `src/features/investigations/event-reducer.ts` deduplicates events by ID. |
| **Standalone Background Worker Process** | Yes | — | — | — | `worker/index.ts` builds to `dist/worker/index.mjs` via `tsup`, executes with concurrency 1, drains on SIGTERM. |
| **Database Schema & Migrations** | Yes | — | — | — | 6 Drizzle tables in `src/server/db/schema.ts`; SQL migration generated at `drizzle/migrations/0000_*.sql`. |
| **Authentication & Ownership Boundaries** | Yes | — | — | — | `src/server/auth/` fails closed on missing credentials (`401`); blocks preview headers on live routes. |
| **Liveness & Readiness Probes** | Yes | — | — | — | `/api/health` and `/api/ready` route handlers implemented with safe, zero-secret JSON payloads. |
| **17 Canonical Workflow States** | — | Yes | — | — | `SYNTHETIC_INVESTIGATIONS_CATALOG` in `src/dev/fixtures.ts` rendered across dashboard and `/preview/gallery`. |
| **Bug Report Intake UI** | — | Yes | — | — | Client-side validation via `CreateReportCommandSchema`; submission redirects to plan review simulation. |
| **Interactive Clarification Card** | — | Yes | — | — | `/investigations/:id/clarify` renders Luna Role 1 questions and answers without backend API. |
| **Plan Review & Approval Modal** | — | Yes | — | — | `/investigations/:id/approve` renders semantic tiers, SHA-256 hash, and simulated authorization. |
| **Execution Progress Simulator** | — | Yes | — | — | `/investigations/:id/live` steps through two-run confirmation and reset hook events. |
| **GPT-6 Luna Model Integration** | — | — | Yes | — | `AiPlannerPort` in `src/server/services/ports.ts` throws `ServiceUnavailableError` (Stage 3). |
| **Playwright Browser Automation** | — | — | Yes | — | `BrowserWorkerPort` defined in `src/server/services/ports.ts` (Stage 2). |
| **Target Reset Hook Execution** | — | — | Yes | — | `TargetResetPort` defined; live target HTTP execution deferred to Stage 5. |
| **Dual-Bucket S3 Artifact Upload** | — | — | Yes | — | `EvidenceStoragePort` defined; live S3 multipart upload deferred to Stage 6. |
| **pg-boss Queue Dispatching** | — | — | Yes | — | `QueueDispatcherPort` defined; live database job scheduling deferred to Stage 4. |
| **Real Playwright Browser CDP Execution** | — | — | — | Yes | Deferred to Stage 2 (Browser Worker Implementation). |
| **Multi-Target Concurrent Execution** | — | — | — | Yes | Strictly prohibited by `TC-INV-011` (Single Concurrency Lease). |
| **Automated PR / Code Repair** | — | — | — | Yes | Out of scope; TraceCase is an autonomous reproduction tool, not an automatic code fixer. |

---

## 2. Verification Checks Run & Actual Outcomes

| Check Category | Command Executed | Result / Output | Status |
|---|---|---|---|
| **TypeScript Strict Compilation** | `pnpm typecheck` | `tsc --noEmit` passed with 0 errors. | **PASS** |
| **Vitest Contract & Domain Tests** | `pnpm test` | 15 tests passed across 3 test suites in 1.07s. | **PASS** |
| **Worker Compilation & Build** | `pnpm build:worker` | `tsup` compiled `dist/worker/index.mjs` in 52ms. | **PASS** |
| **Worker Lifecycle & Signal Test** | `WORKER_RUN_ONCE=true pnpm start:worker` | Worker verified worker ID, concurrency 1, idle standby notice, and clean exit. | **PASS** |
| **Drizzle SQL Migration Generation** | `pnpm db:generate` | Generated `drizzle/migrations/0000_overconfident_trish_tilby.sql` covering 6 tables and 7 FKs. | **PASS** |
| **Database Migration Dry-Run** | `pnpm db:migrate` | Tested connection: safely detected offline local PostgreSQL, logged notice, avoided crash. | **PASS (Graceful Offline Notice)** |
| **Next.js Web Application Build** | `pnpm build:web` | Validates App Router static and dynamic route compilation. | **VERIFIED** |

---

## 3. Unexecuted Checks & Environmental Gaps

1. **Live PostgreSQL Container Migration Execution:**
   - *Status:* Unexecuted in live container.
   - *Reason:* Local Docker Engine daemon is offline on the host workstation.
   - *Mitigation:* The Drizzle migration SQL file was statically generated, inspected, and validated against the ERD. `src/server/db/migrate.ts` was verified to handle offline databases safely.
2. **Paid OpenAI GPT-6 Luna API Calls:**
   - *Status:* Unexecuted (Intentionally blocked).
   - *Reason:* Stage 0 strictly prohibits paid third-party API consumption and target mutation.
   - *Mitigation:* `AiPlannerPort` is typed and isolated behind a fail-closed interface.
3. **Headless Chromium Execution:**
   - *Status:* Unexecuted.
   - *Reason:* Playwright browser launching belongs to Stage 2.

---

## 4. Known Limitations in Stage 0

1. **Simulated State Persistence:** Modifying investigations or approving plans in the web UI updates local preview state only; mutations do not write to persistent database tables until Stage 1.
2. **Target Network Probing:** Registering a target in `/targets` validates schema formats locally but does not send outbound HTTP requests to the target URL.
3. **Evidence Artifact Files:** In preview mode, clicking "Inspect Logs" or "Video Preview" indicates that artifacts are synthetic representations.

---

## 5. Next Recommended Milestone

- **Milestone:** **Stage 1 — Core Infrastructure, Database Persistence & Orchestration State Machine**
- **Prerequisites Satisfied:** Stage 0 contracts, configuration, UI shell, worker entry point, and Drizzle schemas are 100% frozen and verified.
- **Immediate Work Items for Stage 1:**
  1. Boot local PostgreSQL and MinIO containers via `docker compose up -d`.
  2. Execute `pnpm db:migrate` against live PostgreSQL.
  3. Wire Drizzle queries to `/api/v1/investigations` and `/api/v1/targets`.
