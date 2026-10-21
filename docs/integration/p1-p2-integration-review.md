# Person 1 and Person 2 Subsystem Integration Review

**Date:** 21 October 2026  
**Integration Branch:** `integration/person-1-person-2`  
**Base Commit (Person 1):** `297125b` (`origin/person-1`)  
**Merged Commit (Person 2):** `a7d9ffc` (`origin/person-2`)  
**Working State:** Clean build, 0 TypeScript errors, 0 ESLint warnings/errors, 58 test files passed (475 passed tests, 0 failed).

---

## 1. Executive Summary

This document certifies the successful local integration of **Person 1** (Trusted Backend, State Machine, Queue, Playwright Browser Execution, Deterministic Verifier, Two-Attempt Controller) and **Person 2** (AI Role Modules, Prompt Contracts, Observation Pruning, Evaluation Harness, and Controlled Demo Target).

Integration was performed strictly on the isolated branch `integration/person-1-person-2`. Neither `main`, `person-1`, nor `person-2` was modified or pushed. No Person 3 code was imported or altered.

All shared runtime contracts, environment validations, target reset protocols, and AI role adapters were reconciled and verified end-to-end against live test doubles and the controlled demo target application.

---

## 2. Integrated Architecture & Runtime Adapters

### 2.1 Single Provider Path & Fail-Closed Model Enforcement (TC-INV-001 / TC-INV-005)
- **Production Model Hardening:** Configured `OPENAI_MODEL_ID` in `src/server/config/env.ts` to strictly default to `gpt-6-luna`.
- **Cloud Luna Enforcement:** In `OpenAiLunaProvider.generateStructuredCompletion`, any cloud inference invocation (`!this.customFetch`) requires `modelIdentifier === 'gpt-6-luna'`, otherwise rejecting fail-closed with `ModelProviderError('UNAUTHORIZED_MODEL')`.
- **Local Model Prohibition in Production:** In `OllamaLocalModelProvider.generateStructuredCompletion`, execution fails closed if `NODE_ENV === 'production'` with `ModelProviderError('LOCAL_MODEL_FORBIDDEN')`.
- **Offline / Unconfigured Host Resilience:** In `src/server/ai/integrated-adapters.ts`, if `OPENAI_API_KEY` is not present, all role adapters fail gracefully with typed `ServiceUnavailableError('OpenAI (gpt-6-luna)')`.

### 2.2 Role Adapter Bridge (`src/server/ai/integrated-adapters.ts`)
Person 1's trusted ports (`src/server/services/ports.ts`) are bridged to Person 2's specialized AI agents:
1. **Role 1 (Intake & Experiment Proposal):** `IntegratedReportClarificationAgent` implements `ReportClarificationAgentPort` wrapping `ReportExperimentAgent`. Translates between Person 1's `DraftReportIntake` and Person 2's `ReportAgentInput` / `ReportAgentOutput`. Maps experiment actions to typed `PlanStep` and assertions to `TypedAssertion`.
2. **Role 2 (Browser Next Action):** `IntegratedBrowserInvestigationAgent` implements `BrowserInvestigationAgentPort` wrapping `BrowserInteractionAgent`. Converts `SanitizedBrowserObservation` into pruned `AXTree` nodes, checks scope boundaries, and maps `BrowserDecisionOutput` into grounded `BrowserActionProposal`.
3. **Role 3 (Evidence Review & Synthesis):** `IntegratedEvidenceReviewAgent` implements `EvidenceReviewAgentPort` wrapping `EvidenceReviewAgent`. Enforces the critical invariant that model hypotheses are strictly marked `isVerifiedFact: false` (TC-INV-008).
4. **Target Reset Port Adapter:** `DefaultTargetResetAdapter` implements `TargetResetPort` supporting authenticated reset and payload extraction.

### 2.3 Target Reset & Baseline Verification Protocol
- Person 1's `TargetResetClient` was aligned with Person 2's `demo-target`:
  - **Headers:** Outbound reset requests send `X-TraceCase-Reset-Secret`, `X-TraceCase-Reset-Auth`, and `Authorization: Bearer <secret>`.
  - **Dual Readback Resolution:** Resolves `/api/test/readback` with fallback to `/api/test/baseline`.
  - **Comparator Normalization:** `BaselineComparator` ignores non-semantic dynamic keys (`timestamp`, `verifiedat`, `resetat`, `buildversion`).
  - **E2E Reset & Readback Verification:** Confirmed against real `demo-target` HTTP instance in `tests/integration/p1-p2-integrated-flow.test.ts`.

---

## 3. Test Suites & Quality Verification

Across the unified repository, all test suites execute cleanly:

