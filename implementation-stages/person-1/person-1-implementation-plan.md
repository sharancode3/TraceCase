# TraceCase — Person 1: Core Platform, Browser Execution, and Verification

**Role:** User / lead integrator. **Plan status:** Proposed; stages not executed by this document.  
**Stages:** Nine, P1-01–P1-09. **Read first:** [Common baseline, ownership, handoffs and gates](../README.md).

## Mission and ownership

Build the trusted system that accepts an authorized report, obtains useful AI proposals, requires approval, executes a bounded experiment, verifies two attempts, and returns an honest evidence-backed result. Extend the existing foundation rather than rebuilding the UI or replacing contracts independently.

Own public API handlers (`src/app/api/**`), auth, database/repositories/migrations, controller, policy, queue, browser, deterministic verification, target-adapter client, `worker/**`, shared configuration and deployment. Coordinate `src/contracts/**`, service ports and dependency changes. P2 owns AI and demo-target internals. P3 owns UI and evidence storage/sanitization services. You integrate their public operations; do not write competing versions.

At inspection, contracts, six table definitions, migration SQL, API scaffolds, policy helpers, fail-closed auth scaffold and an idle worker exist. Typecheck/lint/15 existing tests pass. That does not establish live auth, persistence, applied migration, durable concurrency, real browser execution or verification. These are the work below.

Use stage IDs in tasks and completion records. References below identify actual documents by their domain/topic; inspect their current sections and code rather than assuming draft examples are implemented. Do not infer a deadline from the submission-opening screenshot.

## P1-01 — Review the foundation and freeze usable integration contracts

### Entry and references

Begin immediately after Stage 0, alongside P2-01 and P3-01. Read [foundation decisions](../../docs/foundation-decisions.md), [status](../../docs/foundation-status.md), [contribution boundaries](../../docs/contribution-boundaries.md), [TRD](../../docs/trd.md) architecture/contracts, [workflow](../../docs/workflow-and-state-machine-specification.md), [agent contracts](../../docs/agent-and-tool-contracts.md), [API/events](../../docs/api-and-event-contracts.md), and [verification/safety](../../docs/verification-evidence-and-safety-specification.md). Inspect current contracts, `services/ports.ts`, auth, config, approval/fingerprint helpers, migration runner and route scaffolds.

### Implement and decide

1. Resolve common checklist F-01–F-11. Keep type names canonical and record changed draft examples. Do not call an earlier self-labelled approved document human approval.
2. Separate model proposals from server-enriched plans. The server assigns IDs, versions, hashes, credentials references, approval and budget authority. Support incomplete intake; require clarified correct behavior/failure signature before approval, not a complete specification before any report can be saved.
3. Define a small typed assertion vocabulary supported by the verifier. Describe missing observation, supported comparison, settling point, and unsupported visual checks. No free-text-to-arbitrary-code conversion.
4. Replace the browser port's verdict-like boolean with observations/action receipts/capture coverage, leaving assessment to verification. Define the three AI role ports with P2.
5. Split safe target metadata from reset/account secrets. P2 receives only safe context; P3 receives safe UI projection. Use credential references internally.
6. Define evidence capture/processing/access ports with P3, including multi-page recordings, failed finalization and storage failures. Define typed safe progress payloads and snapshot sequence watermark.
7. Correct preview/live composition, production default-secret behavior, and truthful readiness. Synthetic data cannot authorize live work or substitute for missing services. Do not assume existing defaults are production credentials.
8. Complete approval binding: owned investigation/plan/target/fixture/account references, version, permitted steps/variants, limits, revocation and expiry if selected. Review canonical serialization, optional fields, ordered versus unordered fields, and material-scope coverage. A hash is not a signature or independent approval.
9. Define ownership of every service write and choose event/queue commit consistency. Do not invent verified transactional pg-boss integration without checking installed APIs.

### Behavior, checks and exit

Unknown or missing trusted facts block live admission. Changes to material experiment meaning require approval again. Test cross-investigation approval reuse, missing/revoked approval, altered assertions/fixture scope, forbidden client fields, secret-free safe projections, invalid production config and typed event payloads. Keep ordinary locator refresh distinct from a changed semantic plan.

**Deliverables:** agreed shared schemas/ports/examples, decision updates, focused negative tests and foundation review record. **Exit:** H-01 accepted by consumers; G0. P2/P3 may prepare independent fixtures, prompts and components while this lands. No real reproduction yet.

