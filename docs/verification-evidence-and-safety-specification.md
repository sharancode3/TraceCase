# TraceCase — Verification, Evidence, and Safety Specification

**Document ID:** TC-VES-001  
**Document Purpose:** Implementation-Ready Specification for Reproduction Oracles, Attempt Validity, Evidence Integrity, In-Stream Redaction, and Execution Safety Guardrails  
**Version:** 1.0.0-draft  
**Date:** 20 October 2026  
**Status:** Draft for Review (Requires technical lead and security sign-off before implementation)  
**Authoring Role:** Verification Architect, Evidence System Designer & Execution Safety Engineer (Antigravity Agent)  
**Intended Readers:** AI Engineers, Backend/Worker Developers, Security Auditors, QA Automation Engineers, Hackathon Evaluators.

---

## Table of Contents

- [1. Document Control, Authority, and Implementation Baseline](#1-document-control-authority-and-implementation-baseline)
- [2. Terminology and Operational Definitions](#2-terminology-and-operational-definitions)
- [3. Trust and Authority Model](#3-trust-and-authority-model)
- [4. Tri-Dimensional State Separation](#4-tri-dimensional-state-separation)
- [5. Claim Intake, Oracles, and Assertion Vocabulary](#5-claim-intake-oracles-and-assertion-vocabulary)
- [6. Attempt Validity, Initial Conditions, and Target Reset](#6-attempt-validity-initial-conditions-and-target-reset)
- [7. Two-Attempt Confirmation Policy & Master Decision Table](#7-two-attempt-confirmation-policy--master-decision-table)
- [8. Deterministic Verifier Architecture](#8-deterministic-verifier-architecture)
- [9. Evidence Inventory, Sufficiency, and Lifecycle](#9-evidence-inventory-sufficiency-and-lifecycle)
- [10. Recording, Console, and Network Telemetry Contracts](#10-recording-console-and-network-telemetry-contracts)
- [11. Evidence Integrity, Provenance, and Manifest Schema](#11-evidence-integrity-provenance-and-manifest-schema)
- [12. Data Classification, In-Stream Sanitization, and TC4 Synthetic-Secret Verification](#12-data-classification-in-stream-sanitization-and-tc4-synthetic-secret-verification)
- [13. Publication, Access, and Export Policy](#13-publication-access-and-export-policy)
- [14. Human Approval and Sandbox Safety Policy](#14-human-approval-and-sandbox-safety-policy)
- [15. Action-Risk Classification and Policy Rules](#15-action-risk-classification-and-policy-rules)
- [16. Retry, Cancellation, and Mutation Uncertainty](#16-retry-cancellation-and-mutation-uncertainty)
- [17. Safety Incidents, Containment, and Escalation](#17-safety-incidents-containment-and-escalation)
- [18. Budget, Quota, and Resource Safety](#18-budget-quota-and-resource-safety)
- [19. UI Truthfulness and Qualified Reporting Language](#19-ui-truthfulness-and-qualified-reporting-language)
- [20. Optional Diagnostic Guidance and Regression-Test Export](#20-optional-diagnostic-guidance-and-regression-test-export)
- [21. Official-Case Verification Walkthroughs (TC1–TC4)](#21-official-case-verification-walkthroughs-tc1tc4)
- [22. Labelled Reference Example (Filter & Delete Task B)](#22-labelled-reference-example-filter--delete-task-b)
- [23. Acceptance Strategy & Ground-Truth Test Matrix](#23-acceptance-strategy--ground-truth-test-matrix)
- [24. Metrics & Evaluation Methodology](#24-metrics--evaluation-methodology)
- [25. Architectural Diagrams](#25-architectural-diagrams)
- [26. Traceability Matrix & Identifier Registry](#26-traceability-matrix--identifier-registry)
- [27. Open Decisions and Implementation Handoff](#27-open-decisions-and-implementation-handoff)
- [28. Validation Checklist & Sign-Off](#28-validation-checklist--sign-off)

---

## 1. Document Control, Authority, and Implementation Baseline

### 1.1 Document Overview
This document establishes the authoritative, implementation-oriented specification for **verification truth, evidence integrity, and execution safety** in **TraceCase**. It defines what TraceCase can truthfully conclude, what constitutes a valid reproduction attempt, how assertions are deterministically evaluated, how two independent runs establish confirmation, how the mandatory Evidence Triad is captured and sanitized, and how human approval and sandbox boundaries protect connected targets.

The central mandate of TraceCase is the **Deterministic Verification Invariant**:
$$\text{Model Proposes} \longrightarrow \text{Code Authorizes} \longrightarrow \text{Playwright Executes} \longrightarrow \text{Deterministic Code Verifies} \longrightarrow \text{Pipeline Redacts}$$

The foundation model (**GPT-6 Luna**) has **zero authority** over verification verdicts, approval validity, sandbox trust, budget limits, or evidence safety.

### 1.2 Inspected Sources vs. Unavailable Sources
- **Inspected Workspace Specifications:**
  - [`docs/prd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/prd.md) (`TC-PRD-001`, v1.0.0-draft): Product requirements, user journeys, official acceptance criteria.
  - [`docs/trd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/trd.md) (`TC-TRD-001`, v1.0.0-draft): Technical architecture, ADRs (`TC-ADR-001`–`TC-ADR-010`), and system topology.
  - [`docs/ps-requirements-traceability-matrix.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/ps-requirements-traceability-matrix.md) (`TC-RTM-001`, v1.0.0-draft): 19 atomic official requirements (`PS-REQ-001`–`PS-REQ-019`) and TC1–TC4 test mappings.
  - [`docs/workflow-and-state-machine-specification.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/workflow-and-state-machine-specification.md) (`TC-WFM-001`, v1.0.0-draft): 5-dimensional decoupled state machine (`WF-TR-001`–`WF-TR-021`).
  - [`docs/database-design-and-erd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/database-design-and-erd.md) (`TC-DBD-001`, v1.0.0-draft): 21 PostgreSQL relational tables, JSONB schemas, transaction matrix (`DB-TXN-001`–`DB-TXN-014`).
  - [`docs/system-architecture.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/system-architecture.md) (`TC-SAD-001`, v1.0.0-draft): C4 views, runtime isolation boundaries, and execution topology.
  - [`docs/ui-ux-specification.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/ui-ux-specification.md) (`TC-UIX-001`, v1.0.0-draft): UI design system alignment (white/pale-lavender, cobalt-blue actions, circular icon buttons).
  - [`docs/agent-and-tool-contracts.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/agent-and-tool-contracts.md) (`TC-AGT-001`, v1.0.0-draft): Prompt engineering, 16-step tool dispatch pipeline, AXTree pruning, error codes, and budget caps.
  - [`docs/api-and-event-contracts.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/api-and-event-contracts.md) (`TC-AEC-001`, v1.0.0-draft): REST endpoints, Server-Sent Events (SSE), outbox events, and error envelopes.
- **Unavailable / Unverified External Sources:**
  - Live target demo application source code and runtime database (standard HTTP web endpoints and REST fixtures assumed).
  - Production S3 object storage infrastructure (local MinIO S3 API contract assumed).
  - Live OpenAI API balance and production quota records (user reported $\approx \$20.00$ credit envelope).

### 1.3 Baseline System Invariants
| Invariant ID | Name | Verification & Safety Enforcement Rule |
|---|---|---|
| **TC-INV-001** | Exclusive AI Model | All AI inference requests route exclusively to `gpt-6-luna` via OpenAI API. Zero silent fallback. |
| **TC-INV-002** | Two-Run Confirmation | `reproduction_verdict = 'CONFIRMED_REPRODUCED'` strictly requires two independent runs matching the failure signature. |
| **TC-INV-003** | Explicit Human Approval | No effectful browser actions execute without cryptographic human approval bound to `plan_hash`. |
| **TC-INV-004** | Cryptographic Plan Binding | Any plan modification generates a new revision and revokes approval immediately. |
| **TC-INV-005** | Pre-Flight Baseline Validation | Attempt 1 execution blocked until pre-flight health checks confirm target baseline availability. |
| **TC-INV-006** | Target Fixture Reset | Attempt 2 execution blocked until `POST /api/test/reset-fixture` returns HTTP 200 OK. |
| **TC-INV-007** | Decoupled 3D State Machine | Execution Lifecycle State $\neq$ Reproduction Verdict $\neq$ Evidence Readiness. |
| **TC-INV-008** | Sandbox Guardrail | Destructive actions (`DELETE`, `PURGE`) prohibited unless `targets.is_sandbox = TRUE`. |
| **TC-INV-009** | In-Stream Redaction | PII, tokens, and cookies scrubbed in-memory. Raw artifacts quarantined as `RESTRICTED_RAW`. |
| **TC-INV-010** | No CAPTCHA / OTP Bypass | Automated bypass forbidden. Investigation pauses in `PAUSED_FOR_MANUAL_AUTH` with UI handoff event. |
| **TC-INV-011** | Single Concurrency Lease | Maximum one active browser investigation per worker lease. |
| **TC-INV-012** | Mandatory Evidence Triad | Reproduction validity requires Video (`.webm`), Console Log (`.log`), and Network Log (`.json`). |
| **TC-INV-013** | Mutation Uncertainty Guard | Timeouts on mutating actions transition to `MUTATION_UNCERTAIN`. Zero blind re-executions. |
| **TC-INV-014** | Deterministic Verifier Exclusivity | Assertion outcomes evaluated strictly by deterministic TypeScript code, never by asking LLM opinion. |

---

## 2. Terminology and Operational Definitions

The following 28 definitions form the strict semantic vocabulary of TraceCase verification:

- **`VES-DEF-001` (Reported Claim):** The unverified problem description submitted by the reporter asserting that a specific trigger produces an unintended deviation.
- **`VES-DEF-002` (Correct Behavior):** The intended, healthy application response specified by system requirements or accepted user mental model (e.g. "Task B disappears from list, completed tasks remain").
- **`VES-DEF-003` (Failure Signature):** The concrete, observable, and testable deviation that directly matches the bug report (e.g. "Task B remains visible, and/or completed Task A is removed").
- **`VES-DEF-004` (Oracle / Check):** A deterministic procedure that evaluates page DOM, HTTP status codes, or storage state to decide if an assertion condition is satisfied.
- **`VES-DEF-005` (Supported Assertion):** A structured predicate conforming to the fixed verifier vocabulary (`DOM_ELEMENT`, `HTTP_STATUS`, `URL_PATH`, etc.).
- **`VES-DEF-006` (Prerequisite):** An environmental or authentication condition required before an experiment begins (e.g. user logged in, seed tasks present).
- **`VES-DEF-007` (Candidate Procedure):** A proposed sequence of semantic actions designed to reach the scenario and trigger the reported condition.
- **`VES-DEF-008` (Attempt):** A single, isolated execution of the candidate procedure from initial state to final verification.
- **`VES-DEF-009` (Initial Conditions):** The verified starting state of the target application and browser before step 1 begins.
- **`VES-DEF-010` (Equivalent Fixture):** Target backend data restored to identical semantic values between Attempt 1 and Attempt 2.
- **`VES-DEF-011` (Scenario Reached):** A binary indicator confirming that the browser successfully completed all prerequisite steps and reached the evaluation point without fatal blocking errors.
- **`VES-DEF-012` (Valid Attempt):** An attempt where: (a) initial baseline was validated, (b) approved steps executed within scope, (c) the evaluation point was reached, and (d) assertions were executed.
- **`VES-DEF-013` (Observation):** An objective, timestamped datum captured directly by instrumentation (AXTree snapshot, HTTP receipt, console line).
- **`VES-DEF-014` (Interpretation):** A structured translation of raw observations into technical claims performed by the AI planner.
- **`VES-DEF-015` (Hypothesis):** A proposed technical explanation of the underlying software fault (e.g. "React state key mismatch"), strictly qualified as unverified.
- **`VES-DEF-016` (Corroboration):** Multiple independent observations (e.g. console stack trace + 500 HTTP receipt) supporting the same phenomenon.
- **`VES-DEF-017` (Confirmation):** The formal state reached when two valid, independent attempts both exhibit the matching failure signature under equivalent initial conditions (`TC-INV-002`).
- **`VES-DEF-018` (Nonreproduction):** The formal state reached when a valid attempt completes the full procedure and expected behavior assertions pass, with zero failure signature observed.
- **`VES-DEF-019` (Inconsistent Result):** An outcome where Attempt 1 and Attempt 2 yield conflicting findings (e.g. Attempt 1 reproduced, Attempt 2 behaved correctly).
- **`VES-DEF-020` (Inconclusive Result):** An outcome where the procedure could not reach the evaluation point due to external blockers, locator failures, or crashes.
- **`VES-DEF-021` (Execution Error):** An unhandled runtime exception in the browser or test harness that aborts an attempt prematurely.
- **`VES-DEF-022` (Evidence Completeness):** The state where all three required Evidence Triad artifacts (Video, Console, Network) exist, are non-empty, and are finalized.
- **`VES-DEF-023` (Evidence Sufficiency):** The degree to which captured evidence directly supports the verification verdict without ambiguity or gaps.
- **`VES-DEF-024` (Integrity):** Cryptographic assurance (via SHA-256) that an artifact has not been modified or corrupted since capture.
- **`VES-DEF-025` (Provenance):** The complete lineage connecting a final verdict to specific attempts, worker leases, plan hashes, and raw artifact IDs.
- **`VES-DEF-026` (Sanitized Derivative):** A safe, redacted version of an artifact scrubbed of secrets and PII, classified as `PUBLIC_SAFE`.
- **`VES-DEF-027` (Restricted Artifact):** An unredacted raw capture classified as `RESTRICTED_RAW`, quarantined in private storage.
- **`VES-DEF-028` (Uncertain Mutation):** A state where an effectful browser action timed out before confirmation, leaving target server state indeterminate.

---

## 3. Trust and Authority Model

TraceCase strictly defines non-overlapping authority boundaries across all participating entities. The foundation model is an advisory engine with **zero verification authority**:

| Decision Domain | Authoritative Owner | Non-Authoritative Entity | Non-Authority Rule |
|---|---|---|---|
| **User Identity & Tenancy** | Supabase Auth JWT | Frontend Client / AI | Caller cannot claim an arbitrary `org_id` or `user_id`. |
| **Plan Approval** | Human User (via UI / API) | AI Planner (`AT-ROLE-001`) | Planner proposes; human signs. Model cannot set `is_approved: true`. |
| **Sandbox Trust** | Admin Target Registration | Reporter / Model | Model cannot declare a production target to be a sandbox. |
| **Action Dispatch Authorization** | Backend `ToolPolicyEnforcer` | AI Browser Actor (`AT-ROLE-002`)| Model emits action proposal; policy wrapper checks 16 invariants before execution. |
| **Assertion Evaluation** | Deterministic Verifier Code | AI Reviewer (`AT-ROLE-003`) | Verifier checks DOM/HTTP status. Reviewer opinion never sets verdict. |
| **Reproduction Verdict** | Orchestration Controller | AI Reviewer | Controller evaluates dual-run rule; Reviewer receives verdict as a locked fact. |
| **Artifact Publication** | In-Stream Sanitization Pipeline | Scribe / Reviewer Agent | Scribe reads scrubbed logs; cannot un-quarantine `RESTRICTED_RAW` artifacts. |
| **Budget Enforcement** | Metering Engine (`model_usage_records`)| OpenAI SDK Client | Controller halts on spend $\ge \$20.00$; model cannot self-meter. |

---

## 4. Tri-Dimensional State Separation (`TC-INV-007`)

A fatal flaw in naive agent systems is conflating execution progress, bug confirmation, and artifact generation into a single "success" flag. TraceCase enforces **complete decoupling across three orthogonal dimensions of truth**:

```mermaid
flowchart LR
    subgraph D1["Dimension 1: Lifecycle State (investigations.status)"]
        S_RUN["ATTEMPT_1_RUNNING"]
        S_RST["RESETTING_TARGET"]
        S_CMP["COMPLETED"]
        S_HLT["ERROR_HALTED"]
    end

    subgraph D2["Dimension 2: Reproduction Verdict (reproduction_verdict)"]
        V_CONF["CONFIRMED_REPRODUCED (TC1)"]
        V_NONE["NOT_REPRODUCED (TC2)"]
        V_INCO["INCONSISTENT_OBSERVATIONS"]
        V_FAIL["INCONCLUSIVE_EXECUTION_FAILURE"]
    end

    subgraph D3["Dimension 3: Evidence Readiness (evidence_state)"]
        E_QUAR["QUARANTINED_RAW"]
        E_SAFE["PUBLIC_SAFE_READY"]
        E_GAP["EXPORT_FAILED / GAP"]
    end

    D1 -. "Evaluates at End of Attempt 2" .-> D2
    D1 -. "Processes Artifacts After Run" .-> D3
```

1. **Lifecycle Execution State (`status`):** Where the investigation currently resides in the workflow machine (`ATTEMPT_1_RUNNING`, `RESETTING_TARGET`, `COMPLETED`, `CANCELLED`, etc.).
2. **Reproduction Confirmation Verdict (`reproduction_verdict`):** The factual finding regarding the reported defect (`CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONSISTENT_OBSERVATIONS`, `INCONCLUSIVE_EXECUTION_FAILURE`, `PENDING`).
3. **Evidence Readiness State (`evidence_state`):** The security and sanitization posture of the evidence package (`PENDING_GENERATION`, `QUARANTINED_RAW`, `PROCESSING_REDACTION`, `PUBLIC_SAFE_READY`, `EXPORT_FAILED`).

*State Separation Axiom:* An investigation can reach `status = 'COMPLETED'`, `reproduction_verdict = 'CONFIRMED_REPRODUCED'`, and `evidence_state = 'EXPORT_FAILED'` simultaneously. The system records the confirmed bug honestly while flagging the evidence gap for administrator review.



## 5. Claim Intake, Oracles, and Assertion Vocabulary

### 5.1 Claim Intake & Provenance Tracking
Before an executable plan can be synthesized, the system must separate supplied user facts from inferred assumptions. Every claim entity carries a strict **provenance tag**:

```typescript
export type ClaimProvenance = 
  | 'USER_SUPPLIED'         // Explicitly stated in bug report text
  | 'ATTACHMENT_DERIVED'    // Extracted from user-submitted screenshot or log
  | 'TARGET_CONFIGURATION'  // Retrieved from targets table (e.g. allowedOrigins)
  | 'BROWSER_OBSERVED'      // Discovered during pre-flight page exploration
  | 'PROPOSED_ASSUMPTION';  // Synthesized by AT-ROLE-001 (requires confirmation)
```

- **Minimum Submission Baseline:** Connected target ID + raw description text.
- **Clarification Requirement:** If expected behavior or the exact failure symptom is missing, planning is blocked until the user answers up to 3 structured questions (`AT-TOOL-010`).

### 5.2 Correct Behavior vs. Reported Failure Signature
An experiment requires two distinct, non-overlapping assertion sets:
1. **Intended Correct Behavior Assertions (`CORRECT_BEHAVIOR`):** Defines what a healthy application must exhibit (e.g. `NOT_EXISTS(selector="tr:has-text('Release')")`).
2. **Reported Failure Signature Assertions (`REPORTED_FAILURE_SIGNATURE`):** Defines the exact deviation reported by the user (e.g. `EXISTS(selector="tr:has-text('Release')")` AND `NOT_EXISTS(selector="tr:has-text('Invoice')")`).

*Freezing Invariant:* Both assertion sets are computed during planning and **frozen into the cryptographic `plan_hash`**. Assertions cannot be dynamically relaxed or modified during execution.

### 5.3 Supported Assertion Vocabulary
TraceCase restricts oracles to a deterministic, typed predicate vocabulary. **Arbitrary LLM-generated JavaScript code is strictly rejected:**

| Assertion Target | Supported Condition | Required Parameters | Evaluation Source |
|---|---|---|---|
| **`DOM_ELEMENT`** | `EXISTS` / `NOT_EXISTS` | `selector: string` | Playwright Locator count |
| **`DOM_ELEMENT`** | `TEXT_CONTAINS` | `selector: string`, `expectedText: string` | Element `innerText` |
| **`DOM_ELEMENT`** | `IS_ENABLED` / `IS_DISABLED`| `selector: string` | Element ARIA / disabled state |
| **`HTTP_STATUS`** | `STATUS_CODE_EQUALS` | `urlPattern: string`, `expectedStatus: number` | Intercepted CDP Network Log |
| **`URL_PATH`** | `URL_MATCHES` | `expectedPathRegex: string` | Page `location.pathname` |
| **`API_PAYLOAD`** | `JSON_PATH_EQUALS` | `urlPattern: string`, `jsonPath: string`, `val` | Intercepted Response Body |

### 5.4 Timing, Settling, and Asynchronous UI Handling
Web applications frequently employ debounced search bars, optimistic UI state updates, and asynchronous network saves. To prevent evaluating assertions prematurely:
1. **Network Idle Settling:** The verifier awaits network idle (`networkidle`: no in-flight requests for $\ge 500\text{ms}$) before evaluating DOM state.
2. **DOM Mutation Settling:** The verifier monitors a 1,000 ms window via `MutationObserver` to ensure React/Vue rendering has finalized.
3. **Overlay Dismissal Check:** Asserts that modal backdrops and loading spinners (`[aria-busy="true"]`, `.spinner`) are absent before assertion evaluation.

---

## 6. Attempt Validity, Initial Conditions, and Target Reset

### 6.1 The Attempt Validity Rule (`VES-VER-001`)
An execution run is classified as a **Valid Attempt** if and only if all four conditions are met:
1. **Baseline Pre-Flight Validation (`TC-INV-005`):** The target responded with HTTP $<400$ prior to step 1.
2. **Scope Adherence:** All actions executed within `target.allowed_origins`; zero unhandled navigation redirects.
3. **Scenario Reached (`VES-DEF-011`):** All planned steps (1 to $N$) dispatched without fatal Playwright timeouts or unhandled modal blockers.
4. **Assertion Execution:** The verifier successfully captured the evaluation snapshot and evaluated all frozen predicates.

*Negative Clause:* An attempt aborted by a broken locator, CAPTCHA modal, or network disconnect is **INVALID**. An invalid attempt cannot be counted as a valid non-reproduction.

### 6.2 Target Fixture Reset Protocol (`TC-INV-006`)
A critical flaw in web test automation is assuming that clearing cookies or opening an incognito browser window resets backend database state. **Browser isolation is NOT backend reset.**

Between Attempt 1 and Attempt 2, TraceCase executes the strict **Target Fixture Reset Protocol**:

```mermaid
sequenceDiagram
    autonumber
    participant C as TraceCase Controller
    participant T as Target Application (Demo/Staging)
    participant DB as Target Application DB

    Note over C: Attempt 1 Complete (Data Mutated)
    C->>T: POST /api/test/reset-fixture (Header: X-TraceCase-Reset-Secret)
    T->>DB: Truncate test tables & re-seed baseline fixtures
    DB-->>T: Seed Complete
    T-->>C: HTTP 200 OK {"fixtureVersion": "seed_v1", "restored": true}
    Note over C: Invariant TC-INV-006 Satisfied
    C->>C: Spawn Fresh Ephemeral Browser Context
    C->>T: Launch Attempt 2 Execution
```

- **Hard Blocking Gate:** If `POST /api/test/reset-fixture` returns non-200 or times out, Attempt 2 is **strictly blocked**. The controller transitions to `ERROR_HALTED` with `VES-ERR-006: TARGET_RESET_FAILED`. Under no circumstances will Attempt 2 execute on dirty backend state.

---

## 7. Two-Attempt Confirmation Policy & Master Decision Table

### 7.1 The Two-Run Confirmation Rule (`VES-VER-002` / `TC-INV-002`)
To satisfy the official hackathon mandate and prevent intermittent network glitches or race conditions from masquerading as verified bugs, TraceCase requires **two distinct, valid runs**:

$$\text{Confirmation} \iff (\text{Attempt}_1 = \text{Valid} \land \text{SignatureMatched}) \land (\text{Attempt}_2 = \text{Valid} \land \text{SignatureMatched})$$

### 7.2 Master Verification Decision Table (16 Scenarios)

The following master decision table governs all final verdict assignments:

| Row | Preconditions | Attempt 1 Finding | Attempt 2 Finding | Reproduction Verdict (`D2`) | Evidence State (`D3`) | Official UI Badge | Permitted Next Action |
|---|---|---|---|---|---|---|---|
| **1** | Valid sandbox; clean reset | Failure Signature Matched | Failure Signature Matched | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY` | "Reproduced in 2 Valid Runs" (TC1) | Export safe package; review report |
| **2** | Valid sandbox; reset OK | Failure Signature Matched | Failure Signature Matched | `CONFIRMED_REPRODUCED` | `QUARANTINED_RAW` | "Confirmed (Evidence Quarantined)" | Admin reviews unredacted logs |
| **3** | Valid sandbox; reset OK | Failure Signature Matched | Failure Signature Matched | `CONFIRMED_REPRODUCED` | `EXPORT_FAILED` | "Confirmed (Video Missing)" | Re-run video packaging job |
| **4** | Valid sandbox; reset OK | Correct Behavior Observed | Correct Behavior Observed | `NOT_REPRODUCED` | `PUBLIC_SAFE_READY` | "Not Reproduced Under Test" (TC2) | Retain environment & steps; close |
| **5** | Valid sandbox; reset OK | Failure Signature Matched | Correct Behavior Observed | `INCONSISTENT_OBSERVATIONS` | `PUBLIC_SAFE_READY` | "Inconsistent (Observed Once)" | Flag intermittent bug; human review |
| **6** | Valid sandbox; reset OK | Correct Behavior Observed | Failure Signature Matched | `INCONSISTENT_OBSERVATIONS` | `PUBLIC_SAFE_READY` | "Inconsistent (Observed Once)" | Flag intermittent bug; human review |
| **7** | Valid sandbox; reset OK | Different Error Observed | Different Error Observed | `INCONSISTENT_OBSERVATIONS` | `PUBLIC_SAFE_READY` | "Unrelated Errors Observed" | Review error logs; re-plan |
| **8** | Pre-flight baseline failed | Not Executed | Not Executed | `INCONCLUSIVE_EXECUTION_FAILURE` | `PENDING_GENERATION` | "Target Offline / Baseline Failed" | Verify target reachability |
| **9** | Unsupported assertion | Not Executed | Not Executed | `INCONCLUSIVE_EXECUTION_FAILURE` | `PENDING_GENERATION` | "Unsupported Assertion Requested"| Clarify testable assertions |
| **10** | Ambiguous DOM target | Step 2 Halted | Not Executed | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` | "Ambiguous Element Locator" | Re-ground element with unique role |
| **11** | CAPTCHA / 2FA detected | Step 1 Paused | Not Executed | `PENDING` | `PENDING_GENERATION` | "Paused for Manual Login" | User completes login in browser |
| **12** | Fixture reset timed out | Failure Signature Matched | Blocked by Reset Gate | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` | "Target Fixture Reset Failed" | Check target reset endpoint |
| **13** | Non-sandbox target | Destructive Step Blocked | Not Executed | `INCONCLUSIVE_EXECUTION_FAILURE` | `PENDING_GENERATION` | "Blocked: Destructive Non-Sandbox"| Require sandbox target for deletes |
| **14** | User cancelled in Attempt 2 | Failure Signature Matched | Aborted by User | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` | "Cancelled by User" | Resources released; no confirmation |
| **15** | Token budget $\ge \$20.00$ | Step 3 Halted | Not Executed | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` | "Budget Ceiling Exhausted" | Top up API credits; resume |
| **16** | Mutation timed out | Mutating Click Timed Out| Not Executed | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` | "Halted: Uncertain Mutation" | Inspect target DB; manual recovery |

---

## 8. Deterministic Verifier Architecture

The **Deterministic Plan Assertion Verifier** (`PlanAssertionVerifier`) executes inside the persistent worker process. It evaluates concrete assertion predicates using pure TypeScript logic without passing screenshots or logs to an LLM:

```typescript
// src/worker/verifier/planAssertionVerifier.ts
import { Page } from 'playwright';
import { PlanAssertion } from '../../shared/contracts/outputContracts';

export interface AssertionEvaluationResult {
  predicateId: string;
  assertionType: 'CORRECT_BEHAVIOR' | 'REPORTED_FAILURE_SIGNATURE';
  passed: boolean;
  actualValue: unknown;
  expectedValue: unknown;
  error?: string;
}

export class PlanAssertionVerifier {
  public static async evaluateAssertions(
    page: Page,
    assertions: PlanAssertion[],
    interceptedNetworkResponses: Map<string, number>
  ): Promise<AssertionEvaluationResult[]> {
    const results: AssertionEvaluationResult[] = [];

    for (const assertion of assertions) {
      try {
        if (assertion.target === 'DOM_ELEMENT') {
          const locator = page.locator(assertion.selector!);
          const count = await locator.count();

          if (assertion.expectedCondition === 'EXISTS') {
            results.push({
              predicateId: assertion.predicateId,
              assertionType: assertion.assertionType,
              passed: count > 0,
              actualValue: count,
              expectedValue: '> 0',
            });
          } else if (assertion.expectedCondition === 'NOT_EXISTS') {
            results.push({
              predicateId: assertion.predicateId,
              assertionType: assertion.assertionType,
              passed: count === 0,
              actualValue: count,
              expectedValue: 0,
            });
          }
        } else if (assertion.target === 'HTTP_STATUS') {
          const actualStatus = interceptedNetworkResponses.get(assertion.selector!) || 0;
          results.push({
            predicateId: assertion.predicateId,
            assertionType: assertion.assertionType,
            passed: actualStatus === Number(assertion.expectedValue),
            actualValue: actualStatus,
            expectedValue: assertion.expectedValue,
          });
        }
      } catch (err: any) {
        results.push({
          predicateId: assertion.predicateId,
          assertionType: assertion.assertionType,
          passed: false,
          actualValue: 'EXCEPTION',
          expectedValue: assertion.expectedValue,
          error: err.message,
        });
      }
    }

    return results;
  }
}
```



## 9. Evidence Inventory, Sufficiency, and Lifecycle

### 9.1 The Mandatory Evidence Triad (`TC-INV-012` / `VES-EVD-001`)
To satisfy official hackathon requirements and eliminate subjective ambiguity, TraceCase mandates that every confirmed reproduction must be corroborated by three distinct, synchronized media streams:

| Evidence Stream | File Extension | Capturing Mechanism | Verification Target |
|---|---|---|---|
| **Video Recording** | `.webm` | Native Playwright CDP context video | Visual interaction, UI rendering, layout shifts, error modals |
| **Console Log** | `.log` | Page event listener (`page.on('console')`) | JavaScript runtime exceptions, React hydration errors, unhandled rejections |
| **Network Log** | `.json` | Page event listener (`page.on('response')`) | HTTP status codes, failing API endpoints, payload error responses |

*`VES-EVD-001` (Sufficiency Rule):* A reproduction claim supported solely by an AI summary, a single screenshot, or a text log without video is **INSUFFICIENT**. All three triad streams must be finalized and verified.

### 9.2 Evidence Lifecycle States
Every captured artifact transitions through a strict, auditable lifecycle:
```text
EXPECTED ──> CAPTURING ──> FINALIZING ──> STORED_RAW (RESTRICTED_RAW) ──> SANITIZING ──> PUBLIC_SAFE_READY
                                                                                 └──> EXPORT_FAILED
```

1. **`EXPECTED`:** Artifact slot registered in `artifacts` table upon investigation admission.
2. **`CAPTURING`:** Stream actively recording while Playwright worker executes steps.
3. **`FINALIZING`:** Browser context closed; file written to local worker spool.
4. **`STORED_RAW`:** Unscrubbed artifact uploaded to private S3 bucket; flagged as `RESTRICTED_RAW`.
5. **`SANITIZING`:** Secret scrubber scrubs PII, cookies, and tokens in-memory.
6. **`PUBLIC_SAFE_READY`:** Scrubbed derivative uploaded to public safe bucket; signed download URLs enabled.

---

## 10. Recording, Console, and Network Telemetry Contracts

### 10.1 Video Recording Contract (`VES-EVD-002`)
- **Codec & Container:** VP8 / VP9 encoded in `.webm` container at 24 fps, $1280 \times 720$ resolution.
- **Session Association:** One distinct video recording per attempt (`attempt_1_recording.webm`, `attempt_2_recording.webm`). Reusing video across attempts is strictly forbidden.
- **Playback Integrity Check:** The worker checks that the video file size $> 10\text{ KB}$ and verifies video duration $> 1.0\text{s}$ before marking finalized.

### 10.2 Console & Runtime Exception Capture (`VES-EVD-003`)
- **Event Listeners:** Listens to `page.on('console')` and `page.on('pageerror')`.
- **Formatting:** Each line formatted as: `[ISO_TIMESTAMP] [LEVEL] [SOURCE] MessageText`.
- **Truncation Guard:** Console logs capped at 1,000 lines or 500 KB per attempt to prevent memory exhaustion.

### 10.3 Network Telemetry & Response Interception (`VES-EVD-004`)
- **Captured Fields:** HTTP Method, Request URL (query parameters scrubbed), Response Status Code, Response Duration (ms), and Response Body (capped at 1 KB, scrubbed).
- **Static Asset Exclusion:** Requests for fonts, CSS stylesheets, and images (`.png`, `.svg`, `.woff2`) are excluded from JSON logs to minimize token bloat and focus on API mutations.

---

## 11. Evidence Integrity, Provenance, and Manifest Schema

### 11.1 SHA-256 Byte Integrity & Lineage Tracking (`VES-EVD-005`)
Upon finalization of each artifact, the worker computes a cryptographically secure **SHA-256 checksum**. Any subsequent retrieval verifies that the stored object's hash matches the database manifest:

```typescript
// src/shared/contracts/evidenceManifest.ts
import { z } from 'zod';

export const ArtifactEntrySchema = z.object({
  artifactId: z.string().uuid(),
  attemptIndex: z.union([z.literal(1), z.literal(2)]),
  artifactType: z.enum(['VIDEO', 'CONSOLE_LOG', 'NETWORK_LOG', 'SCREENSHOT', 'REPORT_MARKDOWN']),
  storageClassification: z.enum(['RESTRICTED_RAW', 'PUBLIC_SAFE']),
  fileName: z.string().max(100),
  mimeType: z.string().max(50),
  byteSize: z.number().int().positive(),
  sha256Checksum: z.string().length(64),
  captureStartedAt: z.string().datetime(),
  captureFinalizedAt: z.string().datetime(),
  sanitizationStatus: z.enum(['PENDING', 'SCRUBBED_CLEAN', 'QUARANTINED']),
});

export const EvidenceManifestSchema = z.object({
  investigationId: z.string().uuid(),
  planId: z.string().uuid(),
  planHash: z.string().length(64),
  reproductionVerdict: z.enum([
    'CONFIRMED_REPRODUCED',
    'NOT_REPRODUCED',
    'INCONSISTENT_OBSERVATIONS',
    'INCONCLUSIVE_EXECUTION_FAILURE'
  ]),
  evidenceCompletenessStatus: z.enum(['COMPLETE_TRIAD_VERIFIED', 'INCOMPLETE_MISSING_ARTIFACTS']),
  attempt1Artifacts: z.array(ArtifactEntrySchema),
  attempt2Artifacts: z.array(ArtifactEntrySchema).nullable(),
  manifestGeneratedAt: z.string().datetime(),
});
export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
```

---

## 12. Data Classification, In-Stream Sanitization, and TC4 Synthetic-Secret Verification

### 12.1 Data Classification Tier Matrix
TraceCase segregates all operational data into six security tiers:

| Tier | Category Name | Eligible Model Input? | Eligible UI Display? | Public Export? | Storage Location |
|---|---|---|---|---|---|
| **Tier 1** | Public Metadata (IDs, Hashes) | Yes | Yes | Yes | PostgreSQL `investigations` |
| **Tier 2** | User Report Text | Yes (Fenced) | Yes | Yes | PostgreSQL `bug_reports` |
| **Tier 3** | Diagnostic Excerpts (Cleaned) | Yes (Top 20 lines)| Yes | Yes | PostgreSQL JSONB columns |
| **Tier 4** | Credentials / Passwords / PII | **NO (Forbidden)** | **NO** | **NO** | Secret Vault (Encrypted) |
| **Tier 5** | `RESTRICTED_RAW` Artifacts | **NO (Forbidden)** | **NO** | **NO** | Private Encrypted S3 Bucket |
| **Tier 6** | `PUBLIC_SAFE` Derivatives | Yes | Yes | Yes | Public Safe S3 Bucket |

### 12.2 In-Stream Secret Scrubbing Engine (`TC-INV-009`)
The in-stream regex sanitizer operates directly on network and console byte streams before writing to disk or database:

```typescript
// src/worker/redaction/secretScrubber.ts
const REDACTION_PATTERNS = [
  { regex: /bearer\s+[a-zA-Z0-9_\-\.~\+\/]+=*/gi, token: '[REDACTED_BEARER_TOKEN]' },
  { regex: /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]+['"]/gi, token: '$1: "[REDACTED_SECRET]"' },
  { regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/gi, token: '[REDACTED_JWT_TOKEN]' },
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g, token: '[REDACTED_EMAIL]' },
  { regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, token: '[REDACTED_CREDIT_CARD]' },
];

export function scrubStreamText(rawText: string): string {
  let sanitized = rawText;
  for (const { regex, token } of REDACTION_PATTERNS) {
    sanitized = sanitized.replace(regex, token);
  }
  return sanitized;
}
```

### 12.3 TC4 Controlled Synthetic-Secret Verification Test
To prove compliance with **TC4 (Auth Token in Logs Redacted)**, TraceCase incorporates a dedicated automated fixture test:

```typescript
// tests/integration/tc4_redaction.test.ts
import { describe, it, expect } from 'vitest';
import { scrubStreamText } from '../../src/worker/redaction/secretScrubber';

describe('Official Case TC4: Synthetic-Secret In-Stream Sanitization', () => {
  it('should scrub high-entropy bearer tokens from console logs and exports', () => {
    const rawConsoleMessage = 
      'Console Error: Request failed with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.s64_token_payload';

    const scrubbed = scrubStreamText(rawConsoleMessage);

    // Assert that the raw secret is nowhere in the output
    expect(scrubbed).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(scrubbed).not.toContain('s64_token_payload');

    // Assert that the explicit redaction token is present
    expect(scrubbed).toContain('[REDACTED_BEARER_TOKEN]');
  });
});
```

---

## 13. Publication, Access, and Export Policy

### 13.1 Pre-Signed Download URLs (`VES-PUB-001` / `VES-PUB-004`)
- **Endpoint:** `GET /api/v1/artifacts/:id/download`.
- **`VES-PUB-004` (Organization Tenant Scope):** Caller must belong to the organization owning the investigation. Cross-tenant access returns `404 Not Found`.
- **Classification Check:** The artifact must have `storage_classification = 'PUBLIC_SAFE'`.
- **`VES-PUB-002` (Quarantine Isolation Gate):** If the artifact is classified as `RESTRICTED_RAW`, the API strictly returns **`403 Forbidden: ARTIFACT_QUARANTINED`** (`VES-SAFE-004`).
- **`VES-PUB-001` (Expiration Window):** Pre-signed URLs are valid for **15 minutes**.

### 13.2 Standalone Sanitized Evidence ZIP Export (`VES-PUB-003`)
When a user clicks "Export Investigation Package", the server bundles:
1. `attempt_1_recording.webm` & `attempt_2_recording.webm` (Watermarked, scrubbed).
2. `attempt_1_console.log` & `attempt_2_console.log` (Scrubbed plain text).
3. `attempt_1_network.json` & `attempt_2_network.json` (Scrubbed JSON).
4. `verification_manifest.json` (Cryptographic hashes and assertion results).
5. `reproduction_report.html` (Offline interactive viewer with embedded video and log players).

*`VES-PUB-003` (Zero Raw Leak Guarantee):* The ZIP packaging worker queries exclusively from the `PUBLIC_SAFE` MinIO bucket.



## 14. Human Approval and Sandbox Safety Policy

### 14.1 Cryptographic Plan Hash Binding (`TC-INV-003` / `TC-INV-004`)
TraceCase enforces cryptographic plan binding to guarantee that no browser action executes without human sign-off on the exact sequence of steps:

```typescript
export function computeCanonicalPlanHash(plan: ExperimentPlan): string {
  // Canonical serialization: sorted keys, stripped whitespace
  const canonicalString = JSON.stringify({
    planRevision: plan.planRevision,
    requiredRole: plan.requiredRole,
    preconditions: plan.preconditions.sort(),
    steps: plan.steps.map(s => ({
      stepNumber: s.stepNumber,
      actionType: s.actionType,
      targetRole: s.targetRole || '',
      targetAccessibleName: s.targetAccessibleName || '',
      inputValue: s.inputValue || '',
      isDestructive: s.isDestructive,
    })),
    correctBehaviorAssertions: plan.correctBehaviorAssertions.sort((a, b) => a.predicateId.localeCompare(b.predicateId)),
    reportedFailureAssertions: plan.reportedFailureAssertions.sort((a, b) => a.predicateId.localeCompare(b.predicateId)),
  });

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}
```

- **Revocation Rule (`TC-INV-004`):** Any edit to the report, steps, or assertions increments `planRevision`, generates a new `plan_hash`, and **immediately invalidates all prior approvals** (`is_revoked = true`).

### 14.2 Sandbox Enforcement Guardrail (`TC-INV-008` / TC3)
To prevent devastating data loss on connected production or shared staging environments:
- **Destructive Action Gate:** Any step containing `isDestructive: true` (e.g. clicking "Delete Task", submitting "Purge Records") triggers an automatic database check: `SELECT is_sandbox FROM targets WHERE id = $1`.
- **Enforcement:** If `is_sandbox = false`, the admission controller rejects investigation execution with **`403 Forbidden: SANDBOX_VIOLATION`** (`VES-SAFE-001`). Destructive actions are strictly confined to disposable sandboxes.

---

## 15. Action-Risk Classification and Policy Rules

Every proposed browser interaction is classified into a strict risk tier before dispatch:

| Risk Tier | Action Type | Example Operation | Idempotent? | Precondition & Scope Guard |
|---|---|---|---|---|
| **Tier 0: Safe Read** | `OBSERVE`, `SNAPSHOT` | Capturing live AXTree | Yes | Active single-use observation window |
| **Tier 1: Scoped Nav** | `NAVIGATE` | Opening `/tasks?filter=active` | Yes | URL must match `target.allowed_origins` |
| **Tier 2: Benign Input** | `FILL`, `SELECT` | Typing search query or filter | Yes | Input text capped; no secrets or tokens |
| **Tier 3: Mutating Submit** | `CLICK` (Submit/Add) | Clicking "Create New Task" | **NO** | Active plan step approval verified |
| **Tier 4: Destructive Mutation**| `CLICK` (Delete/Purge)| Clicking "Trash Item" (TC3) | **NO** | `target.is_sandbox = TRUE` strictly required |
| **Tier 5: Privileged Reset** | `POST /reset-fixture`| Restoring baseline seed | Yes | Internal token authentication; target adapter |

---

## 16. Retry, Cancellation, and Mutation Uncertainty

### 16.1 The Mutation Uncertainty Invariant (`TC-INV-013` / `AT-POL-001`)
When an effectful browser action (e.g. clicking "Confirm Delete") times out after 5,000 ms, **the target server may have received and processed the mutation even though the browser never received the HTTP response**:

```mermaid
flowchart TD
    Timeout["Mutating Action Times Out (>5,000ms)"] --> CheckMutating{"Action is Mutating?<br/>(Tier 3 or 4)"}
    CheckMutating -- No (Idempotent) --> SafeRetry["Safe to Re-dispatch Action (Max 1)"]
    CheckMutating -- Yes --> Halt["Halt Dispatch Immediately!<br/>Invariant TC-INV-013"]
    Halt --> StateUncertain["Transition Status: MUTATION_UNCERTAIN"]
    StateUncertain --> Readback["Worker Captures Fresh AXTree Readback"]
    Readback --> EvaluateReadback{"Did mutation take effect?<br/>(e.g. Task absent?)"}
    EvaluateReadback -- Yes --> Resume["Resume Normal Execution"]
    EvaluateReadback -- No / Ambiguous --> HaltFatal["Halt: ERROR_HALTED<br/>User Review Required"]
```

- **Zero Blind Retries:** The worker **never** blindly clicks the button a second time.
- **Readback Inspection:** Captures a fresh AXTree snapshot to inspect if the UI updated.
- **Escalation:** If indeterminate, transitions to `MUTATION_UNCERTAIN` and requires user confirmation.

### 16.2 Graceful Cancellation Handling
When a user clicks "Abort" in the UI:
1. Controller broadcasts `EVT-020: investigation.cancelled` to outbox.
2. Worker receives `AbortSignal` and terminates the Playwright context immediately.
3. Partial video recordings and logs are spooled and uploaded to MinIO to preserve diagnostic history.
4. Investigation status transitions to `CANCELLED`.
5. The worker lease is cleared to allow subsequent queued jobs to proceed.

---

## 17. Safety Incidents, Containment, and Escalation

### 17.1 Safety Incident Taxonomy (`VES-ERR-001` – `VES-ERR-008`)
TraceCase implements automated circuit breakers for eight critical safety failure modes:

1. **`VES-ERR-001` (Out-of-Scope Navigation Attempt):** If a step attempts navigation to an unapproved external domain (e.g. `https://evil.com`), the policy enforcer intercepts the call, cancels navigation, and transitions status to `BLOCKED`.
2. **`VES-ERR-002` (Unauthorized Deletion on Non-Sandbox):** If a plan contains destructive actions against a target with `is_sandbox = false`, execution admission is blocked.
3. **`VES-ERR-003` (Unredacted Secret Leak in Artifact Pipeline):** If the secret scrubber detects an unhandled high-entropy token in the public artifact pipeline, the artifact is immediately locked in `QUARANTINED_RAW` and barred from export.
4. **`VES-ERR-004` (Browser Daemon Crash / Hang):** If Playwright fails to respond to heartbeats for 30 seconds, the controller forcibly terminates the orphaned process, invalidates the lease, and transitions status to `ERROR_HALTED`.
5. **`VES-ERR-005` (Mutation Uncertain Timeout):** Mutating action timed out without proof of target state; transitions to `MUTATION_UNCERTAIN` (`TC-INV-013`).
6. **`VES-ERR-006` (Target Reset Failed):** `POST /api/test/reset-fixture` failed or timed out; blocks Attempt 2 execution (`TC-INV-006`).
7. **`VES-ERR-007` (Budget Ceiling Exhausted):** Cumulative OpenAI API usage reached $20.00 ceiling (`TC-INV-005`).
8. **`VES-ERR-008` (Corrupted Evidence Artifact):** Finalized video or log fails checksum or playback verification; flags evidence gap.

---

## 18. Budget, Quota, and Resource Safety

TraceCase operates under an authoritatively metered **US$20.00 credit ceiling** (`TC-INV-005`):

```typescript
export class BudgetEnforcer {
  public static async assertBudgetAvailable(investigationId: string): Promise<void> {
    const totalSpendUsd = await getCumulativeSpendUsd();

    if (totalSpendUsd >= 20.00) {
      throw new BudgetExhaustedError('US$20.00 budget ceiling reached. All AI inference halted.');
    } else if (totalSpendUsd >= 18.00) {
      // Level 2 Slowdown: Disable multi-turn clarification
      logger.warn('Approaching budget limit (spend >= $18.00). Entering single-shot mode.');
    }
  }
}
```

- **Hard Blocking Action:** The moment total estimated spend reaches $$20.00$, the backend intercepts all calls to the OpenAI SDK and throws `API-ERR-011: BUDGET_CEILING_EXHAUSTED`.
- **No Degradation of Truth:** Running out of budget **never** causes the verifier to fabricate confirmation or lower evidence completeness requirements. The run is truthfully recorded as `INCONCLUSIVE_EXECUTION_FAILURE`.



## 19. UI Truthfulness and Qualified Reporting Language

TraceCase strictly enforces factual precision in its user-facing UI language. Subjective, misleading, or overpromising claims are barred by system contracts:

| User Interface Status | Permitted Language | Prohibited Misleading Claims |
|---|---|---|
| **Two Matches Confirmed** | "Bug reproduced across 2 independent runs with matching failure signature." | "Bug 100% verified everywhere", "Your app has a critical flaw" |
| **Clean Non-Reproduction** | "The reported failure was not observed under the tested baseline conditions." | "Bug does not exist", "Your app is completely bug-free" |
| **Inconsistent Results** | "Failure signature observed in Attempt 1 but not Attempt 2 (Intermittent)." | "Bug intermittently confirmed" |
| **Missing Evidence Triad** | "Reproduction observed twice; evidence package incomplete (Video missing)." | "Verified evidence ready for download" |
| **Diagnostic Hypothesis** | "Hypothesis: React key mapping offset error (UNVERIFIED_HYPOTHESIS)." | "Root cause identified in component line 42" |

---

## 20. Optional Diagnostic Guidance and Regression-Test Export

### 20.1 Diagnostic Hypotheses Qualification
When `AT-ROLE-003` generates technical diagnostic insights:
- Must contain an explicit boolean guard: `"isVerifiedFact": false`.
- Must quote literal console error messages captured during execution.
- **Strict Prohibition:** Cannot invent backend repository file paths, class names, or source code line numbers unless they appear verbatim in the stack trace.

### 20.2 Executable Playwright Regression-Test Export
To support engineering teams, TraceCase can export a standalone, executable Playwright test script:
1. **Target Isolation:** Uses environment variable `TARGET_BASE_URL` instead of hardcoding production URLs.
2. **Credential Safety:** Uses synthetic placeholder variables (`process.env.TEST_USER_NAME`); never embeds real API tokens.
3. **Dual Assertions:** Asserts intended correct behavior; test fails if the bug is still present.

---

## 21. Official-Case Verification Walkthroughs (TC1–TC4)

### TC1: Bug Reproduced Twice (Official Baseline)
- **Source Requirement:** PS-REQ-006, PS-REQ-010.
- **Preconditions:** Connected target registered as sandbox (`is_sandbox = true`); baseline HTTP 200 validated.
- **Attempt 1:** Playwright dispatches steps 1–3. Evaluator detects task 'Release' present after delete $\to$ `matchingFailureObserved = true`. Triad streams captured.
- **Reset Gate:** Controller executes `POST /api/test/reset-fixture` $\to$ HTTP 200 OK receipt.
- **Attempt 2:** Fresh Playwright context dispatches steps 1–3. Evaluator detects task 'Release' present after delete $\to$ `matchingFailureObserved = true`. Triad streams captured.
- **Verdict & Evidence:** Invariant `TC-INV-002` satisfied. Controller sets `reproduction_verdict = 'CONFIRMED_REPRODUCED'`. Triad artifacts scrubbed and uploaded to `PUBLIC_SAFE`.
- **Pass Definition:** Both attempts valid; both match signature; video, console, network streams verified.

### TC2: Cannot Reproduce
- **Source Requirement:** PS-REQ-007.
- **Preconditions:** Target reachable; approved plan executed.
- **Execution:** Both Attempt 1 and Attempt 2 complete without runtime error. Task disappears from DOM; success toast appears.
- **Verification:** Expected behavior assertions `PASS`; failure signature assertions `FAIL`.
- **Verdict:** `reproduction_verdict = 'NOT_REPRODUCED'`. UI presents attempted steps, environment baseline, and video showing clean execution.

### TC3: Deletion Involved (Sandbox Guardrail)
- **Source Requirement:** PS-REQ-008.
- **Preconditions:** Plan includes destructive action (`isDestructive: true`).
- **Enforcement:**
  - *Branch A (Sandbox Target):* Target has `is_sandbox = true`. Admission granted. Actions execute safely. Fixture reset restores deleted records between attempts.
  - *Branch B (Production Target):* Target has `is_sandbox = false`. Admission strictly rejected with `403 Forbidden: SANDBOX_VIOLATION`. Zero destructive actions dispatched.

### TC4: Auth Token in Logs (In-Stream Redaction)
- **Source Requirement:** PS-REQ-009.
- **Preconditions:** Target console emits Bearer token in response headers.
- **Sanitization:** In-stream secret scrubber matches token; replaces with `[REDACTED_BEARER_TOKEN]`.
- **Quarantine:** Raw trace saved to private `RESTRICTED_RAW` bucket. Scrubbed log saved to `PUBLIC_SAFE` bucket.
- **Verification:** Public artifact and export bundle contain zero raw secret tokens.

---

## 22. Labelled Reference Example (Filter & Delete Task B)

The following hypothetical walkthrough illustrates the complete verification flow:
- **Baseline Tasks:**
  - Task A: "Invoice", Status: Completed
  - Task B: "Release", Status: Active
- **Approved Steps:**
  1. `NAVIGATE /tasks`
  2. `CLICK button[name="Active"]`
  3. `CLICK button[name="Trash Item"]` (for Task B, `isDestructive: true`)
- **Assertions:**
  - `CORRECT_BEHAVIOR`: Task B `NOT_EXISTS`, Task A `EXISTS`.
  - `REPORTED_FAILURE_SIGNATURE`: Task B `EXISTS`, Task A `NOT_EXISTS`.
- **Execution Run:** Task A disappears from the database while Task B remains visible.
- **Evaluation:** Failure signature is satisfied on Attempt 1. Target reset restores Tasks A and B. Attempt 2 repeats the failure.
- **Verdict:** `CONFIRMED_REPRODUCED`.

---

## 23. Acceptance Strategy & Ground-Truth Test Matrix

To prevent regressions in the verification engine, TraceCase validates its verifier against **16 deterministic ground-truth test fixtures**:

| Fixture ID | Category | Simulated Target Behavior | Expected Reproduction Verdict | Expected Evidence State |
|---|---|---|---|---|
| **GT-001** | Positive (TC1) | Defect consistently reproduces on runs 1 & 2 | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY` |
| **GT-002** | Negative (TC2) | Healthy target; assertions pass without error | `NOT_REPRODUCED` | `PUBLIC_SAFE_READY` |
| **GT-003** | Intermittent | Fails run 1, passes run 2 | `INCONSISTENT_OBSERVATIONS` | `PUBLIC_SAFE_READY` |
| **GT-004** | Security (TC3) | Destructive action against non-sandbox | `INCONCLUSIVE_EXECUTION_FAILURE` | `PENDING_GENERATION` |
| **GT-005** | Security (TC4) | Target logs emit JWT and Bearer tokens | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY` (Scrubbed) |
| **GT-006** | Fault Injection| Target offline (HTTP 503) at baseline | `INCONCLUSIVE_EXECUTION_FAILURE` | `PENDING_GENERATION` |
| **GT-007** | Fault Injection| Target fixture reset fails with HTTP 500 | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` |
| **GT-008** | Fault Injection| Mutating click times out (>5,000ms) | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` |
| **GT-009** | Fault Injection| Video recorder crashes mid-session | `CONFIRMED_REPRODUCED` | `EXPORT_FAILED` (Gap Flagged) |
| **GT-010** | Adversarial | Page DOM embeds prompt injection | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY` |
| **GT-011** | Adversarial | Client attempts to forge `approved: true` | `INCONCLUSIVE_EXECUTION_FAILURE` | `PENDING_GENERATION` |
| **GT-012** | Budget Test | Token spend exceeds $20.00 ceiling | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` |
| **GT-013** | Ambiguity | Multiple elements match identical selector | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` |
| **GT-014** | Auth Test | Target triggers unexpected CAPTCHA dialog | `PENDING` (Paused for User) | `PENDING_GENERATION` |
| **GT-015** | Cancellation | User cancels investigation during run 2 | `INCONCLUSIVE_EXECUTION_FAILURE` | `PUBLIC_SAFE_READY` |
| **GT-016** | Concurrency | Second investigation attempts concurrent run| `QUEUED` (Lease Respected) | `PENDING_GENERATION` |

---

## 24. Metrics & Evaluation Methodology

TraceCase tracks four core evaluation metrics across all test executions:

1. **Confirmation Precision ($P_c$):**
   $$P_c = \frac{\text{True Confirmed Reproductions}}{\text{True Confirmed Reproductions} + \text{False Confirmations}} \times 100\%$$
   *Target: 100% (Guaranteed by two-run confirmation rule `TC-INV-002` and deterministic verifier).*

2. **False Confirmation Rate ($FCR$):**
   $$FCR = \frac{\text{False Confirmations}}{\text{Total Confirmed Assertions}} \times 100\% \equiv 0\%$$

3. **Two-Run Reproduction Success Rate ($R_2$):**
   $$R_2 = \frac{\text{Reproductions Valid Across Run 1 and Run 2}}{\text{Total Verified Investigations}} \times 100\%$$

4. **Evidence Completeness Index ($ECI$):**
   $$ECI = \frac{\text{Investigations with Complete Verified Triad (Video + Console + Network)}}{\text{Total Completed Investigations}} \times 100\%$$



## 25. Architectural Diagrams

### Diagram 1: Claim-to-Oracle-to-Observation-to-Conclusion Flow
```mermaid
flowchart TD
    Report["Raw Bug Report Text & Attachment"] --> Intake["Claim Intake & Provenance Tagging"]
    Intake --> Planner["AT-ROLE-001 Synthesizes ExperimentPlan"]
    Planner --> Assertions["Frozen Assertions: Correct Behavior vs Failure Signature"]
    Assertions --> Approval{"Human Approval (plan_hash lock)"}
    Approval -- Approved --> Worker["Playwright Worker Executes Steps"]
    Worker --> Observations["Capture Raw AXTree, Console, Network Streams"]
    Observations --> Verifier["Deterministic PlanAssertionVerifier"]
    Verifier --> DualGate{"Both Attempts Match Signature?"}
    DualGate -- Yes --> Confirmed["reproduction_verdict = CONFIRMED_REPRODUCED"]
    DualGate -- No --> NotRepro["reproduction_verdict = NOT_REPRODUCED / INCONSISTENT"]
```

### Diagram 2: Two-Attempt Verification and Target Reset Sequence
```mermaid
sequenceDiagram
    autonumber
    participant C as Controller
    participant W as Playwright Worker
    participant T as Target Web App
    participant V as Deterministic Verifier

    C->>W: Launch Attempt 1
    W->>T: Execute Approved Steps 1..N
    W-->>V: Raw Page Snapshot & Network Responses
    V-->>C: Attempt 1 Result: Failure Signature Matched
    Note over C,T: Invariant TC-INV-006: Target Reset Gate
    C->>T: POST /api/test/reset-fixture
    T-->>C: HTTP 200 OK (Baseline Restored)
    C->>W: Launch Attempt 2 (Fresh Context)
    W->>T: Execute Approved Steps 1..N
    W-->>V: Raw Page Snapshot & Network Responses
    V-->>C: Attempt 2 Result: Failure Signature Matched
    Note over C: Invariant TC-INV-002 Satisfied
    C->>C: Set reproduction_verdict = 'CONFIRMED_REPRODUCED'
```

### Diagram 3: Outcome vs. Evidence-Readiness Decision Flow
```mermaid
flowchart TD
    AttemptsDone["Attempt 1 & Attempt 2 Completed"] --> EvalDual{"Both runs matched<br/>failure signature?"}
    EvalDual -- Yes --> SetVerdictConf["reproduction_verdict =<br/>CONFIRMED_REPRODUCED"]
    EvalDual -- No --> SetVerdictNon["reproduction_verdict =<br/>NOT_REPRODUCED / INCONSISTENT"]

    AttemptsDone --> CheckTriad{"All 3 Triad Artifacts<br/>(Video, Console, Network)<br/>Finalized & Non-Empty?"}
    CheckTriad -- No --> StateGap["evidence_state =<br/>EXPORT_FAILED (Gap Flagged)"]
    CheckTriad -- Yes --> CheckSanitization{"In-Stream Secret Scrubber<br/>Completed Cleanly?"}
    CheckSanitization -- No --> StateQuar["evidence_state =<br/>QUARANTINED_RAW"]
    CheckSanitization -- Yes --> StateSafe["evidence_state =<br/>PUBLIC_SAFE_READY"]
```

### Diagram 4: Evidence Capture and Finalization Pipeline
```mermaid
sequenceDiagram
    autonumber
    participant P as Playwright Context
    participant FS as Local Worker Spool
    participant S as In-Stream Scrubber
    participant S3 as MinIO / S3 Storage
    participant DB as PostgreSQL Database

    P->>P: Start Context Video & CDP Listeners
    Note over P: Execute Steps...
    P->>FS: Close Context & Flush Streams to Spool
    FS->>DB: Compute SHA-256 Checksums
    FS->>S3: Upload Raw Streams to RESTRICTED_RAW Bucket
    FS->>S: Pipe Console & Network Text to In-Stream Scrubber
    S->>S3: Upload Scrubbed Streams to PUBLIC_SAFE Bucket
    S3->>DB: Update artifacts Table (Status: PUBLIC_SAFE_READY)
```

### Diagram 5: Sanitization, Restricted Original, and Safe Derivative Flow
```mermaid
flowchart LR
    RawStream["Raw CDP Logs & Headers"] --> Scrubber{"Regex Secret Scrubber<br/>(Bearer, JWT, Passwords)"}
    RawStream --> RawStorage[("MinIO Encrypted Bucket<br/>RESTRICTED_RAW")]
    Scrubber --> ScrubbedStream["Scrubbed Logs & Excerpts"]
    ScrubbedStream --> SafeStorage[("MinIO Public Safe Bucket<br/>PUBLIC_SAFE")]
    
    SafeStorage --> API["GET /api/v1/artifacts/:id/download"]
    RawStorage -. "Direct Download Forbidden" .-> Blocked["403 Forbidden: QUARANTINED"]
    API --> UI["Web UI Player & ZIP Export"]
```

### Diagram 6: Approval, Policy Wrapper, and Execution Boundary
```mermaid
flowchart TD
    Agent["AI Browser Agent (AT-ROLE-002)"] --> Proposal["BrowserActionProposal (JSON AST)"]
    Proposal --> Wrapper{"ToolPolicyEnforcer<br/>(16-Step Pipeline)"}
    Wrapper -- "Invalid Schema" --> RePrompt["Self-Correction Re-Prompt (Max 1)"]
    Wrapper -- "plan_hash Mismatch" --> Revoke["Revoke Approval -> AWAITING_APPROVAL"]
    Wrapper -- "Out-of-Scope Domain" --> HaltScope["Halt -> State: BLOCKED"]
    Wrapper -- "Destructive on Non-Sandbox" --> HaltSandbox["Halt -> State: BLOCKED"]
    Wrapper -- "All 16 Checks Passed" --> Playwright["Playwright Dispatches Action"]
```

### Diagram 7: Uncertain-Mutation Recovery Sequence
```mermaid
sequenceDiagram
    autonumber
    participant W as Playwright Worker
    participant T as Target App
    participant C as Controller
    participant DB as PostgreSQL DB

    W->>T: Dispatch Mutating Click (Delete Task)
    Note over W,T: Target Server Lag (>5,000ms)
    W-->>C: Playwright TimeoutError
    Note over C: Invariant TC-INV-013 Triggered
    C->>DB: Set status = 'MUTATION_UNCERTAIN'
    C->>W: Capture Fresh AXTree Readback Snapshot
    W->>T: Query Current Elements
    T-->>W: Return AXTree Nodes
    alt Task Successfully Deleted in UI
        C->>DB: Log Mutation Verified via Readback; Resume
    else Task Still Present or Ambiguous
        C->>DB: Set status = 'ERROR_HALTED'
        C-->>W: Halt Investigation for User Confirmation
    end
```

### Diagram 8: Artifact Access and Export Authorization
```mermaid
flowchart TD
    User["Authenticated User (JWT)"] --> Request["GET /api/v1/artifacts/:id/download"]
    Request --> CheckOrg{"Does User belong to<br/>Investigation org_id?"}
    CheckOrg -- No --> NotFound["404 Not Found (Disclosure Shield)"]
    CheckOrg -- Yes --> CheckClass{"storage_classification ==<br/>'PUBLIC_SAFE'?"}
    CheckClass -- No (RESTRICTED_RAW) --> Forbidden["403 Forbidden (ARTIFACT_QUARANTINED)"]
    CheckClass -- Yes --> GenerateSigned["Generate 15-Minute Presigned S3 URL"]
    GenerateSigned --> S3Download["Direct Download from MinIO Safe Bucket"]
```

### Diagram 9: Safety-Incident Containment Circuit Breaker
```mermaid
stateDiagram-v2
    [*] --> RUNNING: Execution Active
    RUNNING --> PAUSED_AUTH: CAPTCHA / 2FA Detected (TC-INV-010)
    PAUSED_AUTH --> RUNNING: User Solves Barrier & Clicks Resume
    RUNNING --> BLOCKED_SCOPE: Target Redirect Outside allowed_origins
    RUNNING --> BLOCKED_SANDBOX: Destructive Action on Non-Sandbox Target
    RUNNING --> MUTATION_UNCERTAIN: Mutating Action Times Out (TC-INV-013)
    MUTATION_UNCERTAIN --> ERROR_HALTED: Readback Ambiguous
    BLOCKED_SCOPE --> [*]
    BLOCKED_SANDBOX --> [*]
    ERROR_HALTED --> [*]
```

---

## 26. Traceability Matrix & Identifier Registry

### 26.1 Mapping Requirements to Verification Rules & Acceptance Scenarios

| Official Requirement | TraceCase Requirement | Verification / Safety Rule | Verification Guard | Acceptance Scenario | Required Proof Artifact |
|---|---|---|---|---|---|
| **PS-REQ-001** (Interpret Report) | `TC-FR-001` | `VES-DEF-001` / `VES-DEF-014` | Provenance Tagging | `VES-SCN-001` | Extracted Claim JSON |
| **PS-REQ-002** (Clarify Details) | `TC-FR-002` | `VES-DEF-006` / `AT-TOOL-010` | Max 3 Multiple-Choice Qs | `VES-SCN-002` | Clarification Thread Record |
| **PS-REQ-003** (Plan Reproduction) | `TC-FR-003` | `VES-DEF-005` / `VES-VER-001` | Frozen Assertion Signatures| `VES-SCN-003` | Canonical SHA-256 Plan Hash |
| **PS-REQ-004** (Action Approval) | `TC-FR-004` | `VES-SAFE-001` / `TC-INV-003` | Cryptographic Sign-Off | `VES-SCN-004` | `plan_approvals` Record |
| **PS-REQ-005** (Browser Execution) | `TC-FR-005` | `VES-SAFE-002` / `TC-INV-011` | Single Concurrency Lease | `VES-SCN-005` | Playwright Action Logs |
| **PS-REQ-006** (Two-Run Confirm) | `TC-FR-006` | `VES-VER-002` / `TC-INV-002` | Deterministic Verifier Gate| `VES-SCN-006` (TC1) | Dual-Run Verification Records |
| **PS-REQ-007** (Negative Run Handling)| `TC-FR-007` | `VES-DEF-018` / `TC-INV-007` | Qualified Non-Reproduction | `VES-SCN-007` (TC2) | Full Step Logs & Video |
| **PS-REQ-008** (Sandbox Protection) | `TC-FR-008` | `VES-SAFE-001` / `TC-INV-008` | Sandbox DB Boolean Check | `VES-SCN-008` (TC3) | Fixture Reset Receipt |
| **PS-REQ-009** (In-Stream Redaction) | `TC-FR-009` | `VES-SAFE-003` / `TC-INV-009` | In-Stream Regex Scrubber | `VES-SCN-009` (TC4) | Scrubbed Logs (No Raw Token)|
| **PS-REQ-010** (Evidence Triad) | `TC-FR-010` | `VES-DEF-022` / `TC-INV-012` | Video, Console, Network | `VES-SCN-010` | Evidence Manifest Record |

---

## 27. Open Decisions and Implementation Handoff

### 27.1 Team Responsibility Division (3-Person Architecture)
- **Team Member 1 (Lead Systems Engineer):**
  - Owns Deterministic Verifier (`PlanAssertionVerifier`), Playwright worker context management, `ToolPolicyEnforcer` interceptor, and Target Fixture Reset client.
- **Team Member 2 (AI Engineer):**
  - Owns OpenAI client adapter (`gpt-6-luna`), Zod response parser, prompt engineering, and AXTree pruning algorithm.
- **Team Member 3 (UI / Frontend Engineer):**
  - Owns Next.js 15 client dashboard, SSE stream connection, clarification modal, approval hash modal, and synchronized Evidence Triad media player.

### 27.2 Open Decisions & Research Questions
- **`VES-DEC-001` (Settling Timeout):** Default settling timeout set to 1,000 ms of DOM mutation silence and 500 ms of network idle.
- **`VES-DEC-002` (Video Container):** Capped at 24 fps VP8 in `.webm` container for broad browser playback compatibility.
- **`VES-DEC-003` (Artifact Retention):** `PUBLIC_SAFE` artifacts retained for 30 days; `RESTRICTED_RAW` artifacts permanently deleted after 72 hours.
- **`VES-OQ-001` (OCR-Based Visual Verification):** Automated OCR verification for canvas-based elements deferred to v1.1.0; v1.0.0 relies strictly on ARIA accessibility trees and DOM text.

---

## 28. Validation Checklist & Sign-Off

- [x] **Model Restriction:** Exclusively uses `gpt-6-luna` via official OpenAI API (`TC-INV-001`). Zero silent fallback.
- [x] **Independent Verification Boundary:** Verifier executes deterministic TypeScript code; model opinion cannot set verdicts (`TC-INV-014`).
- [x] **Decoupled 3D States:** Execution state $\neq$ Reproduction verdict $\neq$ Evidence readiness (`TC-INV-007`).
- [x] **Official Test Cases:** Explicitly covers TC1 (Dual-run match), TC2 (Clean non-reproduction), TC3 (Sandbox deletion), and TC4 (In-stream redaction).
- [x] **Mandatory Evidence Triad:** Reproduction validity requires Video, Console, and Network logs (`TC-INV-012`).
- [x] **Target Fixture Reset:** Attempt 2 strictly blocked until backend fixture reset confirms HTTP 200 restoration (`TC-INV-006`).
- [x] **Diagram Consistency:** All 9 required Mermaid diagrams integrated and verified against schema names.

---
*End of Verification, Evidence, and Safety Specification — TraceCase (TC-VES-001)*
