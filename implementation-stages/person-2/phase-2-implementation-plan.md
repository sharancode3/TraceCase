# Person 2 — Phase 2: Realistic, controlled browser-verification target

**Owner:** Person 2 (controlled target application).
**Status:** Proposed implementation plan; no stage is represented as complete.
**Primary outcome:** Give TraceCase a polished, credible, fully interactive local application to verify, while preserving a deterministic defect, safe reset/readback, and the existing Task Management target as a regression baseline.

Person 2 owns the target application served from `demo-target`; Person 2 does not own TraceCase's dashboard, report form, AI workflow, database, browser worker, approval rules or verdict engine. The new UI is a test subject for TraceCase, not another dashboard inside the TraceCase product.

## Confirmed current target baseline

The repository's `demo-target/server.ts`, `store.ts`, `client.ts`, `types.ts` and `config.ts` implement a real Node HTTP target application, not merely a static screenshot. Its public UI is a single “Task Management Demo” page. The store holds synthetic tasks in process memory and supports filtered reads, delete behavior, build information and whitelisted fixture reset/readback/cleanup APIs. `pnpm dev:target` starts this target; `DEMO_TARGET_PORT` defaults to 3005. The documentation describes a buggy build at 3005 and a fixed build at 3006; verify both configurations on the machine before relying on them. The known deterministic bug is that deleting an item while a filter is active can apply its filtered-list index to the unfiltered array, deleting the wrong task. The fixed behavior deletes by stable record ID.

TraceCase at port 3000 and the target at port 3005 are separate web applications/processes. TraceCase's backend stores a target profile (URL, allowed origins and test configuration); it does not host this target. The screenshot's five target records at the same origin are records to inspect and reuse carefully, not permission to delete or silently merge. Existing target fixtures, reset/readback security, the buggy/fixed comparison and synthetic TC4 case must remain available as regression coverage.

## Product direction for the improved site

Build a small, realistic enterprise work queue named provisionally **TraceCase Workbench** (confirm final label with Person 1 before exposing it). It should have an overview with metrics computed from actual synthetic work items, a searchable/filterable work queue, a selected-item detail view, and a useful activity/history panel. It should feel like a credible staging tool, not a fake SaaS clone. Every visible control must work, keyboard focus must be visible, and desktop/mobile layouts must remain usable. Use synthetic organizations and records only; do not copy a real vendor's identity or imply affiliation.

The defect should remain understandable and testable. Recommended first scenario: when the user filters the work queue to Active and deletes a specifically named active item, the buggy build removes a different record from the fixture. Ground truth identifies the selected stable item ID and the expected state of every fixture record before and after the action. The fixed build performs the same journey and removes only the selected ID. Use one deterministic seeded defect first; do not pile unrelated bugs into the UI.

Keep the existing task target on 3005/3006 unchanged as a regression target. Prefer an isolated `demo-target/workbench` module and a configurable port for the improved target; a proposed default port such as 3007/3008 may be used only after checking for conflicts and documenting overrides. If a second service would create unnecessary setup burden, propose reusing the same server with a clearly isolated route/configuration, but do not change the baseline app or its response contracts without Person 1's agreement. No public third-party site is authorized by this plan.

## Stage P2-2.0 — Baseline and contract handoff with Person 1

Read repository guidance, the current branch/revision and working tree, `demo-target/README.md`, target config/types/client/store/server, TraceCase target contracts and API, the official problem statement, verification/safety spec, and the Person 1 Phase 2 plan. Confirm existing 3005 and 3006 startup behavior, available ports and the target's reset secret handling without printing secrets. Do not assume a process is running because a port was used previously.

Before implementation, agree with Person 1 on: target display name; buggy and fixed URLs/build identifiers; allowed origins; environment label; fixture scope; stable record IDs; the exact defect trigger; initial expected state; reset/readback receipt fields; health/build endpoints; user-facing accessible labels; and whether the application is a separate service or isolated route. Specify which files Person 2 may change. Shared contracts, package scripts, environment examples and lockfiles require coordination first.

**Exit evidence:** written target contract and file ownership; verified port/configuration plan; no changes to the existing 3005/3006 baseline; no secrets copied into the handoff.

## Stage P2-2.1 — Specify the application and oracle before writing UI

