# TraceCase — Project Memory and Person 1 Phase Tracker

**Last updated:** 21 October 2026 (Asia/Calcutta).  
**Purpose:** Persistent repository context for continuing the agreed implementation. This file records decisions and progress; it does not prove that planned features work.

## Current assignment and starting point

The user is **Person 1**, responsible for the trusted backend, database, authentication, approval, queue, browser execution, verification, integration and deployment.

Stage 0 exists as a development foundation. Extend it rather than regenerating the application. At this update the checkout was clean on `main`, tracking `origin/main`. The previously inspected foundation commit was `af56f5a`; recheck the actual revision before starting work.

Earlier in this conversation, type checking, linting, all 15 existing tests, and web/worker builds passed. Those checks were not rerun just to save this memory. They do not establish live authentication, applied database migrations, browser reproduction, model access, evidence storage, deployment or official-case success.

**P1-01 status:** Completed locally. All 46 tests across 9 files pass; `pnpm typecheck`, `pnpm lint`, and production `pnpm build` pass with 0 errors. P1-01 review and contract handoffs documented in `implementation-stages/person-1/p1-01-foundation-review.md` and `p1-01-contract-handoff.md`.
**P1-02 status:** Completed locally. All 70 tests across 13 files pass; `pnpm typecheck`, `pnpm lint`, and production `pnpm build` pass with 0 errors. Cryptographic JWT authentication (`src/server/auth/jwt.ts`), Drizzle PostgreSQL migration `0001_puzzling_meltdown.sql`, five domain repositories (`principals`, `targets`, `reports`, `investigations`, `plans`), and persisted API surfaces implemented and verified. Review and handoff documented in `implementation-stages/person-1/p1-02-identity-and-persistence-review.md` and `p1-02-persistence-handoff.md`.
**P1-03 status:** Completed locally. All 108 tests across 19 files pass; `pnpm typecheck`, `pnpm lint`, and production `pnpm build` pass with 0 errors. Implemented investigation workflow engine (`InvestigationWorkflowService`), clarification question intake/answering, deterministic proposal validator (`validateExperimentProposal`), immutable plan revision storage with canonical SHA-256 fingerprinting, explicit human approval gate (`POST /approve`), rejection (`POST /reject`), revocation (`POST /revoke`), pre-execution cancellation (`POST /cancel`), durable command idempotency ledger (`idempotency_keys` table), and truthful start/admission boundary (`POST /start` returning 503 `DISPATCHER_UNAVAILABLE` in live Stage 0 mode). Review and handoff documented in `implementation-stages/person-1/p1-03-workflow-and-approval-review.md` and `p1-03-workflow-and-approval-handoff.md`.
**P1-04 status:** Completed locally. All 131 tests across 25 files pass; `pnpm typecheck`, `pnpm lint`, and production `pnpm build` pass with 0 errors. Pinned Node-20 compatible `pg-boss@10.4.2`, added Drizzle PostgreSQL migration `0003_chunky_colonel_america.sql`, implemented Transactional Outbox pattern (`outbox_messages` table and `OutboxRelayService`), singleton global execution lease with monotonic epoch fencing (`global_execution_leases` table and `ExecutionLeaseService`), harmless internal diagnostic job handler (`diagnostic_runs` table and `system-diagnostic` queue), persistent background worker daemon with graceful shutdown and private health probe (`worker/index.ts`), serialized progress event counter on investigations, cursor-based event replay API (`/events`), and live SSE streaming (`/stream`). Review and handoff documented in `implementation-stages/person-1/p1-04-queue-worker-and-progress-review.md` and `p1-04-queue-worker-and-progress-handoff.md`.
**P1-05 status:** Completed locally. All 149 tests across 30 files pass; `pnpm typecheck`, `pnpm lint`, and production `pnpm build` pass with 0 errors. Installed and configured Playwright Chromium (`playwright@1.49.1`), implemented target network and egress guard (`TargetNetworkGuard`) with cloud metadata IP and loopback restrictions, fresh observation manager (`ObservationManager`) with opaque element reference tracking, document generations, and anti-ambiguity locator checks, typed action dispatcher (`ActionDispatcher`) with auto-waiting actionability, timeouts, and mutation uncertainty classification, evidence collection (`EvidenceCollector`) with pre-navigation listeners and secret scrubbing, video recording (`VideoManager`) with on-disk verification and coverage receipt, and integrated `PlaywrightBrowserWorker` into `worker/index.ts` and `InvestigationClaimHandler` with lease heartbeat renewal and 1-hour quarantine on `MUTATION_UNCERTAIN`. Review and handoff documented in `implementation-stages/person-1/p1-05-browser-execution-and-capture-review.md` and `p1-05-browser-execution-and-capture-handoff.md`.
**P1-06 status:** Completed locally. All 195 tests across 36 files pass; `pnpm typecheck`, `pnpm lint`, and production `pnpm build` pass with 0 errors. Implemented pure deterministic assertion evaluation (`DeterministicAssertionEvaluator`), independent target baseline readback and canonical state hashing (`BaselineComparator`), authenticated outbound target reset coordination with fake-reset detection (`TargetResetClient`), 4-point attempt validity and 5-finding assessment (`AttemptAssessor`), master 16-scenario pair decision table (`PairAssessor`), bounded two-attempt orchestration with fresh context and reset gates (`TwoAttemptController`), persistent lease quarantine tracking, and database migration `0004_parched_bucky.sql` adding `investigation_attempts`, `assertion_evaluations`, `reset_receipts`, and `pair_assessments`. Review and handoff documented in `implementation-stages/person-1/p1-06-verification-reset-and-two-attempt-review.md` and `p1-06-verification-reset-and-two-attempt-handoff.md`.
**P1-07 status:** Completed locally. All 218 tests across 42 files pass; `pnpm typecheck`, `pnpm lint`, and production `pnpm build` pass with 0 errors. Implemented trusted end-to-end integration across all lifecycle boundaries: AI proposal & bounded investigation agent loop (`BrowserInvestigationAgentLoop`), atomic budget manager (`BudgetManager`) with per-investigation limits, OpenAI `gpt-6-luna` client wrapper, explanation synthesis service (`EvidenceReviewService`), local raw capture registration (`CaptureRegistrar`) with SHA-256 and byte sizes, evidence pipeline (`EvidencePipeline`) decoupling verification verdicts from packaging status, dynamic system readiness probing (`getSystemReadiness`, `/api/ready`), centralized dependency injection container (`ServiceContainer`), and verification hardening in `TwoAttemptController` (exact revision/hash binding, multi-checkpoint revalidation, pre-flight baseline verification, dynamic scope adherence, regex guards, error isolation). Database migration `0005_late_lizard.sql` applied adding `evidence_artifacts` and `synthesis_explanations`. Review and handoff documented in `implementation-stages/person-1/p1-07-agent-evidence-and-journey-integration-review.md` and `p1-07-agent-evidence-and-journey-integration-handoff.md`.
**P1-08 status:** Completed locally. All 225 tests across 43 files pass; `pnpm typecheck`, `pnpm lint`, production `pnpm build` (web and worker), and worker run-once verification pass with 0 errors. Implemented operational failure recovery and deployment hardening: worker heartbeats and liveness probing (`WorkerHeartbeatService`, `worker_heartbeats` table), outbox relay crash-recovery for abandoned in-flight processing messages (`recoverAbandonedProcessingMessages`), durable database-backed budget reservation queries across processes (`budget_reservations` table), terminal duplicate delivery rejection in claim handler (`ALREADY_TERMINAL`), pre-flight target baseline verification with immediate execution halt on dirty state (`PREFLIGHT_BASELINE_FAILED`), catastrophic backtracking nested quantifier detection (ReDoS protection) and text bounds in `DeterministicAssertionEvaluator`, target build identity comparability checking across runs in `PairAssessor`, truthful readiness probing returning HTTP 503 on unready/degraded subsystems, multi-stage production Dockerfiles (`Dockerfile.web`, `Dockerfile.worker`), local deployment profile `docker-compose.yml`, and hardened CI pipeline `.github/workflows/ci.yml` with Node 22 LTS and disposable PostgreSQL container. Database migration `0006_lumpy_iron_patriot.sql` applied. Review and handoff documented in `implementation-stages/person-1/p1-08-recovery-and-deployment-review.md` and `p1-08-recovery-and-deployment-handoff.md`.
**P1-09 status:** Completed corrective review and implementation pass locally. All 242 tests across 45 files pass (100% passing in ~16s); `pnpm typecheck`, `pnpm lint`, production `pnpm build` (web and worker), and worker run-once verification pass with 0 errors. Replaced ungrounded claims with an evidence-grounded acceptance framework distinguishing between contract tests with doubles, real local integration, contributor dependencies, and unexecuted gates:
- **TC1:** Pass with doubles and real media. Two-attempt controller orchestration, reset readback, and pair assessment verified with doubles. Real Playwright Chromium launch, action execution against local HTTP fixture, and WebM disk video capture (EBML container `0x1A 0x45 0xDF 0xA3`, size > 1 KB), console error logs, and network trace capture verified in real integration suite (`tests/person-1/phase-9/real-acceptance.integration.test.ts`).
- **TC2:** Pass with doubles. Deterministic decision table and controller doubles confirm `NOT_REPRODUCED` verdict with transparent recording of steps tried, environment (`development`), and attested build identity (`build-commit-sha-7a8b9c`).
- **TC3:** Pass with real local services and doubles. Mutating deletion permitted in verified sandbox with baseline equivalence confirmed post-reset. Negative safety invariant strictly verified: non-sandbox target with allowed origin rejected fail-closed before any network egress or browser dispatch. SSRF guard strictly blocked `169.254.169.254`.
- **TC4:** Tenant isolation verified with real HTTP handler and cryptographic JWT (Principal Bob receives 404 with zero leaked metadata). Content redaction is explicitly BLOCKED pending Person 3's shared sanitizer (`src/server/evidence/evidence-storage.service.ts`). Negative regression test confirmed unredacted secret sentinels fail verification.
- **Quality Gates:** G0 passed, G1 passed, G2 passed with doubles, G3 blocked on Person 2, G4 partially passed locally, G5 not run (local deployment candidate prepared), H-12 qualified handoff delivered.
- **Campaign Index:** Machine-readable index saved at `implementation-stages/person-1/p1-09-campaign-index.json`. Corrective review and handoff documented in `implementation-stages/person-1/p1-09-acceptance-and-release-review.md` and `p1-09-acceptance-and-release-handoff.md`.
**Person 1 Roadmap:** All planned phases (P1-01 through P1-09) implemented, hardened, and verified locally. Person 1 boundary is complete and ready for joint integration with Person 2 and Person 3.

