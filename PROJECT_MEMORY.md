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

**Person 1 & Person 2 Integration (`integration/person-1-person-2`):** Completed locally on isolated integration branch. Reconciled Person 1 trusted execution engine with Person 2 AI roles (Planner, Actor, Reviewer) and controlled demo target.
- All 58 test files pass (475 passed tests, 6 skipped, 0 failed in ~24s).
- `pnpm typecheck` and `pnpm lint` pass with 0 errors/warnings.
- Unified provider enforces single model path (`gpt-6-luna`), rejects unauthorized models, and strictly forbids local models in production (TC-INV-001 / TC-INV-005).
- Integrated adapters (`src/server/ai/integrated-adapters.ts`) bridge Person 1 ports with Person 2 role agents, preserving hypothesis non-fact separation (TC-INV-008).
- Outbound target reset client aligned with demo target authentication and dual readback endpoint resolution.
- Quality Gates: G0 passed, G1 passed, G2 passed, G3 validated with test doubles (ready for live OpenAI Luna API key), G4 validated with Chromium media capture (shared sanitizer pending Person 3), G5 verified with test doubles.
- Documented in `docs/integration/p1-p2-integration-review.md`.

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
