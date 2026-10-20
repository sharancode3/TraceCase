# TraceCase — Development Setup and Runbook

**Document ID:** `TC-DEV-001`  
**Version:** `1.0.0`  
**Creation Date:** 20 October 2026  
**Status:** Approved for Stage 0 Baseline  
**Audience:** All Engineering Contributors  

---

## 1. System Prerequisites

Before launching TraceCase, ensure your local workstation satisfies the following toolchain requirements:

- **Node.js:** `v20.x LTS` or `v24.x` (verified on Node `v24.11.0`).
- **Package Manager:** `pnpm` version `9.x` (verified on `v9.15.9`).
  - If pnpm is not installed, install globally: `npm install -g pnpm@9`.
- **Operating System:** Windows 11 (PowerShell / WSL2), macOS 14+, or Ubuntu 22.04 LTS.
- **Docker Engine (Optional for Stage 0):** Docker `24.0+` with Docker Compose `v2.20+`. (Stage 0 operates fully in Development Preview mode without running Docker).

---

## 2. Installation and Environment Setup

```bash
# 1. Clone the repository and enter directory
git clone https://github.com/sharancode3/TraceCase.git
cd TraceCase

# 2. Install pinned dependencies via pnpm
pnpm install --frozen-lockfile

# 3. Create your local environment configuration
cp .env.example .env.local
```

### Configuration Parameters in `.env.local`
- `PORT=3000`: Web application HTTP port.
- `WORKER_PORT=3001`: Worker diagnostic probe port.
- `DEV_PREVIEW_MODE=true`: Enables synthetic workflow simulations without requiring paid OpenAI API keys or live Playwright Chromium daemons.
- `DATABASE_URL`: Connection string for PostgreSQL (default: `postgres://tc_user:tc_pass@localhost:5432/tracecase`).
- `OPENAI_API_KEY`: Optional in Stage 0. Leave blank.

---

## 3. Running the Web Application

To launch the Next.js 15 App Router web interface:

```bash
pnpm dev
```

- **URL:** Open [http://localhost:3000](http://localhost:3000) in your web browser.
- **Available Routes:**
  - `/`: Main Investigations Dashboard (shows Tri-Dimensional status indicators).
  - `/targets`: Target Environment Management & Sandbox Registration.
  - `/investigations/new`: Bug Report Intake Form with client-side Zod validation.
  - `/investigations/:id`: Investigation Detail & Evidence Triad overview.
  - `/investigations/:id/approve`: Plan Review and Simulated Cryptographic Approval.
  - `/investigations/:id/clarify`: Interactive Clarification Card (Luna Role 1).
  - `/investigations/:id/live`: Real-Time Execution Progress & Event Reducer Simulator.
  - `/preview/gallery`: Comprehensive gallery of all 17 canonical workflow states.

---

## 4. Running the Separate Background Worker

The Browser Worker runs as an independent Node.js process outside of Next.js:

```bash
# Development mode with live reload
pnpm dev:worker

# Production build and run
pnpm build:worker
pnpm start:worker
```

- **Health Probe:** Probes respond at `http://localhost:3001/health`.
- **One-shot Verification:** To verify worker startup and lifecycle exit in CI:
  ```bash
  WORKER_RUN_ONCE=true pnpm start:worker
  ```

---

## 5. Running Verification Checks and Tests

```bash
# 1. TypeScript Strict Compilation
pnpm typecheck

# 2. Code Linting (ESLint)
pnpm lint

# 3. Vitest Unit & Contract Tests
pnpm test

# 4. Full Production Builds (Web & Worker)
pnpm build
```

---

## 6. Database and Schema Tooling

```bash
# Generate SQL migration from TypeScript schema
pnpm db:generate

# Apply pending migrations to local PostgreSQL
pnpm db:migrate
```
*Note: If PostgreSQL is offline, `pnpm db:migrate` safely reports a connection notice without crashing.*

---

## 7. Troubleshooting and Common Startup Issues

| Issue | Probable Cause | Remediation |
|---|---|---|
| `pnpm : Command not found` | pnpm is not in your global npm prefix PATH. | Run `npm install -g pnpm@9` and ensure `%APPDATA%\npm` is in PATH. |
| Port 3000 already in use | Another Next.js instance or Node server is running. | Stop conflicting process or run `next dev --port 3002`. |
| Port 3001 already in use | Stale worker daemon process holding socket. | Terminate worker process via Task Manager or `pkill -f node`. |
| Database connection refused | Docker container not running. | Stage 0 runs fully in preview mode (`DEV_PREVIEW_MODE=true`). No database is required for preview inspection. |