**Person 1 & Person 2 Integration (`integration/person-1-person-2`):** Completed runtime-integration correction and Person 3 compatibility readiness pass locally on isolated integration branch.
- Reconciled Person 1 trusted execution engine with Person 2 AI roles (Planner, Actor, Reviewer), Playwright browser worker loop, and controlled demo target.
- Removed fabricated placeholder adapter contexts (fake hashes, synthetic selectors, static durations, dummy attempt-2 outcomes).
- Implemented multi-turn clarification history persistence, element grounding via `ObservationManager.resolveTarget`, and `wait_for_selector` support.
- Wrapped all AI invocations in atomic pre-allocation and reservation tracking via `BudgetManager` with pessimistic `FOR UPDATE` row locking on `investigationsTable` and test-double `InMemoryBudgetLedger`.
- Bounded chunked streaming in `TargetResetClient` with a strict 1,000,000 byte safety limit, dual headers (`X-TraceCase-Reset-Auth`, `Authorization`), and redirect rejection.
- TwoAttemptController wired with typed execution modes (`AI_GROUNDED` vs `DETERMINISTIC_FIXED_STEP`), failing closed on missing AI agent, rejecting dirty pre-flight baselines, and requiring independent Attempt 2 build verification.
- PlaywrightBrowserWorker hardened with exhaustive proposal discrimination, allowed tier derivation, semantic toolKind validation, bounded non-dispatching wait, and post-model latency lease verification.
- Verified Person 3 frontend and evidence contract readiness against live route handlers and Zod schemas (`tests/integration/p3-contract-readiness.test.ts`).
- Demonstrated complete hybrid backend workflow slice against live demo target (`tests/integration/real-workflow-slice.integration.test.ts`).
- Added dedicated 10-case behavioral regressions suite (`tests/integration/p1-p2-behavioral-regressions.test.ts`) and budget concurrency suite (`tests/integration/budget-manager-concurrency.test.ts`).
- Added real-runtime acceptance lane (`tests/integration/real-runtime-acceptance.test.ts`) auditing real Playwright Chromium launch and truthfully reporting PostgreSQL port 5432 status as OFFLINE.
- All 63 test files pass (511 passed tests, 6 skipped, 0 failed in ~14s).
- `pnpm typecheck` (`tsc --noEmit`) and `pnpm lint` (`next lint`) pass with 0 errors/warnings.
- Quality Gates: G0 ready, G1 ready, G2 ready with test doubles, G3 blocked on live OpenAI Luna API key, G4 ready, G5 blocked on live PostgreSQL 5432 and background daemon.
- Documented in `docs/integration/p1-p2-integration-review.md`.

