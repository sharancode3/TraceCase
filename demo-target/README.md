# TraceCase — Controlled Demo Target Application (`TraceCase-Demo-Tasks`)

**Component:** Controlled Staging / Demo Web Application  
**Default Ports:** `3005` (buggy build `v1.0.0-buggy`) / `3006` (fixed build `v1.0.1-fixed`)  
**Build Versions:** `v1.0.0-buggy` (seeded defect active) / `v1.0.1-fixed` (correct behavior)  
**Authentication Secret:** Configured via `TARGET_RESET_SECRET` environment variable (fails closed if empty)  

---

## 1. Overview & Seeded Defect

`TraceCase-Demo-Tasks` is a synthetic web application built to serve as an independently verifiable benchmark target for the TraceCase Bug Reproduction Agent.

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
- `GET /api/tasks?filter=all|active|completed&scope=<scope>` — List tasks. Returns 400 on invalid filter or scope.
- `DELETE /api/tasks/:id?filter=all|active|completed&scope=<scope>` — Delete task. Returns 400 on empty ID, invalid filter, or invalid scope.
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
# 1. Reset baseline fixture
curl -X POST http://localhost:3005/api/test/reset-fixture \
  -H "Content-Type: application/json" \
  -H "X-TraceCase-Reset-Auth: $TARGET_RESET_SECRET" \
  -d '{"fixtureScope": "two_tasks_one_completed"}'

# 2. Independent readback verification (mandatory; HTTP 200 alone is insufficient)
curl "http://localhost:3005/api/test/readback?scope=two_tasks_one_completed" \
  -H "X-TraceCase-Reset-Auth: $TARGET_RESET_SECRET"

# 3. Scoped cleanup
curl -X POST http://localhost:3005/api/test/cleanup-fixture \
  -H "Content-Type: application/json" \
  -H "X-TraceCase-Reset-Auth: $TARGET_RESET_SECRET" \
  -d '{"fixtureScope": "two_tasks_one_completed"}'
```

---

## 4. Input Validation & Fail-Closed Safety

1. **Scope Whitelist:** Only predefined disposable scopes are accepted:
   - `two_tasks_one_completed` (Default, Count = 2)
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
