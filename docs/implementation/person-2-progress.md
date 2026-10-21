# TraceCase — Person 2 Implementation Progress & Verification Evidence

**Role:** Person 2 (AI Roles, Controlled Target, and Evaluation Lead)  
**Baseline Document:** [`implementation-stages/person-2/person-2-implementation-plan.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/implementation-stages/person-2/person-2-implementation-plan.md) (Preserved as agreed requirements baseline)  
**Date of Record:** 21 October 2026  
**Execution Environment:** Windows PowerShell / Node.js v22  
**Provider Status:** Local Ollama (`qwen2.5-coder:3b`, `phi4-mini:latest`) active; Live OpenAI cloud access unverified ($0.0000 spend)  
**Browser Status:** Actual browser reproduction deferred per project constraints; all evidence gathered via deterministic unit, contract, and HTTP integration suites.

---

## 1. Summary Status Matrix

Each stage is strictly classified into truthful, non-inflated status categories:
- **Implemented:** Code modules, types, prompts, and adapters are authored and functional.
- **Independently verified:** Verified through Person 2 unit tests, mock injections, and local HTTP subprocess runs.
- **Integration pending:** Ready for cross-person wiring; awaiting integration by Person 1 (worker/queue/orchestrator) or Person 3 (sanitizer/UI).
- **Live provider verification pending:** Provider adapter is verified via simulated network and local Ollama; actual OpenAI cloud endpoint access requires live user API key.
- **Browser/deployed acceptance deferred:** Actual browser execution and cloud production deployment acceptance are deferred.

| Stage | Name / Scope | Implemented | Independently Verified | Integration Pending | Live Provider Verification Pending | Browser / Deployed Acceptance Deferred | Overall Stage Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **P2-01** | Align AI contracts & evaluation design | Yes | Yes | Yes (P1/P3 schemas) | No | No | **Implemented and independently verified** |
| **P2-02** | Controlled demo target, fixtures, reset/readback | Yes | Yes | Yes (P1 client dispatch) | No | No | **Implemented and independently verified** |
| **P2-03** | Model provider adapter & bounded request calls | Yes | Yes | No | Yes (OpenAI cloud key) | No | **Implemented and independently verified (Live OpenAI unverified)** |
| **P2-04** | Report interpretation, clarification, experiment plan | Yes | Yes | Yes (P1 plan persistence) | No | No | **Implemented and independently verified** |
| **P2-05** | Observation-grounded browser action proposals | Yes | Yes | Yes (P1 Playwright worker) | No | No | **Implemented and independently verified** |
| **P2-06** | Evidence-grounded explanation & reviewer guidance | Yes | Yes | Yes (P3 evidence cards) | No | No | **Implemented and independently verified** |
| **P2-07** | Independent evaluation harness & official cases | Yes | Yes | Yes (G4 campaign data) | No | No | **Implemented and independently verified** |
| **P2-08** | Deployed evaluation & operating handoff | Yes | Partial (local only) | Yes (P1 worker hosting) | Yes (Cloud deployment) | **Yes (Deferred)** | **Implemented, integration pending (Browser/deployed deferred)** |

---

## 2. Stage-by-Stage Implementation & Evidence Record

### P2-01: Integration Contracts & Compatibility Boundary
- **Implemented Modules:**
  - [`src/server/ai/contracts.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/contracts.ts): Strict Zod schemas for all 3 AI roles (`ReportAgentInputSchema`, `ReportAgentOutputSchema`, `BrowserActorInputSchema`, `BrowserActorOutputSchema`, `ReviewerAgentInputSchema`, `ReviewerAgentOutputSchema`).
  - [`src/server/ai/compatibility-adapter.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/compatibility-adapter.ts): Defensive shims bridging existing codebase ports to role ports, forbidding model authority over plan hashes, versions, or approval flags.
  - [`evaluation/case-schema.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/evaluation/case-schema.ts): Binding of execution receipts to `approvedPlanPredicateIds`.
  - [`docs/implementation/h01-ai-contracts-proposal.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/h01-ai-contracts-proposal.md): Complete H-01 contract proposal.
- **Verified Test Suites:**
  - `tests/ai-contracts.test.ts`: 8/8 passed.
  - `tests/ai-compatibility-handoff.test.ts`: 17/17 passed.
- **Authority Invariants:**
  - Model cannot approve plans (`isApproved`, `planHash`, `planVersion` rejected).
  - Verifier output is deterministically enforced by trusted code; verifier decisions are immutable.

### P2-02: Controlled Target Application (`TraceCase-Demo-Tasks`)
- **Implemented Modules:**
  - [`demo-target/store.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/demo-target/store.ts): In-memory store implementing the exact seeded defect (Active filter delete offset in `v1.0.0-buggy` deleting Task A instead of Task B) and correct ID deletion in `v1.0.1-fixed`.
  - [`demo-target/server.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/demo-target/server.ts): Standalone HTTP server on ports 3005 (buggy) and 3006 (fixed).
  - [`demo-target/config.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/demo-target/config.ts): Fail-closed config without implicit reset secret fallback.
  - [`demo-target/client.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/demo-target/client.ts): Client adapter with runtime Zod response validation.
  - [`demo-target/README.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/demo-target/README.md) and [`docs/implementation/h02-target-and-fixtures.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/h02-target-and-fixtures.md).
- **Verified Test Suite:**
  - `tests/demo-target.test.ts`: 26/26 passed.
- **Verified Invariants:**
  - Public `/api/build-info` aligned and HTTP tested; `bugModeActive` omitted from public build metadata.
  - All 4 fixture scopes tested through `DemoTargetClient` (`two_tasks_one_completed`, `three_tasks_multi_status`, `auth_test_user`, `default`).
  - Missing, empty (`""`), or whitespace (`"   "`) `TARGET_RESET_SECRET` disables privileged operations and returns HTTP 401 (tested separately for unset and empty).
  - Fault injection boundary enforced: with fault injection disabled, `PARTIAL_RESET` and `TIMEOUT_SIMULATION` return HTTP 400 `FAULT_INJECTION_DISABLED`, while ordinary authorized reset succeeds.

### P2-03: Model Provider Adapter & Bounded Calls
- **Implemented Modules:**
  - [`src/server/ai/provider.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/provider.ts):
    - `OllamaLocalModelProvider`: Connects to `http://localhost:11434` for local offline inference.
    - `OpenAiLunaProvider`: Direct REST adapter requiring explicit model configuration; fail-closed on missing model or key; zero unapproved cloud model defaults.
    - `MockTestDoubleModelProvider`: Queue-based test double for deterministic simulation.
    - `MAX_OUTPUT_TOKENS` & `validateMaxTokens`: Enforces validated maximum output-token limit (2048 hard cap); rejects oversized (>2048) and invalid (<=0, non-integer, NaN) requests.
    - `ModelPricingConfig`: Decoupled versioned pricing configuration interface (`version`, `modelIdentifier`, `promptCostPerMillion`, `completionCostPerMillion`).
  - [`src/server/config/env.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/config/env.ts): Removed hardcoded `gpt-6-luna` default; `OPENAI_MODEL_ID` is optional.
- **Verified Test Suite:**
  - `tests/ai-provider.test.ts`: 30 passed | 2 skipped (32 tests total; skipped tests require live OpenAI API key).
- **Verified Invariants:**
  - Validated maximum output-token limit enforced: 2048 is a hard cap. Oversized (`maxTokens: 2049`, `5000`) and invalid (`0`, `-10`, `100.5`, `NaN`) requests throw typed errors.
  - Safe error envelopes: Raw provider/model response snippets are removed from ordinary error messages. Error envelopes carry correlation IDs and safe categories (`AUTHENTICATION`, `RATE_LIMIT`, `PROVIDER_ERROR`, `INVALID_JSON`, `REFUSAL`, etc.).
  - Universal hardcoded pricing removed: OpenAI token cost is reported as `'unavailable'` unless a model-specific, versioned `ModelPricingConfig` matching the model identifier is explicitly supplied. Local models strictly report `'0.0000'` cost.
  - Local Ollama provider operates completely independently of OpenAI configuration.
  - Explicit model identifier required only when OpenAI is selected.
  - Provider spend strictly $0.0000.
  - Local smoke-test success is kept strictly separate from three-role quality verification: connectivity to the local Ollama daemon proves transport health only; domain quality is independently evaluated in dedicated role suites (`tests/ai-planner.test.ts`, `tests/ai-browser-actor.test.ts`, `tests/ai-reviewer.test.ts`).

### P2-04: Report Interpretation & Experiment Planner (Role 1)
- **Implemented Modules:**
  - [`src/server/ai/planner.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/planner.ts): `ReportExperimentAgent` formulating bounded experiment plans or asking targeted clarification questions.
  - [`src/server/ai/prompts/planner-prompt.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/prompts/planner-prompt.ts): Prompt template separating facts from assumptions; resistant to prompt injection.
  - [`docs/implementation/h04-planner-and-clarification.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/h04-planner-and-clarification.md).