## P1-02 — Establish real identity, persistence and owned resources

### Entry and references

Requires the relevant H-01 identity/data contracts. Read [database/ERD](../../docs/database-design-and-erd.md) ownership/transactions, [API/events](../../docs/api-and-event-contracts.md) authentication/commands, [PRD](../../docs/prd.md) intake/targets, and [operations](../../docs/test-evaluation-operations-and-execution-plan.md) local setup/migrations. Inspect `src/server/auth`, `db`, config and generated SQL.

### Implement

- Select/configure the documented auth integration with safe session verification. Do not create an organization/billing system. UI sign-in work belongs to P3; auth enforcement belongs here. Replace the production path's unavailable verifier with real verification; injected test identities stay in test composition. Review the existing admin bypass so only a deliberately verified server-authorized role can use it.
- Provision an explicitly local/disposable database for development verification. Apply reviewed migrations, report failures with a non-success operational outcome, and distinguish connectivity, schema and permission problems. Never run an unknown reset or truncate to make setup pass.
- Extend six initial tables incrementally: frozen plan revisions/clarification records, approval revocation and scope, attempts/candidates, action/observation/assertion receipts, fixture/reset receipts, artifact metadata, model usage and audit as required by stages. Avoid creating all ERD entities without an implemented use.
- Provide typed owned repositories for targets, reports, investigations and plan versions; explicit artifact/model-usage repository operations requested by P3/P2. Define transaction boundaries, constraints and indexes for actual access patterns.
- Record configured target origins, test-account reference, verified environment/build, fixture scope and trust provenance. A client sandbox request is not verification. Network probing needs explicit onboarding authorization and outbound policy.
- Design any supported attachments with bounded types/sizes, safe names, ownership and restricted processing. P3 implements evidence/attachment storage service; defer unsupported formats explicitly. Do not require source-code upload or video interpretation for core reproduction.

### Checks and exit

Test actual insert/read/update through owned repositories, cross-user access denial, duplicate/conflicting versions, migrations on a fresh local database, and protected routes with missing/invalid auth. A new session can reload saved data; auth/provider errors do not return invented empty live lists. Do not log connection strings or token bodies.

**Deliverables:** identity integration, applied local migration record, repositories and safe resource projections. **Exit:** real persisted owned resources usable by APIs; P3 receives auth/API error behavior and repository interfaces needed by evidence (part of H-09). Database-unavailable status is a blocker to persistence verification, not to P2's target or P3's UI work.

## P1-03 — Implement intake, planning, approval and investigation APIs

### Entry and references

Requires P1-02 for live persistence; P2 planner may still be a labelled double. Read [PRD](../../docs/prd.md) journeys/approval, [workflow](../../docs/workflow-and-state-machine-specification.md) transitions/scope invalidation and [API/events](../../docs/api-and-event-contracts.md) commands/errors/idempotency. Reuse current `/api/v1` route direction after H-01.

### Implement

1. Save a report and its reported environment/build without fabricating missing facts. Track reporter claims separately from verified environment values. Clarification answers append to a traceable report context.
2. Invoke the planner through the agreed port, validate its proposal, persist unresolved questions or a versioned experiment, and server-enrich the accepted proposal. Unavailable AI remains an unavailable integration, not a mock live plan.
3. Define correct behavior and reported failure as separate supported checks. Reject contradictions or unsupported verification before approval.
4. Read stored plans for review. Remove `SYNTHETIC_PLAN_V1` from live approval. On approval, authenticate, verify ownership and version/hash/scope, and persist the authorization. On material edits, invalidate prior approval in the same coherent transaction.
5. Keep approval and start semantics consistent with the selected two-step foundation direction. Provide one documented start/admission command; do not enqueue twice from an approval handler and a client follow-up.
6. Implement safe rejection, revocation and cancellation commands. A revoked queued run cannot later execute under the old authorization. Cancellation is a request to stop future work, not rollback of target state.
7. Add scoped idempotency for state-changing commands, payload conflict detection and optimistic versions. Reauthenticate cached responses; do not cache enduring signed artifact grants. Do not mistake command deduplication for exactly-once external effects.
8. Return truthful snapshots/errors, including incomplete, pending, blocked, observed-once and inconsistent meanings using agreed schema/mappings. Do not directly accept a client verdict, approval fact or artifact-safe flag.

### Checks and exit

