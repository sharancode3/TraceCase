# Person 2 Phase 2 Handoff Specification: TraceCase Workbench

**Branch:** `testingupdate`  
**Owner:** Person 2  
**Target:** Person 1 (Orchestrator & Browser Worker Integration)  
**Status:** Ready for P2-2.6 Integration  

---

## 1. Executive Summary

Person 2 has completed Stages P2-2.0 through P2-2.5. The **TraceCase Workbench** is implemented, tested, and validated as an enterprise-grade target application with deterministic buggy and fixed builds.

All changes have been confined strictly to Person 2-owned files:
- `demo-target/`
- `tests/demo-target-workbench.test.ts`
- Target documentation in `demo-target/README.md`

No files in `src/`, core application routers, migrations, package scripts, or lockfiles have been modified.

---

## 2. Target Profile for Registration (Stage P2-2.6)

Person 1 can register the target using these profile properties:

```json
{
  "name": "TraceCase-Workbench",
  "buggyBaseUrl": "http://localhost:3005",
  "fixedBaseUrl": "http://localhost:3006",
  "entrypoint": "/workbench",
  "allowedOrigins": [
    "http://localhost:3005",
    "http://localhost:3006",
    "http://127.0.0.1:3005",
    "http://127.0.0.1:3006"
  ],
  "fixtureScope": "workbench_work_items",
  "resetEndpoint": "/api/test/reset-fixture",
  "readbackEndpoint": "/api/test/readback?scope=workbench_work_items",
  "buggyBuildId": "wb-v1.0.0-buggy",
  "fixedBuildId": "wb-v1.0.1-fixed"
}
```

---

## 3. Canonical Initial Fixture (`workbench_work_items`)

Both buggy (`wb-v1.0.0-buggy`) and fixed (`wb-v1.0.1-fixed`) builds initialize with identical canonical records:

| Index | Item ID | Title | Status | Priority | Assigned Owner | Created At (UTC) |
|---|---|---|---|---|---|---|
| `0` | `wb-item-01` | Review Security Compliance Checklist | Completed (`true`) | High | `Sarah Connor` | `2026-10-21T09:00:00.000Z` |
| `1` | `wb-item-02` | Implement Audit Log Retention Policy | Active (`false`) | Critical | `Alex Murphy` | `2026-10-21T09:30:00.000Z` |
| `2` | `wb-item-03` | Provision Sandbox Network Boundaries | Active (`false`) | Medium | `Ellen Ripley` | `2026-10-21T10:00:00.000Z` |
| `3` | `wb-item-04` | Rotate Staging Service Credentials | Completed (`true`) | Low | `James Holden` | `2026-10-21T10:30:00.000Z` |

### Initial KPI Metrics
- **Total Queue:** `4`
- **Active Work:** `2` (`wb-item-02`, `wb-item-03`)
- **Completed:** `2` (`wb-item-01`, `wb-item-04`)
- **Critical Priority (Active only):** `1` (`wb-item-02`)

---

## 4. Defect Reproduction Journey (Playwright Worker Steps)

Person 1's browser worker can reproduce the defect using these standard DOM interactions:

1. **Navigate:** Open `http://localhost:3005/workbench`.
2. **Verify Baseline:**
   - Assert text `TraceCase Workbench` is present.
   - Assert element `#metric-total-val` has text `4`.
   - Assert element `#metric-active-val` has text `2`.
   - Assert element `#metric-completed-val` has text `2`.
   - Assert element `#metric-critical-val` has text `1`.
3. **Filter Active:**
   - Click button `#filter-active` (`aria-label="Filter active work items"`).
   - Assert visible count is `2` (`wb-item-02` and `wb-item-03`).
4. **Trigger Defect:**
   - Click delete button on item `wb-item-02`:
     `button[data-action="delete"][data-item-id="wb-item-02"]` (accessible label: `Delete Implement Audit Log Retention Policy`).
5. **Observe Defect Outcome (`wb-v1.0.0-buggy`):**
   - Item `wb-item-02` **persists** in the DOM list `#wb-queue-list`.
   - The server erroneously removed `wb-item-01` (at raw index 0).
   - Metric `#metric-active-val` remains `2`.
   - Metric `#metric-completed-val` drops to `1`.
6. **Observe Fixed Outcome (`wb-v1.0.1-fixed` on port 3006):**
   - Item `wb-item-02` disappears from the active queue.
   - Item `wb-item-01` remains preserved.
   - Metric `#metric-active-val` drops to `1`.
   - Metric `#metric-completed-val` remains `2`.

---

## 5. Protected Reset & Independent Readback Oracle

TraceCase's `TargetResetClient` can coordinate fixture reset and readback without changes to core verification logic:

### Reset Request
- **Endpoint:** `POST /api/test/reset-fixture`
- **Header:** `X-TraceCase-Reset-Auth: <secret>` (or `Authorization: Bearer <secret>`)
- **Body:**
  ```json
  {
    "targetId": "TraceCase-Workbench",
    "fixtureScope": "workbench_work_items",
    "attemptPairId": "<attemptPairId>"
  }
  ```
- **Receipt:** Returns `200 OK` with `FixtureResetReceipt` (`itemsRestored: 4`, `buildVersion`).

### Independent Readback Request
- **Endpoint:** `GET /api/test/readback?scope=workbench_work_items`
- **Header:** `X-TraceCase-Reset-Auth: <secret>`
- **Response:** Returns `200 OK` with `FixtureReadbackResult`:
  ```json
  {
    "fixtureScope": "workbench_work_items",
    "buildVersion": "wb-v1.0.0-buggy",
    "itemCount": 4,
    "items": [ ... ],
    "verifiedAt": "2026-10-22T19:45:00.000Z"
  }
  ```
- **Oracle Comparison:** Compatible with `BaselineComparator.compareBaselines()`. Ignored volatile fields (`verifiedAt`, `createdAt`) are stripped automatically, producing matching SHA-256 hashes on reset restoration and diverging hashes on defect mutation.

---

## 6. Backward Compatibility & Non-Interference

1. **Root Application at `/`:** Preserves 100% legacy behavior for `TraceCase-Demo-Tasks`.
2. **Legacy Tasks API at `/api/tasks`:** Fully preserved.
3. **Legacy Fixture Scopes:** `two_tasks_one_completed`, `three_tasks_multi_status`, and `auth_test_user` are completely isolated and unaffected by workbench operations.
4. **TC4 Synthetic Auth Redaction:** Preserved at `POST /api/auth/login` (emits `synthetic-jwt-token-xyz-9876`).
5. **Build Metadata:** `GET /api/build-info` and `/api/info` return truthful versions without leaking internal `bugModeActive`.

---

## 7. Verification Summary

| Suite / Check | Result |
|---|---|
| `tests/demo-target-workbench.test.ts` | **37 passed, 0 failed** |
| `tests/demo-target.test.ts` | **26 passed, 0 failed** |
| `tests/person-2-runnable-examples.test.ts` | **5 passed, 0 failed** |
| Target TypeScript compilation (`tsc --noEmit`) | **Clean exit 0** |
| **Combined Target Suite Total** | **68 passed, 0 failed** |

---

## 8. Handoff Status for P2-2.6

Person 2's implementation of the target application, deterministic defect, fixed counterpart, reset/readback oracle, and documentation is complete. Person 1 may proceed with Phase 2 end-to-end integration (Stage P2-2.6).
