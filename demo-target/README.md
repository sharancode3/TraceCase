# TraceCase — Controlled Demo Target Application (`TraceCase-Demo-Tasks` & `TraceCase Workbench`)

**Component:** Controlled Staging / Demo Web Application  
**Default Ports:** `3005` (buggy build `v1.0.0-buggy` / `wb-v1.0.0-buggy`) / `3006` (fixed build `v1.0.1-fixed` / `wb-v1.0.1-fixed`)  
**Build Versions:** `wb-v1.0.0-buggy` (seeded defect active) / `wb-v1.0.1-fixed` (correct behavior)  
**Primary Routes:**
- `/` — Legacy Task Management Demo Application
- `/workbench` — TraceCase Workbench (Enterprise Operations Dashboard)
**Authentication Secret:** Configured via `TARGET_RESET_SECRET` environment variable (fails closed if empty)  

---

## 1. Overview & Seeded Defects

`demo-target` provides two distinct target application surfaces built to serve as independently verifiable benchmark targets for the TraceCase Autonomous Bug Reproduction Agent:

1. **Legacy Task Application (`/`):** Baseline task manager with seeded index-offset deletion defect on `two_tasks_one_completed`.
2. **TraceCase Workbench (`/workbench`):** Enterprise operations dashboard featuring search, live KPI metric cards, status filters, item queue, and detail inspection, with a seeded index-offset deletion defect on `workbench_work_items`.

### Seeded Defect (TC1 vs TC2):
- **Backing Data:** Task A (completed, `id: 'task-a'`) is at index 0; Task B (active, `id: 'task-b'`) is at index 1.
- **Trigger:** Switch filter to `Active`. The UI displays only Task B at display index 0.
- **Buggy Behavior (`v1.0.0-buggy`):** Clicking Delete on Task B erroneously invokes `tasks.splice(filteredIndex, 1)`. Because `filteredIndex` is 0, **Task A is deleted** and **Task B remains present and active**!
- **Fixed Behavior (`v1.0.1-fixed`):** Clicking Delete deletes by immutable record ID (`t.id !== targetId`). Task B is deleted and Task A is preserved.

---

## 2. Supported Startup Configurations

The server reads configuration strictly from environment variables. Unsupported command-line flags (such as `--port` or `--bug-mode`) are **not** supported and must not be used.

**Mandatory Secret Configuration:** Privileged operations (`POST /api/test/reset-fixture`, `GET /api/test/readback`, `POST /api/test/cleanup-fixture`) require an explicitly configured disposable test secret via `TARGET_RESET_SECRET`. Implicit secret fallbacks have been removed. If `TARGET_RESET_SECRET` is unset, empty, or whitespace, privileged endpoints fail closed with HTTP 401.

### PowerShell (Windows)

#### Option A: Buggy Target (Port 3005)
```powershell
$env:DEMO_TARGET_PORT="3005"; $env:DEMO_TARGET_BUG_MODE="true"; $env:DEMO_TARGET_BUILD_VERSION="v1.0.0-buggy"; $env:TARGET_RESET_SECRET="tc-disposable-secret-2026"; npx tsx demo-target/server.ts
```

#### Option B: Fixed Target (Port 3006)
```powershell
$env:DEMO_TARGET_PORT="3006"; $env:DEMO_TARGET_BUG_MODE="false"; $env:DEMO_TARGET_BUILD_VERSION="v1.0.1-fixed"; $env:TARGET_RESET_SECRET="tc-disposable-secret-2026"; npx tsx demo-target/server.ts
```

### Windows Command Prompt (CMD)

#### Buggy Target (Port 3005):
```cmd
cmd /c "set DEMO_TARGET_PORT=3005&& set DEMO_TARGET_BUG_MODE=true&& set DEMO_TARGET_BUILD_VERSION=v1.0.0-buggy&& set TARGET_RESET_SECRET=tc-disposable-secret-2026&& npx tsx demo-target/server.ts"
```

#### Fixed Target (Port 3006):
```cmd
cmd /c "set DEMO_TARGET_PORT=3006&& set DEMO_TARGET_BUG_MODE=false&& set DEMO_TARGET_BUILD_VERSION=v1.0.1-fixed&& set TARGET_RESET_SECRET=tc-disposable-secret-2026&& npx tsx demo-target/server.ts"
```

