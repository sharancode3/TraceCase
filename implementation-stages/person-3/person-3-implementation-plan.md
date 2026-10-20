# TraceCase — Person 3: Product Interface and Evidence Delivery

**Role:** Product / evidence engineer. **Plan status:** Proposed; not completed implementation.  
**Stages:** Eight, P3-01–P3-08. **Read first:** [Common baseline, ownership, handoffs and gates](../README.md).

## Mission and ownership

Turn the existing interface foundation into an understandable real product and implement one coherent evidence-processing/delivery module. Users must be able to describe a bug, answer questions, review a concrete experiment, authorize it, follow its actual progress, and inspect qualified findings with safely accessible evidence.

Own frontend pages under `src/app/**` except `src/app/api/**`, components, client feature modules, development-preview composition and proposed `src/server/evidence/**`. Own the shared sanitization implementation, private storage/processing/access service logic and associated tests. This is deliberately a product-plus-evidence role, not a request to own the whole backend.

P1 owns API handlers, identity, authorization middleware, database migrations/repository contracts, controller state and browser capture. Supply evidence-service operations for those handlers; do not create competing endpoints or write investigation verdicts. P2 owns AI proposals and explanations; never implement an extra frontend model call.

The foundation already has the shell, tokens, primitive controls, dashboard/targets/report/clarification/approval/live/result routes, synthetic fixtures and an event reducer. Preserve that work. Its preview behavior is not real persistence, approval, execution, evidence processing or auth. Typecheck/lint/15 existing tests passed during planning; no independent visual, media, storage or cross-user review was executed by this documentation task.

## P3-01 — Review the UI foundation and agree evidence/event contracts

### Entry and references

Start alongside P1-01 and P2-01. Read [UI/UX](../../docs/ui-ux-specification.md) reference/tokens/screens/state mapping, [PRD](../../docs/prd.md) journeys/results, [API/events](../../docs/api-and-event-contracts.md), [verification/safety](../../docs/verification-evidence-and-safety-specification.md) publication/privacy, [architecture](../../docs/system-architecture.md) capture/media boundaries, and foundation documents. Inspect `src/app`, components, features, `src/dev/fixtures.ts`, shared evidence/events/target contracts and service ports.

### Review and define

1. List which screens are fixture-driven, which handlers exist, and which interactions really persist. Do not mark a screen complete merely because it renders. Remove later reliance on direct synthetic imports in live routes.
2. Agree H-01 safe resource projections, errors, pagination, snapshot/event sequence behavior, approval versioning and artifact lifecycle with P1. P1 lands shared changes. Keep model narration, execution, assessment and evidence readiness as separate UI concepts.
3. Define scoped capture references and coverage metadata from P1, including per-attempt multiple videos, console/page errors, network failures and missing capture. Separate capture ingestion, finalization, sanitization/review, storage and access grants rather than one `publishEvidenceTriad` success call.
4. Request artifact metadata/readiness repository operations and migration changes from P1; do not independently edit database schema. Define what the evidence service writes and what the controller derives.
5. Agree that `PUBLIC_SAFE` means eligible for a particular authorized audience after review, not an anonymous public bucket. Replace durable public-URL assumptions with stable artifact identity and temporary access grants.
6. Review visual tokens and actual contrast. Some draft values/claims differ; compute critical pairs rather than copying ratios. Keep the chosen white/lavender/cobalt/navy reference direction.
7. Define preview composition: explicit dev/test-only selection, visible disclosure, no live write authority and no automatic fallback when a real API fails. P1 owns server configuration; coordinate the client behavior.

### Checks and exit

Test fixture-schema consistency and representative status combinations, especially two observed matches with missing/restricted evidence. Inspect target data so reset credentials never enter client props. Check event contracts before building the live consumer.

**Deliverables:** UI capability inventory, evidence/event contract proposals/examples and H-01 consumer review. **Exit:** work can proceed independently against agreed data, not guessed fields. P3-02 sanitization starts early; do not wait for the complete backend.

## P3-02 — Build the shared sanitization and data-minimization module

### Entry and references

