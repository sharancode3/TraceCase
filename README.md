# TraceCase

**Autonomous, Deterministic Web Application Defect Reproduction and Verifiable Evidence Pipeline**

---

## Document Control and System Metadata

- **System Identifier:** TraceCase Foundation Core
- **Repository Version:** 1.0.0-stage0
- **Implementation Milestone:** Stage 0 — Shared Application Foundation
- **Operating Mode:** Development Preview Active (Synthetic Fixtures)
- **Primary AI Model Target:** OpenAI GPT-6 Luna (Exclusive Structured Output Adapter; Integration Deferred to Stage 3)
- **Execution Engine Target:** Playwright Chromium Headless via Chrome DevTools Protocol (Worker Scaffold Implemented)
- **Persistence Layer:** PostgreSQL 15 with Drizzle ORM (Schema and Migrations Implemented)
- **Object Storage Target:** Dual-Bucket S3 Architecture (MinIO / AWS S3; Interface Implemented)
- **Repository Remote:** `https://github.com/sharancode3/TraceCase.git`

---

## Executive Overview and Product Intent

Software engineering teams lose considerable velocity investigating vague, incomplete, and non-reproducible bug reports. Traditional bug reporting relies on ambiguous human write-ups, volatile application logs, and ad-hoc screenshots that frequently leak credentials or user PII.

**TraceCase** is designed to transform unstructured bug reports into deterministic, two-run confirmed bug reproduction packages. The intended end-to-end operational flow is:

```text
Authorized Target Registration
  -> Bug Report Intake
  -> AI-Assisted Normalization & Clarification (Luna Role 1)
  -> Versioned Experiment Plan (Luna Role 2)
  -> Mandatory Human Operator Authorization Gate (TC-INV-003, TC-INV-004)
  -> First Browser Execution Run (Isolated Chromium Context)
  -> Deterministic Verifier Assertion Check (Code, Not LLM)
  -> Target Baseline Restoration Hook (POST /api/test/reset-fixture)
  -> Second Browser Execution Run (Fresh Context)
  -> Verification Matching & In-Stream Secret Scrubbing (TC-INV-009)
  -> Evidence Triad Finalization (Video .webm, Console .log, Network .json)
  -> Audited Natural Language Synthesis (Luna Role 3)
```

---

## Current Status: Stage 0 Foundation Reality

To maintain strict engineering transparency, this repository currently reflects **Stage 0: The Complete Shared Foundation**. It provides a working, typed, and navigable foundation for subsequent implementation stages.

### 1. What Stage 0 Implements
- **Working Web Application Shell:** Next.js 15.1 App Router application with responsive navigation, breadcrumbs, and layout components.
- **Reference-Aligned Design System:** Lavender surfaces (`#EDF0FF`), cobalt actions (`#4767DB`), deep navy text (`#161E38`), rounded cards (`rounded-card`), and circular icon buttons. Strictly zero emojis. All color pairings mathematically achieve WCAG AA/AAA contrast ratios.
- **Canonical Executable Contracts:** Strict Zod schemas and inferred TypeScript types in `src/contracts/` covering status, targets, reports, plans, events, evidence, and safe error envelopes. Server-owned authority fields are strictly protected against client tampering.
- **Tri-Dimensional State Decoupling (`TC-INV-007`):** Execution Lifecycle State, Reproduction Verdict, and Evidence Readiness are maintained as independent dimensions in code and UI presentation.
- **Domain Security Helpers:** Tested pure implementations of deterministic plan fingerprinting (`SHA-256`), approval compatibility verification (`verifyApprovalCompatibility`), and progress event deduplication.
- **Database Schema and Migrations:** 6 relational tables declared via Drizzle ORM in `src/server/db/schema.ts` and initial SQL migration generated in `drizzle/migrations/`.
- **Authentication and Ownership Boundary:** Trusted port in `src/server/auth/` that fails closed on unauthenticated live mutations and prevents preview personas from accessing protected live operations.
- **Separately Executable Background Worker Process:** Standalone Node.js daemon in `worker/index.ts` that builds independently via `tsup`, logs single concurrency lease (`TC-INV-011`), handles `SIGTERM`/`SIGINT` graceful shutdown, and serves an internal `/health` probe on port 3001.
- **Automated Test Suite & CI:** Vitest contract, domain, and security boundary tests passing with 100% success; GitHub Actions CI workflow in `.github/workflows/ci.yml`.