Write a short product/fixture specification with two complementary views: what a human sees and what the verifier can independently establish. Define route map, navigation, work-item fields, filter/search semantics, stable labels, and the state transition caused by each button. Design a compact deterministic fixture with realistic synthetic names, statuses, dates, priority and owner values. Do not let display order, random data, current time, or generated IDs determine which record is the intended target.

Create a ground-truth table that names each fixture ID, initial status, user-visible title, expected post-action state and the one bug-mode result. Define how reset restores exactly that baseline, how readback obtains actual records independently, how the app reports its build, and how the fixed build differs. Ground truth must live in server-side test fixtures/contract code; do not leak a “bug mode” label, expected wrong record or oracle answer in public DOM text or normal API responses the browser agent can inspect.

**Exit:** a reviewer can identify the exact selected entity, trigger, wrong entity (buggy build), expected behavior (fixed build), and readback fields without interpreting an AI-generated plan.

## Stage P2-2.2 — Build the polished, functional user experience

Implement a responsive application shell with a useful overview, work-item queue, status filters, search, item detail and activity/history. Metrics must be computed from the same real in-memory fixture data shown in the list; omit a metric if it cannot be calculated reliably. Keep the hierarchy clear: page title and environment/build context, a small summary strip, queue controls, legible list/table rows, and detail content for the selected item. Provide coherent empty, loading, not-found, validation and error states.

Every control must have real behavior: search narrows items, filters are mutually understandable and accessible, selecting a row opens that record, details match its stable ID, and any supported mutation changes the actual in-memory store and appears in activity/history. If delete/archive exists, show the selected record and a confirmation before mutation. Do not add fake charts, nonfunctional tabs, decorative buttons, misleading “saved” toasts, or controls that only update local presentation while server state stays unchanged.

Use the existing repository stack and runtime unless a measured need justifies change. The current target uses a TypeScript Node HTTP server and serves an HTML/CSS/JS page; a maintainable isolated set of static assets or route-rendering module is preferable to adding a large framework or expanding a single template string indefinitely. Do not add dependencies or alter root package scripts/lockfile without coordination. Match the TraceCase UI direction where appropriate, while making the target look like its own realistic work application rather than copying TraceCase's console.

**Acceptance:** all visible navigation/actions work; responsive and keyboard behavior is sound; metrics/search/filter/detail are based on real fixture state; every displayed build label is truthful; no external service or real data is required.

## Stage P2-2.3 — Implement one controlled defect and a truly comparable fixed build

Use the same UI, routes, fixture data, ordering and accessible labels in both builds. Select the buggy/fixed behavior only through server configuration, with explicit build identity and a shared code path. The buggy build should contain exactly the agreed index-versus-ID defect or another approved single deterministic defect; the fixed build should correct only that behavior. Do not expose an operator toggle that lets a browser user change modes. Keep bug-mode configuration, reset credentials and fixture oracle out of HTML, page JavaScript, public build-info fields and normal logs.

The ordinary application API must validate IDs, filter values, methods and bounded request bodies, and return truthful HTTP status/error envelopes. Privileged reset/readback/cleanup endpoints must remain separate from product actions, accept only whitelisted fixture scopes and fail closed when reset authorization is absent or invalid. Do not accept arbitrary URLs, SQL, filesystem paths, tables or “reset all” values. Do not copy permissive wildcard CORS from an existing route without checking whether CORS is needed at all; use the narrowest origin policy consistent with the existing browser-worker contract.

**Acceptance:** a normal user action on the buggy build produces the exact agreed wrong-entity transition; the same action on the fixed build affects only the chosen ID; the builds are otherwise behaviorally comparable; invalid and unauthorized requests fail safely.

## Stage P2-2.4 — Make reset and readback a trustworthy independent oracle

Reuse the existing fixture safety pattern where possible. Reset only the named disposable scope and return a receipt that includes the fixture scope, actual build identity, timestamp and restored entity count or equivalent contracted values. Then independently read back the named entities and relevant fields; do not treat HTTP 200 or a reset endpoint's self-assertion as proof. Readback must reveal whether the intended and unrelated records match the exact baseline. Repeated resets must be idempotent; mutation in one fixture scope must not alter another.

Use only synthetic fixtures and a test-only reset secret loaded on the server. Never place the secret in source, browser storage, demo copy, exported evidence, URLs or console output. Do not run cleanup against a non-disposable target. If the target remains in-memory, document that process restart resets state and test the startup baseline. Preserve the existing target's separate TC4 synthetic token scenario; do not use a real credential or introduce a real token into this new app.