Needs agreed safe projection/input shapes; independent synthetic tests can begin immediately. Read [verification/safety](../../docs/verification-evidence-and-safety-specification.md) classifications/TC4/recordings, [agent contracts](../../docs/agent-and-tool-contracts.md) data ingress, [database](../../docs/database-design-and-erd.md) restricted derivatives and [API/events](../../docs/api-and-event-contracts.md) safe payloads.

### Implement

- Build one server-side sanitization module for bounded text and structured console/network/observation data. Persons 1 and 2 consume it; neither creates another competing redactor.
- Prefer capture allowlists/minimization: omit credentials, cookies, auth headers and unnecessary bodies before ordinary persistence/exposure. Handle URL query values and structured fields as well as text patterns. Do not rely solely on token-shaped regex matches.
- Define sanitized projections for model input, progress, user-facing logs, reports and artifact metadata. Known synthetic-secret variants support tests; actual secret values must not be logged to prove a replacement occurred.
- Return safe content plus nonsecret processing/coverage information. Failed parsing, truncation or incomplete scan must not become “sanitized successfully.” Preserve provenance and distinguish omitted data from absent original data.
- Define a restricted path for unavoidable raw diagnostic material. Do not indiscriminately persist raw target output before scrubbing, and do not grant ordinary UI access to restricted originals.
- Handle screenshots/video separately. Text replacement does not remove pixels. Use synthetic target data, deliberate masking before capture where feasible, or restricted review/withholding. Do not promise perfect OCR/redaction or alter the bug trigger without recording the effect on the experiment.
- Supply a safe early text/structured-data implementation to P1 before its real capture loop emits model/UI/progress data. Later media review extends the same policy rather than bypassing it.

### Checks and exit

Use known synthetic tokens in console lines, mixed-case sensitive header fields, URLs, error messages, structured objects and bounded supported encodings. Check safe replacements and the absence of values in emitted audit/progress data. Test parse failure and content-size limits. Explicitly document untested formats and pixel risks.

**Deliverables:** reusable sanitizer, focused positive/negative tests and H-03. **Exit:** P1 can sanitize before exposure and P2 can prune already safe observations. Passing a finite synthetic suite is scoped coverage, not universal leak prevention.

## P3-03 — Implement private artifact processing, storage and access services

### Entry and references

Use labelled safe fixture captures until H-07 real browser captures arrive. Requires P1 repository interfaces for actual persistence. Read [database/ERD](../../docs/database-design-and-erd.md) artifacts/lineage/retention, [verification/safety](../../docs/verification-evidence-and-safety-specification.md) evidence lifecycle/access/export, [architecture](../../docs/system-architecture.md) media/storage and [operations](../../docs/test-evaluation-operations-and-execution-plan.md) storage/recovery.

### Implement

1. Configure private S3-compatible storage through server-only credentials and verified selected SDK behavior. Local MinIO and a later hosted store may use an adapter; neither sanitized nor restricted objects is anonymously readable. Do not infer encryption, revocation or retention behavior from a bucket name.
2. Ingest only worker-created scoped capture references or validated upload records. Prevent arbitrary host paths, object keys, URLs and cross-investigation references. Validate actual file metadata/size/type and owner relationships; user attachments remain distinct from agent evidence.
3. Wait for real media finalization. A recording reference before context closure is not necessarily a complete video. Handle multiple pages/videos, capture failures and partial upload independently.
4. Store artifact identity, attempt association, kind, size, MIME, checksum, capture coverage, processing/review status and derivative lineage. A checksum detects changed bytes; it is not proof of truthful capture. Identical bytes are allowed across legitimate captures.
5. Run sanitization/review using P3-02. Preserve restricted originals only under the agreed minimization/retention policy. Return a manifest that distinguishes missing, processing, failed, restricted and eligible artifacts, not merely file presence.
6. Produce evidence readiness independently from findings. Two valid matches with a corrupted video remain observed matching findings plus incomplete evidence. Empty successfully captured console output is valid empty data; a failed listener is a capture failure.
7. Implement service-level authorization checks for artifact metadata/access/grants and provide operations to P1's authenticated API handlers. Recheck owner and eligibility before grants. Temporary URLs are not durable manifest identities; do not promise instant revocation of an already issued URL without verified support.
8. Add bounded upload retries, orphan cleanup and partial processing recovery. Retrying an upload must not create another attempt or rerun the browser. Keep local scratch and private media out of Git.