**Person 1, Person 2, and Person 3 Comprehensive System Integration (`codex/integration-person-1-2-3`):** Completed local integration, semantic reconciliation, and runtime wiring across all three contributors' subsystems.
- Merged Person 3 (`origin/person3`, `c276cae`) cleanly into the verified Person 1 + Person 2 baseline (`db88fcd`).
- Transport and Auth: added cryptographic cookie session verification (`tc_session`) alongside Bearer authorization, resolving cookie-based API access across Next.js frontend pages. Harmonized 409 Conflict messages on plan state revision mismatches.
- Multi-Process Persistent Evidence Storage: implemented `PersistentDiskEvidenceStorageDriver` in `src/server/evidence/storage.ts` supporting persistent disk storage with bucket isolation (`restricted_raw` vs `public_safe`), atomic write-and-rename, metadata sidecars, and path traversal prevention.
- Additive Schema Migration for Derivative Lineage: generated `0007_derivative_lineage.sql` adding nullable `raw_artifact_id` to `evidence_artifacts` table with updated `_journal.json`.
- Evidence Delivery Security: hardened `/api/v1/investigations/[id]/artifacts/[artifactId]` with RFC 7233 partial content / HTTP 206 range requests, strict investigation ownership verification (no admin bypass), and fail-closed HTTP 403 `RESTRICTED_TIER_FORBIDDEN` for `RESTRICTED_RAW` captures without explicit restricted grant.
- Artifacts Listing Endpoint: implemented `/api/v1/investigations/[id]/artifacts` returning authenticated users their accessible `PUBLIC_SAFE` artifact descriptors with safe delivery URLs.
- Dynamic Frontend App Router Wiring: connected live planning and execution workflows across `/investigations/new`, `/investigations/[id]/clarify`, `/investigations/[id]/approve`, and `/investigations/[id]`. Dynamic intake triggers planning via `requestPlanning(id)`, routes authoritatively to `/clarify` or `/approve` based on proposal status, binds human approval and start commands to authoritative plan version and hash, fetches live plan and artifacts, and exports reproduction packages with authoritative plan and artifact manifests.
- Removed Fabricated AI Explanation Defaults: replaced synthetic duration defaults (4200ms / 3800ms) with real measurements in `evidence-review-service.ts` and `investigation-claim-handler.ts`, failed closed on missing attempt 1, left missing attempt 2 null, and resolved tested target baseUrl dynamically from target profiles.
- Comprehensive Verification Suites: added `tests/integration/evidence-delivery-security.test.ts` (9 tests), `tests/integration/persistent-storage.test.ts` (5 tests), and `tests/integration/real-acceptance-lane.test.ts` (4 tests).
- All 75 test suites pass (663 passed tests, 6 skipped, 0 failed in ~16.8s).
- `pnpm typecheck` (`tsc --noEmit`) and `pnpm lint` (`next lint`) pass with 0 errors/warnings.
- Production `pnpm build` (`build:web` and `build:worker`) succeeds cleanly with 26 routes generated and worker bundled (`dist/worker/index.mjs`, 405 KB).
- Quality Gates: G0 ready, G1 ready, G2 ready with test doubles, G3 blocked on live OpenAI Luna API key, G4 ready, G5 blocked on host PostgreSQL 5432 and Docker daemon.
- Preserved references: `main` (`af56f5a`), `person-1` (`297125b`), `person-2` (`a7d9ffc`), `integration/person-1-person-2` (`db88fcd`). Zero pushes to remote, zero PRs, zero external deployments.
- Documented in `docs/integration/p1-p2-p3-integration-review.md`.

