# TraceCase

**Autonomous, Deterministic Web Application Defect Reproduction and Verifiable Evidence Pipeline**

---

## Document Control and System Metadata

- **System Identifier:** TraceCase Core Platform
- **Repository Version:** 1.0.0-p1-handoff
- **Implementation Milestone:** Person 1 Backend & Verification Integration Handoff
- **Operating Mode:** Local Integration & Verification Baseline
- **Primary AI Model Target:** OpenAI GPT-6 Luna (Exclusive Structured Output Adapter; Role Prompts by Person 2)
- **Execution Engine:** Playwright Chromium Headless via Chrome DevTools Protocol
- **Persistence & Queue Layer:** PostgreSQL 15 with Drizzle ORM and `pg-boss` (ACID Transactional Outbox; Zero Redis Dependency)
- **Object Storage Target:** Dual-Bucket S3 Architecture (MinIO / AWS S3; Implemented in Contracts)
- **Repository Remote:** `https://github.com/sharancode3/TraceCase.git`

---

## Contributor Navigation & Codebase Ownership

TraceCase is divided across three distinct ownership boundaries:

| Contributor | Focus Area | Primary Directories Owned | Entry Document |
|---|---|---|---|
| **Person 1** (Lead / Execution) | Trusted backend APIs, PostgreSQL persistence, `pg-boss` queue, Playwright Chromium execution, two-attempt deterministic verifier, operational hardening, and deployment containerization | `src/server/`, `src/contracts/`, `worker/`, `drizzle/`, `tests/person-1/`, `scripts/`, Dockerfiles | [`implementation-stages/person-1/README.md`](implementation-stages/person-1/README.md) |
| **Person 2** (AI / Evaluation) | OpenAI GPT-6 Luna prompts and adapters, controlled demo targets (`TraceCase-Demo-Tasks`), baseline reset/readback endpoints, and independent benchmark evaluation | `src/server/ai/` (prompts/adapters), controlled demo target applications, benchmark suites | [`implementation-stages/person-2/README.md`](implementation-stages/person-2/README.md) |
| **Person 3** (Frontend / Evidence) | Next.js UI features/pages, shared evidence sanitizer (`src/server/evidence/evidence-storage.service.ts`), dual-tier S3 artifact storage, and synchronized evidence player | `src/app/` (UI routes), `src/features/`, `src/components/`, evidence storage/sanitization services | [`implementation-stages/person-3/README.md`](implementation-stages/person-3/README.md) |

### Implementation Plans Index
- [Shared Coordination Guide & Gate Definitions](implementation-stages/README.md)
- [Person 1 Implementation Plan](implementation-stages/person-1/person-1-implementation-plan.md) (Phases P1-01 through P1-09)
- [Person 2 Implementation Plan](implementation-stages/person-2/person-2-implementation-plan.md) (Phases P2-01 through P2-08)
- [Person 3 Implementation Plan](implementation-stages/person-3/person-3-implementation-plan.md) (Phases P3-01 through P3-08)

---

## Repository Map

```text
TraceCase/
├── src/
│   ├── app/                   # Next.js 15 App Router web pages and API route handlers
│   │   ├── api/               # Trusted API endpoints (/ready, /v1/investigations, /reports, etc.)
│   │   └── investigations/    # Web pages for intake, approval, review, and live playback
│   ├── contracts/             # Pure TypeScript / Zod schemas (shared across web, server, worker)
│   ├── features/              # UI components, layout, and preview galleries
│   └── server/                # Trusted server modules
│       ├── ai/                # AI proposal schemas and atomic budget metering
│       ├── auth/              # Cryptographic JWT authentication & tenant isolation
│       ├── browser/           # Playwright Chromium automation & action dispatch
│       ├── config/            # Strict environment variable parsing
│       ├── db/                # PostgreSQL schema, Drizzle ORM repositories, and migrations
│       ├── evidence/          # Capture registrar, evidence pipeline, and metadata packaging
│       ├── policy/            # Plan fingerprinting, sandbox guards, approval verification
│       ├── queue/             # Transactional outbox relay & execution lease management
│       ├── services/          # Service container and ports
│       └── verification/      # Two-attempt controller, baseline comparator, pair assessor
├── worker/                    # Standalone persistent background worker daemon (pg-boss consumer)
├── drizzle/                   # Drizzle ORM SQL migration files (0000 through 0006)
├── docs/                      # Architectural specifications (PRD, TRD, SAD, etc.)
├── implementation-stages/     # Multi-contributor implementation plans and review handoffs
│   ├── person-1/              # Person 1 plans, reviews, handoffs, and campaign index
│   ├── person-2/              # Person 2 plans and handoffs
│   └── person-3/              # Person 3 plans and handoffs
├── tests/                     # Unit, contract, and integration test suites
│   └── person-1/              # Person 1 phase verification suites (Phases 1 through 9)
├── scripts/                   # Operational and diagnostic scripts
├── Dockerfile.web             # Multi-stage production container for Next.js web application
├── Dockerfile.worker          # Multi-stage production container for Playwright worker daemon
└── docker-compose.yml         # Local containerized orchestration (PostgreSQL, Web, Worker)
```

