# TraceCase Production Deployment Runbook: Vercel Frontend and Render Backend

This document specifies the authoritative production deployment architecture, step-by-step procedure, environment variable matrix, and verification plan for deploying TraceCase across Vercel (Next.js frontend) and Render (PostgreSQL, Backend API, Playwright Worker, and Controlled Demo Targets).

---

## 1. System Architecture and Deployment Boundary

TraceCase is decomposed into a lightweight client-facing frontend layer hosted on Vercel and a containerized backend execution layer hosted on Render.

```
+-----------------------------------------------------------------------------------+
|                                  USER BROWSER                                     |
|               (Accessible Dashboard, Plan Review, Live Events, PDF)               |
+-----------------------------------------------------------------------------------+
                                   |                 ^
      Same-Origin Requests (/api/*)|                 | Static Assets / HTML
                                   v                 |
+-----------------------------------------------------------------------------------+
|                              VERCEL EDGE / SERVERLESS                             |
|                                                                                   |
|  - Next.js App Router Frontend (HTML, React Server Components, Tailwind UI)        |
|  - Edge Middleware (`src/middleware.ts`): Honest 503 if backend unconfigured       |
|  - Reverse Proxy Rewrites (`next.config.ts`): Forwards /api/* -> Render API URL    |
|  - ZERO Chromium binaries or long-running worker loops                            |
+-----------------------------------------------------------------------------------+
                                   |
                Public HTTPS API Forwarding (TLS Encrypted)
                                   v
+-----------------------------------------------------------------------------------+
|                                RENDER PLATFORM                                    |
|                                                                                   |
|  +---------------------------+       +-----------------------------------------+  |
|  |     tracecase-api         |       |            tracecase-worker             |  |
|  | (Docker: Dockerfile.web)  |       |      (Docker: Dockerfile.worker)        |  |
|  |                           |       |                                         |  |
|  | - Next.js REST API routes |       | - Concurrency-1 singleton daemon        |  |
|  | - PostgreSQL persistence  |       | - pg-boss queue claim & lease fencing   |  |
|  | - Server Chromium PDF gen |       | - Isolated Playwright Chromium runner   |  |
|  | - Stateless Signed Grants |       | - Deterministic 2-attempt controller    |  |
|  +---------------------------+       +-----------------------------------------+  |
|               |                                           |                       |
|               +---------------------+---------------------+                       |
|                                     |                                             |
|        +----------------------------+----------------------------+                |
|        |                            |                            |                |
|        v                            v                            v                |
|  +------------------+     +-------------------+     +--------------------------+  |
|  |   tracecase-db   |     |    S3 Storage     |     | Controlled Demo Targets  |  |
|  | (PostgreSQL 15)  |     | (AWS S3 / R2)     |     |                          |  |
|  | - Drizzle ORM    |     | - RESTRICTED_RAW  |     | - Workbench (Port 3005)  |  |
|  | - pg-boss queues |     | - PUBLIC_SAFE     |     | - Acme Cart (Port 3007)  |  |
|  | - Outbox table   |     | - SHA-256 audited |     | - Authenticated reset    |  |
|  +------------------+     +-------------------+     +--------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Architectural Separation Justification

1. **Proxy Rewrites (`next.config.ts`):** All client browser fetch calls target relative same-origin paths (`/api/v1/...`). When `BACKEND_API_URL` is configured, Next.js `beforeFiles` rewrites stream requests directly to Render. This eliminates cross-site cookie restrictions, SameSite browser blocks, and CORS preflight latency.
2. **Chromium Isolation:** Headless Chromium for browser investigations runs strictly within `tracecase-worker` (a Debian container with full system libraries). Chromium for PDF generation runs within `tracecase-api` (containerized Debian). Vercel serverless lambdas never bundle or launch Chromium.
3. **Queue-Decoupled Execution:** Long-running investigations execute asynchronously through PostgreSQL and pg-boss. Requests to start investigations return a job ID immediately (`202 Accepted`). Browser progress is streamed via server-sent events or polled from the database.
4. **Shared Durable Storage:** Raw Playwright traces, console logs, and videos are uploaded by the worker to S3-compatible object storage (`RESTRICTED_RAW` tier). Sanitized derivatives are published to `PUBLIC_SAFE`. The API reads from S3 and signs time-limited access grants using HMAC-SHA256, allowing stateless verification across instances without shared local disk.

---

## 2. Service Inventory and Minimal Sizing

| Service Name | Platform | Type | Runtime | Plan / Sizing | Health Check |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **tracecase-frontend** | Vercel | Web Application | Node 20 / Next.js 15 | Hobby or Pro | `/` |
| **tracecase-api** | Render | Web Service | Docker (`Dockerfile.web`) | Standard (2 GB RAM, 1 CPU) | `/api/health` |
| **tracecase-worker** | Render | Background Worker | Docker (`Dockerfile.worker`) | Standard (2 GB RAM, 1 CPU) | `/health` |
| **tracecase-target-workbench** | Render | Web Service | Node (`dist/demo-target/server.mjs`) | Starter (512 MB RAM, 0.5 CPU) | `/api/health` |
| **tracecase-target-cart** | Render | Web Service | Node (`dist/demo-target/cart/server.mjs`) | Starter (512 MB RAM, 0.5 CPU) | `/api/health` |
| **tracecase-db** | Render | PostgreSQL | Postgres 15 | Starter (1 GB RAM, 10 GB Storage) | `SELECT 1` |
| **tracecase-storage** | AWS / R2 | Object Storage | S3-Compatible API | Pay-as-you-go | S3 HeadBucket |

---

## 3. Environment Variables Reference Matrix

### Vercel Frontend (`tracecase-frontend`)

| Variable Name | Required | Example / Placeholder | Purpose |
| :--- | :--- | :--- | :--- |
| `BACKEND_API_URL` | Yes (After Render deploy) | `https://tracecase-api.onrender.com` | Target Render API origin for same-origin proxy rewrites |
| `APP_ROLE` | Yes | `frontend` | Designates frontend mode for edge middleware |
| `NODE_ENV` | Yes | `production` | Production mode |