**Prototype Runtime Wiring and Local Execution Completion (`codex/prototype-runtime-fixes`):** Completed local prototype wiring, development authentication bootstrap, local Qwen Ollama AI execution, derivative evidence lineage persistence, and Results UI de-mocking.
- Local Authentication Bootstrap: implemented `src/server/auth/dev-auth.ts` generating local Ed25519 (EdDSA) keypairs in `.tracecase-storage/dev-auth-keys.json`, added endpoints `GET /api/dev/jwks`, `GET /api/dev/session`, `POST /api/dev/session`, `DELETE /api/dev/session`, and wired `src/server/auth/jwt.ts` to verify dev session JWTs in development without external identity providers. Added an operator indicator and one-click session generator in `src/components/layout/header.tsx`.
- Local Qwen Ollama AI Execution: extended `LocalModelProvider` in `src/server/ai/provider.ts` to support the running local model `qwen3:4b-instruct-2507-q4_K_M` via Ollama at `http://127.0.0.1:11434`, with robust JSON schema formatting and single-turn repair retries. Configured development environment to default to `local_ollama` while preserving fail-closed OpenAI Luna checks for production. Separated OpenAI and Local AI capability indicators in `/api/ready`.
- Report Intake and Planning Flow: fixed `src/app/investigations/new/page.tsx` payload construction to match `DraftReportIntake` (including `rawDescription`), and updated retry planning logic to reuse `savedInvestigationId` without creating duplicate bug reports.
- Derivative Evidence Lineage and Safe Persistence: updated `IntegratedEvidenceStorageAdapter` in `src/server/evidence/evidence-storage-adapter.ts` to persist sanitized derivative records in `evidence_artifacts` table with `storageTier: 'PUBLIC_SAFE'`, `isEligibleForSharing: true`, and `rawArtifactId` lineage reference to the source raw artifact. Raw records remain in `storageTier: 'RESTRICTED_RAW'`. Hardened `PersistentDiskEvidenceStorageDriver` against Windows NTFS file replacement errors (`EPERM`) using unlink/copy fallback. Exposed `rawArtifactId` in `GET /api/v1/investigations/[id]/artifacts`.
- Results UI Artifact Presentation: updated `src/app/investigations/[id]/page.tsx` to de-mock synthetic ID checking, fetch and render real console logs and network traces from artifact URLs with session credentials, add a multi-attempt video selector pill control when recordings for both Attempt 1 and Attempt 2 exist, and eliminate fallback synthetic plan injection during reproduction package downloads.
- Verification and Test Coverage: all 79 test files pass (677 passed tests, 6 skipped, 0 failed in ~30s); `pnpm lint` passed with 0 warnings or errors; `pnpm typecheck` passed with 0 errors; `pnpm build:worker` and `pnpm build:web` passed cleanly.
- Quality Gates: G0 passed, G1 passed, G2 passed, G3 passed for local Qwen development (blocked on live key for OpenAI Luna production), G4 passed, G5 truthfully audited (offline due to inactive Docker daemon / host PostgreSQL 5432).
- Protected References: zero remote pushes, zero PRs, zero modifications to protected references (`main`, `person-1`, `person-2`, `origin/person3`, `integration/person-1-person-2`, `integration-in-progress`).

**Phase 2 Stage B (P1-2.1: Target Registration and Readiness Clarity):** Completed locally.
- Redesigned target registration around mental model: "Add a test site once, then choose it whenever you file a report."
- Implemented shared URL normalization (`parseAndNormalizeTargetUrl`) with protocol checks, credentials stripping, cloud metadata IP SSRF protection, and real-time client-side origin preview.
- Added duplicate origin detection with non-destructive notice and quick reuse CTA.
- Moved extra allowed origins, fixture reset endpoint, test account ref, and sandbox classification request into a collapsible advanced section with plain-language help.
- Truthfully displayed only server-returned readiness facts on target cards (sandbox verified vs requested vs protected, reachability inside container during test runs, fixture reset hook status, test account status).
- Ensured form values are preserved on errors; strictly prohibited passwords in target profiles.
- Added direct CTA: "Create a report for this target" linking to `/investigations/new?targetId=...` and wired target pre-selection.
- Added dedicated test suite `tests/person-1/phase-2/target-registration.test.ts` (10/10 passed).
- Documented in `implementation-stages/person-1/phase-2-b-handoff.md`.

**Phase 2 Stage C (Target Reuse & Exact Report Selection):** Completed locally.
- Added safe return path validator `sanitizeInternalReturnPath` preventing open redirects or external URLs.
- Implemented intentional variant confirmation on duplicate normalized origin in `src/app/targets/page.tsx` without automatic deduplication, merging, or renaming of existing records.
- Updated `src/app/investigations/new/page.tsx` to validate incoming `targetId`, require visible selection when multiple targets exist, preselect single targets with visible identity, provide an actionable return path when zero targets exist, and fail closed without silent selection or leakage on invalid/unauthorized target IDs.
- Added dedicated test suite `tests/person-1/phase-2/target-selection-and-reuse.test.ts` (10/10 passed).
- Documented in `implementation-stages/person-1/phase-2-c-handoff.md`.

**Phase 2 Stage D (P1-2.2 (part 2): Short, Resilient Report Intake):** Completed locally.
- Form structured with primary fields only: selected saved target, concise bug title (min 3 chars), description of what went wrong (min 5 chars).
- Added prominent "Uncertainty is completely okay" guidance callout explaining that autonomous planning resolves missing preconditions.
- Placed expected/observed behaviors, suspected reproduction steps, browser/build metadata, and paste diagnostics inside collapsible progressive disclosure.
- Cleanly displaced misleading attachment file picker with honest paste-diagnostics textarea; distinguished reporter-supplied environment notes from actual worker observations.
- Fully preserved form inputs across validation, authentication, and network failures.
- In-flight submit disabled to prevent duplicate submissions and immediately re-enabled after recoverable errors.
- Added dedicated test suite `tests/person-1/phase-2/report-intake-resilience.test.ts` (7/7 passed).
- Documented in `implementation-stages/person-1/phase-2-d-handoff.md`.