### 2. What is Preview-Only in Stage 0
- **17 Canonical Workflow States:** Navigable development previews of all 17 canonical states defined by the specifications, accessible via the main dashboard and `/preview/gallery`.
- **Simulated Workflow Steps:** Report intake validation, clarification cards, plan review, and operator approval are interactive simulations in local memory.
- **Simulated Progress Reducer:** `/investigations/:id/live` allows contributors to step through the two-run confirmation lifecycle using a deterministic event reducer.
- **Synthetic Evidence Manifests:** Media placeholders and logs indicate that evidence is simulated. No real video recording or live network packets are presented as genuine.

### 3. What is Interface-Only (Deferred to Later Stages)
- **Live GPT-6 Luna Client:** Typed interface `AiPlannerPort` in `src/server/services/ports.ts` throws `ServiceUnavailableError`. Real OpenAI API calls will be wired in Stage 3.
- **Live Playwright Chromium Execution:** Browser tool wrapper contracts exist; headless browser automation on live targets will be implemented in Stage 2.
- **Live Target Reset Execution:** Reset hook contracts exist; outbound HTTP requests to target endpoints will activate in Stage 5.
- **pg-boss Queue Dispatching:** Worker queue consumption will be integrated in Stage 4.
- **Dual-Bucket S3 Persistence:** S3 client configuration and lifecycle rules are defined; live multipart uploads will activate in Stage 6.

---

## Canonical Hackathon Target Scenarios

TraceCase is designed to benchmark against four canonical problem statement scenarios. In Stage 0, these exist as fully documented test specifications and synthetic preview fixtures:

| Scenario | Objective | Target Fixture Mode | Verification Assertion | Expected Final Verdict | Evidence Readiness |
|---|---|---|---|---|---|
| **TC1** | Deterministic Two-Run Confirmation | `TraceCase-Demo-Tasks`<br/>(Array Index Offset Bug Active) | Filter Active -> Delete item -> Assert wrong item deleted across two consecutive runs with baseline reset. | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY`<br/>(Synced Video, Logs, Traces) |
| **TC2** | Non-Reproducible Defect (Clean Baseline) | `TraceCase-Demo-Tasks`<br/>(Fixed Application Build) | Execute identical steps -> Assert correct item deleted -> Bug not observed across two runs; baseline preserved. | `NOT_REPRODUCED` | `PUBLIC_SAFE_READY`<br/>(Clean Baseline Verified) |
| **TC3** | Sandbox Guardrail Enforcement | Variant A: Sandbox Target<br/>Variant B: Production Target | Variant A: Tier 4 action authorized by operator -> Executed.<br/>Variant B: Tier 4 action blocked pre-execution by Policy Engine (`TC-INV-008`). | A: Per Application<br/>B: `INCONCLUSIVE` (Blocked) | A: `PUBLIC_SAFE_READY`<br/>B: `PENDING_GENERATION` |
| **TC4** | PII & Secret In-Stream Redaction | `TraceCase-Demo-Tasks`<br/>(Debug Auth Leak Active) | Injected synthetic JWTs (`synthetic-jwt-token-xyz`), Bearer tokens, and API keys scrubbed in worker memory before public export. | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY`<br/>(0 Plaintext Secrets in S3) |

---

## Specification and Architecture Documentation

All 11 formal specification documents and 4 companion foundation manuals are maintained in the [`docs/`](docs/) directory:

### Foundation Governance & Setup Documents
- [`docs/foundation-decisions.md`](docs/foundation-decisions.md): Complete reconciliation of version conflicts, naming, and architectural decisions.
- [`docs/foundation-status.md`](docs/foundation-status.md): Detailed capability implementation matrix and test verification record.
- [`docs/development-setup.md`](docs/development-setup.md): Complete developer workstation installation and execution runbook.
- [`docs/contribution-boundaries.md`](docs/contribution-boundaries.md): Module ownership, import rules, and cross-team coordination boundaries.