### Render API Service (`tracecase-api`)

| Variable Name | Required | Example / Placeholder | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Enforces production security checks |
| `APP_ROLE` | Yes | `backend` | Runs API route handlers directly |
| `APP_URL` | Yes | `https://tracecase-api.onrender.com` | Public base URL of API service |
| `DATABASE_URL` | Yes | `postgres://tc_user:password@tracecase-db:5432/tracecase` | Managed PostgreSQL connection string |
| `ENABLE_DEV_AUTH` | Yes | `false` | Must be false in production |
| `DEV_PREVIEW_MODE` | Yes | `false` | Must be false in production |
| `STORAGE_DRIVER` | Yes | `s3` | Uses S3-compatible remote storage driver |
| `S3_ENDPOINT` | Yes | `https://s3.us-east-1.amazonaws.com` | S3 / MinIO / R2 endpoint URL |
| `S3_REGION` | Yes | `us-east-1` | S3 region identifier |
| `S3_ACCESS_KEY` | Yes | Server secret | S3 access key ID |
| `S3_SECRET_KEY` | Yes | Server secret | S3 secret access key |
| `S3_BUCKET_PUBLIC` | Yes | `tracecase-public-safe` | Sanitized public evidence bucket |
| `S3_BUCKET_RESTRICTED` | Yes | `tracecase-restricted-raw` | Quarantined raw capture bucket |
| `AI_PROVIDER` | Yes | `openai_luna` | Production AI provider (Luna/OpenAI) |
| `OPENAI_API_KEY` | Yes | Server secret | OpenAI API secret key |
| `OPENAI_MODEL_ID` | Yes | `gpt-4o-2024-08-06` | Explicit model identifier |
| `TARGET_RESET_SECRET` | Yes | Server secret | Privileged token for Workbench resets |
| `CART_RESET_SECRET` | Yes | Server secret | Privileged token for Cart resets |
| `WORKBENCH_TARGET_URL` | Yes | `https://tracecase-target-workbench.onrender.com/workbench` | Canonical Workbench target URL |
| `CART_TARGET_URL` | Yes | `https://tracecase-target-cart.onrender.com` | Canonical Cart target URL |
| `TRUSTED_TARGET_ORIGINS` | Yes | `https://tracecase-target-workbench.onrender.com,https://tracecase-target-cart.onrender.com` | Comma-separated allowlist of owned sandbox targets |
| `AUTH_ISSUER` | Yes (When OIDC configured) | `https://auth.tracecase.com/` | JWT external issuer URL |
| `AUTH_AUDIENCE` | Yes (When OIDC configured) | `https://api.tracecase.com` | JWT expected audience |
| `AUTH_JWKS_URI` | Yes (When OIDC configured) | `https://auth.tracecase.com/.well-known/jwks.json` | Remote JWKS public keyset URL |