---

## Executive Overview and Product Intent

Software engineering teams lose considerable velocity investigating vague, incomplete, and non-reproducible bug reports. Traditional bug reporting relies on ambiguous human write-ups, volatile application logs, and ad-hoc screenshots that frequently leak credentials or user PII.

**TraceCase** transforms unstructured bug reports into deterministic, two-run confirmed bug reproduction packages. The end-to-end operational flow is:

```text
Authorized Target Registration
  -> Bug Report Intake
  -> AI-Assisted Normalization & Clarification (Luna Role 1)
  -> Versioned Experiment Plan (Luna Role 2)
  -> Mandatory Human Operator Authorization Gate (TC-INV-003, TC-INV-004)
  -> First Browser Execution Run (Isolated Chromium Context)
  -> Deterministic Verifier Assertion Check (Pure Code, Not LLM)
  -> Target Baseline Restoration Hook (POST /api/test/reset-fixture)
  -> Second Browser Execution Run (Fresh Context)
  -> Verification Matching & In-Stream Secret Scrubbing (TC-INV-009)
  -> Evidence Triad Finalization (Video .webm, Console .log, Network .json)
  -> Audited Natural Language Synthesis (Luna Role 3)
```

---

## Current Status: Person 1 Integration Handoff

Person 1 backend infrastructure, browser execution, deterministic verification, and deployment preparations are implemented and verified locally across 45 test files and 242 passing tests.

### 1. What Person 1 Has Implemented & Verified
- **Separately Executable Architecture:** Standalone Next.js 15 web application and persistent Node.js worker daemon (`worker/index.ts`) building independently with private health probe (`127.0.0.1:3001`).
- **PostgreSQL & Queue Engine:** Drizzle ORM schema across 7 migrations (`0000` through `0006`). Asynchronous job execution orchestrated via `pg-boss` on PostgreSQL with Transactional Outbox pattern (`outbox_messages` table) and singleton monotonic lease fencing (`global_execution_leases` table). No Redis container required.
- **Identity & Authorization:** Cryptographic JWT authentication with asymmetric RSA keys, strict tenant isolation (cross-tenant requests return 404), and explicit actor authorization checks.
- **Deterministic Approval & Policy:** Canonical SHA-256 plan fingerprinting, explicit human approval gate (`POST /approve`), rejection, revocation, and fail-closed pre-action expiration checks.
- **Bounded Browser Execution:** Headless Playwright Chromium execution with anti-ambiguity locators, action receipts, SSRF guards blocking private cloud metadata (`169.254.169.254`), on-disk WebM video recording, console error capture, and network trace capture.
- **Deterministic Two-Attempt Verification:** Pure assertion evaluation (equality, containment, regex with nested quantifier ReDoS protection), independent baseline readback and canonical state hashing, outbound target reset coordination, 4-point attempt validity, and 16-scenario pair decision matrix.
- **Operational Hardening:** Worker heartbeats, outbox crash recovery, 1-hour lease quarantine on `MUTATION_UNCERTAIN`, pre-flight baseline mismatch halt (`PREFLIGHT_BASELINE_FAILED`), and truthful `/api/ready` subsystem probing.
- **Deployment Candidates:** Multi-stage production `Dockerfile.web`, `Dockerfile.worker`, local `docker-compose.yml`, and GitHub Actions CI workflow in `.github/workflows/ci.yml`.

