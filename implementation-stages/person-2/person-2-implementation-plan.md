# Person 2 — Realistic Controlled Demo Target Plan

**Role:** Target application and deterministic benchmark owner for this corrective sprint.
**Goal:** Give TraceCase a realistic application to test while keeping it owned, safe, repeatable and independently verifiable.
**Plan status:** Proposed work; no stage is marked complete by this document.

This plan replaces the former eight-stage Person 2 roadmap as the active assignment. Preserve the current demo target as a stable regression target.

## What exists today

The repository includes demo-target/server.ts, store.ts, client.ts, types.ts and config.ts. The target is more than static HTML: it has a real HTTP server, in-memory fixture state, filtered reads, delete behavior, build information, and authenticated reset, readback and cleanup routes. Its public experience is a single small task-list screen. Repository docs describe a buggy build on 3005 and fixed build on 3006. Verify both are runnable before relying on them; do not assume a service is running or a port is free.

The known defect is deterministic: while the Active filter is selected, a visible task's filtered index can be applied to the unfiltered backing array, deleting the wrong record. The fixed mode deletes by stable task identity. Preserve this exact scenario for existing regression reports.

## Product decision for the second application

Build a second owned local target that feels like a small real work-management product, not a one-page fixture. A bounded concept is an enterprise issue/work queue with an overview, work-item table, search and status filters, item detail and activity history. Every visible navigation item and action must work. Do not add decorative screens or dead buttons.

Keep it visibly identified as a TraceCase demo/staging target using synthetic data; do not copy real vendor branding or imply affiliation. It is a controlled local app, not an unapproved third-party site.

Prefer an isolated new target module under demo-target so the existing Task Management target and its fixtures remain unchanged. Keep configuration and build identity separate. A proposed default is port 3007 for a buggy build and 3008 for a fixed build, but check the machine and make ports configurable before starting. Do not take over 3005/3006. Package scripts require a cross-platform method and coordination with Person 1 before shared package changes.

If the team later chooses a public external app, require explicit authorization, exact approved origins, safe test accounts, disposable state and independent reset/readback before any browser action. A pasted URL alone is not permission to test it.

## Stage P2-R1 — Agree target contract and ownership with Person 1

Before implementation, agree on canonical target name, base URLs, build names, origin, test case, initial fixture, entity IDs, correct behavior, failure signature and deterministic assertions. Agree which public routes and accessible names Playwright will use, exact fixture scope, reset/readback shape, environment configuration and whether a fixed comparison build is needed. Identify every shared contract/package file before editing it.

Reuse existing target adapter contracts when possible. If a new fixture scope or response field is necessary, propose the change to Person 1 with compatibility impact first. Keep hidden bug mode out of public page markup, selectors, public build info and model-visible observations unless a reviewed requirement explicitly permits disclosure. Do not work around an existing security check.

**Exit:** written agreement and file ownership; existing 3005/3006 target preserved; Person 1 can register the new target via normal target management.

## Stage P2-R2 — Design the product flow and deterministic fixture

Write a short target specification before coding. A coherent scope can include a workspace overview, a work-item list, status filters/search, item detail and an activity view. Pick one credible, easily described bug with deterministic observable effects. Do not add multiple seeded defects in the first version.

Use enough synthetic records to look like a real queue, but keep a named verification fixture with stable IDs and an exact expected baseline. Ground truth must name the target entity and expected state; “first row disappeared” is not sufficient by itself. The bug must not depend on record order the agent cannot observe. All navigation and actions must work with keyboard and accessible labels.

Avoid a large SaaS clone. No real users, account/payment integrations, fake charts, dead screens or database are required. Keep the in-memory store if it satisfies the verified scenario; clearly document that target data resets on restart.

**Exit:** routes, synthetic data, bug trigger, expected and observed outcomes, fixture IDs and readback fields are specified independently from AI prompts.

## Stage P2-R3 — Implement the richer interface and real application behavior

Build a polished responsive shell, navigation, list/table, filters, search, details and activity. Each control must perform real behavior: search searches, filters filter, links navigate, actions mutate the selected record. Use semantic accessible controls and stable identifiers from the agreed contract.

Implement buggy and fixed builds from a shared code path and explicit configuration. The buggy variant should contain only the agreed deterministic defect. The fixed variant should change that behavior and keep equivalent data and UI. Show safe application/build version for operator verification; do not disclose hidden bug-mode flags.

Keep ordinary product APIs distinct from privileged test endpoints. Validate path IDs, filters, methods and bounded request bodies. Return truthful statuses and safe errors. Do not introduce unauthenticated forced-bug controls or permissive cross-origin access without need.

**Exit:** the complete visible journey is functional; the buggy build manifests the specified issue; the fixed build does not; both share the same fixture and comparable UI.

## Stage P2-R4 — Implement safe fixtures, reset and readback

Reuse the current target pattern: whitelisted fixture scopes, server-side reset authorization, bounded reset, independent readback of actual IDs/statuses, build identity and scoped cleanup if required. Never accept arbitrary SQL, table, file, hostname or reset-all inputs. Reset secrets remain server-side and never enter page code or model context.

A 200 response is not proof of restoration. Read back the specific baseline entities and relevant fields, return a truthful receipt, and allow TraceCase to compare exact expected state. Unsupported scope, missing secret, partial reset, wrong build and readback mismatch must fail clearly. If the target uses memory, test repeated resets, scope isolation and restart semantics. Keep old target fixture/endpoints unchanged.

The new fixture must let the verifier establish whether the intended entity changed and unrelated entities remained intact. Do not expose the expected bug outcome in public UI/API data sent to the browser agent before execution.

**Exit:** repeated reset/readback returns the same baseline; build identity is correct; missing authorization and invalid scope fail closed; original 3005/3006 tests remain compatible.

## Stage P2-R5 — Document startup, test and hand off

Document exact launch configuration for buggy and fixed builds, environment variable names, health/build checks, target catalog values, routes, fixture IDs and reset/readback process. Never put a real secret in source or documentation. State in-memory restart behavior and unsupported authentication clearly.

Add deterministic target checks for initial state, routes, filters, invalid input, the buggy outcome, fixed behavior, repeated reset/readback, scope isolation, build identity, unauthorized access, invalid scope and absence of hidden scenario/secret leakage. Include an accessibility and responsive-control check supported by existing project tools.

Pair with Person 1 to run TraceCase only after the target contract is accepted. Submit a report example, but do not seed it as a live investigation. Record actual target/build, plan hash, attempt IDs, reset/readback receipts, artifacts and observed outcome. If any run fails, preserve it and report the blocker.

**Exit:** clean-checkout startup is documented, target checks pass, normal target registration works without hardcoded TraceCase UI assumptions, and an actual bounded browser demonstration is recorded or explicitly marked blocked.

## Definition of done

The new target looks and behaves like a small staging application. All visible controls and APIs work. One approved issue reproduces in two valid buggy-build attempts with equivalent verified reset/readback; a fixed build provides a clean comparison. Existing Task Management target remains available. All data is synthetic; destructive actions stay inside whitelisted disposable fixtures.

## Restrictions

Person 1 owns TraceCase pages, target registration, workflow persistence, authorization and result rendering. Person 2 owns only target implementation, target tests and target documentation. Coordinate shared contracts, environment examples, package scripts and lockfiles. Do not change TraceCase verdict logic, bypass target allowlists, expose reset credentials, test an unapproved public site, switch branches, stage, commit, merge, push or reset the shared checkout.