**Phase 2 Stage E (P1-2.2 (part 3): Durable Report Save and Safe Planning Retries):** Completed locally.
- Decoupled report creation and planning into separate operations with authoritative `investigationId` retention.
- Added prominent status banner: "Report saved; preparing a plan." with spinner during autonomous planning.
- Planning retries reuse that investigation ID and never create another report.
- Added command idempotency to `POST /api/v1/reports` via `executeWithIdempotency` and `extractIdempotencyKey`.
- Implemented centralized typed planning orchestrator (`src/features/investigations/planning-orchestration.ts`).
- Gated proposal navigation to `/approve` on authoritative verification of the persisted experiment plan revision via `fetchPlan(id)`.
- Handled `PROPOSAL_READY`, `CLARIFICATION_NEEDED`, `UNABLE_TO_PROCEED`, and `ERROR` explicitly with sanitized, safe messages.
- Updated URL with `?investigationId=...` for durable browser reload recovery without storing sensitive reports in client storage.
- Added dedicated test suite `tests/person-1/phase-2/durable-save-and-planning-retry.test.ts` (8/8 passed).
**Phase 2 Stage F (P1-2.3 (part 1): Concurrency-Safe Clarification Ordering and Persistence):** Completed locally.
- Resolved unique constraint violation (`clarification_questions_inv_idx_idx`) caused by model-local 0-indexed question arrays in subsequent planning rounds.
- Implemented server-assigned append-only ordering on `clarification_questions`: model-local indices are disregarded in favor of monotonic server sequence allocation.
- Enforced concurrency-safe allocation using PostgreSQL/Drizzle row lock (`FOR UPDATE` on `investigationsTable`) inside atomic database transactions before querying `MAX(question_index)` and bulk inserting.
- Added additive, forward-compatible column `round_index` (default `1`) and composite index on `(investigation_id, round_index)` via migration `0009_clarification_round_index.sql`.
- Preserved `uniqueIndex('clarification_questions_inv_idx_idx')`, existing answers, and historical records without destructive renumbering or table truncation.
- Added authoritative command replay protection: pending clarifications with unanswered questions return existing questions without re-prompting or duplicating rows; genuine new rounds append after prior questions are answered.
- Added dedicated test suite `tests/person-1/phase-2/clarification-ordering-and-concurrency.test.ts` (6/6 passed, 65/65 total in Phase 2).
- Documented in `implementation-stages/person-1/phase-2-f-handoff.md`.

**Phase 2 Stage G (P1-2.3 (part 2): Grounded Luna Planning and Recoverable Answer Transitions):** Completed locally.
- Assembled planning fact ledger from saved bug report, authorized target metadata, and persisted answers with explicit provenance (`[Target Config]`, `[Reporter Claim]`, `[User Clarification Round X QY]`), keeping reporter claims, target configuration, model interpretation, and browser observations distinct.
- Avoided repeating answered questions by filtering out identical question texts in subsequent planning rounds.
- Enforced authoritative clarification policy limit (`MAX_CLARIFICATION_ROUNDS = 3`), transitioning the investigation to `UNABLE_TO_PROCEED` (reviewStatus `BLOCKED`) when exceeded.
- Added strict runtime validation of planner output using `ReportPlannerOutputSchema.safeParse`, preventing malformed model output from reaching proposal or approval.
- Decoupled external model execution from database transactions: calls to `planner.generateProposal` occur strictly outside transactions.
- Protected against competing delayed planner responses overwriting newer state using optimistic revision checks (`where and(eq(id), eq(workflowRevision, initialWorkflowRevision))`).
- Validated answer submissions: verified target investigation association, non-empty text, question existence, and prohibited answering questions belonging to prior completed rounds.
- Ensured user answers survive downstream planning failures (such as provider timeouts or network faults), enabling safe retries without resubmitting answers.
- Atomically persisted immutable experiment proposals with canonical SHA-256 fingerprinting before setting `reviewStatus: 'PROPOSAL_READY'`.
- Dedicated test suite `tests/person-1/phase-2/grounded-planning-and-answer-transitions.test.ts` (9/9 passed, 74/74 total in Phase 2 across 10 test files).
- Documented in `implementation-stages/person-1/phase-2-g-handoff.md`.

**Phase 2 Stage H (P1-2.3 (part 3): Honest Clarification UI and Navigation):** Completed locally.
- Retitled clarification view to “Clarify report details.” Removed developer-internal labels (`Luna Role 1`) and misleading `Preview Mode` badge.
- Added explicit user guidance: clarification answers prepare a safe reproduction plan and are not interactive chat asked during execution.
- Gated option buttons strictly on server-provided `suggestedOptions`; preserved exact option string contracts with free-text fallback; zero synthetic options invented.
- Associated answers strictly with persisted question UUIDs (`q.id`), avoiding array position mismatches.
- Implemented eight distinct UI states: `LOADING`, `FETCH_FAILED`, `NO_PENDING_QUESTIONS`, `QUESTIONS_READY`, `SUBMITTING`, `PLANNING`, `PROPOSAL_READY`, `CANNOT_PROCEED`.
- Fetch failures are visibly rendered as failures with actionable retry controls — never converted into an empty success checkmark.
- Answer-save-success / replanning-failure recovery: users are not forced to re-type or resubmit accepted answers; dedicated "Retry planning now" button triggers planning directly.
- Strict proposal verification gate: "Go to plan review" is visible/navigable only after `hasAuthoritativeProposal` verifies a valid persisted plan revision (`version > 0`, non-empty `planHash`, and valid assertions).
- Multi-round history presentation: questions grouped by `roundIndex` with badges (`Answered` vs `Needs your input`) and preserved accepted answers clearly displayed.
- Draft preservation across recoverable network or validation failures; full keyboard accessibility and semantic headings.
- Dedicated test suite `tests/person-1/phase-2/clarification-ui-and-navigation.test.ts` (17/17 passed, 91/91 total in Phase 2 across 11 test files).
- Documented in `implementation-stages/person-1/phase-2-h-handoff.md`.