### Bash / Linux / macOS
```bash
# Buggy Target
DEMO_TARGET_PORT=3005 DEMO_TARGET_BUG_MODE=true DEMO_TARGET_BUILD_VERSION=v1.0.0-buggy TARGET_RESET_SECRET=tc-disposable-secret-2026 npx tsx demo-target/server.ts

# Fixed Target
DEMO_TARGET_PORT=3006 DEMO_TARGET_BUG_MODE=false DEMO_TARGET_BUILD_VERSION=v1.0.1-fixed TARGET_RESET_SECRET=tc-disposable-secret-2026 npx tsx demo-target/server.ts
```

---

## 3. Web & API Endpoints

### Public Web Surfaces
- `GET /` — Accessible Task List UI with accessible `role="toolbar"`, filter buttons, and delete actions.
- `GET /workbench` — TraceCase Workbench: accessible enterprise operations dashboard with summary cards, search, status filters, work item queue, and detail inspection pane.
- `GET /api/tasks?filter=all|active|completed&scope=<scope>` — List tasks. Returns 400 on invalid filter or scope.
- `DELETE /api/tasks/:id?filter=all|active|completed&scope=<scope>` — Delete task. Returns 400 on empty ID, invalid filter, or invalid scope.
- `GET /api/workbench/items?filter=all|active|completed&search=<query>&scope=<scope>` — List workbench items with live overview KPIs (`total`, `active`, `completed`, `critical`).
- `DELETE /api/workbench/items/:id?filter=all|active|completed&search=<query>&scope=<scope>` — Delete workbench work item. Returns 400 on empty ID or invalid filter/scope, 404 if item not found.
- `GET /api/build-info` or `GET /api/info` — Safe application build metadata (application name, version, sandbox environment; `bugModeActive` is strictly omitted).
- `GET /api/health` — Liveness health check.

### TC4 Diagnostic Secret Redaction Surface
- `POST /api/auth/login` — Simulates diagnostic login and logs a synthetic token to test in-stream secret redaction.
  - Emission: Logs `[DEBUG_AUTH] User '<user>' session initialized with Bearer synthetic-jwt-token-xyz-9876`.
  - Header: Sets `X-Diagnostic-Token: Bearer synthetic-jwt-token-xyz-9876`.
  - Scenario boundary: Only synthetic tokens are used; real secrets must never be used.
  - Role responsibilities: Person 1 captures raw browser console and network artifacts. Person 3 sanitizes secrets before creating public-safe evidence manifests.
  - Live browser execution disclaimer: Actual browser emission and Playwright capture remain unverified in non-browser unit tests.

### Privileged Test Webhooks (Protected by `X-TraceCase-Reset-Auth` header)
Privileged endpoints require authentication matching `TARGET_RESET_SECRET` (fails closed if unset or blank):

```bash
# 1. Reset baseline fixture (Legacy Task app)
curl -X POST http://localhost:3005/api/test/reset-fixture \
  -H "Content-Type: application/json" \
  -H "X-TraceCase-Reset-Auth: $TARGET_RESET_SECRET" \
  -d '{"fixtureScope": "two_tasks_one_completed"}'

# 2. Reset baseline fixture (TraceCase Workbench)
curl -X POST http://localhost:3005/api/test/reset-fixture \
  -H "Content-Type: application/json" \
  -H "X-TraceCase-Reset-Auth: $TARGET_RESET_SECRET" \
  -d '{"fixtureScope": "workbench_work_items"}'

# 3. Independent readback verification (mandatory; HTTP 200 alone is insufficient)
curl "http://localhost:3005/api/test/readback?scope=workbench_work_items" \
  -H "X-TraceCase-Reset-Auth: $TARGET_RESET_SECRET"

# 4. Scoped cleanup
curl -X POST http://localhost:3005/api/test/cleanup-fixture \
  -H "Content-Type: application/json" \
  -H "X-TraceCase-Reset-Auth: $TARGET_RESET_SECRET" \
  -d '{"fixtureScope": "workbench_work_items"}'
```

---

## 4. Input Validation & Fail-Closed Safety

