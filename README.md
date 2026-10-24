# TraceCase

**Autonomous, Deterministic Web Application Defect Reproduction and Verifiable Evidence Pipeline**

[![Next.js 15](https://img.shields.io/badge/Next.js-15.1.7-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Playwright Chromium](https://img.shields.io/badge/Playwright-Chromium-green?style=flat&logo=playwright)](https://playwright.dev/)
[![PostgreSQL 15](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.38-C5F74F?style=flat)](https://orm.drizzle.team/)
[![pg--boss](https://img.shields.io/badge/pg--boss-10.4-orange?style=flat)](https://github.com/timgit/pg-boss)
[![License Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Tests Passing](https://img.shields.io/badge/Tests-392%20passed-brightgreen?style=flat)](tests/)

---

## The Problem: The Defect Reproduction Crisis

Modern engineering teams lose between 20% to 40% of sprint capacity chasing vague, incomplete, or non-reproducible bug reports. Traditional defect triage suffers from critical structural flaws:

1. **"Works On My Machine":** Informal user write-ups omit environment specifics, preconditions, or subtle user interaction sequences.
2. **Polluted Test Environments:** Flaky tests and unverified state mutations create false positives, obscuring real regressions.
3. **The AI Hallucination Gap:** Naive AI agents generate non-deterministic browser actions or ungrounded assertions that cannot reliably prove whether a defect genuinely exists.
4. **PII and Secret Leakage:** Developers haphazardly upload unscrubbed screenshots, video recordings, and diagnostic logs containing production bearer tokens, session keys, and customer data.

TraceCase bridges this gap by transforming unstructured bug descriptions into **cryptographically authorized, deterministic, two-run verified bug reproduction packages** with synchronized multi-track evidence (WebM video, console streams, and CDP network traces).

---

## The TraceCase Solution

TraceCase operates as an autonomous defect reliability platform designed around five strict architectural pillars:

- **Natural Language Intake with Grounded Scoping:** Operators describe bugs in natural language. TraceCase's planner synthesizes testable browser actions and deterministic predicates without requiring raw CSS selectors or complex scripting.
- **Cryptographic Plan Authorization Gate (TC-INV-003):** To prevent autonomous AI agents from performing destructive operations without consent, every plan is fingerprinted via SHA-256 and requires explicit operator sign-off before entering the execution queue.
- **Deterministic Dual-Run Engine with Authenticated State Readback:** A defect is never declared "reproduced" from a single run. TraceCase executes Attempt 1, restores the target baseline via authenticated fixture webhooks, verifies state equivalence via SHA-256 canonical hashing, and executes Attempt 2.
- **Three-Orthogonal Status Dimensions:** Decouples **Lifecycle State** (`RUNNING`, `COMPLETED`, `FAILED`), **Reproduction Verdict** (`CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONCLUSIVE`), and **Evidence Readiness** (`READY`, `QUARANTINED_LEAK_DETECTED`).
- **Grounded Contextual Investigation Assistant:** An interactive post-investigation AI partner equipped with typed citation pills (`STEP`, `ATTEMPT`, `ASSERTION`, `EVIDENCE`, `TARGET`) providing instant answers regarding execution timing, failure causes, and comparison between attempts.

---

## High-Level System Architecture

```mermaid
flowchart TD
    User["User / QA Engineer"] -->|"Natural Language Report"| WebUI["TraceCase Next.js 15 Web Application"]
    WebUI -->|"Store Report & Target"| DB[("PostgreSQL 15 (Drizzle ORM)")]
    
    subgraph Planning ["AI Planning & Clarification Subsystem"]
        Planner["Integrated Planner Agent"]
        Planner -->|"Grounded Proposal"| Fingerprint["SHA-256 Plan Fingerprinting"]
    end
    WebUI <--> Planning
    
    User -->|"Cryptographic Plan Sign-off"| AuthGate{"Human Approval Gate"}
    AuthGate -->|"Admit to Queue"| Outbox["Transactional Outbox Relay"]
    Outbox -->|"Transactional Enqueue"| PgBoss[("pg-boss Job Queue (PostgreSQL)")]
    
    subgraph Execution ["Autonomous Execution Subsystem"]
        Worker["Playwright Worker Daemon"]
        Worker -->|"Acquire Monotonic Lease"| LeaseGuard["Execution Lease Slot (Fencing)"]
        Worker -->|"CDP Automation & Media Capture"| Browser["Chromium Engine (Playwright)"]
        Browser -->|"Target Interactions"| TargetApp["Target Web Application (Sandbox)"]
        Worker -->|"POST /api/test/reset-fixture"| TargetReset["Target Fixture Reset & Readback"]
    end
    PgBoss --> Worker
    
    subgraph Evidence ["Verification & Evidence Subsystem"]
        TwoAttempt["Two-Attempt Controller"]
        PairAssessor["Pair Assessor Decision Matrix"]
        Comparator["Deterministic Baseline Comparator"]
        Sanitizer["Secret & PII Quarantine Sanitizer"]
        PDFGen["Canonical PDF Report Engine"]
    end
    Worker --> TwoAttempt
    TwoAttempt --> Comparator
    TwoAttempt --> PairAssessor
    TwoAttempt --> Sanitizer
    TwoAttempt --> PDFGen
    PDFGen -->|"Store Canonical Artifacts"| ArtifactStore[("Evidence Store / Local Filesystem")]
    TwoAttempt -->|"Persist Locked Verdict"| DB
    WebUI <-->|"Real-Time Events & Timeline"| DB
```

---

## Deterministic Two-Attempt Verification State Machine

```mermaid
stateDiagram-v2
    [*] --> REPORT_DRAFTED: Intake Form Submitted
    REPORT_DRAFTED --> AWAITING_PLAN_APPROVAL: AI Formulates Grounded Plan
    REPORT_DRAFTED --> CLARIFICATION_NEEDED: Ambiguous Prerequisites
    CLARIFICATION_NEEDED --> REPORT_DRAFTED: User Answers Question
    
    AWAITING_PLAN_APPROVAL --> RUNNING_ATTEMPT_1: Operator Cryptographically Approves Plan
    
    state "Attempt 1 Execution" as Attempt1 {
        RUNNING_ATTEMPT_1 --> PreflightBaselineCheck
        PreflightBaselineCheck --> ActionDispatch1
        ActionDispatch1 --> AssertionEvaluation1
    }
    
    Attempt1 --> RESETTING_TARGET: Attempt 1 Complete
    
    state "Target Baseline Reset" as ResetGate {
        RESETTING_TARGET --> OutboundResetPost: POST /api/test/reset-fixture
        OutboundResetPost --> ReadbackVerification: GET /api/test/readback
        ReadbackVerification --> StateHashComparison: BaselineComparator SHA-256 Hash
    }
    
    ResetGate --> RUNNING_ATTEMPT_2: State Restored & Verified Clean
    ResetGate --> FAILED_RESET: State Dirty / Readback Discrepancy
    
    state "Attempt 2 Execution" as Attempt2 {
        RUNNING_ATTEMPT_2 --> ActionDispatch2
        ActionDispatch2 --> AssertionEvaluation2
    }
    
    Attempt2 --> VERDICT_ASSESSMENT: Attempt 2 Complete
    
    state "Verdict Locking" as VerdictLock {
        VERDICT_ASSESSMENT --> CONFIRMED_REPRODUCED: 2x Valid Defect Detected
        VERDICT_ASSESSMENT --> NOT_REPRODUCED_CLEAN: 2x Valid Clean Behavior
        VERDICT_ASSESSMENT --> INCONCLUSIVE_FLAKY: Inconsistent Observations
    }
    
    CONFIRMED_REPRODUCED --> EVIDENCE_PACKAGING
    NOT_REPRODUCED_CLEAN --> EVIDENCE_PACKAGING
    INCONCLUSIVE_FLAKY --> EVIDENCE_PACKAGING
    
    EVIDENCE_PACKAGING --> COMPLETED: PDF Report & Triad Ready
    FAILED_RESET --> FAILED: Blocked by Unverified Reset
    COMPLETED --> [*]
    FAILED --> [*]
```

---

## Autonomous Verification Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Operator / QA
    participant Web as Next.js Web App
    participant Worker as Playwright Worker
    participant Browser as Chromium Browser
    participant Target as Controlled Target App
    participant Evaluator as Deterministic Evaluator

    Operator->>Web: Submit natural language bug description
    Web->>Web: Formulate plan & compute SHA-256 fingerprint
    Web-->>Operator: Present Plan Review (Safety Tiers & Assertions)
    Operator->>Web: Click "Authorize & Approve Plan"
    Web->>Worker: Enqueue execution request under lease fencing
    
    Note over Worker,Browser: Attempt 1 Begins
    Worker->>Browser: Launch isolated browser context (record video, trace)
    Browser->>Target: Execute Step 1 (Navigate) & Step 2 (Filter)
    Browser->>Target: Execute Step 3 (Trigger Action)
    Browser->>Target: Execute Step 4 (Confirm Modal Dialog)
    Worker->>Evaluator: Collect DOM observations & evaluate assertions
    Evaluator-->>Worker: Attempt 1 Finding: VALID_DEFECT_DETECTED
    Worker->>Browser: Close context & save Attempt 1 artifacts
    
    Note over Worker,Target: Authenticated Baseline Reset Gate
    Worker->>Target: POST /api/test/reset-fixture (Auth Secret)
    Target-->>Worker: HTTP 200 Fixture Reset OK
    Worker->>Target: GET /api/test/readback
    Target-->>Worker: Observed Fixture Baseline State
    Worker->>Worker: Compute SHA-256 hash & verify baseline equivalence
    
    Note over Worker,Browser: Attempt 2 Begins
    Worker->>Browser: Launch fresh isolated browser context
    Browser->>Target: Re-execute identical 4-step sequence
    Worker->>Evaluator: Collect DOM observations & evaluate assertions
    Evaluator-->>Worker: Attempt 2 Finding: VALID_DEFECT_DETECTED
    Worker->>Browser: Close context & save Attempt 2 artifacts
    
    Note over Worker,Web: Verdict Finalization & Evidence Packaging
    Worker->>Worker: PairAssessor evaluates 2-run consistency
    Worker->>Worker: Lock Verdict: CONFIRMED_REPRODUCED
    Worker->>Worker: Redact sensitive secrets from network traces
    Worker->>Worker: Generate canonical 2-page PDF Report
    Worker-->>Web: Emit INVESTIGATION_COMPLETED
    Web-->>Operator: Display Results, Interactive Assistant, & PDF Download
```

---

## Controlled Multi-Domain Demonstration Targets

TraceCase includes two standalone, controlled target web applications representing genuinely different business domains:

### 1. Acme Hardware Shopping Cart Application (`Port 3007`)
- **Domain:** E-Commerce / Consumer Retail.
- **Architecture:** Responsive hardware catalog with category tabs (`All Products`, `Hardware`, `Accessories`), real-time catalog search, and cart drawer.
- **Seeded Defect (`cart-v1.0.0-buggy`):** When incrementing quantity for in-cart items, the item subtotal recalculates but the top-level checkout subtotal fails to update due to missing state synchronization.
- **Fixed Control (`cart-v1.0.1-fixed`):** Both item subtotal and top-level cart subtotal update reactively.
- **Fixture Endpoints:** `POST /api/test/reset-fixture` and `GET /api/test/readback` with token authorization.

### 2. TraceCase Workbench Application (`Port 3005` & `Port 3006`)
- **Domain:** Enterprise Task Management / Work Item Queue.
- **Architecture:** Accessible data-grid table with status filters (`All`, `Active`, `Completed`), detail pane, and modal confirmation dialogs.
- **Seeded Defect (`wb-v1.0.0-buggy` on Port 3005):** When deleting an item while an active filter is applied, an off-by-one array index offset causes the preceding completed item (`wb-item-01`) to be deleted instead of the selected active item (`wb-item-02`).
- **Fixed Control (`wb-v1.0.1-fixed` on Port 3006):** Deletions resolve by unique entity identity, preserving unaffected records.
- **Fixture Endpoints:** Scoped baseline restoration supporting `workbench_work_items`.

---

## Key Differentiators & Hackathon Highlights

| Feature | TraceCase | Traditional Bug Trackers | Generic AI Coding Agents |
|---|---|---|---|
| **Defect Verification** | **2x Deterministic Execution** across authenticated resets | Manual reproduction | Single-run non-deterministic |
| **Evidence Quality** | **Synchronized Triad** (Video, Network, Console) + Canonical PDF | Ad-hoc screenshots / text logs | Markdown summaries without media |
| **Human-in-the-Loop** | **Cryptographic Sign-Off Gate** (SHA-256 Plan Binding) | Manual triage | Uncontrolled autonomous mutation |
| **Security & Privacy** | **In-Stream Token Sanitization** & Outbound SSRF Guard | Manual redaction (often forgotten) | Leaks credentials into prompt context |
| **Post-Repro Analysis** | **Contextual AI Assistant** with typed citation pills | Static comment threads | Generic ungrounded chat |
| **Reporting** | **Enterprise PDF Report** with reproducible evidence metadata | Manual export | None |

---

## Three-Dimensional Status Architecture

TraceCase rejects binary "passed/failed" reporting in favor of three orthogonal dimensions:

```text
+-----------------------------------------------------------------------------------+
| TRACECASE ORTHOGONAL STATUS TRIAD                                                 |
+-----------------------------------------------------------------------------------+
| 1. LIFECYCLE STATE       | PENDING_APPROVAL -> QUEUED -> RUNNING -> COMPLETED     |
| 2. REPRODUCTION VERDICT  | CONFIRMED_REPRODUCED | NOT_REPRODUCED | INCONCLUSIVE       |
| 3. EVIDENCE READINESS    | READY | QUARANTINED_LEAK_DETECTED | PENDING_GENERATION     |
+-----------------------------------------------------------------------------------+
```

- **Lifecycle State:** Represents workflow progress through the queue and browser execution daemon.
- **Reproduction Verdict:** Computed purely by code using a 16-scenario decision matrix. Confirms defects only when observed across both runs.
- **Evidence Readiness:** Signals whether media and traces are safe for external sharing. Automatically flags and isolates simulated tokens or leaked credentials.

---

## Directory Structure

```text
TraceCase/
├── src/
│   ├── app/                                 # Next.js 15 App Router web pages & endpoints
│   │   ├── api/                             # REST API route handlers
│   │   │   ├── health/                      # Subsystem health probe (/api/health)
│   │   │   ├── ready/                       # Subsystem readiness probe (/api/ready)
│   │   │   └── v1/                          # Versioned API routes
│   │   │       ├── investigations/          # Investigation CRUD, approve, start, assistant
│   │   │       ├── reports/                 # Bug report intake endpoints
│   │   │       └── targets/                 # Target registration & capability queries
│   │   ├── investigations/                  # Dynamic pages
│   │   │   ├── [id]/                        # Details view, timeline, assistant, PDF preview
│   │   │   ├── [id]/approve/                # Cryptographic plan review & approval gate
│   │   │   ├── [id]/clarify/                # Clarification Q&A wizard
│   │   │   ├── [id]/live/                   # Live execution feed & attempt monitoring
│   │   │   └── new/                         # Bug report intake form
│   │   └── targets/                         # Target environment inventory
│   ├── contracts/                           # TypeScript / Zod schemas (API, DB, Verification)
│   ├── features/                            # UI presentation components
│   └── server/                              # Backend server modules
│       ├── ai/                              # AI prompt templates & OpenAI Luna adapters
│       ├── auth/                            # Cryptographic JWT authentication
│       ├── browser/                         # Playwright worker automation & action dispatcher
│       ├── config/                          # Strict environment variable parsing
│       ├── db/                              # PostgreSQL Drizzle ORM schema & repositories
│       ├── evidence/                        # Capture registrar & artifact packaging
│       ├── policy/                          # Plan fingerprinting & target network guards
│       ├── queue/                           # pg-boss queue adapter & execution leases
│       ├── reporting/                       # PDF investigation report generator
│       └── verification/                    # Two-attempt controller, comparator, pair assessor
├── demo-target/                             # Standalone controlled test applications
│   ├── cart/                                # Acme Hardware Store application (Port 3007)
│   ├── workbench/                           # TraceCase Workbench application (Port 3005/3006)
│   └── server.ts                            # Target server entry point
├── worker/                                  # Standalone background execution daemon
│   └── index.ts                             # pg-boss consumer loop & Playwright runner
├── drizzle/                                 # Drizzle ORM PostgreSQL migrations (0000 - 0006)
├── docs/                                    # System architectural specifications (PRD, TRD, etc.)
├── tests/                                   # Vitest automated test suites (392 passing tests)
├── Dockerfile.web                           # Multi-stage production container for Web app
├── Dockerfile.worker                        # Multi-stage production container for Worker daemon
└── docker-compose.yml                       # Full orchestration (PostgreSQL, Web, Worker)
```

---

## Quick Start Guide

### Prerequisites
- **Node.js:** `v20.x` or `v22.x` (LTS)
- **Package Manager:** `pnpm` version `9.x` (`npm install -g pnpm@9`)
- **Docker Engine & Docker Compose:** For PostgreSQL persistence and containerized deployments.

### 1. Clone & Install
```bash
git clone https://github.com/sharancode3/TraceCase.git
cd TraceCase
pnpm install --frozen-lockfile
```

### 2. Environment Configuration
Copy the sample environment file:
```bash
cp .env.example .env.local
```

Key configuration parameters in `.env.local`:
```env
# Database & Queue
DATABASE_URL=postgres://tc_user:tc_pass@localhost:5432/tracecase

# AI Provider Configuration
AI_PROVIDER=openai_luna
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL_ID=gpt-6-luna

# Target Reset Secrets
TARGET_RESET_SECRET=tc-fixture-secret-2026

# Execution Settings
HEADLESS=true
MUTATION_LEASE_TTL_MS=60000
```

### 3. Start Database & Run Migrations
```bash
# Start local PostgreSQL container
docker compose up postgres -d

# Apply database migrations
pnpm db:migrate
```

### 4. Launch Services in Development Mode

In separate terminal windows:

```bash
# Terminal 1: TraceCase Web Application (Port 3000)
pnpm dev

# Terminal 2: TraceCase Background Worker Daemon
pnpm dev:worker

# Terminal 3: Controlled Workbench Demo Targets (Ports 3005 and 3006)
pnpm dev:target

# Terminal 4: Acme Hardware Shopping Cart Target (Port 3007)
npx tsx demo-target/cart/server.ts
```

Open `http://localhost:3000` in your browser to access TraceCase.

---

## Running with Docker Compose (Production Candidate)

To launch the complete stack in containerized production mode:

```bash
docker compose up --build
```

Subsystem health probes:
- Web Application Health: `curl http://localhost:3000/api/health`
- Subsystem Readiness: `curl http://localhost:3000/api/ready`
- Worker Private Health: `curl http://localhost:3001/health`

---

## Verification & Test Suites

TraceCase is validated through 53 automated test files covering 392 unit, contract, and integration tests:

```bash
# Run all automated tests
pnpm test

# Run strict TypeScript compilation check (0 errors required)
pnpm typecheck

# Build Web Application, Worker Daemon, and Target services for production
pnpm build
```

---

## Production Deployment (Vercel & Render)

TraceCase is architected for clean cloud separation between frontend and backend layers:

- **Frontend (Vercel):** Next.js App Router UI with Edge Middleware and same-origin API proxy rewrites (`/api/*` forwarded to Render). Zero Chromium dependencies or worker processes on Vercel. Supports honest "Vercel first" deployment with structured `BACKEND_NOT_CONNECTED` handling until Render services are linked.
- **Backend (Render):** Managed PostgreSQL database, containerized Node.js API service with server-side Chromium PDF generation, concurrency-1 Playwright background worker daemon, and two isolated controlled target services (`tracecase-target-workbench` and `tracecase-target-cart`).
- **Shared Object Storage:** S3-compatible remote evidence storage driver (AWS S3 / Cloudflare R2 / MinIO) with cryptographic SigV4 signing, dual-bucket quarantine, and stateless signed access grants.

For complete step-by-step instructions, environment variable matrix, and Render Blueprint configuration, see the authoritative runbook:
**[docs/deployment/vercel-render-deployment.md](docs/deployment/vercel-render-deployment.md)**

---

## REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Lightweight liveness probe. |
| `/api/ready` | `GET` | Deep subsystem readiness check (DB, Worker, S3). |
| `/api/v1/targets` | `GET, POST` | List registered targets or register a new sandbox. |
| `/api/v1/reports` | `POST` | Submit raw bug report for intake and AI scoping. |
| `/api/v1/investigations` | `GET` | Query investigations with status and verdict filters. |
| `/api/v1/investigations/:id` | `GET` | Retrieve complete investigation record and metadata. |
| `/api/v1/investigations/:id/plan` | `GET` | Inspect versioned experiment plan and SHA-256 hash. |
| `/api/v1/investigations/:id/approve` | `POST` | Operator cryptographic authorization gate. |
| `/api/v1/investigations/:id/start` | `POST` | Dispatch approved plan to execution queue. |
| `/api/v1/investigations/:id/assistant` | `POST` | Contextual Q&A query with grounded citation pills. |
| `/api/v1/investigations/:id/report/pdf`| `GET` | Generate and download canonical PDF investigation report. |
| `/api/v1/investigations/:id/events` | `GET` | Real-time event stream for execution monitoring. |

---

## Security, Safety, and Privacy Invariants

1. **Fail-Closed Sandbox Invariant (TC-INV-008):** Destructive interactions (`TIER_4_DESTRUCTIVE`) are strictly rejected on targets unless `isSandbox` and `isSandboxVerified` are cryptographically true.
2. **SSRF Outbound Guard (TC-INV-007):** Private IP addresses (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local metadata addresses (`169.254.169.254`), and loopback escapes are blocked at socket level.
3. **Monotonic Execution Leases (TC-INV-004):** Prevents concurrent worker collisions on stateful target sandboxes using single-tenant epoch leases with monotonic fencing tokens.
4. **Credential Quarantine (TC-INV-009):** In-stream scanner intercepts Bearer tokens, private keys, and session cookies, masking them before public report export.

---

## License

This project is licensed under the Apache 2.0 License. See the [LICENSE](LICENSE) file for details.