**Phase 2 Stage I (P1-2.4: First-Use Guide and Permanent Help):** Completed locally.
- Authoritative 6-step journey defined in `src/components/guide/first-use-guide-content.ts`: (1) register authorized test target once, (2) file report against saved target, (3) answer specific planning questions when needed, (4) review and explicitly approve plan, (5) separately start bounded investigation, (6) inspect two-attempt outcomes and available evidence.
- Every walkthrough step stamped with `Walkthrough example — not a live investigation`.
- Explicit target vs. server boundary: demo-target is a separate application running at its configured URL (`http://localhost:3005`); registration does not host, deploy, or start it.
- Explicit reproduction vs. patching boundary: TraceCase attempts defect reproduction and packages verifiable evidence; it does not patch target source code.
- 3 independent status dimensions legend: Lifecycle Completion (`COMPLETED` != bug found), Reproduction Verdict (`CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONCLUSIVE`), and Evidence Readiness (`AVAILABLE`, `PROCESSING`, `EMPTY`, `RESTRICTED`), plus distinction rule.
- Accessible walkthrough modal (`FirstUseGuideModal`) with tablist navigation, keyboard controls (`Escape`, `ArrowLeft`, `ArrowRight`), illustrative reference callouts, and collapsible status legend.
- Permanent discoverability: "How to use TraceCase" button in desktop header (`#header-how-to-use-btn`), mobile menu drawer (`#header-mobile-how-to-use-btn`), and sidebar navigation (`#sidebar-how-to-use-btn`).
- Dismissible/reopenable compact dashboard guide banner (`#dashboard-guide-banner`) and reopen strip (`#dashboard-guide-reopen-bar`) using `localStorage` preference keys (`tracecase_guide_banner_dismissed`, `tracecase_guide_dismissed`).
- Zero operational side effects: guide interactions do not call Luna, start browsers/workers, trigger jobs, reset targets, consume credits, or inject fake investigations into the dashboard.
- Dedicated test suite `tests/person-1/phase-2/first-use-guide.test.ts` (10/10 passed, 101/101 total across 12 test files in Phase 2).
- Documented in `implementation-stages/person-1/phase-2-i-handoff.md`.

**Phase 2 Stage J (P1-2.5: Unify Status and Enforce Real Approval/Start Gates):** Completed locally.
- Unified status presentation across dashboard, investigation detail, and plan review into three independent dimensions: execution lifecycle, reproduction verdict, and evidence readiness.
- Enforced strict rule that "Completed" never equates to "Confirmed" (`isReproductionConfirmed`).
- Implemented centralized contract-driven `getNextPermittedAction` helper guiding operators with truthful next actions for `DRAFT`, `CLARIFICATION_PENDING`, `AWAITING_APPROVAL`, `APPROVED`, `QUEUED`/`RUNNING`, `COMPLETED` (inconclusive vs confirmed), and evidence packaging.
- Updated plan review to render authoritative current plan revisions, target metadata, semantic steps with safety tiers (`TIER_1_READ_ONLY` through `TIER_4_DESTRUCTIVE`), deterministic assertions, expected observations, mutation warnings, and sandbox verification gates.
- Bound approval cryptographically to the exact revision and SHA-256 hash using `ApprovePlanCommandSchema`.
- Implemented obsolete approval invalidation: flags when prior approval was granted for an obsolete revision or mismatched hash and requires explicit re-authorization.
- Added API client support and UI modals for plan rejection (`rejectInvestigationPlan`) and approval revocation (`revokeInvestigationPlan`) with mandatory operator justification reasons.
- Strictly decoupled approval from execution start: approval marks review status `APPROVED` without auto-starting; execution launch requires a separate guarded user action calling `/start` with valid planVersion and planHash.
- Preserved all server-side ownership, revision, sandbox, and dispatch guards. Truthfully handled missing plans (404), unauthorized states (401/403), duplicate clicks, and transitions without synthetic plan substitution.
- Dedicated test suite `tests/person-1/phase-2/status-and-approval-gates.test.ts` (20/20 passed, 121/121 total across 13 test files in Phase 2).
- Documented in `implementation-stages/person-1/phase-2-j-handoff.md`.

**Phase 2 Stage K (P1-2.6: Actual Attempts, Results and Evidence Presentation):** Completed locally.
- Rendered actual two-attempt structure when records exist: Attempt 1 & 2 execution states, reset & baseline readback receipt outcome (expected vs observed state hash, discrepancies, transport success), assertion observations table, target environment and build version.
- When only one attempt exists or Attempt 2 is blocked (e.g. unexecuted due to clean pass, reset failure, or mutation uncertainty), explicitly and honestly explained the reason; zero synthetic second attempts, receipts, or artificial durations manufactured.
- Kept deterministic reproduction verdict (`CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONCLUSIVE`) strictly separate from AI narrative/hypotheses (`Evidence Explanation (AI-Synthesized Hypotheses)`).
- Distinguished empty console logs, unavailable video, processing evidence, restricted artifacts, and retrieval failure using actual API semantics (`LOADING`, `FAILED`, `RESTRICTED`, `EMPTY`, `READY`).
- Fetch failure explicitly warns that failure to retrieve telemetry does NOT imply zero errors occurred.
- Delivered artifact metadata and content through dedicated authenticated route (`GET /api/v1/investigations/[id]/results`) checking principal authorization, sanitizing descriptors, withholding raw storage keys, and zero fallback to sample data.
- Preserved restricted raw artifact protections: raw video/logs kept in `RESTRICTED_RAW` storage tier, sanitized derivatives in `PUBLIC_SAFE`, and scrubbed URLs (`publicUrl: null`) in exports for restricted media.
- Reproduction export packaging (`buildReproductionPackage`) bound strictly to real persisted plans and authorized manifests, with explicit `exportDisclosure` disclosing missing plans or missing/quarantined artifacts without fabricated fallbacks.
- Dedicated test suite `tests/person-1/phase-2/attempts-results-and-evidence.test.ts` (11/11 passed, 132/132 total across 14 test files in Phase 2).
- Documented in `implementation-stages/person-1/phase-2-k-handoff.md`.