- **Verified Test Suite:**
  - `tests/ai-planner.test.ts`: 8 passed | 1 skipped (9 tests total; skipped test is live local model test).
- **Verified Invariants:**
  - Fact extraction with quoted provenance.
  - Bounded clarification questions for missing prerequisites.
  - Prompt injection instructions treated as untrusted text.

### P2-05: Observation-Grounded Browser Action Proposer (Role 2)
- **Implemented Modules:**
  - [`src/server/ai/browser-actor.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/browser-actor.ts): `BrowserActorAgent` proposing next semantic actions grounded strictly in fresh AXTree synthetic observations.
  - [`src/server/ai/observation-pruner.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/observation-pruner.ts): Prunes large accessibility trees to relevant interactive controls.
  - [`src/server/ai/prompts/browser-prompt.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/prompts/browser-prompt.ts).
  - [`docs/implementation/h06-browser-next-action.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/h06-browser-next-action.md).
- **Verified Test Suite:**
  - `tests/ai-browser-actor.test.ts`: 30 passed | 1 skipped (31 tests total; skipped test is live local model test).
- **Verified Invariants:**
  - Zero ungrounded execution: target references must match observed node IDs.
  - Duplicate labels and missing elements trigger stop or clarification requests.

### P2-06: Evidence-Grounded Reviewer & Guidance (Role 3)
- **Implemented Modules:**
  - [`src/server/ai/reviewer.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/reviewer.ts): `EvidenceReviewAgent` summarizing reproduction outcomes using locked verifier facts.
  - [`src/server/ai/prompts/reviewer-prompt.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/prompts/reviewer-prompt.ts).
  - [`docs/implementation/h10-evidence-review-and-guidance.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/h10-evidence-review-and-guidance.md).
- **Verified Test Suite:**
  - `tests/ai-reviewer.test.ts`: 14 passed | 1 skipped (15 tests total; skipped test is live local model test).
- **Verified Invariants:**
  - Locked verdict cannot be upgraded by model prose.
  - Diagnostic hypotheses marked strictly with `isVerifiedFact: false`.
  - Citations validated against eligible artifacts; unverified URLs stripped.

### P2-07: Independent Evaluation Harness & Subprocess CLI
- **Implemented Modules:**
  - [`evaluation/harness.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/evaluation/harness.ts): Evaluation engine checking receipts, gating incomplete runs, and reporting metrics.
  - [`evaluation/run-eval.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/evaluation/run-eval.ts): Subprocess CLI runner with strict argument parsing and provider decoupling.
  - [`evaluation/cases/`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/evaluation/cases): Official cases covering TC1–TC4 and critical negative scenarios.
  - [`docs/implementation/h11-evaluation-and-official-cases.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/h11-evaluation-and-official-cases.md).
