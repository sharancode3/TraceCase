# TraceCase — Module Contribution Boundaries and Architecture Governance

**Document ID:** `TC-GOV-001`  
**Version:** `1.0.0`  
**Creation Date:** 20 October 2026  
**Status:** Approved for Stage 0 Baseline  
**Audience:** All Future Contributors, Subagents, and Code Reviewers  

---

## 1. Core Architectural Separation Rules

To prevent code duplication, architectural drift, and accidental security regressions, TraceCase establishes strict structural boundaries between tiers:

1. **Browser UI vs Trusted Server:** Browser components (`'use client'`) must never import server-side secrets, database clients, or internal worker scripts. All communication with trusted services must traverse HTTP route handlers or typed server actions.
2. **Shared Contracts Purity:** `src/contracts/` must remain pure TypeScript/Zod schemas with zero Node-only imports (e.g. `fs`, `crypto`, `child_process`), database connections, or network side effects. Contracts must compile seamlessly in both Node and browser runtimes.
3. **Worker Autonomy:** `worker/` is a separate persistent process. It imports domain contracts, database schemas, and queue interfaces, but must never import Next.js request/response objects or client UI components.
4. **Deterministic Invariant Enforcement:** No contributor may modify the 14 system invariants (`TC-INV-001` through `TC-INV-014`) or weaken the Tri-Dimensional State Model without formal Architecture Decision Record (ADR) approval.

---

## 2. Module Boundary Register

### Module 1: Canonical Contracts (`src/contracts/`)
- **Ownership:** Shared Zod schemas, TypeScript types, status enums, and error envelopes.
- **Allowed Imports:** `zod` only.
- **Strictly Prohibited:** Database drivers, network clients, server environment variables, browser DOM APIs.
- **Public Entry Point:** `src/contracts/index.ts`.
- **Change Coordination:** **CRITICAL SHARED AREA.** Any field addition, deletion, or type modification requires updating both server validation and frontend consumers simultaneously.

### Module 2: Server Persistence & Schema (`src/server/db/`)
- **Ownership:** Drizzle ORM table definitions, database connection pooling, and migration runners.
- **Allowed Imports:** `drizzle-orm`, `postgres`, `src/contracts/`, `src/server/config/`.
- **Strictly Prohibited:** Client component imports, raw unbounded SQL execution in user requests.
- **Public Entry Point:** `src/server/db/index.ts`, `src/server/db/schema.ts`.
- **Change Coordination:** Schema modifications must be followed by `pnpm db:generate` to produce timestamped migration SQL files.

### Module 3: Security & Policy Engine (`src/server/policy/`)
- **Ownership:** Action tier classification, sandbox protection (`TC-INV-008`), cryptographic plan hashing (`TC-INV-004`), and approval verification.
- **Allowed Imports:** `node:crypto`, `src/contracts/`.
- **Strictly Prohibited:** Relaxing Tier 4 destructive action rules; bypassing sandbox verification.
- **Public Entry Point:** `src/server/policy/plan-fingerprint.ts`, `src/server/policy/approval-guard.ts`.

### Module 4: Authentication & Authorization (`src/server/auth/`)
- **Ownership:** Principal resolution, ownership assertion, session verification, and safe error generation.
- **Allowed Imports:** `src/contracts/errors.ts`, framework request headers.
- **Strictly Prohibited:** Default user fallbacks in production, accepting synthetic preview headers on live routes.
- **Public Entry Point:** `src/server/auth/index.ts`.

### Module 5: Presentation & UI Features (`src/app/`, `src/features/`, `src/components/`)
- **Ownership:** Next.js route pages, application shell, Radix/Tailwind components, interactive workflow previews.
- **Allowed Imports:** `src/contracts/`, `@/components/ui/`, `lucide-react`, client hooks.
- **Strictly Prohibited:** Directly querying the database, importing `DATABASE_URL` or `OPENAI_API_KEY`.
- **Visual Design Contract:** Must conform to pale-lavender surfaces (`#EDF0FF`), cobalt actions (`#4767DB`), deep navy text (`#161E38`), rounded cards (`rounded-card`), and circular icon buttons. Strictly zero emojis.

### Module 6: Persistent Browser Worker (`worker/`)
- **Ownership:** Standalone Node.js daemon for consuming reproduction jobs, launching Playwright Chromium, executing two-run confirmation, and capturing the Evidence Triad.
- **Allowed Imports:** `src/contracts/`, `src/server/db/`, `src/server/policy/`, `playwright`, Node standard libraries.
- **Strictly Prohibited:** Executing more than 1 investigation concurrently (`WORKER_CONCURRENCY = 1`), bypassing fixture reset hooks.
- **Public Entry Point:** `worker/index.ts`.

---

## 3. Shared Areas Requiring Coordinated Changes

Future implementation tasks that touch any of the following eight areas must declare them explicitly in task descriptions and PR reviews:

1. **Contracts (`src/contracts/`):** Breaking changes cascade across API routes, UI state, and worker payloads.
2. **Database Migrations (`drizzle/migrations/`, `src/server/db/schema.ts`):** Must follow the expand-contract pattern.
3. **Dependency Manifests (`package.json`, `pnpm-lock.yaml`):** New packages require justification and security review.
4. **State Vocabulary (`src/contracts/status.ts`):** Must preserve Tri-Dimensional State decoupling.
5. **Configuration (`src/server/config/`):** Must separate server secrets from browser-public values.
6. **Design Tokens (`src/app/globals.css`, `tailwind.config.ts`):** Must maintain verified WCAG contrast ratios.
7. **Infrastructure (`docker-compose.yml`, `.github/workflows/`):** Changes must be verified against local Docker and CI runners.
8. **Authentication Interface (`src/server/auth/`):** Must preserve fail-closed security properties.