**Acceptance:** two successive reset/readback cycles establish the same baseline; readback detects a deliberate partial/mismatched state; absent secret and unknown scope fail closed; target build identity is independently visible to the worker without revealing hidden bug mode.

## Stage P2-2.5 — Package a clean local handoff and target checks

Document exact clean-start steps, environment variable names (never values of personal secrets), ports and overrides, health/build check, buggy/fixed configuration, target registration fields, fixture scope, stable IDs, intended behavior, reset/readback process and known limits. Ensure a developer can run the target without Docker if the current Node/TypeScript setup permits it; do not introduce Docker as a new requirement. Clearly state whether state is memory-only and what a restart does.

Add focused deterministic checks using the repository's existing test approach: seed state; list/filter/search; selected-ID deletion; bug-mode wrong-item result; fixed-mode correct result; invalid ID/filter/scope handling; reset and readback repeatability; scope isolation; missing/incorrect reset secret; build identity; responsive/keyboard interactions using available tools. Do not claim browser verification unless a real browser run against the started service was performed. Do not create fake TraceCase investigation records to make the handoff look integrated.

**Acceptance:** clean startup instructions work from repository source; focused checks assert exact records and outcomes; Person 1 can register target through the normal target manager; no machine-specific absolute path or secret is required.

## Stage P2-2.6 — Pair integration and demonstrate the actual workflow

Hand the target contract and exact reset/readback requirements to Person 1 before registering it. Then jointly perform a bounded run using TraceCase: select the new registered target, submit the approved report, review/approve the real plan, start the authorized run, capture the actual target build and fixture, verify attempt 1, reset and independently read back, verify attempt 2, and compare the true result with ground truth. Repeat on the fixed build only when the plan and environment support a valid comparison. Inspect actual evidence records; do not make claims based solely on a dashboard label or mocked API.

Record target URL/build, fixture scope and record IDs, investigation and plan revision/hash, attempt IDs, reset receipts, readback snapshots and evidence IDs. If the browser worker or model fails, preserve the failure and report it; do not re-run until a desired result appears without recording the failed attempt. Keep the existing 3005/3006 regression scenario usable.

**Definition of done:** TraceCase can test the improved target using its ordinary target-registration and approved-run workflow; the interface is credible and useful; one defect is repeatable on two valid buggy-build runs with verified restoration; the fixed build is comparable; the old target remains intact; evidence and limits are truthfully reported.

## Person 2 agent instructions and non-negotiable boundaries

Preserve existing source changes and shared work. Do not switch branches, reset, clean, rebase, merge, commit or push unless separately authorized. Make changes inside the agreed target-owned paths. Do not edit TraceCase UI/workflow/schema/verdict logic or circumvent its target authorization, human approval, reset/readback or evidence policy. Coordinate every shared contract, package script, dependency or lockfile change with Person 1 before editing.

Do not test arbitrary public websites or real customer accounts. Do not introduce live third-party integrations, real personal data, real credentials, OTP/CAPTCHA bypass, uncontrolled network access, undisclosed hidden selectors, fabricated telemetry or a non-deterministic defect. Do not weaken secret checks, widen origin access for convenience, or call a reset hook against anything except the named disposable fixture. Preserve the existing task target and its TC1–TC4 testability. State clearly which checks were actually run and which could not run.

## References

[`demo-target/README.md`](../../demo-target/README.md) · [`demo-target/server.ts`](../../demo-target/server.ts) · [`demo-target/store.ts`](../../demo-target/store.ts) · [`demo-target/types.ts`](../../demo-target/types.ts) · [`demo-target/config.ts`](../../demo-target/config.ts) · [`docs/prd.md`](../../docs/prd.md) · [`docs/ps-requirements-traceability-matrix.md`](../../docs/ps-requirements-traceability-matrix.md) · [`docs/verification-evidence-and-safety-specification.md`](../../docs/verification-evidence-and-safety-specification.md) · [`docs/agent-and-tool-contracts.md`](../../docs/agent-and-tool-contracts.md) · [`docs/api-and-event-contracts.md`](../../docs/api-and-event-contracts.md) · [`implementation-stages/person-1/phase-2-implementation-plan.md`](../person-1/phase-2-implementation-plan.md)