1. **Scope Whitelist:** Only predefined disposable scopes are accepted:
   - `workbench_work_items` (TraceCase Workbench Canonical Fixture, Count = 4)
   - `two_tasks_one_completed` (Legacy Task Target Default, Count = 2)
   - `three_tasks_multi_status` (Count = 3)
   - `auth_test_user` (Diagnostic user task, Count = 1)
   - `default` (Alias to `two_tasks_one_completed`)
2. **Prototype Property Protection:** Property names such as `__proto__`, `constructor`, `prototype`, `toString`, `valueOf` are strictly rejected with HTTP 400 `UNKNOWN_FIXTURE_SCOPE`.
3. **Fail-Closed Authentication:** If `TARGET_RESET_SECRET` is unset, empty, or whitespace, `verifyResetAuth()` fails closed, immediately rejecting all reset, readback, and cleanup requests with HTTP 401.
4. **Body Validation:** Request bodies must be valid JSON objects. Primitive types, arrays, or malformed JSON return HTTP 400 `INVALID_REQUEST_BODY`.
5. **Safe Error Responses:** All errors follow `{ error: { code: string, message: string } }`. Stack traces and internal server paths are never exposed.

---

## 5. Bounded Development-Only Fault Injection

For evaluation testing of the orchestrator's verification gates, `POST /api/test/reset-fixture` accepts an optional `faultInjection` field:
- `NONE` (Default): Clean baseline reset restoring all items.
- `PARTIAL_RESET`: Simulates incomplete state restoration (restores only 1 of 2 tasks).
- `TIMEOUT_SIMULATION`: Simulates delayed reset response (injects 200ms latency).

**Environment Boundary:**
Fault injection is strictly restricted to development/evaluation environments (`DEMO_TARGET_ALLOW_FAULT_INJECTION=true` or sandbox mode). When fault injection is disabled:
- Requests specifying `PARTIAL_RESET` or `TIMEOUT_SIMULATION` are rejected with HTTP 400 `FAULT_INJECTION_DISABLED`.
- Ordinary authorized reset (`faultInjection: 'NONE'` or omitted) remains fully operational.
- Unrecognized fault strings return HTTP 400 `UNSUPPORTED_FAULT_INJECTION`.

---

## 6. In-Memory Lifecycle & Process Restart Semantics

- **Storage:** All fixture records are held strictly in Node process memory per server instance.
- **Persistence:** Does not write to PostgreSQL, SQLite, or local disk.
- **Process Restart:** Restarting the process discards any mutations and restores all disposable fixtures to their initial seed state.
- **Cross-Fixture Isolation:** Mutating one scope (e.g. deleting tasks in `two_tasks_one_completed`) has zero impact on other scopes (e.g. `three_tasks_multi_status`).

---

## 7. Programmatic Client Adapter (`DemoTargetClient`)

Person 1's Playwright worker and orchestrator interact with the target using the typed client adapter in [`demo-target/client.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/demo-target/client.ts):

```typescript
import { DemoTargetClient } from './demo-target/client';

const client = new DemoTargetClient({
  baseUrl: 'http://localhost:3005',
  resetSecret: process.env.TARGET_RESET_SECRET || 'tc-fixture-secret-2026',
});

// 1. Check build info
const info = await client.getBuildInfo();

// 2. Reset baseline before attempt
const receipt = await client.resetFixture('two_tasks_one_completed');

// 3. Verify actual records via independent readback
const readback = await client.readbackFixture('two_tasks_one_completed');
if (readback.itemCount !== 2) {
  throw new Error('Baseline restoration failed');
}

// 4. Cleanup after investigation completes
await client.cleanupFixture('two_tasks_one_completed');
```

---

## 8. TraceCase Workbench Specifications & Reproduction Guide

### A. Target Profile & Registration Values
For registration in TraceCase's target catalog:
- **Application Name:** `TraceCase-Workbench`
- **Base URLs:**
  - Buggy Build: `http://localhost:3005` (or `http://127.0.0.1:3005`)
  - Fixed Build: `http://localhost:3006` (or `http://127.0.0.1:3006`)