Verify report → clarification → plan → review → approve → start request using real persistence. Test stale hashes, another user's IDs, double clicks, mismatched path/body identity, missing prerequisites and plan edits after approval. P3 must be able to replace fixture submissions with these APIs without changing schemas.

**Deliverables:** owned workflow APIs, transition/service tests, stable examples and H-09 partial handoff. **Exit:** real authorization exists; execution still waits for the worker gate. H-04 can replace the planner double when available.

## P1-04 — Implement durable jobs, ownership and progress production

### Entry and references

Requires stored approved plans and start semantics. Read [workflow](../../docs/workflow-and-state-machine-specification.md) side-effect ordering/leases, [database](../../docs/database-design-and-erd.md) concurrency/queue and [API/events](../../docs/api-and-event-contracts.md) jobs/events/progress. Verify pg-boss APIs against the selected installed version before implementation.

### Implement

- Install/configure the selected queue, preserving queue-managed schema separation. Choose one coherent application state/job dispatch strategy and document recovery from a commit/enqueue split. Do not maintain competing truth in queue rows and investigation status.
- Enforce one active investigation across the initial platform, including multiple worker processes; per-target locks or a constant `concurrency: 1` alone do not prove this. Define resource locking, leases, fencing and heartbeat/expiry behavior.
- Dispatch small server-created job references, not credentials, raw prompts, model-approved booleans or mutable client plans. Re-read owned current plan/approval/fixture scope at claim and before action dispatch.
- Produce authoritative state changes with durable safe progress events. Define per-investigation sequence, event version, snapshot watermark and cursor retention. P3 consumes replay; UI reconnect does not enqueue work.
- Implement safe worker drain/stop, truthful liveness versus queue/browser readiness and diagnostic job checks. Do not advertise reproduction readiness before target/browser integrations pass.
- Record intent before external actions and maintain a path for uncertain outcome reconciliation. Lease expiry must not make a second worker blindly replay the same mutation.

### Checks and exit

Use a harmless internal diagnostic job first. Test duplicate start/delivery, two-worker claim race, revoked queued approval, stale worker write, worker loss, event replay duplicates and a missing progress cursor window. No exactly-once guarantee is made.

**Deliverables:** durable admission/worker protocol and progress snapshot/stream contract. **Exit:** a real diagnostic job is claimed/completed once in application history; live investigation dispatch remains gated. H-09 progress contract ready for P3-05.

## P1-05 — Implement bounded Playwright execution and capture

### Entry and references

Needs H-01, H-02 controlled target and H-03 sanitizer for real capture exposure. Safe module/unit work can begin earlier. Read [agent/tool contracts](../../docs/agent-and-tool-contracts.md) dispatch/freshness, [architecture](../../docs/system-architecture.md) browser/network, [verification/safety](../../docs/verification-evidence-and-safety-specification.md) capture/action risks and [TRD](../../docs/trd.md) browser/target integration.

### Implement

1. Launch server-side Chromium through Playwright in the persistent worker. Isolate contexts by attempt; maintain backend fixture isolation separately. Set bounded resource/time limits. No user-browser takeover.
2. Resolve credentials internally; avoid placing credential values in model context or capture where possible. Manual OTP/CAPTCHA handling must be a deliberate safe handoff or labelled mock; do not silently use a personal browser or automated bypass.
3. Capture sanitized structured observations and fresh element references with run/attempt/session/freshness identity. Preserve noninteractive evidence needed by verification while bounding the AI projection with P2.
4. Execute a small typed action set after validation. Check approval, target/network scope, resource identity, risk, fixture and budgets at dispatch. Model-supplied risk or selector is not permission. No arbitrary browser eval, shell, SQL, filesystem path or reset-all tool.
5. Establish actual egress controls appropriate to the deployment, including target redirects/dependencies. Do not claim Playwright routing alone is a complete network sandbox. Document permitted local target exceptions narrowly.
6. Start recording/log listeners before the reproduction steps. Capture console/page errors, response statuses, failed requests, timings and relevant observations; minimize headers/bodies. Invoke P3 sanitizer before downstream model/UI/progress exposure or ordinary persisted logs.
7. Close contexts to finalize videos, including popup/multi-page artifacts. Return H-07 scoped capture references, coverage receipts and failure information. Do not load a whole video into the API unnecessarily.
8. Maintain intent/dispatched/observed/uncertain records. A click timeout after delete needs readback/reconciliation, not automatic retry. Stop future actions on cancellation/revocation; finish only authorized evidence finalization/cleanup.