| Suite Category | Files | Tests | Status | Notes |
|---|---|---|---|---|
| Full Repository Suite (`pnpm test`) | 58 files | 475 passed, 6 skipped | **PASS** | 0 failed |
| Integrated End-to-End (`p1-p2-integrated-flow.test.ts`) | 1 file | 6 passed | **PASS** | Tests Roles 1-3, Target Reset, Provider Invariants |
| Person 1 Acceptance (`phase-9/real-acceptance.test.ts`) | 1 file | 4 passed | **PASS** | Real Playwright Chromium launch & WebM capture |
| Verification Probes (`verification-probes.test.ts`) | 1 file | 8 passed | **PASS** | Ephemeral target server, offline Ollama fail-closed |
| AI Evaluation CLI (`ai-evaluation-cli.test.ts`) | 1 file | 14 passed | **PASS** | Subprocess CLI invocations and arg validation |
| Demo Target Fixture (`demo-target.test.ts`) | 1 file | 26 passed | **PASS** | Store, state machines, reset endpoints, readback |
| AI Role Unit Suites (`ai-*.test.ts`) | 7 files | 147 passed | **PASS** | Planner, Actor, Reviewer, Observation Pruner |
| TypeScript Compiler (`pnpm typecheck`) | - | 0 errors | **PASS** | `tsc --noEmit` exit 0 |
| ESLint (`pnpm lint`) | - | 0 warnings | **PASS** | `next lint` clean |

---

## 4. Quality Gate Status (G0 - G5)

- **Gate G0 (Hygiene & Type Safety):** **PASSED.** Clean typecheck and linting across all integrated files.
- **Gate G1 (Security & Auth Boundaries):** **PASSED.** Cryptographic JWT verification, tenant isolation, network guard SSRF protection (`169.254.169.254` blocked), reset secret validation.
- **Gate G2 (Two-Attempt Deterministic Verification):** **PASSED.** Deterministic assertion evaluator, independent baseline comparator, pair decision matrix, and two-attempt controller verified with test doubles and local fixtures.
- **Gate G3 (AI Proposal Integration & Agentic Loop):** **READY FOR LIVE KEYS / VALIDATED WITH DOUBLES.**
  - The runtime bridge is complete and verified with deterministic doubles.
  - Fail-closed constraints strictly prohibit unauthorized models or local models in production.
  - Live OpenAI inference calls require a valid `OPENAI_API_KEY` with access to `gpt-6-luna`.
- **Gate G4 (Full Evidence Triad):** **PARTIALLY VALIDATED / PENDING PERSON 3.**
  - Genuine WebM video recording, console error capture, and network trace capture verified locally with Playwright Chromium.
  - Finalized public packaging and shared text redaction remain blocked pending Person 3's shared sanitizer.
- **Gate G5 (Official Acceptance Benchmark):** **READY FOR DEPLOYED RUN.**
  - Scenarios TC1, TC2, TC3, and TC4 verified locally with test doubles and real browser media capture.
  - End-to-end evaluation harness CLI operational.

---

## 5. Invariant Status (TC-INV-001 through TC-INV-014)

- **TC-INV-001 (Single Authorized Model):** Enforced in `env.ts` and `provider.ts`. Only `gpt-6-luna` permitted.
- **TC-INV-002 (Explicit User Approval):** Enforced in `InvestigationWorkflowService`. No execution without immutable plan approval.
- **TC-INV-003 (Deterministic Verification):** Enforced in `DeterministicAssertionEvaluator`. Pure functions, no model-assisted assertion scoring.
- **TC-INV-004 (Independent Target Reset):** Enforced in `TargetResetClient` and `BaselineComparator`. Verified against `demo-target`.
- **TC-INV-005 (Fail-Closed Provider Security):** Enforced. Missing API key returns `ServiceUnavailableError`; local models rejected in production.
- **TC-INV-006 (Bounded Execution Leases):** Enforced in `ExecutionLeaseService`. Monotonic epochs and heartbeat renewals prevent split-brain.
- **TC-INV-007 (Atomic Budget Enforcement):** Enforced in `BudgetManager`. Pre-allocation and hard token limits halt unbounded loops.
- **TC-INV-008 (Hypothesis Non-Fact Separation):** Enforced in `Reviewer` and `IntegratedEvidenceReviewAgent`. `isVerifiedFact: false` strictly required.
- **TC-INV-009 (SSRF & Network Isolation):** Enforced in `TargetNetworkGuard`. Cloud metadata and private ranges blocked.
- **TC-INV-010 (Tenant Isolation):** Enforced in all API endpoints and repositories. Principal-scoped queries.
- **TC-INV-011 (Secret Redaction):** Invariant specified; live redaction implementation pending Person 3's shared sanitizer.
- **TC-INV-012 (EBML Header Video Verification):** Enforced in `real-acceptance.integration.test.ts`. WebM byte header validated.
- **TC-INV-013 (Immutable Event Replay):** Enforced in `ProgressReporter` and `outbox_messages`. Serialized progress counter.
- **TC-INV-014 (Two-Attempt Comparability):** Enforced in `PairAssessor`. Target build identity and environmental comparability required.

---

## 6. Next Steps & Handoff

1. Commit all integrated changes locally to `integration/person-1-person-2`.
2. Keep `person-1` and `person-2` untouched for independent provenance.
3. Coordinate with Person 3 for the integration of the shared sanitizer (`evidence-storage.service.ts`) and user-facing frontend.