### Render Worker Daemon (`tracecase-worker`)

| Variable Name | Required | Example / Placeholder | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Enforces production guards |
| `DATABASE_URL` | Yes | `postgres://tc_user:password@tracecase-db:5432/tracecase` | Managed PostgreSQL connection string |
| `WORKER_CONCURRENCY` | Yes | `1` | Strict single-investigation lease enforcement |
| `STORAGE_DRIVER` | Yes | `s3` | S3-compatible remote storage driver |
| `S3_ENDPOINT` | Yes | `https://s3.us-east-1.amazonaws.com` | S3 endpoint URL |
| `S3_REGION` | Yes | `us-east-1` | S3 region identifier |
| `S3_ACCESS_KEY` | Yes | Server secret | S3 access key ID |
| `S3_SECRET_KEY` | Yes | Server secret | S3 secret access key |
| `S3_BUCKET_PUBLIC` | Yes | `tracecase-public-safe` | Public bucket |
| `S3_BUCKET_RESTRICTED` | Yes | `tracecase-restricted-raw` | Restricted raw bucket |
| `TARGET_RESET_SECRET` | Yes | Server secret | Matches `tracecase-api` reset secret |
| `CART_RESET_SECRET` | Yes | Server secret | Matches `tracecase-api` reset secret |

---

## 4. Step-by-Step Deployment Procedure

### Step 1: Deploy Frontend on Vercel ("Vercel First")

1. Log into your Vercel Dashboard and click **Add New > Project**.
2. Import the Git repository `https://github.com/sharancode3/TraceCase`.
3. Configure the Project Settings:
   - **Framework Preset:** Next.js
   - **Root Directory:** `./`
   - **Build Command:** `pnpm build:web`
   - **Install Command:** `pnpm install --frozen-lockfile`
4. Set initial Environment Variables:
   - `NODE_ENV` = `production`
   - `APP_ROLE` = `frontend`
5. Click **Deploy**.
6. When the build completes, visit your deployed URL (e.g., `https://tracecase.vercel.app`).
   - The UI will load cleanly.
   - Any API request will return HTTP 503 `BACKEND_NOT_CONNECTED` with an honest prompt to configure the Render backend.

### Step 2: Deploy Infrastructure on Render via Blueprint

1. Log into your Render Dashboard and navigate to **Blueprints**.
2. Click **New Blueprint Instance** and select the repository.
3. Render will parse `render.yaml` and provision:
   - `tracecase-db` (PostgreSQL Database)
   - `tracecase-api` (Web Service)
   - `tracecase-worker` (Background Worker)
   - `tracecase-target-workbench` (Workbench Target)
   - `tracecase-target-cart` (Cart Target)
4. Supply the required server secrets when prompted by Render:
   - `OPENAI_API_KEY`: Your OpenAI API key.
   - `S3_ACCESS_KEY` and `S3_SECRET_KEY`: Credentials for your S3/R2 storage buckets.
   - `S3_ENDPOINT`: S3 endpoint URL (e.g., `https://s3.us-east-1.amazonaws.com` or Cloudflare R2 endpoint).