### Checks and exit

Test safe synthetic ingestion, wrong attempt/owner, arbitrary path/key, invalid file, incomplete recording, upload failure, restricted access, duplicate upload retry and empty log. Verify actual private-store behavior when configured; record unavailable service checks honestly.

**Deliverables:** artifact service, processing manifest, access operations, repository requirements and H-08. **Exit:** P1 can receive a truthful evidence result and expose only authorized access. Real capture replaces labelled fixture input through H-07 without redesign.

## P3-04 — Connect target setup, intake, clarification and approval UI

### Entry and references

Build components against H-01 examples early; replace preview with H-09 APIs after P1-02/03. Read [UI/UX](../../docs/ui-ux-specification.md) target/report/clarification/approval screens, [PRD](../../docs/prd.md) inputs/journeys, [API/events](../../docs/api-and-event-contracts.md) commands and [workflow](../../docs/workflow-and-state-machine-specification.md) scope invalidation.

### Implement the user behavior

- Complete sign-in/session-expiry UI using P1's selected auth flow. Never accept an API key as ordinary application login or create a client-side default user. Missing auth/configuration produces a clear setup/sign-in state.
- Connect target listing/configuration to persisted safe projections. Show requested versus verified sandbox status separately; checking a box cannot prove isolation. Target probing/reset controls must invoke authorized backend operations only, not fetch arbitrary destinations from the browser.
- Support a useful vague report: description and optional suspected steps/environment/build/attachments, with missing correct behavior clarified before plan approval. Coordinate intake schema changes with P1/P2. Do not force the reporter to know all experiment details or upload source code.
- Integrate actual safe file upload only when the backend/storage path supports it. Show bounded accepted types, progress/error, and real completion. Until then state that attachment persistence is unavailable; do not say an unuploaded local file was attached successfully.
- Display question provenance, editable answers, assumptions and outstanding prerequisites. Submit through the API and reload actual state. Do not hardcode the synthetic clarification into live investigations.
- Present concrete plan target/account reference, environment/build, steps, preconditions, correct behavior/failure checks, reset, attempts and risks. Expand technical details such as hashes rather than making them the central explanation.
- Submit approval/rejection with current version/hash. Handle stale/revoked scope, disabled controls, server validation, duplicate clicks and session expiry. Approval and start follow the selected two-step contract; do not trigger a second job from a follow-up effect.
- Show real data after refresh/back navigation. Remove fixture fallbacks from live flows; keep explicit preview routes available only as intended.

### Checks and exit

Test valid and missing fields, clarification, ownership errors, plan edit after approval, stale revision, double click, failed save, unknown target, session expiry and unavailable integration. Keyboard users must be able to review/approve; warnings need text, not color alone. No frontend checkbox or status setter can authorize execution.

**Deliverables:** real intake/clarification/approval experience, reusable API client/error handling and UI checks. **Exit:** the user can reach an owned persisted approved plan; actual execution readiness is still determined by P1.

## P3-05 — Implement live investigation progress, reconnect and cancellation

### Entry and references

Requires H-09 snapshots/events and implemented P1 queue/worker progress; synthetic events may support unit work first. Read [API/events](../../docs/api-and-event-contracts.md) SSE/cursors/errors, [workflow](../../docs/workflow-and-state-machine-specification.md) lifecycle/cancellation, [UI/UX](../../docs/ui-ux-specification.md) progress/recovery and current `src/features/investigations/event-reducer.ts`.

### Implement