**Phase 2 Stage L (Browser-Free Integration Verification and Final Delivery):** Completed locally.
- Established an explicit safe test allowlist excluding all browser launches, live provider calls, worker daemon executions, and diagnostic queue dispatchers.
- Executed 216 browser-free tests across 23 test suites covering all changed boundaries (target registration/reuse, resilient intake, durable save, concurrency-safe clarification ordering, grounded planning, honest clarification UI, first-use onboarding guide, status & approval gates, actual attempt & evidence presentation, JWT auth, repositories, and evidence storage). Zero test failures.
- Real PostgreSQL 5432 verified reachable via driver query in `tests/person-1/phase-4/real-db-integration.test.ts` (`tracecase` database); unit testing used deterministic in-memory doubles (`ClarificationDbMock`, `ApiTestDbMock`, `InMemoryDbMock`) without mutating shared operational records.
- Verified TypeScript typechecking (`tsc --noEmit`, 0 errors), ESLint (`next lint`, 0 warnings/errors), worker compilation (`tsup`, bundled in 1.88s), and full production Next.js compilation (`next build`, all 31 routes generated).
- Prepared comprehensive final handoff in `implementation-stages/person-1/phase-2-final-handoff.md` detailing phase-by-phase status, changed files and contracts, unapplied migrations, check commands, real database vs doubles, known blockers, and a deferred runtime checklist.
- Browser verification not run, per instruction.

**Phase 2 Comprehensive Real Browser Acceptance and Joint Integration (`codex/integrate-phase2-sharvani`):** Completed locally with real browser execution across all 9 stages.
- Successfully merged Person 1's `origin/phase2-sharvani` into the integration baseline containing Person 2's `testingupdate` Workbench target.
- Reconciled delete confirmation modal markup and selectors in `demo-target/workbench/workbench-view.ts` (`data-task-id`, `aria-label="Confirm Delete"`).
- Resolved state stale closure in `src/app/investigations/new/page.tsx` using functional updaters for `setFormData`.
- Mounted `FirstUseGuideModal` in root layout alongside `OnboardingTour` with sidebar launch button (`#sidebar-guide-btn`).
- Harmonized baseline synthesis in `investigation-workflow.service.ts` to derive target buildVersion dynamically, ensuring pre-flight baseline readback passes cleanly for both buggy (`wb-v1.0.0-buggy`) and fixed (`wb-v1.0.1-fixed`) builds.
- Executed full 9-stage browser verification suite (`scripts/verify-full-browser-suite.ts`) in headless Chromium:
  1. Stage 3 (First Visit, Guide & Tour): verified 6-step First-Use Guide (Target vs Server boundary), mobile viewport (375x667), and onboarding tour.
  2. Stage 4-7 (Buggy Workbench Positive Journey, Port 3005): registered target, submitted bug report via UI, generated and cryptographically authorized plan, executed bounded dual-run in browser worker, verified target reset & readback, confirmed reproduction verdict `CONFIRMED_REPRODUCED` (Investigation ID `2bb6de84-7605-4b13-aa26-e8be4a2f4a0a`).
  3. Stage 8 (Fixed Workbench Negative Control Journey, Port 3006): submitted identical report, authorized plan, executed dual-run, verified `NOT_REPRODUCED` (Investigation ID `c6989bd4-02f0-42dd-b666-7b2e819de08d`).
  4. Stage 9 (Evidence Security & Export): verified secret scrubbing (`synthetic-jwt-token-xyz-9876` scrubbed from console logs and network traces) and exported JSON reproduction package.
- All 95 test files passed (875 passed tests, 0 failed, 6 skipped in Vitest).
- `pnpm exec tsc --noEmit` exited cleanly with code 0.
- Zero emojis in code, commits, or reports; zero remote pushes; lead checkout `C:\SHARAN PROJECTS\TraceCase` on `main` preserved untouched.
- Comprehensive report written in `implementation-stages/integration/phase-2-browser-acceptance-report.md`.



## Agreed Person 1 phases

