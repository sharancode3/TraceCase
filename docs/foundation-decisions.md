# TraceCase — Foundation Decisions and Source Reconciliation

**Document ID:** `TC-DEC-001`  
**Document Version:** `1.0.0`  
**Creation Date:** 20 October 2026  
**Status:** Approved for Stage 0 Foundation Baseline  
**Authoring Role:** Implementation Engineer (Stage 0 Foundation Lead)  
**Governing Context:** Stage 0 — Shared Application Foundation  

---

## 1. Executive Purpose

This document resolves inconsistencies, version divergences, naming conflicts, and structural ambiguities across the 11 draft specification documents in `docs/`. It establishes an unambiguous, executable architectural baseline for the TraceCase codebase, preventing parallel contributors from inventing competing conventions or incompatible subsystems.

---

## 2. Reconciled Architectural Decisions

### 2.1 Next.js and React Baseline
- **Conflict:** Specifications reference Next.js 14 and 15 interchangeably; React 18 is cited in earlier notes while React 19 is cited in the TRD and UI/UX specification.
- **Sources:** `docs/trd.md` (§2.1), `docs/ui-ux-specification.md` (§2.2), `docs/system-architecture.md` (§3.1).
- **Decision:** Standardize on **Next.js 15.1+ (App Router)** with **React 19** and **TypeScript 5.6+**.
- **Rationale:** Next.js 15 App Router natively supports React 19 server components, server actions, and enhanced streaming APIs required for real-time investigation observation.
- **Classification:** Established project direction.
- **Affected Code:** `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/`.
- **Deferred Consequences:** Ensure third-party component libraries installed are React 19 compatible.

### 2.2 Package Manager Selection
- **Conflict:** Specification documents mention both `pnpm` and standard Node tooling.
- **Sources:** `docs/trd.md` (§2.4), `docs/test-evaluation-operations-and-execution-plan.md` (§20.1).
- **Decision:** Standardize on **pnpm 9.x** as the canonical package manager for the repository (`pnpm-lock.yaml`).
- **Rationale:** `pnpm` provides strict dependency isolation, prevents phantom dependencies, and optimizes disk cache usage.
- **Classification:** Established project direction.
- **Affected Code:** `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`.

### 2.3 Persistence Architecture: Pure PostgreSQL vs Managed Supabase
- **Conflict:** Initial PRD and AEC drafts referenced Supabase Auth and Supabase client libraries, while TRD, DBD, and SAD specify standard PostgreSQL 15, Drizzle ORM, and MinIO S3 object storage.
- **Sources:** `docs/prd.md` (§3.2), `docs/database-design-and-erd.md` (§3.1), `docs/trd.md` (§4.1).
- **Decision:** Standardize on **standard PostgreSQL 15** accessed via **Drizzle ORM** with **MinIO / S3-compatible Object Storage**. No proprietary Supabase client libraries (`@supabase/supabase-js`) are embedded into core data access or worker daemons.
- **Rationale:** Prevents vendor lock-in; ensures that local development runs reliably via standard Docker containers without requiring external cloud accounts or local Supabase emulator stacks.
- **Classification:** Established project direction.
- **Affected Code:** `src/server/db/`, `drizzle.config.ts`, `docker-compose.yml`.

### 2.4 API Route Structure and Canonical Prefix
- **Conflict:** Some draft examples use `/api/...` while others use `/api/v1/...`.
- **Sources:** `docs/api-and-event-contracts.md` (§3.1) vs `docs/system-architecture.md` (§5.1).
- **Decision:** Standardize on:
  - System Probes: `/api/health` and `/api/ready`.
  - Domain Operations: `/api/v1/investigations/...`, `/api/v1/targets/...`, `/api/v1/reports/...`.
- **Rationale:** Separates low-level infrastructure health probes from versioned domain contracts, enabling safe future API evolution.
- **Classification:** Implementation decision.
- **Affected Code:** `src/app/api/`.

### 2.5 Approval-Only vs Approval-and-Start Semantics
- **Conflict:** In some drafts, approving a plan immediately starts browser execution; in other drafts, approval is a distinct governance state.
- **Sources:** `docs/workflow-and-state-machine-specification.md` (§4.2) vs `docs/agent-and-tool-contracts.md` (§5.4).
- **Decision:** Separated two-step state transition:
  1. `POST /api/v1/investigations/:id/approve` validates `SHA-256(plan)` and transitions the investigation to `APPROVED`.
  2. Starting execution is a distinct transition to `QUEUED` when resources are ready.
  In Development Preview mode, the approval interaction is explicitly labelled as a **simulation**.
- **Rationale:** Adheres strictly to `TC-INV-003` and `TC-INV-004`. Cryptographic approval must be recorded immutably before any worker queue scheduling takes place.
- **Classification:** Explicit system requirement.
- **Affected Code:** `src/contracts/`, `src/server/controller/`, `src/features/planning/`.

### 2.6 Table and Entity Naming: `plan_approvals` and `investigation_events`
- **Conflict:** Earlier drafts intermittently used `approvals` and `outbox_events`.
- **Sources:** `docs/database-design-and-erd.md` (§4.2, §4.5) vs `docs/workflow-and-state-machine-specification.md` (§3.4).
- **Decision:** Standardize on **`plan_approvals`** and **`investigation_events`**.
- **Rationale:** Matches the audited ERD (`TC-DBD-001`) and prevents name collisions with generic access control systems.
- **Classification:** Established project direction.
- **Affected Code:** `src/server/db/schema/`.