### Core Architectural Specifications
- [`docs/prd.md`](docs/prd.md) (`TC-PRD-001`): Product Requirements Document.
- [`docs/trd.md`](docs/trd.md) (`TC-TRD-001`): Technical Requirements Document.
- [`docs/ps-requirements-traceability-matrix.md`](docs/ps-requirements-traceability-matrix.md) (`TC-RTM-001`): Problem Statement Requirements Traceability Matrix.
- [`docs/workflow-and-state-machine-specification.md`](docs/workflow-and-state-machine-specification.md) (`TC-WFM-001`): Workflow and State-Machine Specification.
- [`docs/database-design-and-erd.md`](docs/database-design-and-erd.md) (`TC-DBD-001`): Database Design and Entity-Relationship Specification.
- [`docs/system-architecture.md`](docs/system-architecture.md) (`TC-SAD-001`): System Architecture Document.
- [`docs/ui-ux-specification.md`](docs/ui-ux-specification.md) (`TC-UIX-001`): UI/UX Design and Interaction Specification.
- [`docs/agent-and-tool-contracts.md`](docs/agent-and-tool-contracts.md) (`TC-AGT-001`): Agent and Tool Contracts Specification.
- [`docs/api-and-event-contracts.md`](docs/api-and-event-contracts.md) (`TC-AEC-001`): API and Event Contracts Specification.
- [`docs/verification-evidence-and-safety-specification.md`](docs/verification-evidence-and-safety-specification.md) (`TC-VES-001`): Verification, Evidence, and Safety Specification.
- [`docs/test-evaluation-operations-and-execution-plan.md`](docs/test-evaluation-operations-and-execution-plan.md) (`TC-TEO-001`): Unified Test, Evaluation, Operations, and Execution Plan.

---

## Local Development and Installation

### 1. Prerequisites
- Node.js `v20.x` or `v24.x` (LTS recommended)
- `pnpm` version `9.x` (`npm install -g pnpm@9`)
- Docker Engine `24.0+` (Optional for Stage 0 preview mode)

### 2. Setup Commands
```bash
# Clone the repository
git clone https://github.com/sharancode3/TraceCase.git
cd TraceCase

# Install dependencies using pinned pnpm lockfile
pnpm install --frozen-lockfile

# Initialize local environment configuration
cp .env.example .env.local
```

### 3. Running the Web Application
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to inspect the application shell, investigations dashboard, and preview gallery.

### 4. Running the Background Worker Process
In a separate terminal:
```bash
# Run worker in development mode
pnpm dev:worker

# Or build and run standalone distribution
pnpm build:worker
pnpm start:worker
```
The worker will log its identity, verify its single-concurrency lease (`TC-INV-011`), and enter idle standby mode awaiting Stage 4 queue activation. Internal health checks are accessible at `http://localhost:3001/health`.

### 5. Running Quality and Verification Checks
```bash
# TypeScript strict type checking
pnpm typecheck

# Code style and linting
pnpm lint

# Vitest contract, domain, and security tests
pnpm test

# Full production build (Web and Worker)
pnpm build
```

---

## Roadmap to Live Reproduction

Subsequent implementation stages will build upon this foundation:

- **Stage 1:** Core Infrastructure, Database Persistence & Orchestration State Machine.
- **Stage 2:** Browser Worker Daemon, Playwright Tool Wrappers & Policy Enforcement.
- **Stage 3:** GPT-6 Luna AI Adapter, Structured Prompts & Zod Schema Validation.
- **Stage 4:** Queue Integration (`pg-boss`) & Controller State Orchestration.
- **Stage 5:** Target Reference Application (`TraceCase-Demo-Tasks`) & Reset Fixtures.
- **Stage 6:** Dual-Bucket S3 Storage Pipeline & Synced Evidence Triad Player.
- **Stage 7:** Official Benchmark Campaign (TC1–TC4) & Redaction Recall Audit.
- **Stage 8:** Production Container Fleet Deployment & Final Demonstration Sign-Off.

## Person-wise Implementation Plans

Use the [shared implementation guide](implementation-stages/README.md) for ownership, dependencies, handoffs, and acceptance gates. Each contributor has a separate staged plan:

- [Person 1 — Core platform, browser execution, and verification](implementation-stages/person-1/person-1-implementation-plan.md)
- [Person 2 — AI roles, controlled target, and evaluation](implementation-stages/person-2/person-2-implementation-plan.md)
- [Person 3 — Product interface and evidence delivery](implementation-stages/person-3/person-3-implementation-plan.md)

These person-wise plans describe parallel delivery. Their stage numbers are local to each person and should not be matched numerically to the earlier subsystem roadmap.