1. Start from an authenticated snapshot and agreed watermark, subscribe through the selected transport, validate event schemas, and deduplicate/order them within the contract. Resolve snapshot/stream races rather than simply fetching then listening with no gap strategy.
2. Correct stale-event application: sorting a visible list is not enough if an older event overwrites current lifecycle. Handle sequence gaps, retention expiry and schema mismatch by the agreed resnapshot/recovery path. Bound retained client history.
3. Display queue, fixture setup, actual attempt/step, reset, verification and evidence finalization with truthful states. If a necessary state is absent from current enums, coordinate a contract extension; do not invent a private UI-only authoritative status.
4. Show connected/stale/reconnecting transport state independently from investigation state. A dropped SSE connection does not establish worker failure. Reconnecting or refreshing must never submit approval/start again.
5. Cancellation sends a command and displays requested versus acknowledged stop. Explain that an in-flight effect may already have occurred; do not display rollback. Block subsequent local actions while authoritative state catches up.
6. Show safe manual-auth/blocked steps from the backend without offering OTP/CAPTCHA bypass. A manual handoff to a controlled session requires an actual supported path; do not redirect users to assume their personal browser authenticates the worker.
7. Use actual screenshots only through approved evidence/progress projections. If no streaming browser view exists, show the step timeline rather than an invented live video.

### Checks and exit

Test duplicate/out-of-order/malformed events, resnapshot gaps, session expiry, cancellation during an action, revoked approval, refresh and reconnect. Ensure raw console/network payloads cannot bypass sanitization through event fields.

**Deliverables:** safe live consumer, corrected reducer and integration checks. **Exit:** a real worker run is represented accurately without replaying execution; no fixture timer is presented as live behavior.

## P3-06 — Implement qualified results, evidence viewers and developer handoff

### Entry and references

Needs H-08 safe artifact service, P1-06 findings/snapshots and optional H-10 narrative. Read [UI/UX](../../docs/ui-ux-specification.md) results/comparison/viewers/exports, [PRD](../../docs/prd.md) developer handoff and [verification/safety](../../docs/verification-evidence-and-safety-specification.md) reporting/evidence sufficiency.

### Implement

- Lead with the reported claim, tested conditions, actual findings and evidence readiness. Render lifecycle, assessment and evidence independently. Include observed once, inconsistent, valid nonmatch, blocked, cancelled, invalid automation and incomplete package.
- Present both attempts with relevant starting state, steps/observations, assertion facts, reset/readback and actual environment/build. Do not imply a negative attempt proves no bug exists anywhere or that all server state remained unchanged.
- Build accessible recording playback, sanitized searchable console/page errors and bounded network request views. Separate status-code response and transport failure; minimize sensitive headers/bodies. Render arbitrary text safely, not injected HTML.
- Link actual evidence/action/assertion IDs supplied by P1/P2. Only synchronize timeline positions where real timestamp/capture mapping supports it. Do not invent precise frame synchronization or timestamps from prose.
- Show missing/corrupt/restricted artifacts visibly. A restricted panel explains why access is unavailable without showing the secret in a “before” toggle. Avoid automatic preview of untrusted uploaded content.
- Keep P2 narrative optional and qualified. Observations and hypotheses receive different labels. No hardcoded root-cause diagnosis or fix guarantee. If the reviewer fails, deterministic result/evidence remain usable.
- Provide authorized downloads through P1 handlers and this role's access service. Handle expired grants using reauthorization; never restart the investigation to refresh a recording URL.
- Implement a sanitized reproduction package after core processing is sound: report/steps, environment/build, attempt/assertion summary, safe manifest and eligible recording/console/network artifacts. Never include raw auth state, hidden evaluation labels, restricted originals or real credentials. Validate members before marking a package ready.

### Checks and exit

Test complete TC1-style evidence, nonreproduction, one match, inconsistent results, missing video, unsafe recording, empty console, failed capture, expired grant, unavailable narrative, malicious log text and archive contents. Generated ZIP existence alone is not correctness; inspect/extract a safe test package and validate its contents.

**Deliverables:** real result/evidence UI, authorized downloads/package service and integration checks. **Exit:** G3 user journey can finish with a clear developer handoff or honest incomplete result. Optional regression code and repair advice remain outside the required gate.

## P3-07 — Verify privacy, access control, usability and failure recovery

### Entry and references

Requires integrated UI/artifacts and P2 synthetic-secret cases. Read [verification/safety](../../docs/verification-evidence-and-safety-specification.md) TC4/incidents, [operations/evaluation](../../docs/test-evaluation-operations-and-execution-plan.md) negative cases/storage/recovery and [UI/UX](../../docs/ui-ux-specification.md) responsive/accessibility criteria.

### Verify and harden