### 2.7 Canonical Tri-Dimensional State Vocabulary
- **Conflict:** Specifications used varying terms for investigation states (e.g. `IN_PROGRESS` vs `RUNNING_ATTEMPT_1`, `SUCCESS` vs `CONFIRMED_REPRODUCED`).
- **Sources:** `docs/workflow-and-state-machine-specification.md` (§3.1), `docs/verification-evidence-and-safety-specification.md` (§3.2).
- **Decision:** Strictly enforce the Tri-Dimensional State Model (`TC-INV-007`):
  - **Execution Lifecycle State:** `DRAFT`, `PLANNING`, `AWAITING_APPROVAL`, `APPROVED`, `QUEUED`, `RUNNING_ATTEMPT_1`, `RESETTING_TARGET`, `RUNNING_ATTEMPT_2`, `FINALIZING_EVIDENCE`, `COMPLETED`, `FAILED`, `CANCELLED`.
  - **Reproduction Verdict:** `PENDING`, `CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONSISTENT_OBSERVATIONS`, `INCONCLUSIVE`.
  - **Evidence Readiness:** `PENDING_GENERATION`, `PACKAGING_IN_PROGRESS`, `PUBLIC_SAFE_READY`, `QUARANTINED_LEAK_DETECTED`, `STORAGE_SYNC_FAILED`.
  - **Attempt Validity:** `PENDING`, `VALID_DEFECT_DETECTED`, `VALID_CLEAN_RUN`, `INVALID_TIMEOUT`, `INVALID_CRASH`, `INVALID_BLOCKED`.
  - **Mutation Uncertainty:** `NONE`, `MUTATION_CONFIRMED`, `MUTATION_UNCERTAIN`.
- **Rationale:** Eliminates the fatal bug where an execution error or incomplete attempt is mistakenly reported as "Bug Not Reproduced".
- **Classification:** Non-negotiable architectural invariant.
- **Affected Code:** `src/contracts/status.ts`, `src/server/db/schema/`.

### 2.8 Single Concurrency Lease Scope
- **Conflict:** TRD describes worker concurrency = 1, while SAD describes global investigation concurrency = 1.
- **Sources:** `docs/trd.md` (§3.2) vs `docs/system-architecture.md` (§5.2).
- **Decision:** In Stage 0, both are established:
  - Each worker process executes at most 1 attempt simultaneously (`WORKER_CONCURRENCY = 1`).
  - The orchestrator enforces single active investigation admission across the platform using PostgreSQL advisory locks / row-level locks on `target_locks`.
- **Rationale:** Eliminates CPU/GPU contention during browser video recording and guarantees that concurrent runs do not cross-pollute the target web application.
- **Classification:** Established project direction.
- **Affected Code:** `worker/`, `src/server/controller/`.

### 2.9 Ownership and Tenancy Model
- **Conflict:** Some API draft snippets include an `org_id` parameter, suggesting multi-tenant organization hierarchies.
- **Sources:** `docs/api-and-event-contracts.md` (§4.1) vs `docs/prd.md` (§2.2).
- **Decision:** Stage 0 enforces **direct user resource ownership** (`created_by: userId`).
- **Rationale:** Building complex organization, tenant, invitation, and role hierarchy engines is out of scope for the hackathon baseline. Multi-tenancy is isolated behind the auth port.
- **Classification:** Implementation decision.
- **Affected Code:** `src/server/auth/`, `src/contracts/`.

### 2.10 Visual Design Tokens and Accessibility Contrast
- **Conflict:** Raw color tokens listed in initial design drafts required mathematical verification against WCAG AA standards.
- **Sources:** `docs/ui-ux-specification.md` (§3.1) vs WCAG 2.1 specifications.
- **Decision:** Calculated and verified functional color pairings:
  - Primary Action: Cobalt `#4767DB` on Canvas `#FFFFFF` = **4.88:1** (Passes WCAG AA).
  - Headings: Deep Navy `#161E38` on Canvas `#FFFFFF` = **15.6:1** (Passes WCAG AAA).
  - Subheadings: Deep Purple `#3A3A7B` on Canvas `#FFFFFF` = **9.87:1** (Passes WCAG AAA).
  - Muted Text: Slate Navy `#5F6782` on Canvas `#FFFFFF` = **5.61:1** (Passes WCAG AA).
  - Card Surface: Pale Lavender `#EDF0FF` with Navy Text `#161E38` = **13.5:1** (Passes WCAG AAA).
- **Rationale:** Guarantees strict visual fidelity to the TraceCase visual reference board while ensuring accessible readability.
- **Classification:** Implementation refinement.
- **Affected Code:** `src/components/ui/tokens.css`, `tailwind.config.ts`.

---

## 3. Summary of Deferred Capabilities

The following capabilities are explicitly defined as **typed integration interfaces** in Stage 0, with operational implementation deferred to subsequent stages:
1. **Live GPT-6 Luna API Client:** Typed adapter exists; real OpenAI API calls are blocked in Stage 0.
2. **Playwright Chromium Automation:** Browser tool interfaces and isolation boundaries are defined; headless browser launching is deferred to Stage 2.
3. **Queue Processing (`pg-boss`):** Worker daemon scaffold connects to queue abstraction; live job processing is deferred to Stage 4.
4. **Target Fixture Reset Execution:** Contract and reset payload schemas are defined; target HTTP calls are deferred to Stage 5.
5. **Real-Time Video/Log S3 Streaming:** S3 client configuration and dual-bucket policies are defined; live multipart upload is deferred to Stage 6.