### 2. Contributor Dependencies & Release Gate Baseline
- **Gate G0 (Common Contracts):** PASSED. Unified types and safe projection boundaries verified.
- **Gate G1 (Persistence & Identity):** PASSED. Real JWT auth and PostgreSQL repositories verified.
- **Gate G2 (Deterministic Slice):** PASSED WITH DOUBLES. Two-attempt controller and Playwright browser media verified.
- **Gate G3 (Agentic User Journey):** BLOCKED pending Person 2 (Luna AI role prompts, live OpenAI API key, and controlled demo target).
- **Gate G4 (Hardened Operations):** PARTIALLY PASSED LOCAL. Daemon liveness, outbox recovery, lease fencing, and ReDoS safety verified locally.
- **Gate G5 (Deployed Evaluation):** NOT RUN. Deployment candidate configurations prepared; live external deployment not yet executed.
- **TC4 Content Redaction:** BLOCKED on Person 3's shared sanitizer (`src/server/evidence/evidence-storage.service.ts`). Tenant isolation is verified; content-level redaction awaits Person 3 to avoid competing redactors.
- **Gate H-12 (Release Handoff):** QUALIFIED HANDOFF DELIVERED. Machine-readable campaign index and comprehensive handoff specifications delivered.

---

## Canonical Problem Statement Scenarios

| Scenario | Objective | Target Fixture Mode | Verification Assertion | Expected Final Verdict | Evidence Readiness |
|---|---|---|---|---|---|
| **TC1** | Deterministic Two-Run Confirmation | `TraceCase-Demo-Tasks`<br/>(Array Index Offset Bug Active) | Filter Active -> Delete item -> Assert wrong item deleted across two consecutive runs with baseline reset. | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY`<br/>(Synced Video, Logs, Traces) |
| **TC2** | Non-Reproducible Defect (Clean Baseline) | `TraceCase-Demo-Tasks`<br/>(Fixed Application Build) | Execute identical steps -> Assert correct item deleted -> Bug not observed across two runs; baseline preserved. | `NOT_REPRODUCED` | `PUBLIC_SAFE_READY`<br/>(Clean Baseline Verified) |
| **TC3** | Sandbox Guardrail Enforcement | Variant A: Sandbox Target<br/>Variant B: Production Target | Variant A: Tier 4 action authorized by operator -> Executed.<br/>Variant B: Tier 4 action blocked pre-execution by Policy Engine (`TC-INV-008`). | A: Per Application<br/>B: `INCONCLUSIVE` (Blocked) | A: `PUBLIC_SAFE_READY`<br/>B: `PENDING_GENERATION` |
| **TC4** | PII & Secret In-Stream Redaction | `TraceCase-Demo-Tasks`<br/>(Debug Auth Leak Active) | Injected synthetic JWTs (`synthetic-jwt-token-xyz`), Bearer tokens, and API keys scrubbed before public export. | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY`<br/>(0 Plaintext Secrets in S3) |

---

## Specification and Architecture Documentation

All formal specification documents are maintained in the [`docs/`](docs/) directory:

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

## Local Development and Verification Runbook

### 1. Prerequisites
- Node.js `v20.x` or `v24.x` (LTS recommended)
- `pnpm` version `9.x` (`npm install -g pnpm@9`)
- Docker Engine `24.0+` (for containerized PostgreSQL and multi-service deployment)

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

### 3. Running Quality & Verification Checks
```bash
# 1. Strict TypeScript typechecking across web and server source
pnpm typecheck

# 2. Code style and ESLint validation (zero warnings)
pnpm lint

# 3. Complete automated test suite (45 test files, 242 tests)
pnpm test

# 4. Controller contract acceptance tests specifically (13 tests)
pnpm vitest run tests/person-1/phase-9/official-acceptance.test.ts

# 5. Real Playwright Chromium acceptance integration suite (4 tests)
pnpm vitest run tests/person-1/phase-9/real-acceptance.integration.test.ts

# 6. Production web and worker compilation
pnpm build

# 7. Single-run worker daemon verification
cmd /c "set WORKER_RUN_ONCE=true&& set USE_IN_MEMORY_QUEUE=true&& node dist/worker/index.mjs"
```

### 4. Running the Multi-Container Deployment Candidate
```bash
# Build and start PostgreSQL, Next.js Web, and Playwright Worker daemon
docker compose up --build

# In a separate terminal, probe subsystem readiness:
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/ready
curl -i http://localhost:3001/health
```

### 5. Applying Database Migrations
```bash
# Apply migrations to live PostgreSQL database
pnpm db:migrate
```