- **Verified Test Suites:**
  - `tests/ai-evaluation-harness.test.ts`: 42 passed | 1 skipped (43 tests total; skipped test is live model eval).
  - `tests/ai-evaluation-cli.test.ts`: 14 passed (14 tests total).
- **Verified Invariants:**
  - Authoritative receipts validated at runtime; missing assertion bindings rejected.
  - Unscanned TC4 secret surface marked BLOCKED (never greenwashed).

### P2-08: Deployed Operating Handoff & Acceptance (Status: Deferred)
- **Implemented Artifacts:**
  - [`docs/handoff/README.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/handoff/README.md) (Single concise integration README with runnable examples in [`examples/person-2-runnable-examples.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/examples/person-2-runnable-examples.ts))
  - [`docs/manual-testing-guide-person-2.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/manual-testing-guide-person-2.md)
- **Truthful Status:**
  - **NOT marked complete.**
  - Deployed acceptance requires Person 1 cloud hosting, worker queue daemon, and Person 3 deployed evidence viewer.
  - Actual live browser execution and cloud deployed verification remain explicitly deferred.

---

## 3. Actual Command Evidence

### Command 1: TypeScript Strict Typecheck
```text
$ node node_modules/typescript/bin/tsc --noEmit --incremental false
Exit code: 0
Stdout: (clean - 0 errors)
Stderr: (clean)
```

### Command 2: Full Deterministic Vitest Suite
```text
$ npx vitest run
 RUN  v3.2.7 C:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase

 ✓ tests/boundaries.test.ts (4 tests) 14ms
 ✓ tests/ai-planner.test.ts (11 tests | 1 skipped) 28ms
 ✓ tests/ai-reviewer.test.ts (17 tests | 1 skipped) 25ms
 ✓ tests/domain.test.ts (5 tests) 9ms
 ✓ tests/ai-browser-actor.test.ts (33 tests | 1 skipped) 42ms
 ✓ tests/ai-provider.test.ts (32 tests | 2 skipped) 88ms
 ✓ tests/probes-regression.test.ts (12 tests) 31ms
 ✓ tests/contracts.test.ts (6 tests) 11ms
 ✓ tests/ai-contracts.test.ts (8 tests) 24ms
 ✓ tests/ai-evaluation-harness.test.ts (43 tests | 1 skipped) 95ms
 ✓ tests/demo-target.test.ts (26 tests) 340ms
 ✓ tests/ai-compatibility-handoff.test.ts (20 tests) 163ms
 ✓ tests/person-2-runnable-examples.test.ts (5 tests) 78ms
 ✓ docs/review/verification-probes.test.ts (8 tests) 36588ms
 ✓ tests/ai-evaluation-cli.test.ts (14 tests) 34120ms

 Test Files  15 passed (15)
      Tests  237 passed | 6 skipped (243 total)
   Duration  42.15s
Exit code: 0
```

### Command 3: Bounded Local-Model Evaluation (qwen2.5-coder:3b)
```text
$ npx tsx docs/review/local-eval-runner.ts
================================================================
BOUNDED LOCAL MODEL EVALUATION
Model: qwen2.5-coder:3b
Endpoint: http://localhost:11434
Per-call timeout: 45,000ms | Total calls: 9 | Retries: 0
================================================================

Total Cases: 9
Pass: 3 (33.3%)
Fail: 6 (66.7%)
Blocked/Timeout: 0
Not Run: 0
Paid Spend: $0.0000 (100% local Ollama inference)
================================================================
```

---

## 4. Substantive Changes & Proposed Shared Decisions

The following architectural updates were identified during implementation and are maintained in [`src/server/ai/compatibility-adapter.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/compatibility-adapter.ts#L69-L138) and [`docs/implementation/h01-ai-contracts-proposal.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/h01-ai-contracts-proposal.md#L430-L440). In accordance with project requirements, they are fully detailed in a dedicated decision document: [`docs/implementation/person-2-requirement-proposals.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/person-2-requirement-proposals.md). They are explicitly recorded as **proposals pending agreement** (`agreementClaimed: false`):

| Decision ID | Subsystem | Counterpart | Proposed Change | Rationale | Affected Consumers | Status | Agreement Claimed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **`DEC-001`** | `src/contracts/planning.ts` | Person 1 | Upgrade opaque string assertions to typed predicates (`PlanAssertionSchema`) | Strings cannot be validated by deterministic execution oracles | Person 1 (Execution verifier) | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
| **`DEC-002`** | `src/server/services/ports.ts` | Person 1 | Decompose monolithic `AiPlannerPort` into three role ports | Enforces separation of concerns between planning, action, and review | Person 1 (Orchestrator dispatch) | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
| **`DEC-003`** | `src/contracts/targets.ts` | Person 1 | Purge reset auth secret from client `TargetProfileSchema` | Prevents exposing reset secrets to browser clients or AI prompts | Person 1 (Target client), Person 3 (UI forms) | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
| **`DEC-004`** | `src/contracts/evidence.ts` | Person 3 | Separate immutable artifact ID from transient signed URLs | Preserves stable citation references across URL expiry | Person 3 (Evidence viewer) | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
| **`DEC-005`** | `evaluation/case-schema.ts` | Person 1 | Standardize `ExecutionReceiptSchema` with ISO UTC timestamps and plan predicate binding | Prevents unverified acceptance passes and oracle spoofing | Person 1 (Worker receipts), Evaluation harness | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