5. Click **Apply**.

### Step 3: Run Database Migrations

Once `tracecase-db` is provisioned, execute migrations from the Render Shell or via a one-off job:

```bash
pnpm db:migrate
```

All 11 sequential migrations (from `0000_overconfident_trish_tilby.sql` to `0010_clarification_purpose.sql`) will be applied to the managed PostgreSQL database.

### Step 4: Connect Vercel to Render API

1. In Render, copy the public URL of `tracecase-api` (e.g., `https://tracecase-api.onrender.com`).
2. Copy the public URLs of both target services:
   - Workbench: `https://tracecase-target-workbench.onrender.com/workbench`
   - Cart: `https://tracecase-target-cart.onrender.com`
3. In `tracecase-api` environment variables on Render, update:
   - `WORKBENCH_TARGET_URL` = `https://tracecase-target-workbench.onrender.com/workbench`
   - `CART_TARGET_URL` = `https://tracecase-target-cart.onrender.com`
   - `TRUSTED_TARGET_ORIGINS` = `https://tracecase-target-workbench.onrender.com,https://tracecase-target-cart.onrender.com`
4. In your Vercel Dashboard, go to **Settings > Environment Variables** and add:
   - `BACKEND_API_URL` = `https://tracecase-api.onrender.com`
5. Trigger a **Redeploy** on Vercel.

---

## 5. Controlled Test Applications and Negative Control Procedure

### Application 1: TraceCase Workbench
- **Buggy URL:** `https://tracecase-target-workbench.onrender.com/workbench`
- **Seeded Defect:** Deleting a task under the Active filter causes an off-by-one index mismatch in task removal.
- **Negative Control:** Set `DEMO_TARGET_BUG_MODE=false` or deploy a fixed service instance with build version `wb-v1.0.1-fixed`. The operation deletes the correct task, resulting in a clean `NOT_REPRODUCED` verdict.

### Application 2: Acme Hardware Store Cart
- **Buggy URL:** `https://tracecase-target-cart.onrender.com`
- **Seeded Defect:** Changing quantity from 1 to 2 retains the single-item subtotal ($120.00 instead of $240.00).
- **Negative Control:** Set `DEMO_TARGET_BUG_MODE=false` or use the authenticated mode switch (`POST /api/test/mode` with `bugMode: false`). The subtotal correctly updates to $240.00, resulting in a clean `NOT_REPRODUCED` verdict.

---

## 6. Verification Checklist

### Local & Pipeline Verification (Passed)
- [x] Strict TypeScript compilation (`npx tsc --noEmit`): 0 errors.
- [x] Vitest test suite (`npx vitest run`): 97 test files passed, 884 tests passed.
- [x] Production web build (`pnpm build:web`): All 14 static pages and 28 API routes compiled.
- [x] Production worker bundle (`pnpm build:worker`): Built `dist/worker/index.mjs` (462 KB).
- [x] Standalone target builds (`pnpm build:targets`): Built `dist/demo-target/server.mjs` and `dist/demo-target/cart/server.mjs`.
- [x] Stateless signed access grants: Verified cryptographic HMAC-SHA256 tokens across in-memory cache clear.
- [x] S3 storage driver: Verified SigV4 headers, path-traversal prevention, and bucket tier isolation.

### Cloud Acceptance Verification (Pending Live Infrastructure Provisioning)
- [ ] Vercel UI loads initial Dashboard without errors.
- [ ] Vercel returns HTTP 503 `BACKEND_NOT_CONNECTED` when `BACKEND_API_URL` is omitted.
- [ ] Vercel reverse proxy forwards `/api/v1/targets` to Render API once `BACKEND_API_URL` is set.
- [ ] Both target profiles appear as verified sandboxes in target selection.
- [ ] Bug report submission, AI plan generation, and separate Start execution queue a job into pg-boss.
- [ ] Worker claims job, opens Chromium, reproduces seeded defect, and uploads video/logs to S3.
- [ ] Investigation results display timeline, Assistant Q&A, and downloadable PDF report.