### Checks and exit

First verify a harmless controlled action, then an approved disposable mutation. Test stale reference, ambiguous entity, forbidden origin, action over budget, missing approval, popup capture, empty console versus listener failure and a mutation timeout. This stage returns facts; it does not self-assign the final verdict.

**Deliverables:** real browser/action/capture adapter, H-05 safe observations, H-07 finalized captures. **Exit:** a controlled approved procedure produces real inspectable captures with no preview substitution. P2-05 may now integrate live proposals.

## P1-06 — Implement oracles, reset verification and two-attempt assessment

### Entry and references

Needs real execution, P2 target fixture/readback and P3 evidence processing for a complete slice. Read [verification/safety](../../docs/verification-evidence-and-safety-specification.md) oracle/validity/master decisions, [workflow](../../docs/workflow-and-state-machine-specification.md) dual attempts, [PRD](../../docs/prd.md) outcomes and [database](../../docs/database-design-and-erd.md) assertion/reset receipts.

### Implement

- Freeze supported intended-correct and reported-failure predicates before execution. Evaluate at defined observation/settling points; absence of an observation is unknown, not automatically false. Reject conflicting oracles. Unrelated errors are not a bug match; HTTP success is not application correctness.
- Classify attempt validity independently from findings and artifact completeness. Record scope/precondition adherence, scenario reached, actual observations, assertion outcomes and environment/build. Unsupported visual judgments remain unsupported/manual review rather than LLM-certified pass/fail.
- Before each attempt, verify relevant baseline identities and state. Between attempts, call P2's scoped reset endpoint under approved setup/reset authority, then independently read back required fixture/build conditions. Store a receipt tied to the actual fixture and attempt pair. HTTP 200 or `restored: true` alone is insufficient.
- Repeat the same approved candidate under equivalent relevant conditions. Compare normalized failure meaning, candidate, relevant build and fixture compatibility. Preserve every attempt; do not cherry-pick later matches.
- Compute two valid matches, observed once, valid bounded nonmatch, inconsistent findings, invalid/inconclusive and blocked states. One valid match plus a nonmatch is unconfirmed. Additional trials are outside the default pair unless explicitly bounded and approved.
- Preserve two observed failures when media is missing; store evidence readiness separately. Never advertise a complete verified package without the required eligible recording/console/network artifacts.

### Checks and exit

Cover two matches, two valid nonmatches, match/nonmatch, one match only, reset failure, wrong reset entity, wrong build, invalid automation, unavailable observation, unrelated HTTP error, and missing/unsafe recording. Use independent P2 labels to check correctness.

**Deliverables:** verifier receipts, reset/readback integration, aggregation tests and real deterministic vertical-slice record. **Exit:** G2: human-approved fixed procedure → two attempts/reset → qualified findings + real evidence. This is plumbing proof; do not call it the complete AI product.

## P1-07 — Integrate the full agentic user journey and evidence APIs

### Entry and references

Needs H-04/H-06 AI proposals, H-08 evidence processing, H-10 narrative and H-09 UI integration. Read [agent contracts](../../docs/agent-and-tool-contracts.md) role boundaries/stops, [API/events](../../docs/api-and-event-contracts.md) artifact/progress and [UI/UX](../../docs/ui-ux-specification.md) user journeys/state mapping.

### Implement

Wire actual report context to P2 clarification/planner; validate/enrich proposals; show them in P3 UI; require human approval; execute bounded observe → propose → validate → act → observe loops; independently verify/reset/repeat; finalize P3 evidence; provide locked sanitized facts to P2 reviewer; assemble final authoritative report.

All model role calls go through one configured Luna-only integration and controller-enforced limits. Reserve headroom for in-flight usage; estimates do not prove billing balance. Do not lower verification or choose another model to save credit. Model-proposed new scope goes back to plan review.

Expose P3's artifact service through owned authenticated API handlers. P3 owns artifact processing facts; the controller updates investigation readiness from validated results. Keep temporary access grants separate from durable artifact identity. Enforce ownership on upload finalization, metadata, previews, downloads and export.

Persist events/snapshots coherently and support reconnect/resnapshot without duplicate execution. Validate narrative references against actual safe evidence; a plausible prose citation is not a real artifact. Do not merge raw target profiles or fixture flags into AI context.

### Checks and exit

