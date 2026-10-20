# Person 1, Phase P1-05: Bounded Playwright Browser Execution, Fresh Observations, Action Receipts, and Evidence Capture — Handoff

## Phase Status: Completed

All deliverables for **Phase P1-05** have been implemented, verified, and integrated into the local working tree without committing or pushing.

---

## 1. What Was Built in Phase P1-05

1. **Headless Chromium Automation Engine**:
   - `playwright@1.49.1` installed and verified. Chromium 131 runtime installed locally.
   - Clean headless lifecycle with sandboxed flags and per-attempt `BrowserContext` isolation (isolated cookies, session storage, local storage, cache, and popups).

2. **Target Network and Egress Guard (`TargetNetworkGuard`)**:
   - Strict origin validation against `target.allowedOrigins` and `target.baseUrl`.
   - Comprehensive cloud metadata blocking (`169.254.169.254`, `metadata.google.internal`, `169.254.169.253`, `100.100.100.200`).
   - Loopback protection blocking `localhost`, `127.0.0.1`, `[::1]`, and `0.0.0.0` unless explicitly enabled by a local development target profile.
   - Deep network-level route interception using `context.route('**/*', ...)` to abort unauthorized egress before connection establishment.

3. **Fresh Observations and Staleness Guards (`ObservationManager`)**:
   - Opaque element reference IDs (`ref-0`, `ref-1`) mapped to DOM elements in a specific `documentGeneration`.
   - Staleness detection: any page navigation increments `documentGeneration`, immediately invalidating prior element references (`STALE_REFERENCE`).
   - Anti-ambiguity guard: checks `locator.count()`. If > 1 match, immediately throws `AMBIGUOUS_LOCATOR` and rejects execution. Never blindly calls `first()`.

4. **Typed Action Dispatcher (`ActionDispatcher`)**:
   - Executes typed steps (`navigate`, `click_button`, `click_link`, `fill_input`, `select_option`, `set_checkbox`, `press_key`, `hover_element`, `scroll_page`, `inspect_dom`, `get_text`, `screenshot`, `clear_storage`, `delete_element`).
   - Auto-waiting actionability with bounded step timeouts (15s default).
   - Monotonic duration tracking.
   - Preserves `MUTATION_UNCERTAIN` whenever a mutating action times out or crashes midway, halting the execution loop immediately.

5. **Evidence Collection and Video Recording (`EvidenceCollector` & `VideoManager`)**:
   - Pre-navigation console and network listeners.
   - Bearer token, basic auth, and query parameter secret redaction in memory.
   - Distinct classification of `CAPTURED_EMPTY` vs `CAPTURE_FAILED` / `UNAVAILABLE`.
   - Context video recording with post-close on-disk verification (`size > 0` bytes) and SHA-256 calculation.
   - Complete `CaptureCoverageReceipt` output.

6. **Worker Integration & Lease Quarantine**:
   - `PlaywrightBrowserWorker` implements `BrowserWorkerPort`.
   - Worker daemon (`worker/index.ts`) wires `PlaywrightBrowserWorker` into `InvestigationClaimHandler`.
   - Lease heartbeat renewal invoked on every executed step.
   - If `MUTATION_UNCERTAIN` is detected, `quarantineLease` locks the global slot for 60 minutes, and the request is marked `FAILED`.

---

## 2. Evidence Disk Staging Layout

Each attempt stages raw evidence into a dedicated directory:
```
.tmp/staging/<investigationId>/attempt-<attemptNumber>/
├── console-attempt-<attemptNumber>.json     (Captured console entries and page errors)
├── network-attempt-<attemptNumber>.json     (Captured HTTP requests, statuses, failures)
├── step-<stepIndex>.png                    (Step screenshots, if taken)
└── videos/
    └── <randomId>.webm                     (Finalized context screen recording)
```

---

## 3. Strict Invariants Enforced

- **TC-INV-007 (Facts Only, No Reproduction Verdicts)**: `PlaywrightBrowserWorker` returns `AttemptExecutionReceipt` containing action receipts, durations, and capture coverage. It never assigns `CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `VALID_CLEAN_RUN`, or `VALID_DEFECT_DETECTED`.
- **TC-INV-013 (Mutation Uncertainty)**: Mutating actions that fail or time out cannot be assumed uncommitted. They are classified as `MUTATION_UNCERTAIN`, aborting the plan and quarantining the lease slot to prevent state corruption.
- **TC-INV-002 (Two Attempts Orchestrated Separately)**: Phase P1-05 executes a single attempt cleanly (recording `ATTEMPT_1_EXECUTED` and `RUNNING_ATTEMPT_1`). Orchestration of Attempt 2 and target fixture resets is deferred to Phase P1-06.

---

## 4. Entry Boundary for Phase P1-06

Phase P1-06 will build directly upon this foundation to implement:
1. **Target Reset Coordination**: Calling `TargetResetPort.triggerFixtureReset()` between Attempt 1 and Attempt 2.
2. **Two-Run Comparison Engine**: Executing Attempt 2 under equivalent baseline conditions and validating precondition equivalence.
3. **Scientific Reproduction Verdict**: Comparing Attempt 1 assertions vs Attempt 2 assertions to reach `CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONSISTENT_OBSERVATIONS`, or `INCONCLUSIVE`.
4. **Transition to Evidence Finalization**: Moving investigation lifecycle to `FINALIZING_EVIDENCE` upon verified completion.

---

## 5. Verification Commands

```bash
# Run unit and integration tests (149 passing)
pnpm test

# Run Phase P1-05 specific tests (18 passing, including real Chromium test)
npx vitest run tests/person-1/phase-5

# Verify zero TypeScript compile errors
pnpm typecheck

# Verify zero ESLint warnings or errors
pnpm lint

# Verify full production build for web and worker
pnpm build
```