| Phase | Work | Completion condition | Current record |
|---|---|---|---|
| P1-01 | Review foundation; correct live/preview boundaries; agree shared contracts, supported assertions, safe target projections, approval scope and service interfaces | Relevant negative checks pass and consumers can use consistent contracts | Locally implemented & verified (46/46 tests pass, typecheck/lint/builds pass); handoff review completed |
| P1-02 | Real authentication, ownership, database migrations and repositories | Real owned records persist and cross-user access is rejected | Locally implemented & verified (70/70 tests pass across 13 files, typecheck/lint/builds pass); review & handoff written |
| P1-03 | Report/clarification/plan APIs, versioning, persisted approval, start and cancellation | An owned report reaches a genuinely approved experiment; stale/duplicate commands handled | Locally implemented & verified (108/108 tests pass across 19 files, typecheck/lint/builds pass); review & handoff written |
| P1-04 | Durable queue, worker ownership, single-investigation admission and progress events | Diagnostic job and concurrency/replay checks pass | Locally implemented & verified (131/131 tests pass across 25 files, typecheck/lint/builds pass); review & handoff written |
| P1-05 | Playwright browser execution, fresh observations, scoped actions and real capture | Approved controlled procedure produces actual capture receipts | Locally implemented & verified (149/149 tests pass across 30 files, typecheck/lint/builds pass); review & handoff written |
| P1-06 | Deterministic assertions, attempt validity, verified fixture restoration and two-attempt assessment | Two valid matching attempts can establish reproduction; invalid/inconsistent outcomes remain honest | Locally implemented & verified (195/195 tests pass across 36 files, typecheck/lint/builds pass); review & handoff written |
| P1-07 | Integrate Person 2's AI and Person 3's UI/evidence services through trusted APIs/controller | Real report-to-result agentic journey works without synthetic substitution | Locally implemented & verified (218/218 tests pass across 42 files, typecheck/lint/builds pass); review & handoff written |
| P1-08 | Failure recovery, cancellation/uncertainty, operational readiness and deployment | Deployed web/worker workflow and important failure paths verified | Locally implemented & verified (225/225 tests pass across 43 files, typecheck/lint/builds/worker-entrypoint pass); review & handoff written |
| P1-09 | Official TC1–TC4 acceptance and release handoff | Actual scenario records, evidence, limitations and submission materials prepared | Locally implemented, hardened & verified (242/242 tests pass across 45 files, typecheck/lint/builds/worker-entrypoint pass); corrective review & handoff written |

The detailed plan is [Person 1 implementation plan](implementation-stages/person-1/person-1-implementation-plan.md). Read the [shared coordination guide](implementation-stages/README.md) for F-01–F-11 foundation follow-up items, H-01–H-12 handoffs and G0–G5 gates. Phase numbers in older subsystem roadmaps are not interchangeable with these person-specific IDs.

## Mandatory method before each next-phase prompt

1. Inspect current source, changes, dependencies and actual implementation status.
2. Review the preceding phase's behavior, relevant test results and handoff evidence.
3. Identify unfinished work, safety/contract problems and dependencies on the others.
4. Resolve blocking issues or clearly document an explicit boundary; do not silently count a mock as integration.
5. Prepare a self-contained implementation prompt for the next agreed phase using the actual repository state.
6. After execution, record revision, implemented behavior, checks/results, limitations and next step. Update phase status only with evidence.

Do not generate nine fixed prompts and follow them blindly. Do not infer completed implementation from an earlier prompt. Future agent prompts must explain the goal, concepts, behavior, user/internal flow, contracts, allowed modules, edge cases, checks and exit conditions clearly.

## Ziro problem-statement alignment

Assignment: **Bug Reproduction Agent**, theme **Developer & Enterprise AI**. The supplied brief/screenshots, represented in the [PS traceability matrix](docs/ps-requirements-traceability-matrix.md), establish these obligations:

- Start from a vague bug report about a permitted open-source demo/staging web application.
- Collect/clarify bug steps, environment and build; plan safe reproduction.
- Obtain human approval before reproduction execution.
- Run the steps and capture screen recording, console logs and network logs.
- Reproduce twice before confirming.
- Return reproduced/not reproduced with evidence, qualifying blocked, invalid or inconclusive situations honestly.

| Official case | Preserve throughout implementation |
|---|---|
| TC1 | Two valid matching reproductions with recordings, console and network logs |
| TC2 | Meaningful bounded nonreproduction with steps tried and environment/build |
| TC3 | Deletion reproduction only in an authorized controlled sandbox |
| TC4 | Auth token redacted before sharing; test with synthetic values |

Use mock/synthetic sensitive data; no OTP/CAPTCHA bypass. A supported manual step or clearly qualified mock may be needed. Final submission form/deadline remains unverified; the supplied opening time is not the final deadline. This plan targets the requirements; organizer acceptance and success must be evidenced later, not assumed.

## Product invariants and scope

- Name: TraceCase. Report-driven reproduction, not unrestricted discovery or automatic code repair.
- Explicit user model choice: GPT-6 Luna through OpenAI only; no silent fallback, local model or training requirement. Verify actual API access/identifier before live use. Approximately $20 was reported, not independently verified credit.
- Trusted code owns identity, approval, policy, budgets, tools, validity, findings and publication. AI proposes/explains; frontend displays/submits commands.
- Preserve execution lifecycle, reproduction assessment, attempt validity and evidence readiness as separate concepts.
- Verify equivalent relevant starting conditions between attempts. Browser isolation or a successful reset response alone does not prove backend restoration.
- Preserve contradictions and partial findings. Missing/unsafe evidence stays incomplete/restricted. Crashes and missing prerequisites are not valid nonreproduction.
- No blind replay of uncertain mutations. Cancellation cannot undo an effect already in flight.
- Sanitize before exposure to models/UI/progress/sharing. Text scrubbing does not sanitize pixels. Sanitized and restricted stores remain private.

## Ownership that must remain consistent

- **Person 1:** Trusted API/controller/database/queue/browser/verifier/target-client operations and deployment; coordinates contracts, migrations and dependencies.
- **Person 2:** Luna role modules, controlled demo-target internals, scoped target reset/readback, independent labels and evaluation.
- **Person 3:** Product UI, shared sanitizer, private artifact processing/storage/access services, viewers and downloads. P1 owns public API handlers and identity enforcement.

One shared sanitizer, one shared contract set, and one coordinated migration history. Do not duplicate another person's module to avoid a handoff. Consult the actual specifications and code; do not treat historical draft claims as proof of implementation or human approval.