Run one actual vague report through clarification, approval, AI action proposals, both attempts and evidence result. Exercise missing AI configuration, invalid proposal, scope change, evidence-review failure and UI reconnect. Final findings must survive an unavailable narrative module.

**Deliverables:** integrated application flow, H-09/H-10 complete and recorded G3 demonstration. **Exit:** an authorized user can use the real product without preview state or developer-authored steps being disguised as AI output.

## P1-08 — Harden recovery and deploy the web/worker system

### Entry and references

Begin container/build preparation earlier, but no deployment-ready claim before integrated checks. Read [operations](../../docs/test-evaluation-operations-and-execution-plan.md) deployment/monitoring/recovery, [architecture](../../docs/system-architecture.md) topology/reliability and [verification/safety](../../docs/verification-evidence-and-safety-specification.md) cancellation/incidents/resources.

### Implement

- Handle provider, database, queue, browser, storage, fixture and finalization failures with distinct truthful statuses. Reconcile uncertain external effects; never replay a mutation just because the worker lease expired.
- Implement graceful drain, safe restarts, timeout limits and cleanup of scoped resources. Preserve partial facts/evidence and mark coverage gaps. Cleanup must not become unapproved target destruction.
- Add safe structured logs/metrics keyed by run/attempt/action, ownership/audit records, actionable readiness, storage/disk limits and budget stops. Do not log raw auth headers or arbitrary exception payloads.
- Prepare reviewed runtime/container builds, separate web and persistent worker processes, database/queue/private storage and controlled target. P2 supplies target configuration; P3 supplies storage policies. Check host/browser dependencies and production package support against actual vendor guidance before release.
- Deploy only to the intended configured environment under the task's authorization. Production preview must be disabled, default example secrets rejected, target egress limited and public worker diagnostics restricted.
- Document migration sequencing, backups/restore limitations, rollback versus roll-forward and schema compatibility. Do not blindly reverse migrations. A frontend-only deployment is insufficient.

### Checks and exit

Exercise duplicate jobs, worker kill before/after effect, cancellation in flight, revoked queued approval, storage failure and restart. Verify deployed web, worker, DB and private evidence independently, then one safe full workflow. Record actual build/deployment revisions; no invented availability or restore guarantees.

**Deliverables:** G4 engine checks, deployment record, safe operational runbook changes and known limitations. **Exit:** G5 environment can execute the workflow; historical local outputs are not substituted for deployed results.

## P1-09 — Execute official acceptance and lead release handoff

### Entry and references

Needs all essential P2/P3 integrations and deployed checks. Read [PS traceability](../../docs/ps-requirements-traceability-matrix.md), [evaluation/operations](../../docs/test-evaluation-operations-and-execution-plan.md) official records/metrics/submission, and common official matrix.

### Execute and record

1. TC1: two valid same-failure attempts with actual finalized recordings, console and network logs.
2. TC2: meaningful bounded nonreproduction with steps, environment/build, limitations; not an automation crash.
3. TC3: deletion of disposable records only in verified sandbox, plus a safely blocked untrusted/non-sandbox variant.
4. TC4: P2 injects a known synthetic token; P3 sanitizes; verify every enabled sharing surface within the agreed test scope. Never use a live key.
5. Review independent labels/results with P2 and evidence/access with P3. Fix critical false confirmation, authorization, or known exposure defects before release. Do not fabricate a pass for an unavailable scenario.
6. Prepare the deployed reference, source evidence, test records, presentation inputs, operator notes and known limitations. Final organizer form and deadline must be checked separately; the supplied opening time is not a deadline.

### Exit and completion record

Record actual inputs, source/target builds, plan approval, fixture/reset, attempts, assertions, artifact IDs, assessment, evidence readiness, deviations and reviewer. Claim only executed behavior. **Exit:** H-12 release-readiness package; optional innovations are not a gate.

## Person 1 handoff checklist

- P2 receives safe target/report context, supported predicates, fresh observations, locked facts and usage limits; never secrets or hidden ground truth.
- P3 receives owned API operations, snapshots/events, capture references and authorized artifact service integration; never the responsibility to infer authorization.
- P1 receives reset implementation, validated proposals and evidence readiness through H-02/H-04/H-06/H-08/H-10.
- Database and contract changes land once with consumer updates. Every stage has relevant tests and an honest implemented/executed/verified/deployed status.
- No automatic fixing, broad production browsing, alternative model, training requirement or unsupported success claim is introduced.