- **Workbench Entrypoint:** `/workbench` (or `/workbench/index.html`)
- **Allowed Origins:** `["http://localhost:3005", "http://localhost:3006", "http://127.0.0.1:3005", "http://127.0.0.1:3006"]`
- **Fixture Scope:** `workbench_work_items`
- **Reset Endpoint:** `/api/test/reset-fixture`
- **Readback Endpoint:** `/api/test/readback?scope=workbench_work_items`
- **Build Identifiers:**
  - Buggy: `wb-v1.0.0-buggy`
  - Fixed: `wb-v1.0.1-fixed`

### B. Canonical Initial Fixture (`workbench_work_items`)
Both builds initialize deterministically with exactly four work items:

| Index | Item ID | Title | Status | Priority | Owner | Created At (UTC) |
|---|---|---|---|---|---|---|
| `0` | `wb-item-01` | Review Security Compliance Checklist | Completed (`true`) | High | `Sarah Connor` | `2026-10-21T09:00:00.000Z` |
| `1` | `wb-item-02` | Implement Audit Log Retention Policy | Active (`false`) | Critical | `Alex Murphy` | `2026-10-21T09:30:00.000Z` |
| `2` | `wb-item-03` | Provision Sandbox Network Boundaries | Active (`false`) | Medium | `Ellen Ripley` | `2026-10-21T10:00:00.000Z` |
| `3` | `wb-item-04` | Rotate Staging Service Credentials | Completed (`true`) | Low | `James Holden` | `2026-10-21T10:30:00.000Z` |

- **Total Items:** 4
- **Active Items:** 2 (`wb-item-02`, `wb-item-03`)
- **Completed Items:** 2 (`wb-item-01`, `wb-item-04`)
- **Critical Active Items:** 1 (`wb-item-02`)

### C. Defect Reproduction Journey
1. Open browser at `/workbench` on port 3005 (buggy build).
2. Observe 4 total items and initial KPIs: Total: 4, Active: 2, Completed: 2, Critical: 1.
3. Click filter button **Active** (`id="filter-active"`).
4. Observe visible filtered items: `wb-item-02` (filtered index 0) and `wb-item-03` (filtered index 1).
5. Click **Delete** on `wb-item-02` (`data-action="delete" data-item-id="wb-item-02"`).
6. **Buggy Outcome (`wb-v1.0.0-buggy`):**
   - The server erroneously splices raw backing array at filtered index 0.
   - Raw index 0 contains `wb-item-01` (`Review Security Compliance Checklist`), which is wrongly deleted!
   - `wb-item-02` remains in the backing store and remains visible in the active queue.
   - Readback state: `itemCount = 3`, `items = [wb-item-02, wb-item-03, wb-item-04]`.
7. **Fixed Outcome (`wb-v1.0.1-fixed` on port 3006):**
   - The server deletes `wb-item-02` by stable ID.
   - `wb-item-02` disappears from the active queue.
   - `wb-item-01` is strictly preserved.
   - Readback state: `itemCount = 3`, `items = [wb-item-01, wb-item-03, wb-item-04]`.

### D. Verification Commands & Test Results
Run target-specific regression suites:
```bash
# 1. Complete Workbench UI, defect, reset, and readback tests
npx vitest run tests/demo-target-workbench.test.ts

# 2. Legacy demo-target tests (backward compatibility, TC4 synthetic auth redaction)
npx vitest run tests/demo-target.test.ts

# 3. Person 2 runnable integration examples
npx vitest run tests/person-2-runnable-examples.test.ts

# 4. Target TypeScript compilation check
npx tsc --noEmit --target ES2022 --moduleResolution bundler --module esnext --strict true --skipLibCheck demo-target/* tests/demo-target*
```

**Actual Execution Results:**
- `tests/demo-target-workbench.test.ts`: **37 passed** (0 failed)
- `tests/demo-target.test.ts`: **26 passed** (0 failed)
- `tests/person-2-runnable-examples.test.ts`: **5 passed** (0 failed)
- Combined target suite total: **68 passed** (0 failed)
- TypeScript compilation: **Clean exit 0** (0 errors)

### E. Known Limitations & Unverified End-to-End Dependencies
- **Target Logic & Oracle:** Fully implemented, independently tested, and passing.
- **End-to-End Playwright Execution:** Real browser execution via `PlaywrightBrowserWorker` requires `playwright` binaries and Docker services (PostgreSQL/pg-boss) to be installed in the environment. These belong to Person 1's orchestrator layer and remain unverified in this target-only stage.