1. Work with P2 on TC4 injection. Check every enabled exposure surface: safe model projection, progress, previews, console/network viewers, report, individual downloads and package members. Record known-value representations and test scope. No token text in test screenshots or public logs.
2. Check media risk independently: text scrub success does not prove screen pixels safe. Restrict or withhold unsuitable recordings and qualify evidence completeness. Document how review/masking affects the experiment.
3. Test cross-user artifact metadata, upload finalization, preview, grant, download and export. Both stores stay private. P1 owns identity/handler enforcement; this service also validates scoped processing/access.
4. Exercise failed upload, unavailable object store, incomplete media, duplicate processing, canceled runs and orphan cleanup. Evidence retry must not trigger a new browser attempt. Report partial coverage rather than silently removing failed artifacts.
5. Check keyboard navigation, form labels/errors, modal focus/escape, screen-reader names and status descriptions. Recalculate critical contrast including control borders and focus. A passing automated scan alone is not full accessibility certification.
6. Check representative desktop/tablet/mobile layouts, long reports, long URLs/logs, multiple videos, empty histories and loading/error/restricted states. Preserve the light reference direction; prioritize readable evidence over decorative motion.
7. Keep public filenames/URLs safe, prevent HTML/script injection in report/log rendering, and bound tables/search payloads. Do not upload raw traces to third-party debugging services as a convenience.

### Exit

**Deliverables:** scoped privacy/access test results, visual/functional review notes, defect fixes and residual limitations. **Exit:** P3 contribution to G4; known secret exposure or unauthorized access blocks release and triggers containment with P1. Do not claim universal redaction or full compliance from limited tests.

## P3-08 — Verify deployed evidence delivery and complete the product handoff

### Entry and references

Requires P1-08 deployment and P2 official-case setup. Read [operations](../../docs/test-evaluation-operations-and-execution-plan.md) deployed smoke/storage/retention/submission and common official matrix.

### Execute and deliver

- Supply selected object-store configuration, private policies, access/retention procedures and resource needs to P1 through safe configuration channels. Do not publish bucket credentials or assume local policies automatically transfer to the hosted setup.
- Verify deployed auth-to-artifact access, actual recording playback, log/network rendering, progress reconnect and download/package behavior from the intended user session. Local fixture screenshots do not establish this.
- For TC1, show the actual two-attempt evidence. For TC2, show real steps/environment and qualified nonreproduction. For TC3, show concrete authorized sandbox scope and safe blocked behavior. For TC4, show scrubbed outputs and audit coverage without revealing the raw synthetic value to the audience.
- Check history/refresh from a new session, expired access grants, missing storage service and production preview disabled. Confirm that client bundles and browser diagnostics do not contain server credentials or hidden target flags.
- Provide operational notes for failed uploads, restricted artifacts, retention, stale downloads and package rebuilding. Do not claim restore/deletion/revocation guarantees without actual supported behavior.
- Prepare a presentation walkthrough with P1/P2, screenshots or recordings only from suitable safe material, and clear labels for supplementary prerecorded demonstrations. Include limitations and distinguish generated/preview/live/verified facts.

### Exit and optional work

**Deliverables:** deployed UI/evidence verification, safe presentation assets, operations notes and H-12 contribution. **Exit:** required official evidence is usable or its gaps are explicitly recorded. After the required flow works, optional improvements may include a richer evidence timeline and validated test-export UI. No fake success animation or fabricated recording is an acceptable fallback.

## Person 3 handoff checklist

- H-03 shared sanitizer is delivered early enough for P1 capture and P2 model inputs.
- H-07 capture references remain scoped and finalized; H-08 reports coverage/readiness rather than changing findings.
- P1 owns public API handlers, auth, migrations and investigation state; P3 supplies evidence services and requests schema changes explicitly.
- P2 explanations refer to actual eligible evidence IDs, not arbitrary URLs or fabricated timestamps.
- Every user-visible surface distinguishes claims, actions, findings and safe evidence. `PUBLIC_SAFE` never means an anonymously public bucket.
- Completion records identify implemented, preview-only, executed and deployed status with actual checks and remaining gaps. Preserve the foundation; do not create a competing UI or redaction subsystem.
