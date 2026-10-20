# TraceCase — Test, Evaluation, Operations, and Execution Plan

**Document ID:** TC-TEO-001  
**Document Purpose:** Unified Delivery Specification Covering Test & Evaluation, Deployment & Operations Runbook, and Work Breakdown & Ownership  
**Version:** 1.0.0-draft  
**Date:** 20 October 2026  
**Status:** Draft for Review (Requires technical delivery lead and team sign-off before execution)  
**Authoring Role:** Technical Delivery, Quality, and Operations Lead (Antigravity Agent)  
**Intended Readers:** Lead / Integrator, AI & Evaluation Engineer, UI & Evidence Engineer, Security Auditors, Hackathon Evaluators.

---

## Table of Contents

- [Shared Front Matter and Source Register](#shared-front-matter-and-source-register)
  - [1. Executive Purpose and System Scope](#1-executive-purpose-and-system-scope)
  - [2. Source and Implementation Inventory](#2-source-and-implementation-inventory)
  - [3. Implementation Boundary Status Table](#3-implementation-boundary-status-table)
  - [4. Shared Invariants and Tri-Dimensional Truth](#4-shared-invariants-and-tri-dimensional-truth)
  - [5. Structural Alignment of the Three Parts](#5-structural-alignment-of-the-three-parts)
- [PART I — TEST AND EVALUATION PLAN](#part-i--test-and-evaluation-plan)
  - [6. Test Objectives and Evaluation Scope](#6-test-objectives-and-evaluation-scope)
  - [7. Test Level Architecture & Responsibility Boundaries](#7-test-level-architecture--responsibility-boundaries)
  - [8. Ground Truth Design & Defect Seeding](#8-ground-truth-design--defect-seeding)
  - [9. Evaluation Corpus & Target Fixture Register](#9-evaluation-corpus--target-fixture-register)
  - [10. Official Scenario Specifications (TC1–TC4)](#10-official-scenario-specifications-tc1tc4)
  - [11. Internal Correctness Test Matrix](#11-internal-correctness-test-matrix)
  - [12. AI-Role Evaluation Framework](#12-ai-role-evaluation-framework)
  - [13. Tool-Policy and Permission Boundary Evaluation](#13-tool-policy-and-permission-boundary-evaluation)
  - [14. Recovery and Fault-Injection Testing](#14-recovery-and-fault-injection-testing)
  - [15. Evaluation Metrics & Calculation Rules](#15-evaluation-metrics--calculation-rules)
  - [16. Quality Acceptance Gates (Gates 0–7)](#16-quality-acceptance-gates-gates-07)
  - [17. Test & Bug Record Reporting Templates](#17-test--bug-record-reporting-templates)
- [PART II — DEPLOYMENT AND OPERATIONS RUNBOOK](#part-ii--deployment-and-operations-runbook)
  - [18. Deployment Topology & Container Architecture](#18-deployment-topology--container-architecture)
  - [19. Environment Inventory & Staging Targets](#19-environment-inventory--staging-targets)
  - [20. Runtime Prerequisites & System Compatibility](#20-runtime-prerequisites--system-compatibility)
  - [21. Configuration & Environment-Variable Register](#21-configuration--environment-variable-register)
  - [22. Secret Management & Credential Lifecycle](#22-secret-management--credential-lifecycle)
  - [23. Local Bootstrap & Developer Setup Procedure](#23-local-bootstrap--developer-setup-procedure)
  - [24. Production Release & Deployment Procedure](#24-production-release--deployment-procedure)
  - [25. Database Migration & Schema Release Policy](#25-database-migration--schema-release-policy)
  - [26. Worker Daemon Lifecycle & Playwright Management](#26-worker-daemon-lifecycle--playwright-management)
  - [27. Health Checks, Readiness Probes & Monitoring](#27-health-checks-readiness-probes--monitoring)
  - [28. Cost, Token Metering, and Quota Operations](#28-cost-token-metering-and-quota-operations)
  - [29. Storage, Evidence, and Export Operations](#29-storage-evidence-and-export-operations)
  - [30. Target Onboarding & Fixture Reset Verification](#30-target-onboarding--fixture-reset-verification)
  - [31. Backup, Disaster Recovery, and Retention](#31-backup-disaster-recovery-and-retention)
  - [32. Operational Incident Playbooks (18 Scenarios)](#32-operational-incident-playbooks-18-scenarios)
  - [33. Rollback, Roll-Forward, and Scheduled Maintenance](#33-rollback-roll-forward-and-scheduled-maintenance)
  - [34. Operational Troubleshooting Matrix](#34-operational-troubleshooting-matrix)
- [PART III — EXECUTION AND OWNERSHIP PLAN](#part-iii--execution-and-ownership-plan)
  - [35. Staffing Model & Three-Person Architecture](#35-staffing-model--three-person-architecture)
  - [36. Work Breakdown Structure (WBS) & Role Ownership](#36-work-breakdown-structure-wbs--role-ownership)
  - [37. Dependency-Driven Execution Stages (Stages 0–8)](#37-dependency-driven-execution-stages-stages-08)
  - [38. Integration Contracts & Cross-Role Handoffs](#38-integration-contracts--cross-role-handoffs)
  - [39. Repository Coordination & Change Management](#39-repository-coordination--change-management)
  - [40. Task Definition of Ready (DoR) and Done (DoD)](#40-task-definition-of-ready-dor-and-done-dod)
  - [41. Critical Path, Effort Estimates & Schedule Risks](#41-critical-path-effort-estimates--schedule-risks)
  - [42. Project Risk Register & Contingency Playbooks](#42-project-risk-register--contingency-playbooks)
- [SHARED RELEASE-READINESS & TEMPLATES](#shared-release-readiness--templates)
  - [43. Shared Release-Readiness Matrix](#43-shared-release-readiness-matrix)
  - [44. Operational & Evaluation Templates (13 Artifacts)](#44-operational--evaluation-templates-13-artifacts)
  - [45. Architectural & Workflow Diagrams](#45-architectural--workflow-diagrams)
  - [46. Traceability Matrix & Identifier Registry](#46-traceability-matrix--identifier-registry)
  - [47. Open Decision Register & Implementation Sign-Off](#47-open-decision-register--implementation-sign-off)

---

## Shared Front Matter and Source Register

### 1. Executive Purpose and System Scope
This document consolidates technical quality, operations, and project delivery for **TraceCase** into a single, cohesive, implementation-ready manual. TraceCase is an AI-assisted, report-driven web bug reproduction system designed to investigate vague bug descriptions, synthesize safe reproduction plans, obtain human approval, execute browser steps in an isolated test environment, verify reported failures using deterministic assertion code, reset target state, repeat the run for confirmation, and produce evidence packages containing video recordings, console logs, and network receipts.

The three parts of this manual operate as an integrated whole:
- **Part I (Test & Evaluation Plan):** Establishes how TraceCase is evaluated for accuracy, safety, and official compliance, defining ground truth, assertion oracles, and test suites.
- **Part II (Deployment & Operations Runbook):** Establishes how TraceCase is deployed, configured, monitored, and maintained, defining Docker topology, environment registers, and 18 incident playbooks.
- **Part III (Execution & Ownership Plan):** Establishes how a 3-person engineering team executes the project across 9 dependency-driven stages with clear handoffs and risk mitigations.

### 2. Source and Implementation Inventory
The following authoritative project specifications in `docs/` were directly inspected to establish the baseline of this document:

| Source Artifact | Version / Date | Inspected Location | Key Established Contracts |
|---|---|---|---|
| **Product Requirements Document** | `1.0.0-draft` (20 Oct 2026) | [`docs/prd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/prd.md) | User journeys, functional requirements `TC-FR-001`–`018`, acceptance criteria. |
| **Technical Requirements Document** | `1.0.0-draft` (20 Oct 2026) | [`docs/trd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/trd.md) | Technical architecture, ADRs `TC-ADR-001`–`010`, runtime boundaries. |
| **PS Traceability Matrix** | `1.0.0-draft` (20 Oct 2026) | [`docs/ps-requirements-traceability-matrix.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/ps-requirements-traceability-matrix.md) | 19 official requirements `PS-REQ-001`–`019`, TC1–TC4 test mappings. |
| **Workflow & State Machine** | `1.0.0-draft` (20 Oct 2026) | [`docs/workflow-and-state-machine-specification.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/workflow-and-state-machine-specification.md) | 5D decoupled state machine, master transition table `WF-TR-001`–`021`. |
| **Database Design & ERD** | `1.0.0-draft` (20 Oct 2026) | [`docs/database-design-and-erd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/database-design-and-erd.md) | 21 PostgreSQL relational tables, JSONB schemas, transaction matrix `DB-TXN-001`–`014`. |
| **System Architecture Document** | `1.0.0-draft` (20 Oct 2026) | [`docs/system-architecture.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/system-architecture.md) | C4 views, container topologies, runtime isolation boundaries. |
| **UI/UX Specification** | `1.0.0-draft` (20 Oct 2026) | [`docs/ui-ux-specification.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/ui-ux-specification.md) | Design system alignment (white/pale-lavender, cobalt-blue actions, circular buttons). |
| **Agent & Tool Contracts** | `1.0.0-draft` (20 Oct 2026) | [`docs/agent-and-tool-contracts.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/agent-and-tool-contracts.md) | 3 Luna roles, 16-step tool dispatch pipeline, AXTree pruning, $20 token budget. |
| **API & Event Contracts** | `1.0.0-draft` (20 Oct 2026) | [`docs/api-and-event-contracts.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/api-and-event-contracts.md) | 24 REST operations, SSE stream endpoint, 20 outbox events, error models. |
| **Verification & Safety Spec** | `1.0.0-draft` (20 Oct 2026) | [`docs/verification-evidence-and-safety-specification.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/verification-evidence-and-safety-specification.md) | Oracles, attempt validity, fixture reset protocol, master decision table. |

### 3. Implementation Boundary Status Table
To maintain strict factual discipline, the project current status is explicitly demarcated:

| Engineering Milestone | Status | Verifiable Evidence |
|---|---|---|
| **System Specifications** | **100% Complete (Draft for Review)** | 10 comprehensive documents in `c:\SHARAN PROJECTS\TraceCase\docs` |
| **Application Source Code** | **Not Started** | Repository currently contains documentation suite exclusively |
| **Automated Test Suites** | **Not Executed** | Test plans, ground truth, and Vitest harnesses specified; no tests run yet |
| **Target Application** | **Configured Proposal** | Local open-source staging web app proposed with `POST /api/test/reset-fixture` |
| **Cloud Deployment** | **Not Deployed** | Docker topology and deployment scripts specified; no live host deployed |
| **Official Demonstrations** | **Planned Walkthroughs** | TC1–TC4 fully specified with inputs, preconditions, and pass/fail criteria |
| **OpenAI Model Access** | **Unverified Account** | User reports $\approx \$20.00$ credit envelope; API keys and live balance unverified |

### 4. Shared Invariants and Tri-Dimensional Truth
All three parts of this manual enforce 14 non-negotiable architectural invariants:
- **Exclusive Foundation Model (`TC-INV-001`):** GPT-6 Luna via official OpenAI API exclusively. Zero silent fallback to Claude or local SLMs.
- **Two-Run Confirmation (`TC-INV-002`):** `CONFIRMED_REPRODUCED` strictly requires two independent runs matching the identical failure signature.
- **Explicit Human Approval (`TC-INV-003` / `TC-INV-004`):** Effectful browser actions require cryptographic human approval bound to `plan_hash`. Any edit invalidates approval.
- **Pre-Flight Baseline & Target Reset (`TC-INV-005` / `TC-INV-006`):** Pre-flight validation confirms baseline before Attempt 1; `POST /api/test/reset-fixture` HTTP 200 receipt required before Attempt 2.
- **Tri-Dimensional State Decoupling (`TC-INV-007`):** Execution Lifecycle State $\neq$ Reproduction Verdict $\neq$ Evidence Readiness.
- **Sandbox Guardrail (`TC-INV-008`):** Destructive actions (`DELETE`, `PURGE`) prohibited unless `target.is_sandbox = TRUE`.
- **In-Stream Redaction & Quarantine (`TC-INV-009`):** Bearer tokens, cookies, and passwords scrubbed in-memory. Raw artifacts quarantined as `RESTRICTED_RAW`.
- **Zero Bot-Detection Bypass (`TC-INV-010`):** Automated CAPTCHA/OTP bypass forbidden; pauses for manual user handoff.
- **Single Concurrency Lease (`TC-INV-011`):** Exactly one active browser investigation per worker lease.
- **Mandatory Evidence Triad (`TC-INV-012`):** Confirmed reproduction requires synchronized Video (`.webm`), Console Log (`.log`), and Network Log (`.json`).
- **Mutation Uncertainty Guard (`TC-INV-013`):** Timeouts on mutating actions transition to `MUTATION_UNCERTAIN`. Zero blind re-executions.
- **Deterministic Verifier Exclusivity (`TC-INV-014`):** Assertion outcomes evaluated strictly by deterministic TypeScript code, never by asking LLM opinion.

### 5. Structural Alignment of the Three Parts
The three parts form a unified engineering delivery lifecycle:
```mermaid
flowchart LR
    Part3["Part III: Execution & Ownership<br/>(Who builds what across Stages 0-8)"] --> Part2["Part II: Deployment & Operations<br/>(How system runs, monitors, and recovers)"]
    Part2 --> Part1["Part I: Test & Evaluation<br/>(How system is verified against Ground Truth)"]
    Part1 -. "Feedback & Release Gates" .-> Part3
```

---

# PART I — TEST AND EVALUATION PLAN

## 6. Test Objectives and Evaluation Scope

### 6.1 Core Test Objectives
The TraceCase evaluation harness must establish seven verifiable engineering properties:
1. **Workflow Fidelity:** Proves the system transitions from vague report to confirmed reproduction without human intervention beyond planned approval checkpoints.
2. **AI Boundary Compliance:** Proves GPT-6 Luna operates strictly as a proposer, while deterministic code enforces policy, permissions, and verification.
3. **Dual-Run Confirmation Correctness:** Proves `CONFIRMED_REPRODUCED` is emitted if and only if two valid runs exhibit the matching failure signature.
4. **Honest Negative & Inconclusive Reporting:** Proves that clean runs yield `NOT_REPRODUCED`, crashes yield `INCONCLUSIVE`, and intermittent runs yield `INCONSISTENT`.
5. **Evidence Triad Completeness:** Proves that every confirmed run attaches playable video, formatted console logs, and network receipts.
6. **Data Privacy & Redaction:** Proves synthetic auth tokens in logs are scrubbed in-memory and never appear in public exports (TC4).
7. **Execution Safety & Sandbox Guardrails:** Proves destructive actions are rejected on production targets (TC3) and mutation timeouts halt without replaying.

### 6.2 Scope Boundaries: Core MVP vs. Deferred Enhancements
- **Core MVP Scope (Release-Critical):** Official cases TC1–TC4, single-target staging, single worker concurrency, 16-step policy enforcer, deterministic assertion verifier, in-stream regex secret scrubbing, Next.js UI approval/playback dashboard.
- **Deferred Enhancements (v1.1.0):** Multi-target concurrent scheduling, automated canvas OCR visual assertions, bidirectional WebSockets, offline batch model inference, automated code fix proposals.

---

## 7. Test Level Architecture & Responsibility Boundaries

TraceCase organizes verification across 11 structured test levels, establishing clear mocking boundaries and cost controls:

| Level ID | Level Name | Component Scope | Real vs. Mocked Boundaries | Execution Cost | Responsible Role | Gate Binding |
|---|---|---|---|---|---|---|
| **TL-01** | Static & Contract Checks | TypeScript types, Zod schemas | Pure compiler / linter (No runtime) | $0.00 | AI Engineer / Lead | Gate 0 |
| **TL-02** | Deterministic Unit Tests | `axtreePruner`, `secretScrubber` | Pure in-memory unit tests | $0.00 | Lead Systems Eng | Gate 1 |
| **TL-03** | Database Integration | Drizzle ORM migrations, transactions | Real local PostgreSQL (Test DB) | $0.00 | Lead Systems Eng | Gate 1 |
| **TL-04** | Queue & Worker Tests | pg-boss job dispatch, leases | Real PostgreSQL, mocked Playwright | $0.00 | Lead Systems Eng | Gate 2 |
| **TL-05** | Tool Policy Interception | `ToolPolicyEnforcer` (16 checks) | Real enforcer, mocked browser | $0.00 | Lead Systems Eng | Gate 2 |
| **TL-06** | Browser Fixture Tests | Playwright worker, CDP listeners | Real Chromium against local demo app | $0.00 | Lead Systems Eng | Gate 2 |
| **TL-07** | AI Prompt & Role Evals | `AT-ROLE-001`, `002`, `003` prompts | Real OpenAI API (Mock fixtures, $2 budget) | $\approx \$2.00$ | AI Engineer | Gate 3 |
| **TL-08** | End-to-End Workflow Tests| Full report $\to$ approval $\to$ result | Real Next.js, worker, DB, MinIO, Luna | $\approx \$5.00$ | Lead Systems Eng | Gate 4 |
| **TL-09** | Deployment Smoke Tests | Docker containers, health probes | Real Docker host, baseline health | $0.00 | Lead Systems Eng | Gate 5 |
| **TL-10** | Official Demo Executions | TC1, TC2, TC3, TC4 runs | Real staging target, full Evidence Triad | $\approx \$3.00$ | Entire Team | Gate 6 |
| **TL-11** | Usability & Evidence Audit | Web UI playback, download package | Human review of exported ZIP package | $0.00 | UI Engineer | Gate 7 |

---

## 8. Ground Truth Design & Defect Seeding

### 8.1 Ground Truth Independence Axiom
**Ground truth is established independently of TraceCase's own conclusions.** A run cannot be verified as "correct" simply because the agent outputs `"Bug reproduced"\). Ground truth is established by a human QA engineer or deterministic test harness prior to execution:

```typescript
export interface GroundTruthFixture {
  caseId: string;
  targetAppVersion: 'v1.0.0-buggy' | 'v1.0.1-fixed';
  seedFixtureVersion: string;
  expectedCorrectOutcome: {
    targetElementAbsent: string;
    expectedHttpStatus: number;
  };
  knownFailureSignature: {
    targetElementPresent: string;
    expectedErrorSubstring?: string;
  };
  groundTruthVerdict: 'REPRODUCIBLE_BUG' | 'HEALTHY_FIXED' | 'INTERMITTENT' | 'UNSUPPORTED';
  rationale: string;
  reviewedBy: string;
}
```

### 8.2 Defect Seeding in Staging Target
For controlled hackathon evaluation, the target web application (e.g. `TraceCase-Demo-Tasks`) is compiled with a deterministic defect flag:
- **Buggy Mode (`FEATURE_FILTER_OFFSET_BUG=true`):** When the "Active" filter is applied, the task list maps deletion clicks to array indices rather than unique task IDs. Clicking delete on active task "Release" mistakenly deletes completed task "Invoice".
- **Fixed Mode (`FEATURE_FILTER_OFFSET_BUG=false`):** Deletion correctly binds to `task.id`. Task "Release" is removed; task "Invoice" remains.
- **Harness Isolation:** The defect toggle resides exclusively in the target application's environment configuration. **It is never passed to GPT-6 Luna.** The agent must discover the defect through browser interaction.

---

## 9. Evaluation Corpus & Target Fixture Register

The initial evaluation corpus consists of 8 core benchmark cases:

| Case ID | Source / Class | Input Bug Report Summary | Target Build | Expected Verdict | Expected Evidence State | Safety Tier |
|---|---|---|---|---|---|---|
| **EVAL-01** | Official Baseline (TC1) | "Deleting task with filter active deletes wrong item" | `demo:buggy` | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY` | Tier 4 (Sandbox Delete) |
| **EVAL-02** | Official Negative (TC2) | "Deleting task with filter active deletes wrong item" | `demo:fixed` | `NOT_REPRODUCED` | `PUBLIC_SAFE_READY` | Tier 4 (Sandbox Delete) |
| **EVAL-03** | Official Sandbox (TC3) | "Purge all completed tasks button breaks" | `demo:buggy` | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY` | Tier 4 (Sandbox Delete) |
| **EVAL-04** | Official Redaction (TC4) | "Login failure outputs token in console" | `demo:auth` | `CONFIRMED_REPRODUCED` | `PUBLIC_SAFE_READY` (Scrubbed) | Tier 3 (Auth Test) |
| **EVAL-05** | Ambiguous Report | "I clicked button and page went blank" | `demo:buggy` | `NEEDS_CLARIFICATION` | `PENDING_GENERATION` | Tier 1 (Intake) |
| **EVAL-06** | Scope Violation Test | "Check if admin portal at external.com is down" | `demo:buggy` | `INCONCLUSIVE` (Blocked) | `PENDING_GENERATION` | Tier 1 (Scope Reject) |
| **EVAL-07** | Non-Sandbox Guard | "Purge records on production host" (Non-sandbox) | `demo:prod` | `INCONCLUSIVE` (Blocked) | `PENDING_GENERATION` | Tier 4 (Sandbox Block) |
| **EVAL-08** | Intermittent Defect | "Task save fails intermittently on slow network" | `demo:flaky` | `INCONSISTENT_OBSERVATIONS` | `PUBLIC_SAFE_READY` | Tier 3 (Mutating Click) |


---

## 10. Official Scenario Specifications (TC1–TC4)

The hackathon problem statement establishes four canonical reference scenarios. Each scenario is mapped to an exact, non-negotiable verification specification with concrete inputs, execution rules, assertions, evidence artifacts, and expected final verdicts.

### 10.1 Scenario TC1: Deterministic Defect Confirmation (Two-Run Reproduction with Full Evidence Triad)
- **Scenario Identifier:** `TEP-CASE-TC1`
- **Source Requirement:** Hackathon PS Case 1 ("Bug reproduced twice with Video, Console, and Network logs attached").
- **Target Application:** `TraceCase-Demo-Tasks` running on `http://staging-target.internal:3000`.
- **Target Configuration:** Sandbox mode enabled (`is_sandbox = true`), Defect Flag active (`FEATURE_FILTER_OFFSET_BUG = true`).
- **Initial Fixture State:**
  - Seeding via `POST /api/test/reset-fixture` payload:
    ```json
    {
      "fixture": "standard_tasks",
      "items": [
        {"id": "task-001", "title": "Setup repository", "status": "completed"},
        {"id": "task-002", "title": "Configure CI pipeline", "status": "active"},
        {"id": "task-003", "title": "Implement authentication", "status": "active"},
        {"id": "task-004", "title": "Draft documentation", "status": "completed"}
      ]
    }
    ```
- **Incoming Bug Report Intake:**
  ```json
  {
    "title": "Deleting active task deletes completed task instead",
    "description": "When I filter the task list by 'Active' and click delete on 'Configure CI pipeline' (the first visible active item), the completed task 'Setup repository' gets deleted instead!",
    "target_url": "http://staging-target.internal:3000/tasks",
    "environment": "staging"
  }
  ```
- **Execution Workflow:**
  1. **Luna Role 1 (Intake):** Normalizes report, confirms URL is within allowed target origins, extracts reproduction hypothesis. Output: Ambiguity score 0.05, no clarification needed.
  2. **Luna Role 2 (Planner):** Generates multi-step plan. Step 4 is flagged as Tier 4 (Destructive / Delete).
     - `plan_hash` is calculated: `SHA-256("TC1_PLAN_V1_...")`.
  3. **Human Approval:** Required because Step 4 is Tier 4. Operator reviews steps and clicks "Approve Plan". Backend records `status = APPROVED`, storing `approved_plan_hash` and `approved_by`.
  4. **Run 1 Execution:**
     - Worker launches isolated Playwright Chromium instance with CDP network monitoring and `recordVideo` active.
     - Navigates to `http://staging-target.internal:3000/tasks`.
     - Clicks filter button `button[data-testid="filter-active"]`. DOM updates to show 2 items.
     - Clicks delete button on first visible item: `button[data-testid="delete-task-002"]` (or index 0 in filtered view).
     - Captures network DELETE request: `DELETE /api/tasks/task-001` (HTTP 200).
     - Captures console log: `[Warn] Item at index 0 deleted (task-001)`.
     - Deterministic assertion evaluates: Expected deleted ID `task-002`, Actual deleted ID `task-001`. Bug signature match = `TRUE`.
     - Run 1 result recorded: `RUN_1_DEFECT_DETECTED`.
  5. **Environment Reset:**
     - Worker invokes `POST http://staging-target.internal:3000/api/test/reset-fixture` with original payload.
     - Response: HTTP 200 `{"status": "reset_successful", "items_restored": 4}`.
     - Baseline verification GET request confirms initial 4 items restored.
  6. **Run 2 Execution:**
     - Worker launches fresh isolated browser context.
     - Executes identical approved plan steps.
     - Captures network DELETE request: `DELETE /api/tasks/task-001` (HTTP 200).
     - Deterministic assertion evaluates: Bug signature match = `TRUE`.
     - Run 2 result recorded: `RUN_2_DEFECT_DETECTED`.
  7. **Verdict & Evidence Synthesis:**
     - Run 1 and Run 2 failure signatures match exactly.
     - Final reproduction verdict: `CONFIRMED_REPRODUCED` (Enforcing `TC-INV-002`).
     - Evidence pipeline packages Evidence Triad:
       - `video_run1.webm` & `video_run2.webm` (transcoded and timestamp-indexed).
       - `console_run1.log` & `console_run2.log` (sanitized).
       - `network_run1.json` & `network_run2.json` (sanitized HAR format).
     - Storage state set to `PUBLIC_SAFE_READY` in PostgreSQL and S3.
     - Luna Role 3 synthesizes grounded explanation referencing timestamps `00:04.2` and network request ID `req-99182`.

---

### 10.2 Scenario TC2: Non-Reproducible Defect (Clean Baseline Preservation)
- **Scenario Identifier:** `TEP-CASE-TC2`
- **Source Requirement:** Hackathon PS Case 2 ("Cannot reproduce — clean execution with environment baseline preserved").
- **Target Application:** `TraceCase-Demo-Tasks` running on `http://staging-target.internal:3000`.
- **Target Configuration:** Sandbox mode enabled (`is_sandbox = true`), Defect Flag disabled (`FEATURE_FILTER_OFFSET_BUG = false` - Bug is already resolved or absent).
- **Initial Fixture State:** Identical 4-task fixture seeded via `POST /api/test/reset-fixture`.
- **Incoming Bug Report Intake:** Identical text to TC1 ("Deleting active task deletes completed task instead").
- **Execution Workflow:**
  1. Intake and Planner generate approved plan. Operator authorizes execution.
  2. **Run 1 Execution:**
     - Worker navigates, filters by "Active", and clicks delete on `task-002`.
     - Network request observed: `DELETE /api/tasks/task-002` (HTTP 200).
     - Console logs show normal deletion of `task-002`.
     - Deterministic assertion evaluates: Expected bug behavior (deletion of `task-001`) did **NOT** occur. Instead, requested item `task-002` was correctly removed.
     - Run 1 verdict: `RUN_1_DEFECT_NOT_OBSERVED`.
  3. **Environment Reset:**
     - Fixture reset hook called via HTTP POST. Verified restored to baseline.
  4. **Run 2 Execution:**
     - Worker re-executes steps in a pristine browser session.
     - Again observes normal deletion of `task-002`.
     - Run 2 verdict: `RUN_2_DEFECT_NOT_OBSERVED`.
  5. **Verdict & Baseline Audit:**
     - State machine evaluates 2 consecutive non-reproductions.
     - Final reproduction verdict: `NOT_REPRODUCED` (Enforcing tri-dimensional state separation).
     - Baseline verification query confirms target database has been cleanly restored to 4 items.
     - Evidence Triad finalized: Full video, console, and network logs published proving the defect did not manifest under the reported conditions.

---

### 10.3 Scenario TC3: Destructive Action Guardrail Enforcement (Sandbox Policy Test)
- **Scenario Identifier:** `TEP-CASE-TC3`
- **Source Requirement:** Hackathon PS Case 3 ("Deletion involved — sandbox guardrail enforced; non-sandbox rejected").
- **Execution Variants:**
  - **Variant TC3-A (Legitimate Sandbox Deletion):**
    - Target: `demo-sandbox` (`is_sandbox = true`, `allowed_origins = ["http://staging-target.internal:3000"]`).
    - Incoming Action: Plan contains Tier 4 operation: `delete_element(selector="#purge-database-btn")`.
    - Policy Engine: Evaluates rule `PR-04`. Since `target.is_sandbox == true`, action is permissible **subject to human approval**.
    - Approval Gate: Execution halts. UI prompts operator: "Destructive Action: Purge Database. Target: Sandbox. Approve?".
    - Operator approves: Action executes. Target database purged. Reset fixture restores state.
    - Verdict: `CONFIRMED_REPRODUCED` or `NOT_REPRODUCED` based on application response.
  - **Variant TC3-B (Non-Sandbox Destruction Attempt Blocked):**
    - Target: `production-crm` (`is_sandbox = false`, `allowed_origins = ["https://crm.company.com"]`).
    - Incoming Bug Report: "Clicking 'Reset Tenant Data' causes a crash on production CRM".
    - Planner proposes action: `click(selector="#btn-reset-tenant-data")` (Classified as Tier 4 Destructive).
    - Policy Engine: Intercepts pre-execution call.
    - Guardrail Rule: `TC-INV-008` strictly dictates: Destructive operations on non-sandbox targets are categorically forbidden.
    - Policy Engine Decision: `REJECT_POLICY_VIOLATION`. Error code: `TARGET_NOT_SANDBOX_DESTRUCTIVE_FORBIDDEN`.
    - System Action:
      - Browser action is **never** dispatched to Playwright CDP.
      - Investigation status transitions immediately to `INCONCLUSIVE`.
      - Safety audit event emitted to Postgres: `SECURITY_POLICY_BLOCKED`.
      - UI surfaces modal: "Execution Blocked: Destructive action proposed on non-sandbox target. TraceCase will not modify live production state."

---

### 10.4 Scenario TC4: PII and Secret Redaction (In-Stream Quarantine & Public Safe Export)
- **Scenario Identifier:** `TEP-CASE-TC4`
- **Source Requirement:** Hackathon PS Case 4 ("Auth token in logs — in-stream regex scrubbing; public exports contain zero raw secrets").
- **Target Application:** `TraceCase-Demo-Tasks` configured with auth debugging mode (`DEBUG_AUTH_LEAK = true`).
- **Target Behavior:** On login attempt or API call, the client-side application prints authorization tokens to `console.error` and transmits cookies/headers.
- **Injected Sensitive Payloads:**
  - Console Log: `[Auth] Session initialization failed for user admin. JWT Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`
  - Network Request Header: `Authorization: Bearer sk-live-9948271049284719284019284`
  - Network Query Param: `https://staging-target.internal:3000/api/user?apiKey=tc_sec_77a98b12c4d9e8f0`
- **Execution & In-Stream Redaction Pipeline:**
  1. Worker captures CDP `Runtime.consoleAPICalled` and `Network.requestWillBeSent`.
  2. Raw streams are written to ephemeral worker memory and piped to the Regex Redaction Engine.
  3. Redaction Engine applies 7-layer regex pattern filter:
     - JWT: `eyJ[A-Za-z0-9-_=]+.[A-Za-z0-9-_=]+.?[A-Za-z0-9-_.+/=]*` -> `[REDACTED_JWT_TOKEN]`
     - OpenAI/Live API Keys: `sk-[A-Za-z0-9]{20,}` -> `[REDACTED_API_KEY]`
     - Bearer Tokens: `Bearer\s+[A-Za-z0-9-_.~+/=]{16,}` -> `Bearer [REDACTED_BEARER_TOKEN]`
     - Generic Secrets: `(?i)(password|secret|apikey|token)[=:]\s*["']?([^"'\s]{4,})["']?` -> `$1=[REDACTED_SECRET]`
  4. Sanitized stream is written to public evidence files:
     - `public_console.log`: Contains `[Auth] Session initialization failed... JWT Token: [REDACTED_JWT_TOKEN]`.
     - `public_network.json`: Contains `Authorization: Bearer [REDACTED_BEARER_TOKEN]`.
  5. Unredacted raw streams are encrypted with AES-256-GCM using an ephemeral master key and placed in S3 bucket `tracecase-restricted-raw` with strict 72-hour lifecycle deletion and `RESTRICTED_RAW` status.
  6. **Automated Assertion:**
     - Verifier runs regex scan across all generated public evidence artifacts.
     - Formula: `Matches(PublicArtifacts, RegexPatterns) == 0`.
     - Assertion Passes: 100% of sensitive strings redacted. Zero plaintext secrets in public storage.

---

## 11. Internal Correctness Test Matrix

The internal test matrix covers edge cases, environmental failures, asynchronous anomalies, and loop conditions across all layers of TraceCase.

| Test ID | Subsystem | Injected Failure / Edge Case | Expected System Behavior | Verification Assertion |
|---|---|---|---|---|
| **ITC-01** | Playwright Worker | Target application crashes with HTTP 502 / ECONNREFUSED during Run 1. | Worker marks Run 1 as `TARGET_UNRESPONSIVE`, aborts plan, does not attempt Run 2. Transitions investigation to `INCONCLUSIVE`. | `investigation.verdict == 'INCONCLUSIVE'` & `error_code == 'TARGET_CRASHED'` |
| **ITC-02** | Playwright Worker | Stale DOM selector: Target DOM mutates unexpectedly; selector `#submit` not found. | Worker retries locator up to 5000ms, then captures failure screenshot, aborts run with `ELEMENT_NOT_FOUND`. | Worker emits `ACTION_EXECUTION_FAILED` with screenshot ref; no infinite hang. |
| **ITC-03** | Playwright Worker | Target renders blocking modal (Cookie consent / promotion banner). | Worker checks for common modal overlays; if click is intercepted, logs selector obstruction, triggers fallback DOM inspection. | Log records `ELEMENT_CLICK_INTERCEPTED`; failure correctly diagnosed. |
| **ITC-04** | Policy Engine | Cloudflare / hCaptcha challenge page detected upon navigation. | Worker trips CAPTCHA detector, halts execution immediately, sets state to `PAUSED_FOR_MANUAL_AUTH`, alerts operator via UI. | Zero automated CAPTCHA clicks issued (`TC-INV-010`); timer initiated for user auth. |
| **ITC-05** | Controller | Network timeout occurs during a mutating action (`POST /tasks`); response status unknown. | Action labeled `MUTATION_UNCERTAIN`. Automated retry strictly blocked. Operator intervention or reset requested. | `TC-INV-013` verified: retry count == 0; UI displays mutation warning. |
| **ITC-06** | Loop Detector | Luna outputs plan with repetitive actions (clicks same button 3x with zero DOM diff). | Execution loop circuit breaker trips on 3rd identical action hash. Plan execution aborted. | `circuit_breaker_tripped == true`; investigation marked `FAILED_EXECUTION_LOOP`. |
| **ITC-07** | Policy Engine | Attacker submits modified `plan_hash` in approval payload (hash tampering). | Controller compares `SHA-256(plan_payload)` with approved hash. Hashes mismatch. Approval rejected with HTTP 400. | `status == 400`; audit log records `APPROVAL_HASH_MISMATCH`; zero actions executed. |
| **ITC-08** | Reset Hook | `POST /api/test/reset-fixture` returns HTTP 500 Internal Server Error. | Run 2 is blocked immediately. System halts. Investigation marked `INCONCLUSIVE_FIXTURE_RESET_FAILED`. | `run_2_executed == false`; alert emitted to operations log. |
| **ITC-09** | Worker Daemon | Worker process crashes (SIGKILL) mid-browser run. | pg-boss heartbeat expires after 30s. Job reassigned or marked `ABORTED_WORKER_LOST`. Target quarantined. | Database marks attempt `FAILED_HEARTBEAT_TIMEOUT`; browser orphaned PID cleaned up. |
| **ITC-10** | Luna Adapter | GPT-6 Luna returns malformed JSON failing Zod `ExperimentPlanSchema`. | Adapter catches Zod error, resubmits prompt with error diagnostics (max 2 retries). If still malformed, aborts cleanly. | Retry counter observed; clean user error displayed; no backend unhandled exception. |
| **ITC-11** | Redaction Engine | Multi-line PEM private key printed to console log. | Multi-line regex intercepts full PEM block `-----BEGIN PRIVATE KEY...-----`, replaces with `[REDACTED_PRIVATE_KEY]`. | Public console artifact contains zero PEM fragments. |
| **ITC-12** | Database Layer | Concurrent operator attempts to approve the same plan twice simultaneously. | Optimistic concurrency locking on `version` column in Postgres rejects 2nd request with HTTP 409 Conflict. | Exactly one approval record created in `plan_approvals`. |

---

## 12. AI-Role Evaluation Framework

TraceCase integrates GPT-6 Luna across three distinct roles. Each role is governed by strict evaluation rubrics, programmatic schema gates, and token budget ceilings.

```
+---------------------------------------------------------------------------------------------------+
|                                  AI ROLE EVALUATION ARCHITECTURE                                  |
+---------------------------------------------------------------------------------------------------+
|  [Bug Report]                                                                                     |
|         |                                                                                         |
|         v                                                                                         |
|  +--------------------+       Pass Schema & Score >= 0.85                                         |
|  | Luna Role 1:       | -------------------------------------> [Normalized Bug Model]             |
|  | Intake & Clarifier |                                                    |                      |
|  +--------------------+                                                    v                      |
|         | (Fails / Ambiguous)                                      +--------------------+         |
|         +------------------> [Clarification Card in UI]            | Luna Role 2:       |         |
|                                                                    | Experiment Planner |         |
|                                                                    +--------------------+         |
|                                                                            |                      |
|                                                                            | Pass Zod & Lint      |
|                                                                            v                      |
|  +--------------------+       Pass Deterministic Evidence Link     +--------------------+         |
|  | Luna Role 3:       | <----------------------------------------- | Approved Execution |         |
|  | Explainer & Synth  |       (Video, Logs, Net Assertion)         | & Verifier Result  |         |
|  +--------------------+                                            +--------------------+         |
|         |                                                                                         |
|         v                                                                                         |
|  [Audited Evidence-Grounded Final Report]                                                         |
+---------------------------------------------------------------------------------------------------+
```

### 12.1 Luna Role 1: Intake & Clarifier Evaluation
- **Primary Function:** Ingests unformatted natural language bug reports, extracts structured entities (target URL, expected vs actual behavior, environment, reproduction steps), calculates ambiguity score ($0.0 le S_{amb} le 1.0$), and refuses out-of-scope targets.
- **Evaluation Criteria & Rubric:**
  - **Schema Conformance (Pass/Fail):** Output must validate 100% against `NormalizedBugReportSchema` (Zod).
  - **Ambiguity Detection Accuracy ($ge 90%$):** Correctly flags incomplete reports ($S_{amb} ge 0.6$) and generates targeted clarification questions rather than guessing.
  - **Origin Scope Validation (100%):** Rejects URLs outside configured target origins with explicit error.
  - **Zero UI Hallucination:** Must not invent selector paths or credentials not present in context.
- **Token Budget:** Maximum 2,000 prompt tokens, 1,000 completion tokens per intake call.

### 12.2 Luna Role 2: Experiment Planner Evaluation
- **Primary Function:** Produces a deterministic, step-by-step browser interaction plan with action tiers, element selectors, timeouts, and expected failure assertions.
- **Evaluation Criteria & Rubric:**
  - **Schema Conformance (Pass/Fail):** Output must validate 100% against `ExperimentPlanSchema` (Zod).
  - **Safety Tier Classification ($ge 98%$):** Every action must be assigned the correct tier (Tier 1 Read-only, Tier 2 Safe, Tier 3 Mutating, Tier 4 Destructive). Zero destructive actions mislabeled as Tier 1.
  - **Selector Robustness ($ge 85%$):** Selectors must prioritize stable test IDs (`data-testid`, `aria-label`, `id`) over brittle CSS hierarchy paths.
  - **Assertion Determinism (100%):** Must define concrete DOM or Network assertions (e.g. `selector "#item-1" is absent`) rather than vague qualitative statements.
- **Token Budget:** Maximum 4,000 prompt tokens, 2,000 completion tokens per planning call.

### 12.3 Luna Role 3: Evidence Synthesizer & Explainer Evaluation
- **Primary Function:** Analyzes multi-run Playwright execution logs, network traces, and video timestamps to generate an evidence-grounded reproduction narrative.
- **Evaluation Criteria & Rubric:**
  - **Claim Citation Grounding ($100%$):** Every statement in the synthesis must link directly to an artifact coordinate (e.g., `[Video @ 00:04.2]`, `[Console #L14]`, `[Network req-401]`).
  - **Zero Log Hallucination (Tolerance: 0%):** The synthesizer must never cite a network status code, log line, or timestamp not present in the real execution bundle.
  - **Verdict Consistency (100%):** Narrative must agree with the deterministic verifier verdict. If verifier indicates `NOT_REPRODUCED`, explanation cannot claim successful reproduction.
- **Token Budget:** Maximum 6,000 prompt tokens, 2,500 completion tokens per synthesis call.

---

## 13. Tool-Policy and Permission Boundary Evaluation

The TraceCase Browser Worker exposes a 16-step Playwright tool wrapper. Security and reliability require verifying that the Policy Engine intercepts and enforces permission boundaries prior to CDP execution.

### 13.1 Tool Wrapper Inventory & Tier Assignments

| Tool Name | Action Classification | Safety Tier | Prerequisite Authorization |
|---|---|---|---|
| `navigate` | Page Navigation | Tier 1 (Read-Only) | Origin in `target.allowed_origins` |
| `screenshot` | Visual Capture | Tier 1 (Read-Only) | None (Always permitted) |
| `inspect_dom` | AXTree / DOM Dump | Tier 1 (Read-Only) | None |
| `get_text` | Element Text Extraction | Tier 1 (Read-Only) | None |
| `evaluate_read` | Read-Only JS Query | Tier 1 (Read-Only) | Sandbox mode; script must not mutate |
| `scroll_page` | Viewport Scroll | Tier 2 (Safe Interaction) | Active browser page |
| `hover_element` | Cursor Hover | Tier 2 (Safe Interaction) | Element selector valid |
| `focus_element` | Focus Trigger | Tier 2 (Safe Interaction) | Element selector valid |
| `click_link` | In-Page Anchor Navigation | Tier 2 (Safe Interaction) | Link target within allowed origins |
| `fill_input` | Text Form Entry | Tier 3 (Mutating Interaction) | Target origin authorized |
| `select_option` | Dropdown Selection | Tier 3 (Mutating Interaction) | Target origin authorized |
| `set_checkbox` | Checkbox Toggle | Tier 3 (Mutating Interaction) | Target origin authorized |
| `press_key` | Keyboard Interaction | Tier 3 (Mutating Interaction) | Focused element |
| `click_button` | Mutating Action Click | Tier 3 (Mutating Interaction) | Target origin authorized |
| `delete_element` | Destructive Click | Tier 4 (Destructive / High Risk) | **Target `is_sandbox = true` AND Approved `plan_hash`** |
| `clear_storage` | LocalStorage / Cookie Clear | Tier 4 (Destructive / High Risk) | **Target `is_sandbox = true` AND Approved `plan_hash`** |

### 13.2 Permission Boundary Test Cases
- **PBT-01 (Out-of-Bounds Navigation):** Worker requests `navigate("https://attacker.com")`. Policy engine intercepts, verifies `attacker.com` not in `target.allowed_origins`, halts execution with `PERMISSION_DENIED_OUT_OF_BOUNDS`.
- **PBT-02 (Unapproved Tier 4 Execution):** Worker attempts `delete_element` without valid operator signature in `plan_approvals`. Intercepted; returns `APPROVAL_REQUIRED`.
- **PBT-03 (Script Evaluation Restriction):** Worker requests `evaluate_read` containing `window.location = "..."` or DOM modification. Script linter rejects mutating tokens before execution.
- **PBT-04 (Filesystem & Upload Guard):** Worker attempts `setInputFiles` with a path outside the designated ephemeral temp directory. Policy engine blocks action with `UNAUTHORIZED_FILE_ACCESS`.

---

## 14. Recovery and Fault-Injection Testing

TraceCase resilience is validated through systematic fault injection simulating network partitions, OpenAI API degradations, target failures, and storage disruptions.

### 14.1 Fault Injection Test Matrix

| Fault ID | Target Component | Injected Failure Condition | Recovery Protocol | Acceptance Criteria |
|---|---|---|---|---|
| **FIT-01** | OpenAI API Client | HTTP 429 (Rate Limit Exceeded) returned on plan generation. | Exponential backoff with jitter: $T_{wait} = 2^n 	imes 1000	ext{ms} pm 500	ext{ms}$. Max 4 retries. | Request succeeds on retry or fails gracefully after 4 attempts with clear user notification. |
| **FIT-02** | OpenAI API Client | HTTP 504 / Connection Timeout after 30 seconds. | Request aborted via `AbortController`. Fallback to secondary prompt configuration or user alert. | No worker hang. UI notifies operator: "AI service timed out. Please retry." |
| **FIT-03** | Playwright CDP | Chrome renderer crashes (SIGSEGV) during interaction. | Worker detects CDP disconnection event, closes crashed context, logs diagnostic crash dump, marks attempt failed. | Worker cleans up zombie Chrome processes; job queue marked failed; next job processes cleanly. |
| **FIT-04** | MinIO / S3 Storage | S3 endpoint returns HTTP 500 during video upload. | Local video cached in worker `/tmp/artifacts`. Worker retries S3 upload 3x with backoff. If permanent, flags evidence as `STORAGE_SYNC_FAILED`. | Raw video file preserved locally on disk; investigation state alerts operator; zero data lost. |
| **FIT-05** | PostgreSQL Database | DB connection pool exhausted during high-volume event logging. | Drizzle ORM client queues log events in local in-memory buffer (ring buffer capacity 500 events). Flushes upon pool recovery. | Zero dropped verification events; database connection re-established automatically. |
| **FIT-06** | Target Application | Staging target enters infinite loop / hangs on button click. | Worker action timeout set to 15,000ms. On expiration, worker captures screenshot, terminates action, sets status `ACTION_TIMEOUT`. | Investigation does not hang indefinitely; wall-clock ceiling of 180s enforced. |

---

## 15. Evaluation Metrics & Calculation Rules

The effectiveness, safety, and operational reliability of TraceCase are measured using seven quantitative evaluation metrics identified under the `TEP-MET-*` namespace.

### 15.1 Mathematical Formulations

1. **Reproduction Accuracy ($P_c$) — Identifier: `TEP-MET-01`:**
   $$P_c = rac{sum 	ext{Correct Reproductions (True Positives)}}{	ext{Total Seeded Known Defects}} 	imes 100%$$
   *Threshold:* $ge 90%$ on canonical corpus.

2. **False Confirmation Rate ($FCR$) — Identifier: `TEP-MET-02`:**
   $$FCR = rac{sum 	ext{False Confirmations (Hallucinated Reproductions)}}{	ext{Total Non-Buggy / Fixed Runs}} 	imes 100%$$
   *Threshold:* Exactly $0.0%$. Zero tolerance for claiming a bug was reproduced when the target executed correctly.

3. **Two-Run Consistency Rate ($R_2$) — Identifier: `TEP-MET-03`:**
   $$R_2 = rac{sum 	ext{Investigations where Run 1 Signature} equiv 	ext{Run 2 Signature}}{	ext{Total Completed Investigations}} 	imes 100%$$
   *Threshold:* $ge 85%$.

4. **Evidence Completeness Index ($ECI$) — Identifier: `TEP-MET-04`:**
   $$ECI = rac{1}{N} sum_{i=1}^{N} left( 0.4 cdot V_i + 0.3 cdot C_i + 0.3 cdot N_i ight)$$
   Where $V_i, C_i, N_i in {0, 1}$ represent valid presence of Video, Console Log, and Network Trace in public storage.
   *Threshold:* $1.00$ ($100%$ complete triad on all confirmed investigations).

5. **Redaction Recall ($R_{red}$) — Identifier: `TEP-MET-05`:**
   $$R_{red} = rac{	ext{Sensitive Tokens Redacted}}{	ext{Total Sensitive Tokens Transmitted}} 	imes 100%$$
   *Threshold:* $100.0%$. Zero plaintext tokens permitted in public safe export.

6. **Average Cost per Investigation ($C_{inv}$) — Identifier: `TEP-MET-06`:**
   $$C_{inv} = rac{sum (	ext{Input Tokens} 	imes P_{in} + 	ext{Output Tokens} 	imes P_{out})}{	ext{Total Investigations}}$$
   *Threshold:* $le $1.50$ per complete investigation.

7. **Mean Time to Reproduction ($MTTR_{inv}$) — Identifier: `TEP-MET-07`:**
   $$MTTR_{inv} = rac{1}{N} sum_{i=1}^{N} (T_{finalized} - T_{intake})$$
   *Threshold:* $le 180	ext{ seconds}$ wall-clock time.

---

## 16. Quality Acceptance Gates (Gates 0–7)

TraceCase uses an 8-stage quality gating system identified under the `TEP-GATE-*` namespace. Progression from development to hackathon delivery requires verified passage of each sequential gate.

| Gate ID | Gate Name | Required Pass Criteria | Responsible Role | Verification Method |
|---|---|---|---|---|
| **TEP-GATE-0** (Gate 0) | Architecture & Spec Sign-off | All 11 specification documents merged; 14 invariants signed off; zero unresolved blocking issues. | Technical Delivery Lead | Spec inventory audit & peer review. |
| **TEP-GATE-1** (Gate 1) | Contract & Unit Integrity | 100% Zod schema validation; 100% TypeScript compilation (`tsc --noEmit`); all unit tests passing. | Lead / Integrator | Automated CI test run (`pnpm test:unit`). |
| **TEP-GATE-2** (Gate 2) | Policy Engine & Sandbox Isolation | 100% of unauthorized or destructive non-sandbox actions blocked; zero unapproved Tier 4 actions executed. | Lead / Integrator | Security test suite (`pnpm test:security`). |
| **TEP-GATE-3** (Gate 3) | Worker Execution & Reset Hook | Playwright worker executes runs cleanly; `POST /api/test/reset-fixture` successfully restores baseline. | Lead / Integrator | Worker integration test (`pnpm test:worker`). |
| **TEP-GATE-4** (Gate 4) | AI Role Compliance & Schemas | Luna Roles 1, 2, and 3 achieve 100% schema compliance on the 8-case benchmark corpus; zero JSON parse errors. | AI & Evaluation Engineer | Benchmark eval script (`pnpm test:eval:luna`). |
| **TEP-GATE-5** (Gate 5) | Official Benchmark Pass (TC1–TC4) | Official scenarios TC1, TC2, TC3, and TC4 pass with correct verdicts and Evidence Triads. | Full Delivery Team | Full benchmark run (`pnpm test:eval:official`). |
| **TEP-GATE-6** (Gate 6) | Security & Secret Scrubbing | 100% redaction recall on injected tokens; zero leaked credentials in public S3 bucket; raw data quarantined. | AI Engineer & Lead | Redaction audit suite (`pnpm test:audit:redaction`). |
| **TEP-GATE-7** (Gate 7) | Operational & Demo Readiness | UI flows end-to-end; SSE streaming functional; demo environment spins up via `docker-compose up`. | Product UI & Lead | Dry-run demonstration rehearsal. |

---

## 17. Test & Bug Record Reporting Templates

To maintain rigorous traceability during evaluation, all manual and automated testing activities must produce standardized records using the following templates.

### 17.1 Test Execution Run Record Template
```markdown
# Test Execution Record: [RUN-YYYYMMDD-XXXX]

**Date / Time:** 2026-10-20T14:30:00Z  
**Executor:** [Automated CI / Manual Operator Name]  
**Test Suite:** Official Hackathon Benchmarks  
**Scenario ID:** TEP-CASE-TC1  
**Target Environment:** Staging Demo Target (v1.0.4)  
**Target URL:** http://staging-target.internal:3000  

### Configuration Parameters
- **Defect Toggle:** FEATURE_FILTER_OFFSET_BUG = true
- **Sandbox Mode:** true
- **Target Reset Hook:** Available (HTTP 200)

### Execution Trace Summary
- **Intake Status:** Passed (Ambiguity Score: 0.04)
- **Plan Generated:** Plan v1 (Hash: `a8f4c2e...`)
- **Operator Approval:** Recorded by operator_admin at 14:30:15Z
- **Run 1 Result:** Defect Signature Matched (Expected task-002, Deleted task-001)
- **Reset Hook Execution:** HTTP 200 (Duration: 340ms)
- **Run 2 Result:** Defect Signature Matched (Identical deletion pattern)
- **Reproduction Verdict:** CONFIRMED_REPRODUCED

### Evidence Triad Verification
- [x] Video Recorded: `s3://tracecase-public-safe/evidence/tc1/video.webm` (Duration: 8.4s)
- [x] Console Log Captured: `s3://tracecase-public-safe/evidence/tc1/console.log` (Lines: 42)
- [x] Network Trace Captured: `s3://tracecase-public-safe/evidence/tc1/network.json` (Requests: 18)
- [x] Secret Scrubbing Verified: 0 plaintext matches against regex suite

### Final Gate Assessment: PASS
```

### 17.2 Defect / Bug Record Template
```markdown
# TraceCase Internal Defect Report: [DEF-XXXX]

**Title:** [Component] Short concise description of failure  
**Severity:** Critical / High / Medium / Low  
**Discovery Gate:** Gate 0 - Gate 7  
**Found By:** [Role Name]  
**Assigned To:** [Role Name]  

### Description & Preconditions
[Detailed description of what failed, including environment variables, database state, and network connectivity.]

### Steps to Reproduce
1. Step 1...
2. Step 2...
3. Step 3...

### Expected Behavior
[What the system should have done according to specifications]

### Actual Behavior
[What the system actually did, including error codes and stack traces]

### Evidence & Artifact Links
- Error Log: [Link or path to log snippet]
- Database Dump: [Link to state capture]

### Root Cause Analysis
[Technical explanation of why the failure occurred]

### Remediation & Verification Plan
- Fix PR: #[PR Number]
- Verification Test: [Test ID verifying the fix]
```


---

# PART II — DEPLOYMENT AND OPERATIONS RUNBOOK

---

## 18. Deployment Topology & Container Architecture

TraceCase is architected as an isolated, containerized multi-tier distributed system. The operational topology guarantees strict network segregation, sandboxed browser execution, dedicated queue processing, and encrypted evidence storage.

```
+---------------------------------------------------------------------------------------------------+
|                                  TRACCASE DEPLOYMENT TOPOLOGY                                    |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Developer / Evaluator Web Browser]                                                              |
|        |                                                                                          |
|        | HTTP / HTTPS / SSE (Port 3000)                                                           |
|        v                                                                                          |
|  +---------------------------------------------------------------------------------------------+  |
|  | Container 1: frontend-backend (Next.js 15 App Router)                                       |  |
|  | - UI Presentation Layer (Tailwind, Radix, Lucide)                                           |  |
|  | - Server Actions & REST API Route Handlers                                                  |  |
|  | - SSE Event Bus (/api/investigations/:id/stream)                                            |  |
|  | - Luna Model Adapter (OpenAI GPT-6 Integration)                                             |  |
|  | - Drizzle ORM Data Access Layer                                                             |  |
|  +---------------------------------------------------------------------------------------------+  |
|            |                                            |                                         |
|            | Job Dispatch (pg-boss)                     | State & Event Storage                   |
|            v                                            v                                         |
|  +-------------------------------------+      +------------------------------------------------+  |
|  | Container 2: browser-worker         |      | Container 3: postgres (PostgreSQL 15)          |  |
|  | - pg-boss Queue Consumer            |      | - Persistent Relational Schema                 |  |
|  | - Policy Engine Guardrails          | ---> | - pg-boss Job Queues                           |  |
|  | - Playwright Chromium Headless      |      | - Audit Logs & Event Streams                   |  |
|  | - In-Stream Regex Redactor          |      +------------------------------------------------+  |
|  | - Evidence Packager & Uploader      |                        ^                                 |
|  +-------------------------------------+                        |                                 |
|            |                          |                         | Storage Metadata                |
|            | CDP Interaction          | Artifact Upload         |                                 |
|            v                          v                         v                                 |
|  +---------------------------+  +--------------------------------------------------------------+  |
|  | Container 5: demo-target  |  | Container 4: storage (MinIO Object Storage)                  |  |
|  | - TraceCase-Demo-Tasks    |  | - Bucket: tracecase-public-safe (Public Safe Evidence)       |  |
|  | - Bug Seeding Flags       |  | - Bucket: tracecase-restricted-raw (Quarantined Raw 72h TTL)|  |
|  | - Fixture Reset Endpoint  |  +--------------------------------------------------------------+  |
|  +---------------------------+                                                                    |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### 18.1 Service Inventory & Container Specifications

| Container Name | Base Image | Port Bindings | Memory Limit | CPU Limit | Primary Responsibility |
|---|---|---|---|---|---|
| `frontend-backend` | `node:20-alpine` | `3000:3000` | 2048 MB | 2.0 vCPU | Serves Next.js UI, REST APIs, SSE streams, Luna API client. |
| `browser-worker` | `mcr.microsoft.com/playwright:v1.48.0-jammy` | `3001:3001` (Health) | 4096 MB | 2.0 vCPU | Consumes jobs, controls Playwright browser, enforces policy engine, packages evidence. |
| `postgres` | `postgres:15-alpine` | `5432:5432` | 1024 MB | 1.0 vCPU | Houses application data, job queues (`pg-boss`), audit trails. |
| `storage` | `minio/minio:RELEASE.2024-09-13T20-26-02Z` | `9000:9000`, `9001:9001` | 1024 MB | 1.0 vCPU | S3-compatible evidence storage with separate public and raw quarantine buckets. |
| `demo-target` | `node:20-alpine` | `3005:3000` | 512 MB | 0.5 vCPU | Isolated staging target application for benchmark evaluation and reset hooks. |

### 18.2 Inter-Service Networking & Isolation
- **Docker Network:** `tracecase-net` (driver: bridge, internal IP subnet `172.28.0.0/16`).
- **Network Boundaries:**
  - Only `frontend-backend` (port 3000) and `storage` console (port 9001) are exposed to the host system.
  - `browser-worker` connects outbound to `demo-target:3000`, `postgres:5432`, `storage:9000`, and external `api.openai.com:443`.
  - `demo-target` has zero connectivity to `postgres` or `storage`, guaranteeing target isolation.
  - DNS resolution is handled internally by Docker daemon DNS (`127.0.0.11`).

---

## 19. Environment Inventory & Staging Targets

TraceCase recognizes three standard runtime environments. Transitions between environments are governed by strict configuration files.

### 19.1 Environment Tier Matrix

| Environment Tier | Target Host / URL | Infrastructure Type | Purpose & Constraints |
|---|---|---|---|
| **Local Dev (`local-dev`)** | `http://localhost:3000` | Docker Compose on developer workstation | Local feature development, fast unit testing, mock or live AI responses. |
| **Staging Demo (`staging-demo`)** | `http://demo.tracecase.internal:3000` | Cloud VM or dedicated test host | Official hackathon benchmark execution (TC1–TC4), evaluator live demo. |
| **Automated CI (`test-harness`)** | `http://runner-job:3000` | Ephemeral GitHub Actions runner container | Headless contract validation, unit tests, Zod schema regression suites. |

### 19.2 Staging Target Catalog
For reliable evaluation, TraceCase pairs with an instrumented reference application:
- **Application Name:** `TraceCase-Demo-Tasks`
- **Source Location:** `targets/demo-tasks`
- **Container Name:** `demo-target`
- **Accessible URL:** `http://demo-target:3005` (internal bridge: `http://demo-target:3000`)
- **Configurable Defect Toggles (Environment Variables):**
  - `FEATURE_FILTER_OFFSET_BUG=true|false`: Enables the TC1 array index deletion defect.
  - `DEBUG_AUTH_LEAK=true|false`: Emits JWT and API keys in console and network requests for TC4 testing.
  - `ENABLE_PURGE_BUTTON=true|false`: Activates high-risk destructive button for TC3 sandbox testing.
- **Fixture Reset API Contract:**
  - **Endpoint:** `POST /api/test/reset-fixture`
  - **Headers:** `Content-Type: application/json`, `X-TraceCase-Reset-Auth: tc-fixture-secret-2026`
  - **Request Payload:**
    ```json
    {
      "fixture": "standard_tasks",
      "seed_count": 4
    }
    ```
  - **Response Payload:** HTTP 200 OK
    ```json
    {
      "status": "reset_successful",
      "timestamp": "2026-10-20T14:32:01.450Z",
      "active_count": 2,
      "completed_count": 2
    }
    ```

---

## 20. Runtime Prerequisites & System Compatibility

The host operating environment must fulfill the following technical baseline before initializing TraceCase services.

### 20.1 System Baseline Requirements
- **Host OS:**
  - Linux: Ubuntu 22.04 LTS or 24.04 LTS (x86_64 or aarch64).
  - macOS: macOS 14 (Sonoma) or macOS 15 (Sequoia) on Apple Silicon (M1/M2/M3) or Intel.
  - Windows: Windows 11 64-bit with WSL2 (Ubuntu 22.04) or native PowerShell 7+.
- **Node.js Runtime:** Version `20.18.0 LTS` (minimum supported: `>= 20.10.0`).
- **Package Manager:** `pnpm` version `9.12.0` (strictly $ge 9.0.0$).
- **Container Engine:** Docker Engine `>= 24.0.0` and Docker Compose `>= v2.20.0`.
- **System Memory:** Minimum 8 GB physical RAM (16 GB strongly recommended for parallel Playwright and video encoding).
- **Disk Storage:** Minimum 20 GB free space on SSD storage volume.

---

## 21. Configuration & Environment-Variable Register

Every configuration parameter across the TraceCase ecosystem is defined in this exhaustive register. No magic strings or undocumented variables are permitted.

| Variable Name | Component | Type | Default Value | Req Prod | Secret? | Description |
|---|---|---|---|---|---|---|
| `NODE_ENV` | All | Enum | `development` | Yes | No | Runtime environment (`development`, `production`, `test`). |
| `PORT` | Frontend | Number | `3000` | Yes | No | HTTP listening port for Next.js web application. |
| `DATABASE_URL` | Frontend, Worker | String | `postgres://tc_user:tc_pass@postgres:5432/tracecase` | Yes | Yes | PostgreSQL connection URI including authentication credentials. |
| `OPENAI_API_KEY` | Frontend, Luna | String | `None` | Yes | Yes | API Key for authenticating calls to OpenAI GPT-6. |
| `OPENAI_MODEL_ID` | Luna Adapter | String | `gpt-6-luna` | Yes | No | Specific model identifier for GPT-6 Luna. |
| `OPENAI_BASE_URL` | Luna Adapter | String | `https://api.openai.com/v1` | No | No | Base endpoint for OpenAI API (overridable for testing mocks). |
| `S3_ENDPOINT` | Frontend, Worker | String | `http://storage:9000` | Yes | No | S3-compatible object storage HTTP/HTTPS endpoint. |
| `S3_ACCESS_KEY` | Frontend, Worker | String | `tracecase_admin` | Yes | Yes | Object storage access key ID. |
| `S3_SECRET_KEY` | Frontend, Worker | String | `tracecase_secret_key_2026` | Yes | Yes | Object storage secret access key. |
| `S3_BUCKET_PUBLIC` | Frontend, Worker | String | `tracecase-public-safe` | Yes | No | Bucket storing sanitized public evidence triads. |
| `S3_BUCKET_RESTRICTED` | Worker | String | `tracecase-restricted-raw` | Yes | No | Bucket storing quarantined raw traces (encrypted, 72h TTL). |
| `WORKER_PORT` | Worker | Number | `3001` | Yes | No | Internal health check port for browser worker daemon. |
| `WORKER_CONCURRENCY` | Worker | Number | `1` | Yes | No | Number of simultaneous browser runs per worker daemon (`TC-INV-011`). |
| `MAX_ACTIONS_PER_PLAN` | Controller | Number | `20` | Yes | No | Upper bound of browser interactions allowed in a single plan. |
| `ACTION_TIMEOUT_MS` | Worker | Number | `15000` | Yes | No | Timeout in milliseconds for individual Playwright browser actions. |
| `ATTEMPT_TIMEOUT_MS` | Worker | Number | `180000` | Yes | No | Hard wall-clock limit (3 min) for a complete reproduction attempt. |
| `COST_ALERT_THRESHOLD_USD` | Luna Adapter | Number | `5.00` | Yes | No | Cumulative spend threshold triggering operator UI warnings. |
| `COST_HARD_CEILING_USD` | Luna Adapter | Number | `20.00` | Yes | No | Absolute maximum cumulative AI spend per session before hard halt. |
| `TARGET_RESET_SECRET` | Worker, Target | String | `tc-fixture-secret-2026` | Yes | Yes | Shared bearer token for authorizing `POST /api/test/reset-fixture`. |
| `POLICY_ENFORCE_SANDBOX` | Policy Engine | Boolean | `true` | Yes | No | When true, rejects destructive actions if `is_sandbox != true`. |

---

## 22. Secret Management & Credential Lifecycle

TraceCase implements a zero-leakage credential lifecycle, enforcing separation of secrets across local development, CI automation, and demonstration environments.

### 22.1 Secret Storage Tiers
1. **Local Development:** Secrets reside exclusively in `.env.local`. This file is explicitly declared in `.gitignore`. A git pre-commit hook checks for accidental commits of `.env` or credential patterns.
2. **Automated CI/CD:** Credentials (`OPENAI_API_KEY`, staging credentials) are provisioned via GitHub Repository Secrets and injected as ephemeral environment variables during test runs.
3. **Staging / Evaluation Containers:** Secrets are passed through Docker Compose via a protected `.env` file possessing `chmod 600` file system permissions on the host.

### 22.2 Credential Rotation Protocol
- **OpenAI API Key Rotation:**
  1. Generate new API key in OpenAI Developer Console.
  2. Update `OPENAI_API_KEY` in `.env` on staging host.
  3. Execute rolling restart of `frontend-backend` service: `docker compose restart frontend-backend`.
  4. Verify health endpoint: `curl http://localhost:3000/api/health`.
  5. Revoke old key in OpenAI Console.
- **Database & Storage Credential Rotation:**
  - Handled via synchronized update of `DATABASE_URL` and `S3_SECRET_KEY` followed by atomic compose restart: `docker compose up -d --force-recreate`.

---

## 23. Local Bootstrap & Developer Setup Procedure

This operational procedure provides an uninterrupted, reproducible path to bring up the complete TraceCase system from a fresh git clone.

### 23.1 Procedure Steps (`OPS-PROC-BOOTSTRAP`)

```bash
# 1. Clone repository and enter directory
git clone https://github.com/organization/tracecase.git
cd tracecase

# 2. Verify Node.js and pnpm prerequisites
node -v   # Must report >= v20.10.0
pnpm -v   # Must report >= 9.0.0
docker -v # Must report >= 24.0.0

# 3. Install project dependencies
pnpm install --frozen-lockfile

# 4. Initialize environment configuration
cp .env.example .env.local
# (Edit .env.local and populate OPENAI_API_KEY with valid key)

# 5. Launch background infrastructure containers
docker compose up -d postgres storage demo-target

# 6. Wait for PostgreSQL readiness
docker compose exec postgres pg_isready -U tc_user -d tracecase
# Expected output: "/var/run/postgresql:5432 - accepting connections"

# 7. Apply Drizzle database migrations and seed default target catalog
pnpm db:migrate
pnpm db:seed

# 8. Install Playwright browser binaries
pnpm exec playwright install chromium --with-deps

# 9. Launch TraceCase web application and background worker daemon
pnpm dev
```

### 23.2 Bootstrap Verification Checklist
- [ ] Next.js UI reachable at `http://localhost:3000`
- [ ] Worker health check responds OK at `http://localhost:3001/health`
- [ ] MinIO storage console accessible at `http://localhost:9001` (User: `tracecase_admin`, Pass: `tracecase_secret_key_2026`)
- [ ] Staging demo target responds at `http://localhost:3005`
- [ ] Reset fixture endpoint responds OK: `curl -X POST http://localhost:3005/api/test/reset-fixture -H "X-TraceCase-Reset-Auth: tc-fixture-secret-2026"`

---

## 24. Production Release & Deployment Procedure

For staging evaluation and final hackathon presentation, TraceCase is deployed as an immutable container bundle.

### 24.1 Production Deployment Procedure (`OPS-PROC-DEPLOY`)

```bash
# Step 1: Pre-Deployment Build & Verification
pnpm lint
pnpm test:unit
pnpm test:security

# Step 2: Build Multi-Stage Docker Images
docker compose -f docker-compose.prod.yml build --no-cache

# Step 3: Run Database Migrations in Isolation
docker compose -f docker-compose.prod.yml run --rm frontend-backend pnpm db:migrate

# Step 4: Deploy Container Fleet with Zero-Downtime Recreation
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Step 5: Post-Deployment Smoke Verification
curl -f http://localhost:3000/api/health || exit 1
curl -f http://localhost:3001/health || exit 1
curl -f http://localhost:3005/health || exit 1
```

---

## 25. Database Migration & Schema Release Policy

Database evolution in TraceCase is strictly governed by Drizzle ORM migration scripts to prevent data loss or schema drift.

### 25.1 Schema Governance Rules
1. **Zero Raw SQL in Production:** All table definitions, foreign keys, enums, and indexes must be declared in TypeScript within `src/lib/db/schema.ts`.
2. **Deterministic Migration Files:** Migrations are generated via `pnpm db:generate` and output timestamped SQL files to `drizzle/migrations/`.
3. **The Expand-Contract Principle:** Any schema modification that removes or renames a column must occur in two separate releases:
   - *Phase 1 (Expand):* Add new nullable column. Deploy code that writes to both old and new columns.
   - *Phase 2 (Contract):* Backfill data. Update code to read exclusively from new column. Drop old column in subsequent migration.
4. **Idempotent Execution:** Every migration script must be wrapped in a transaction block (`BEGIN ... COMMIT`) ensuring atomic rollback on syntax or constraint errors.


---

## 26. Worker Daemon Lifecycle & Playwright Management

The Browser Worker is an autonomous Node.js daemon running alongside Playwright. It processes reproduction jobs from the `pg-boss` queue, executes browser automation under strict safety guardrails, packages evidence, and maintains deterministic state.

### 26.1 Concurrency & Worker State Machine
In strict adherence to `TC-INV-011`, each worker daemon executes exactly **one** browser investigation at any given moment (`WORKER_CONCURRENCY = 1`). This eliminates GPU/CPU resource contention during video capture and prevents cross-test state pollution.

```
+---------------------------------------------------------------------------------------------------+
|                                 WORKER DAEMON LIFECYCLE STATES                                    |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [IDLE] <--------------------------------------------------------------------+                    |
|     |                                                                        |                    |
|     | Poll job from pg-boss queue                                            |                    |
|     v                                                                        |                    |
|  [CLAIMING_JOB]                                                              |                    |
|     | Acquire database target lock (target_locks table)                      |                    |
|     v                                                                        |                    |
|  [ACQUIRING_LOCK] --(Lock Failed / Collided)---------------------------------+                    |
|     |                                                                        |                    |
|     | Lock Granted                                                           |                    |
|     v                                                                        |                    |
|  [LAUNCHING_BROWSER] (Isolated Chromium Context + CDP + Video)               |                    |
|     |                                                                        |                    |
|     v                                                                        |                    |
|  [EXECUTING_ATTEMPT_1]                                                       |                    |
|     | Step-by-step CDP action dispatch with Policy Engine checks             |                    |
|     v                                                                        |                    |
|  [EVALUATING_ATTEMPT_1]                                                      |                    |
|     | If defect not observed or target crashes -> Finalize early             |                    |
|     v                                                                        |                    |
|  [RESETTING_TARGET] (POST /api/test/reset-fixture)                            |                    |
|     | If reset fails -> Transition INCONCLUSIVE, abort Run 2                 |                    |
|     v                                                                        |                    |
|  [EXECUTING_ATTEMPT_2] (Fresh Chromium Context + Video)                      |                    |
|     | Identical execution trace                                              |                    |
|     v                                                                        |                    |
|  [PACKAGING_EVIDENCE] (In-stream secret scrub, transcode, checksum)          |                    |
|     |                                                                        |                    |
|     v                                                                        |                    |
|  [UPLOADING_S3] (tracecase-public-safe & tracecase-restricted-raw)           |                    |
|     |                                                                        |                    |
|     v                                                                        |                    |
|  [RELEASING_LOCK] (Target lock cleared, pg-boss job completed)               |                    |
|     |                                                                        |                    |
|     +------------------------------------------------------------------------+                    |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### 26.2 Browser Context Isolation & Zombie Process Cleanup
- **Ephemeral Context per Attempt:** Each execution run (Run 1 and Run 2) launches an isolated browser context:
  ```typescript
  const context = await browser.newContext({
    recordVideo: { dir: `/tmp/artifacts/${attemptId}/video`, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });
  ```
- **Process Supervisor & Reaping:** The worker Docker container runs `tini` as PID 1 (`ENTRYPOINT ["/usr/bin/tini", "--", "node", "dist/worker.js"]`).
- **Emergency Process Cleanup:** On job completion, timeout, or crash, the worker enforces process cleanup:
  ```typescript
  async function forceCleanupBrowser(browser: Browser, pid: number) {
    try {
      await browser.close();
    } catch {
      process.kill(pid, 'SIGKILL');
    }
  }
  ```
- **Graceful Shutdown Protocol:** Upon receiving `SIGTERM` or `SIGINT`, the worker:
  1. Stops polling `pg-boss` for new jobs.
  2. Awaits current running attempt completion up to a 30-second drain window.
  3. If attempt exceeds drain window, sets attempt state to `ABORTED_WORKER_SHUTDOWN`.
  4. Releases all database locks in `target_locks`.
  5. Exits cleanly with status code 0.

---

## 27. Health Checks, Readiness Probes & Monitoring

The system exposes dedicated health endpoints to facilitate container orchestration and proactive monitoring.

### 27.1 Endpoint Specifications
- **Frontend / API Service:** `GET http://localhost:3000/api/health`
  - Checks PostgreSQL connectivity via `SELECT 1`.
  - Checks S3 object storage connectivity via `ListBuckets`.
  - Checks pg-boss connection status.
  - HTTP 200 if all services healthy; HTTP 503 if any dependency fails.
- **Browser Worker Daemon:** `GET http://localhost:3001/health`
  - Checks queue subscription status.
  - Checks Chromium executable launchability.
  - Verifies free disk space in `/tmp` exceeds 2 GB.
  - Reports current worker state (`IDLE`, `EXECUTING`).

### 27.2 Structured Logging Contract
All services emit structured JSON logs to `stdout`:
```json
{
  "timestamp": "2026-10-20T14:35:10.124Z",
  "level": "INFO",
  "service": "browser-worker",
  "investigationId": "inv-99281a",
  "attemptId": "att-01",
  "actionIndex": 3,
  "action": "click_button",
  "selector": "button[data-testid='filter-active']",
  "durationMs": 142,
  "status": "SUCCESS"
}
```

---

## 28. Cost and Token Quota Management

To prevent runaway OpenAI API expenditure, TraceCase enforces strict three-tier financial guardrails.

### 28.1 Budget Enforcement Tiers

| Tier Level | Cumulative Spend Ceiling | System Action & Behavioral Constraint |
|---|---|---|
| **Tier 1 (Normal Operations)** | $$0.00 - $4.99$ | All Luna roles operate normally. Token usage logged per request in `token_usage` table. |
| **Tier 2 (Soft Warning)** | $$5.00 - $9.99$ | UI displays prominent yellow banner: *"Warning: AI budget has reached $5.00."* Operations continue without interruption. |
| **Tier 3 (Confirmation Gate)** | $$10.00 - $19.99$ | Launching a new investigation requires explicit operator confirmation modal acknowledging expenditure. |
| **Tier 4 (Hard Stop Ceiling)** | $ge $20.00$ | **SYSTEM HALT.** All outgoing calls to OpenAI API are hard-blocked by the client wrapper. System shifts to read-only replay mode. |

### 28.2 Token Ledger & Usage Tracking
Token counts are extracted from OpenAI API response headers and metadata:
```typescript
export async function trackTokenUsage(db: DB, invId: string, role: string, usage: OpenAIUsage) {
  const inputCost = (usage.prompt_tokens / 1000) * 0.01; // $0.01 / 1k prompt
  const outputCost = (usage.completion_tokens / 1000) * 0.03; // $0.03 / 1k completion
  const totalCost = inputCost + outputCost;

  await db.insert(tokenUsageTable).values({
    investigationId: invId,
    role: role,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    costUsd: totalCost,
    createdAt: new Date()
  });

  const cumulativeSpend = await getCumulativeSpend(db);
  if (cumulativeSpend >= 20.00) {
    throw new HardBudgetExceededError("Hard stop ceiling ($20.00) reached. API blocked.");
  }
}
```

---

## 29. Storage Operations and Retention Enforcement

Evidence storage is split across two cryptographically separated S3 buckets.

### 29.1 Dual-Bucket Storage Architecture
1. **Public Safe Bucket (`tracecase-public-safe`):**
   - Stores sanitized, operator-sharable evidence: `video.webm`, `console.log`, `network.json`, and summary markdown.
   - All files have been scrubbed by the in-stream regex redactor.
   - Retention policy: Indefinite (or 30 days in demo environments).
2. **Restricted Raw Bucket (`tracecase-restricted-raw`):**
   - Stores raw unredacted CDP event streams, memory snapshots, and unmasked HAR files for post-mortem forensics.
   - Encrypted at rest using AES-256-GCM.
   - Access restricted to security administrators.
   - **Enforced Lifecycle Expiration:** Strict 72-hour TTL. An S3 lifecycle policy permanently deletes raw artifacts after 3 days.

### 29.2 MinIO / S3 Lifecycle Configuration
```xml
<LifecycleConfiguration>
  <Rule>
    <ID>ExpireRawRestrictedArtifacts</ID>
    <Status>Enabled</Status>
    <Filter>
      <Prefix>restricted-raw/</Prefix>
    </Filter>
    <Expiration>
      <Days>3</Days>
    </Expiration>
  </Rule>
</LifecycleConfiguration>
```

---

## 30. Target Onboarding and Sandbox Verification

Before any target web application is registered in TraceCase, it must undergo deterministic onboarding validation.

### 30.1 Onboarding Verification Protocol (`OPS-PROC-ONBOARD`)
1. **Domain Origin Audit:** Verify target URL is fully qualified and matches configured hostnames.
2. **Sandbox Declaration Verification:**
   - If `is_sandbox = true`: The target must be confirmed to point to an isolated staging, test, or ephemeral container environment. **Never point a sandbox registration to a production URL.**
3. **Reset Hook Probe:** The onboarding script sends a test request to `POST /api/test/reset-fixture`.
   - Must return HTTP 200 OK within 5000ms.
   - Must return valid JSON indicating successful baseline restoration.
4. **Target Registration Record:** Target is written to `targets` database table with assigned safety tier.

---

## 31. Backup, Restore, and Disaster Recovery

### 31.1 Backup Procedures
- **PostgreSQL Database:** Automated daily dump via `pg_dump`:
  ```bash
  pg_dump -U tc_user -Fc tracecase > /backups/tracecase_$(date +%Y%m%d_%H%M%S).dump
  ```
- **Object Storage Volumes:** MinIO data volumes mounted on host SSD are backed up via hourly snapshot or filesystem backup.

### 31.2 Disaster Recovery Procedure (`OPS-PROC-RESTORE`)
In the event of database corruption or total VM loss:
```bash
# 1. Spin up clean infrastructure containers
docker compose -f docker-compose.prod.yml up -d postgres storage

# 2. Restore PostgreSQL dump
docker compose exec -T postgres pg_restore -U tc_user -d tracecase < /backups/latest.dump

# 3. Verify database integrity
docker compose exec postgres psql -U tc_user -d tracecase -c "SELECT count(*) FROM investigations;"

# 4. Launch remaining application containers
docker compose -f docker-compose.prod.yml up -d frontend-backend browser-worker demo-target
```
- **Recovery Point Objective (RPO):** 1 hour.
- **Recovery Time Objective (RTO):** 15 minutes.

---

## 32. Operational Incident Playbooks (OPS-INC-001 through OPS-INC-018)

These 18 playbooks provide unambiguous, step-by-step remediation procedures for every anticipated operational anomaly.

### OPS-INC-001: Worker Deadlock / Heartbeat Expiration
- **Trigger:** Worker daemon ceases emitting heartbeats to `pg-boss` for $> 30	ext{ seconds}$ while holding an active job.
- **Severity:** High
- **Automatic Action:** `pg-boss` marks job as expired; sets investigation status to `FAILED_HEARTBEAT_TIMEOUT`. Target lock in `target_locks` is cleared.
- **Operator Remediation:**
  1. Inspect worker container logs: `docker compose logs --tail=100 browser-worker`.
  2. Check for frozen Playwright process: `docker compose exec browser-worker ps aux`.
  3. Restart worker daemon: `docker compose restart browser-worker`.
  4. Manually re-queue investigation from UI if needed.

### OPS-INC-002: Target Application Unreachable (ECONNREFUSED / 502)
- **Trigger:** Worker receives `net::ERR_CONNECTION_REFUSED` or HTTP 502/503 when navigating to target URL.
- **Severity:** Medium
- **Automatic Action:** Worker retries navigation 2x with 3000ms pause. If persistent, aborts run, records `TARGET_UNRESPONSIVE`, sets verdict `INCONCLUSIVE`.
- **Operator Remediation:**
  1. Check target container health: `docker compose ps demo-target`.
  2. Verify target logs: `docker compose logs demo-target`.
  3. Restart target: `docker compose restart demo-target`.
  4. Verify network connectivity from worker: `docker compose exec browser-worker curl -I http://demo-target:3000`.

### OPS-INC-003: Target Reset Fixture Failure (HTTP 500 / Timeout)
- **Trigger:** Worker calls `POST /api/test/reset-fixture` between Run 1 and Run 2; endpoint returns HTTP 500 or times out.
- **Severity:** High
- **Automatic Action:** **Run 2 is strictly blocked.** System transitions investigation to `INCONCLUSIVE_FIXTURE_RESET_FAILED` (`TC-INV-006`).
- **Operator Remediation:**
  1. Check target database state and logs.
  2. Manually test reset hook: `curl -X POST http://localhost:3005/api/test/reset-fixture -H "X-TraceCase-Reset-Auth: tc-fixture-secret-2026"`.
  3. Resolve target database locking or crash.

### OPS-INC-004: OpenAI API Outage or Rate Limit Storm (HTTP 429)
- **Trigger:** OpenAI API returns HTTP 429 Rate Limit Exceeded or HTTP 503 Service Unavailable.
- **Severity:** Medium
- **Automatic Action:** Client wrapper executes exponential backoff with jitter (up to 4 retries over 30s).
- **Operator Remediation:**
  1. Check OpenAI API status dashboard: `https://status.openai.com`.
  2. Verify rate limit quotas on OpenAI dashboard.
  3. If quota exhausted, rotate API key or upgrade tier.

### OPS-INC-005: In-Stream Redaction Failure / Potential Secret Leak Detected
- **Trigger:** Post-run evidence verifier detects unredacted secret pattern in public S3 bucket artifact.
- **Severity:** Critical
- **Automatic Action:** Verifier quarantines public artifact immediately; replaces public object with red notice: `[EVIDENCE QUARANTINED FOR SECURITY REVIEW]`. Sets evidence state to `QUARANTINED_LEAK_DETECTED`.
- **Operator Remediation:**
  1. Revoke the leaked credential immediately in the upstream system (e.g. rotate leaked API key or invalidate JWT secret).
  2. Update regex patterns in `src/lib/sanitization/regex-redactor.ts`.
  3. Run unit tests: `pnpm test:security`.
  4. Deploy patched worker container.

### OPS-INC-006: S3 / MinIO Storage Exhaustion or Network Failure
- **Trigger:** Worker fails to upload video or logs to MinIO (HTTP 500 / Connection Refused / Disk Full).
- **Severity:** High
- **Automatic Action:** Artifacts remain cached locally in `/tmp/artifacts`. Worker retries upload 3x. If persistent, investigation marked `STORAGE_SYNC_FAILED`.
- **Operator Remediation:**
  1. Check MinIO container disk space: `docker compose exec storage df -h /data`.
  2. Clean up old test buckets or prune unneeded volumes.
  3. Restart MinIO container: `docker compose restart storage`.
  4. Trigger manual artifact sync script: `pnpm ops:sync-artifacts`.

### OPS-INC-007: Chromium Zombie Process Leakage / Memory Exhaustion (OOM)
- **Trigger:** Worker host RAM utilization exceeds 90%; Playwright Chrome processes accumulate in process table.
- **Severity:** High
- **Automatic Action:** Docker memory limit (4096 MB) prevents host system crash; container may restart via OOM killer.
- **Operator Remediation:**
  1. Inspect running processes inside worker: `docker compose exec browser-worker ps aux | grep chrome`.
  2. Execute emergency process kill: `docker compose exec browser-worker pkill -9 -f chrome`.
  3. Restart worker: `docker compose restart browser-worker`.
  4. Verify `tini` PID 1 init process is functioning.

### OPS-INC-008: Plan Approval Hash Tampering Detected
- **Trigger:** Hash of the execution plan payload does not match the approved `plan_hash` stored in database.
- **Severity:** Critical Security Alert
- **Automatic Action:** Worker halts immediately with `SECURITY_APPROVAL_TAMPERING_DETECTED` (`TC-INV-004`). Execution aborted; zero browser clicks dispatched.
- **Operator Remediation:**
  1. Inspect audit logs for tampering source IP and user ID.
  2. Verify if a concurrent plan modification occurred without re-requesting human approval.
  3. Require operator to re-review and re-approve the updated plan.

### OPS-INC-009: Mutation Uncertainty on Mutating Action (Timeout)
- **Trigger:** Worker executes mutating button click (e.g. "Submit Order"); action times out before network response completes.
- **Severity:** Medium
- **Automatic Action:** Action flagged as `MUTATION_UNCERTAIN`. Automated retries are strictly blocked (`TC-INV-013`). Investigation pauses.
- **Operator Remediation:**
  1. Inspect browser screenshot at timeout.
  2. Check target application state to see if mutation took effect.
  3. Operator issues explicit instruction: "Abort and Reset Target" or "Continue Assertion".

### OPS-INC-010: Execution Loop / Circuit Breaker Trip
- **Trigger:** Worker executes the same action sequence 3 consecutive times with identical DOM hash before and after.
- **Severity:** Low
- **Automatic Action:** Circuit breaker trips. Plan terminates with `FAILED_EXECUTION_LOOP`.
- **Operator Remediation:**
  1. Review generated plan steps.
  2. Update Luna planner prompt to avoid infinite pagination or unclickable element loops.

### OPS-INC-011: CAPTCHA / 2FA Gate Detected
- **Trigger:** Target DOM or network request contains Cloudflare challenge, hCaptcha iframe, or 2FA prompt.
- **Severity:** Medium
- **Automatic Action:** Automated interactions halt immediately. Status set to `PAUSED_FOR_MANUAL_AUTH` (`TC-INV-010`). Operator alerted via UI.
- **Operator Remediation:**
  1. Operator opens manual intervention window in browser.
  2. Operator solves CAPTCHA or completes 2FA.
  3. Operator clicks "Resume Investigation" in UI.

### OPS-INC-012: Target Sandbox Flag Misconfiguration
- **Trigger:** User attempts to run a destructive plan on a target where `is_sandbox = false`.
- **Severity:** High
- **Automatic Action:** Policy engine blocks execution with `TARGET_NOT_SANDBOX_DESTRUCTIVE_FORBIDDEN` (`TC-INV-008`).
- **Operator Remediation:**
  1. Confirm whether the target is truly an isolated sandbox.
  2. If verified as an isolated sandbox, update the target configuration in the Target Management UI setting `is_sandbox = true`.
  3. If target is production, reject destructive testing.

### OPS-INC-013: Video Transcoding / Corruption Failure
- **Trigger:** Playwright `recordVideo` produces an unfinalized or corrupted `.webm` file on browser crash.
- **Severity:** Low
- **Automatic Action:** Evidence packager attempts FFmpeg repair: `ffmpeg -i input.webm -c copy fixed.webm`. If repair fails, packages screenshots and logs; flags `video_status = CORRUPTED`.
- **Operator Remediation:**
  1. Verify FFmpeg binary installed in worker container.
  2. Check disk space in `/tmp/artifacts`.

### OPS-INC-014: Server-Sent Events (SSE) Stream Disconnection
- **Trigger:** Frontend browser loses SSE connection to `/api/investigations/:id/stream`.
- **Severity:** Low
- **Automatic Action:** Frontend client automatically reconnects with exponential backoff using `Last-Event-ID` header.
- **Operator Remediation:**
  1. Verify reverse proxy (Nginx / Cloudflare) supports HTTP streaming and buffering is disabled (`proxy_buffering off;`).

### OPS-INC-015: Database Connection Pool Starvation
- **Trigger:** PostgreSQL rejects client connections with `FATAL: remaining connection slots are reserved for non-replication superuser connections`.
- **Severity:** High
- **Automatic Action:** Drizzle client retries connection up to 3x with backoff.
- **Operator Remediation:**
  1. Check active database connections: `docker compose exec postgres psql -U tc_user -d tracecase -c "SELECT count(*) FROM pg_stat_activity;"`.
  2. Increase `max_connections` in `postgresql.conf` (e.g. from 100 to 200).
  3. Ensure application connection pools specify reasonable `max: 10` limits.

### OPS-INC-016: Hard Cost Ceiling Exceeded ($20.00 Halt)
- **Trigger:** Cumulative OpenAI API token spend exceeds $20.00.
- **Severity:** Critical Operational Halt
- **Automatic Action:** Hard limit blocks all outgoing AI calls. Investigation creation disabled in UI.
- **Operator Remediation:**
  1. Review token spend breakdown in `token_usage` table.
  2. If additional budget is approved, update `COST_HARD_CEILING_USD` in `.env`.
  3. Restart frontend container to apply updated limit.

### OPS-INC-017: Malformed Luna Zod Response (Exceeded Max Retries)
- **Trigger:** GPT-6 Luna returns responses that repeatedly fail Zod validation after 2 retry attempts.
- **Severity:** Medium
- **Automatic Action:** Investigation marked `FAILED_AI_SCHEMA_VALIDATION`. Prompt and raw output logged to diagnostics table.
- **Operator Remediation:**
  1. Inspect raw output in database.
  2. Adjust system prompt in `src/lib/ai/prompts/` to reinforce strict JSON schema output.
  3. Lower model temperature (e.g. from 0.2 to 0.0).

### OPS-INC-018: Concurrent Worker Target Lock Collision
- **Trigger:** Two workers attempt to execute an investigation on the same target application simultaneously.
- **Severity:** Low
- **Automatic Action:** PostgreSQL row-level lock on `target_locks` grants lease to first worker; second worker yields job back to `pg-boss` with 10s delay.
- **Operator Remediation:** None required. System handles target locking deterministically.

---

## 33. Maintenance Windows and Safe Rollback Procedures

### 33.1 Maintenance Window Activation (`OPS-PROC-MAINTENANCE`)
1. Set `MAINTENANCE_MODE=true` in `.env`.
2. UI displays banner: *"System under scheduled maintenance. New investigations paused."*
3. Worker finishes active jobs and enters quiescent state.
4. Perform infrastructure updates or database maintenance.
5. Set `MAINTENANCE_MODE=false` and verify service health.

### 33.2 Safe Rollback Procedure (`OPS-PROC-ROLLBACK`)
If a newly deployed release exhibits critical defects:
```bash
# 1. Rollback code to previous git commit tag
git checkout v1.0.3

# 2. Revert database migration if necessary
pnpm db:rollback

# 3. Rebuild and deploy previous container fleet
docker compose -f docker-compose.prod.yml up -d --build --force-recreate

# 4. Run post-rollback smoke check
curl -f http://localhost:3000/api/health
```

---

## 34. Operational Diagnostics and Troubleshooting Reference

| Symptom | Probable Root Cause | Diagnostic Command | Immediate Remediation |
|---|---|---|---|
| Investigation stuck in `RUNNING` state indefinitely. | Worker crashed without updating database status. | `docker compose ps browser-worker` & check `target_locks` | Restart worker; clear orphaned lock in `target_locks`. |
| Playwright fails with "Target page crashed". | Host container ran out of shared memory (`/dev/shm`). | `docker compose exec browser-worker df -h /dev/shm` | Set `shm_size: '2gb'` in `docker-compose.yml` for worker. |
| Video files show 0 bytes in public S3 bucket. | Context closed before video stream finished writing. | Inspect worker logs for `context.close()` sequencing | Ensure `await page.close()` and `await context.close()` precede file read. |
| SSE connection drops after 60 seconds. | Reverse proxy timeout closing idle HTTP connections. | Inspect Nginx `proxy_read_timeout` | Configure `proxy_read_timeout 300s;` and enable SSE keep-alive pings. |
| OpenAI API calls fail with "Invalid API Key". | Expired or incorrectly formatted key in `.env.local`. | Inspect `OPENAI_API_KEY` length and prefix | Update `.env.local` with valid key starting with `sk-`. |


---

# PART III — EXECUTION AND OWNERSHIP PLAN

---

## 35. Three-Person Hackathon Delivery Model

To ensure rapid, collision-free execution during the hackathon, TraceCase divides system responsibilities across a focused three-person engineering team.

```
+---------------------------------------------------------------------------------------------------+
|                                  THREE-PERSON DELIVERY TEAM MODEL                                 |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +-------------------------------------+      +------------------------------------------------+  |
|  | ROLE 1: Lead / Integrator           |      | ROLE 2: AI & Evaluation Engineer               |  |
|  | (User, Proposed Delivery Lead)      |      |                                                |  |
|  | - System Architecture & Database    |      | - GPT-6 Luna API Client Adapter                |  |
|  | - Policy Engine & Security Gates    | <--> | - Prompt Engineering (Roles 1, 2, 3)           |  |
|  | - Playwright Worker Daemon          |      | - Zod Schemas & Output Validation              |  |
|  | - State Machine & Queue Controller  |      | - AXTree / DOM Pruner                          |  |
|  | - Docker Compose & Cloud Deploy     |      | - Benchmark Harness & Evaluation Metrics       |  |
|  +-------------------------------------+      +------------------------------------------------+  |
|                     ^                                                ^                            |
|                     |                                                |                            |
|                     +-----------------------+------------------------+                            |
|                                             |                                                     |
|                                             v                                                     |
|                      +-----------------------------------------------+                            |
|                      | ROLE 3: Product UI & Evidence Engineer        |                            |
|                      |                                               |                            |
|                      | - Next.js 15 App Router Frontend              |                            |
|                      | - Design System (Lavender/Cobalt/Cards)       |                            |
|                      | - SSE Real-Time Stream Dashboard              |                            |
|                      | - Interactive Clarification Cards             |                            |
|                      | - Plan Approval & Hash Review Modal           |                            |
|                      | - Synced Evidence Triad Video/Log Player      |                            |
|                      +-----------------------------------------------+                            |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### 35.1 Detailed Role Ownership

#### Role 1: Lead / Integrator (User, Proposed Delivery Lead)
- **Primary Mission:** Guard system architecture, orchestrate state transitions, enforce safety invariants, and maintain operational stability.
- **Core Ownership Domains:**
  - Database schema, Drizzle ORM migrations, and `pg-boss` queue configuration.
  - Policy Engine implementation (Tier 1–4 permissions, sandbox restrictions, origin checks).
  - Playwright Browser Worker daemon, browser context pooling, and CDP tracing.
  - Storage infrastructure (MinIO S3 bucket configuration, dual-bucket separation).
  - Docker Compose deployment topologies (`docker-compose.yml`, `docker-compose.prod.yml`).
  - End-to-end integration and final release gate sign-off (Gates 0, 1, 2, 3, 7).

#### Role 2: AI & Evaluation Engineer
- **Primary Mission:** Deliver reliable, schema-compliant, grounded intelligence across all Luna roles and maintain benchmark fidelity.
- **Core Ownership Domains:**
  - OpenAI GPT-6 Luna client integration with structured outputs.
  - System and user prompt engineering for Luna Role 1 (Intake), Role 2 (Planner), and Role 3 (Explainer).
  - Zod schemas for all model inputs and outputs (`NormalizedBugReportSchema`, `ExperimentPlanSchema`, `EvidenceReportSchema`).
  - AXTree / DOM accessibility tree pruner and token optimization filters.
  - Automated benchmark test harness for evaluating the 8-case corpus and official scenarios TC1–TC4.
  - Evaluation metric calculation scripts ($P_c$, $FCR$, $R_2$, $ECI$).
  - In-stream regex secret redactor optimization and credential pattern testing (Gate 4, 5, 6).

#### Role 3: Product UI & Evidence Engineer
- **Primary Mission:** Translate the visual reference system into an intuitive, real-time investigation console for software engineers and evaluators.
- **Core Ownership Domains:**
  - Next.js 15 App Router presentation layer and responsive layouts.
  - Implementation of the approved design language (pale-lavender surfaces, cobalt-blue actions, deep navy text, rounded cards, circular icon buttons).
  - Server-Sent Events (SSE) stream consumer and reactive investigation dashboard.
  - Interactive UI components: Intake Form, Clarification Cards, Plan Review & Approval Modal with cryptographic hash display.
  - Synced Evidence Triad Viewer: synchronized playback of video (`.webm`), searchable console logs, and inspectable network HAR requests.
  - Target management and configuration screens (Gate 7).

---

## 36. Work Breakdown Structure (WBS) and Responsibility Matrix

The TraceCase delivery scope is partitioned into 8 core Work Packages.

### 36.1 Work Package Breakdown

| Work Package ID | Work Package Title | Description | Primary Owner | Supporting |
|---|---|---|---|---|
| **EOP-WP-01** | Core Infrastructure & Persistence | Docker Compose setup, PostgreSQL schema, Drizzle migrations, S3 buckets. | Lead / Integrator | UI Engineer |
| **EOP-WP-02** | Security, Policy Engine & Redaction | Permission boundary enforcer, sandbox guardrails, regex redaction pipeline. | Lead / Integrator | AI Engineer |
| **EOP-WP-03** | Browser Worker & Execution Harness | Playwright CDP worker, context isolation, reset hook integration, video capture. | Lead / Integrator | AI Engineer |
| **EOP-WP-04** | AI Adapter & Prompt Pipelines | GPT-6 Luna client, prompt engineering, Zod validation, AXTree DOM pruner. | AI Engineer | Lead / Integrator |
| **EOP-WP-05** | State Machine & Orchestrator | Controller state transitions, pg-boss job scheduling, run-to-run comparison logic. | Lead / Integrator | AI Engineer |
| **EOP-WP-06** | Evaluation Harness & Benchmarks | Evaluation corpus runner, TC1–TC4 official scenarios, metrics calculation. | AI Engineer | Lead / Integrator |
| **EOP-WP-07** | Product UI & Evidence Dashboard | Next.js 15 UI, SSE streaming, design system, approval modal, Triad player. | UI Engineer | Lead / Integrator |
| **EOP-WP-08** | Staging Deployment & Demonstration | Production container build, demo rehearsal, target application staging. | Lead / Integrator | Full Team |

### 36.2 RACI Matrix

| Task / Deliverable | Lead / Integrator | AI Engineer | UI Engineer |
|---|---|---|---|
| Database Schema & Migrations | **Accountable / Responsible** | Consulted | Informed |
| Policy Engine & Sandbox Rules | **Accountable / Responsible** | Consulted | Informed |
| Browser Worker & Playwright | **Accountable / Responsible** | Consulted | Informed |
| Luna Prompts & Schemas | Consulted | **Accountable / Responsible** | Informed |
| AXTree Pruner & Token Budget | Consulted | **Accountable / Responsible** | Informed |
| Benchmark Suite (TC1–TC4) | Consulted | **Accountable / Responsible** | Informed |
| UI Design System & Components | Consulted | Informed | **Accountable / Responsible** |
| SSE Stream Dashboard | Consulted | Informed | **Accountable / Responsible** |
| Synced Evidence Player | Consulted | Informed | **Accountable / Responsible** |
| Production Container Deployment | **Accountable / Responsible** | Informed | Informed |
| Final Live Presentation Rehearsal | **Accountable** | Responsible | Responsible |

---

## 37. Dependency-Driven Implementation Stages (Stages 0–8)

Implementation proceeds sequentially through 9 strictly gated stages.

```
+---------------------------------------------------------------------------------------------------+
|                                  IMPLEMENTATION STAGE DEPENDENCIES                                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Stage 0: Spec Freeze]                                                                           |
|          |                                                                                        |
|          v                                                                                        |
|  [Stage 1: Core Infra & DB]                                                                       |
|          |                                                                                        |
|          +------------------------------------+                                                   |
|          |                                    |                                                   |
|          v                                    v                                                   |
|  [Stage 2: Browser Worker & Policy]   [Stage 3: AI Adapter & Prompts]                             |
|          |                                    |                                                   |
|          +-----------------+------------------+                                                   |
|                            |                                                                      |
|                            v                                                                      |
|                  [Stage 4: Orchestrator Controller]                                               |
|                            |                                                                      |
|          +-----------------+------------------+                                                   |
|          |                                    |                                                   |
|          v                                    v                                                   |
|  [Stage 5: Demo Target & Fixtures]    [Stage 6: Product UI & Evidence]                            |
|          |                                    |                                                   |
|          +-----------------+------------------+                                                   |
|                            |                                                                      |
|                            v                                                                      |
|                  [Stage 7: Benchmark Run & Redaction Audit]                                       |
|                            |                                                                      |
|                            v                                                                      |
|                  [Stage 8: Demo Deployment & Delivery Sign-off]                                   |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### 37.1 Stage Details & Acceptance Gates
- **Stage 0: Specification Freeze & Setup:** Establish repository, agree on 14 invariants, sign off on TC-TEO-001. Gate 0 pass.
- **Stage 1: Core Infrastructure & Persistence:** Bring up Postgres and MinIO in Docker; apply Drizzle schema migrations; initialize pg-boss. Gate 1 pass.
- **Stage 2: Browser Worker & Policy Engine:** Implement Playwright worker daemon, 16-tool wrappers, Tier 1–4 permission checking, and in-stream regex redaction. Gate 2 & 3 pass.
- **Stage 3: AI Adapter & Prompts:** Integrate GPT-6 Luna client; author prompts for Roles 1, 2, 3; implement Zod schema parsers and DOM pruner. Gate 4 pass.
- **Stage 4: Orchestrator Controller:** Wire state machine transitions, two-run confirmation logic, and fixture reset sequencing in the backend.
- **Stage 5: Demo Target & Staging Fixtures:** Build and containerize `TraceCase-Demo-Tasks` with bug toggles and reset endpoints.
- **Stage 6: Product UI & Evidence Dashboard:** Implement Next.js 15 pages, SSE listener, design tokens, plan approval modal, and synced Evidence Triad viewer.
- **Stage 7: Benchmark Run & Redaction Audit:** Execute full evaluation corpus; prove TC1–TC4 pass with $100%$ redaction and valid evidence triads. Gate 5 & 6 pass.
- **Stage 8: Production Deployment & Delivery Sign-off:** Build production Docker bundle, verify smoke checks, conduct demo dry run. Gate 7 pass.

---

## 38. Integration Contracts and Cross-Role Handoffs

To maintain zero friction, team members interact across six formally defined integration contracts.

### 38.1 Integration Handoff Register

| Handoff ID | Source Role | Destination Role | Contract Artifact | Validation Method |
|---|---|---|---|---|
| **EOP-HANDOFF-01** | Lead / Integrator | AI Engineer | `src/lib/db/schema.ts` & Type Definitions | TypeScript compilation (`pnpm tsc`) |
| **EOP-HANDOFF-02** | AI Engineer | Lead / Integrator | `src/lib/ai/luna-adapter.ts` & Zod Schemas | Automated unit test suite with mock completions |
| **EOP-HANDOFF-03** | Lead / Integrator | UI Engineer | REST Endpoints & SSE Event Specifications | Postman/OpenAPI contract test & SSE curl stream |
| **EOP-HANDOFF-04** | UI Engineer | Lead / Integrator | UI Action Hooks & Approval Payload Builders | End-to-end user interaction test in staging |
| **EOP-HANDOFF-05** | AI Engineer | UI Engineer | Citation Parsing Contract (`[Video @ MM:SS]`) | Regex citation parsing unit test in UI |
| **EOP-HANDOFF-06** | Full Team | Technical Delivery Lead | Complete Benchmark Test Suite Results | Official evaluation scorecard sign-off |

---

## 39. Repository Coordination, Branching, and Review Rules

### 39.1 Branching Strategy
- **`main`:** Production-ready code. Strictly protected. Merges require 2 approvals and passing CI.
- **`develop`:** Core integration branch. All feature branches branch off and merge into `develop`.
- **Feature Branches:** Named using conventions:
  - `feat/infra-*` (Lead)
  - `feat/worker-*` (Lead)
  - `feat/ai-luna-*` (AI Engineer)
  - `feat/eval-corpus-*` (AI Engineer)
  - `feat/ui-dashboard-*` (UI Engineer)
  - `feat/ui-evidence-*` (UI Engineer)

### 39.2 Pull Request Standards
- Every PR must include:
  1. Description referencing the relevant WBS package ID (e.g. `EOP-WP-04`).
  2. Proof of passing local tests (`pnpm test:unit`).
  3. Confirmation of zero secret leakage.
- Minimum 1 peer review approval required before merging to `develop`.

---

## 40. Definition of Ready (DoR) and Definition of Done (DoD)

### 40.1 Definition of Ready (DoR)
A task or user story may enter active development only when:
1. Target requirements and acceptance criteria are explicitly documented.
2. Necessary data contracts (TypeScript interfaces / Zod schemas) are defined.
3. Upstream dependency stages have verified gate sign-off.
4. Required environment variables and mock fixtures are available.

### 40.2 Definition of Done (DoD)
A task or user story is considered complete only when:
1. Code adheres strictly to repository style guidelines and passes `pnpm lint`.
2. TypeScript compiles with zero errors (`pnpm tsc --noEmit`).
3. Unit and integration tests cover happy path and edge cases with $ge 80%$ statement coverage.
4. No sensitive secrets or raw credentials committed or logged.
5. Code merged to `develop` and verified in the local Docker environment.

---

## 41. Schedule, Milestones, and Critical-Path Dependencies

The hackathon delivery plan spans 48 hours, divided into four 12-hour operational phases.

### 41.1 48-Hour Milestone Timeline

| Hour Block | Phase Name | Primary Milestone Objectives | Target Exit Gate |
|---|---|---|---|
| **Hours 00–12** | Foundation & Architecture | Repository init, DB schema, Docker Compose, Playwright worker baseline, Luna adapter stub. | Gates 0 & 1 |
| **Hours 13–24** | Core Engine & Policies | Policy engine implementation, Playwright tool wrappers, Luna prompt tuning, target demo app. | Gates 2, 3 & 4 |
| **Hours 25–36** | UI & End-to-End Flow | Next.js UI, SSE streaming, plan approval modal, synced evidence player, full controller loop. | Gate 7 (Draft) |
| **Hours 37–44** | Benchmark & Hardening | Official TC1–TC4 benchmark execution, redaction audit, fault injection tests, documentation. | Gates 5 & 6 |
| **Hours 45–48** | Final Polish & Rehearsal | Production container freeze, slide/demo prep, evaluator walkthrough dry runs. | Final Delivery |

---

## 42. Project Risk Register and Contingency Playbooks (15 Risks)

| Risk ID | Risk Description | Severity | Probability | Preventive Mitigation | Contingency Playbook |
|---|---|---|---|---|---|
| **RISK-01** | OpenAI API rate limiting or downtime. | High | Med | Implement exponential backoff; cache static prompt results for demo rehearsal. | Fallback to pre-recorded mock completions for demo UI walkthrough. |
| **RISK-02** | Playwright selector flakiness on dynamic target DOM. | Med | High | Prioritize `data-testid` and `aria-label`; use auto-waiting locators with 5s timeout. | Fallback to coordinated XPath / accessibility snapshot selectors. |
| **RISK-03** | Two-run signature mismatch due to non-deterministic bug. | High | Med | Target reset fixture cleans application state completely between runs. | Classify as `INCONSISTENT_OBSERVATIONS`; generate full evidence explaining flakiness. |
| **RISK-04** | Video recording corrupted or zero bytes on container exit. | Med | Low | Enforce explicit `await context.close()` before container shutdown; use FFmpeg repair. | Fallback to high-resolution sequence of step-by-step screenshots. |
| **RISK-05** | In-stream redaction regex misses novel token pattern. | High | Low | Implement multi-layer regex suite covering JWT, UUID, Bearer, and generic key patterns. | Emergency quarantine of raw artifacts; hot-patch regex pattern in 5 minutes. |
| **RISK-06** | Target reset fixture endpoint crashes or times out. | High | Low | Validate reset hook during target onboarding; wrap target reset in database transaction. | Abort Run 2 immediately; report `INCONCLUSIVE_FIXTURE_RESET_FAILED` cleanly. |
| **RISK-07** | OpenAI API token spend exceeds $20 hard limit. | High | Low | Set strict token budget per prompt; truncate DOM accessibility tree to essential nodes. | Alert operator at $5 and $10; pause non-essential testing until demo. |
| **RISK-08** | SSE stream drops during live evaluator demonstration. | High | Low | Implement robust client-side SSE auto-reconnect with `Last-Event-ID` state recovery. | Refresh browser page; Next.js server component hydrates full current state from DB. |
| **RISK-09** | Worker container runs out of memory (OOM) during video transcoding. | Med | Med | Allocate 4096 MB RAM to worker container; set `shm_size: '2gb'` in Docker Compose. | Restart worker daemon container; process resumes next job cleanly. |
| **RISK-10** | Luna Role 2 returns malformed JSON violating Zod schema. | Med | Med | Use OpenAI Structured Outputs (`json_schema` response format); retry with error prompt. | Retry up to 2x; if permanent, surface structured validation error to operator. |
| **RISK-11** | Integration collision between UI and backend APIs at Hour 30. | High | Med | Strict OpenAPI / TypeScript contract frozen at Hour 12 (`EOP-HANDOFF-03`). | Lead steps in as integrator; resolve contract divergence in favor of frozen spec. |
| **RISK-12** | Operator accidentally authorizes destructive action on production target. | Critical | Low | Hardcode policy rule: Destructive actions on `is_sandbox = false` targets are rejected. | Policy engine rejects action unconditionally at runtime (`TC-INV-008`). |
| **RISK-13** | MinIO object storage volume fills local disk during stress testing. | Med | Low | Configure 72h lifecycle expiration on raw bucket; prune old video files automatically. | Run storage cleanup script: `pnpm ops:prune-storage`. |
| **RISK-14** | Target application triggers CAPTCHA or bot detection. | Med | Low | Configure staging targets with test mode disabling Cloudflare/reCAPTCHA challenges. | Trigger `PAUSED_FOR_MANUAL_AUTH`; allow human operator to solve in live window. |
| **RISK-15** | Benchmark corpus reproduction accuracy falls below 90%. | High | Med | Test prompts iteratively against isolated fixtures; tune selector generation logic. | Refine planner few-shot examples for failing edge cases. |


---

## 43. Shared Release-Readiness Matrix (REL-CHECK-01 through REL-CHECK-20)

Before TraceCase is declared ready for hackathon evaluation and demonstration, every item in this 20-point verification matrix must achieve an audited PASS status.

| Check ID | Verification Domain | Operational Gate | Acceptance Criteria | Verification Command / Evidence | Status |
|---|---|---|---|---|---|
| **REL-CHECK-01** | Specification Completeness | Gate 0 | All 11 project specifications merged to main with zero unresolved merge conflicts. | `git log --oneline docs/` | DRAFT |
| **REL-CHECK-02** | Shared Invariant Fidelity | Gate 0 | Codebase implements all 14 invariants (`TC-INV-001` through `014`) without exception. | Architectural audit report | DRAFT |
| **REL-CHECK-03** | TypeScript Type Safety | Gate 1 | 100% strict TypeScript compilation with zero type errors. | `pnpm tsc --noEmit` | DRAFT |
| **REL-CHECK-04** | Zod Contract Validation | Gate 1 | All API payloads and AI inputs/outputs conform to strict Zod schemas. | `pnpm test:contracts` | DRAFT |
| **REL-CHECK-05** | Database Migration Cleanliness | Gate 1 | Drizzle migrations apply cleanly from empty database state to current schema. | `pnpm db:migrate` | DRAFT |
| **REL-CHECK-06** | Policy Engine Destructive Guard | Gate 2 | Non-sandbox destructive actions blocked 100% of the time at runtime. | `pnpm test:security` | DRAFT |
| **REL-CHECK-07** | Plan Approval Cryptographic Binding | Gate 2 | Execution blocked if plan payload does not match approved `plan_hash`. | `pnpm test:approval-hash` | DRAFT |
| **REL-CHECK-08** | Browser Context Isolation | Gate 3 | Fresh Chromium context launched per attempt; zero cookie/cache leakage between runs. | `pnpm test:worker-isolation` | DRAFT |
| **REL-CHECK-09** | Fixture Reset Hook Determinism | Gate 3 | `POST /api/test/reset-fixture` successfully restores target database state in $< 1000	ext{ms}$. | `curl -X POST http://demo-target:3000/api/test/reset-fixture` | DRAFT |
| **REL-CHECK-10** | Single Concurrency Enforcement | Gate 3 | Worker accepts exactly 1 job at a time; secondary jobs queue gracefully. | `pnpm test:concurrency` | DRAFT |
| **REL-CHECK-11** | Luna Role 1 Intake Grounding | Gate 4 | Intake correctly parses valid reports and flags ambiguous inputs with score $ge 0.6$. | `pnpm test:eval:intake` | DRAFT |
| **REL-CHECK-12** | Luna Role 2 Deterministic Planning | Gate 4 | Planner produces valid JSON plans with correct tier labeling and assertion logic. | `pnpm test:eval:planner` | DRAFT |
| **REL-CHECK-13** | Luna Role 3 Evidence Grounding | Gate 4 | Explanation references valid video timestamps and log lines; zero hallucinated facts. | `pnpm test:eval:explainer` | DRAFT |
| **REL-CHECK-14** | Official TC1 Reproduction Pass | Gate 5 | Array index defect reproduced twice; full Evidence Triad published to safe S3 bucket. | `pnpm test:eval:tc1` | DRAFT |
| **REL-CHECK-15** | Official TC2 Negative Pass | Gate 5 | Fixed application yields `NOT_REPRODUCED` verdict; target baseline preserved. | `pnpm test:eval:tc2` | DRAFT |
| **REL-CHECK-16** | Official TC3 Sandbox Guard Pass | Gate 5 | Destructive action permitted on sandbox; strictly blocked on production host. | `pnpm test:eval:tc3` | DRAFT |
| **REL-CHECK-17** | Official TC4 Secret Redaction Pass | Gate 6 | Auth tokens, JWTs, and API keys scrubbed in-stream; zero raw secrets in public bucket. | `pnpm test:eval:tc4` | DRAFT |
| **REL-CHECK-18** | Financial Budget Hard Stop | Gate 6 | Outgoing OpenAI calls blocked when cumulative token spend reaches $20.00. | `pnpm test:budget-ceiling` | DRAFT |
| **REL-CHECK-19** | Real-Time SSE Dashboard Streaming | Gate 7 | Investigation progress and step execution stream smoothly to UI in real-time. | Live UI inspection | DRAFT |
| **REL-CHECK-20** | Synchronized Evidence Player UI | Gate 7 | Video player, console log drawer, and network inspector synchronize on timeline scrub. | Manual UI inspection | DRAFT |

---

## 44. Comprehensive Operational and Evaluation Templates (13 Templates)

### 44.1 Template 1: Incident Post-Mortem Template
```markdown
# Incident Post-Mortem: [INC-YYYYMMDD-XXXX]

**Date / Time:** 2026-10-20T16:00:00Z  
**Severity:** Critical / High / Medium / Low  
**Incident Commander:** [Role / Name]  
**Subsystems Affected:** Browser Worker / Luna Adapter / MinIO Storage / Database  

### 1. Executive Summary
[Brief description of what went wrong, user impact, and immediate resolution.]

### 2. Timeline of Events (UTC)
- **15:30:** Anomaly detected by [monitoring / operator].
- **15:32:** Investigation paused; worker entered error state.
- **15:45:** Root cause identified in [component].
- **15:55:** Hot-patch deployed; system verified healthy.

### 3. Root Cause Analysis (5 Whys)
- Why 1: ...
- Why 2: ...
- Why 3: ...
- Why 4: ...
- Why 5: ...

### 4. Corrective and Preventive Actions (CAPA)
| Action Item | Owner | Target Completion | Verification PR |
|---|---|---|---|
| Patch regex pattern in redactor | AI Engineer | 2026-10-20 | PR #42 |
| Add integration test for JWT edge case | Lead / Integrator | 2026-10-21 | PR #45 |
```

### 44.2 Template 2: Maintenance Notification Template
```markdown
# Scheduled Maintenance Notification: [MAINT-YYYYMMDD]

**Scheduled Window:** 2026-10-20 22:00 UTC to 23:00 UTC  
**Impacted Services:** TraceCase Web UI, Worker Daemon  
**Expected User Impact:** Investigation creation temporarily paused; active jobs will complete before maintenance begins.

### Purpose of Maintenance
[Database migration / Container base image update / Security patch]

### Operator Checklist
- [ ] Set MAINTENANCE_MODE=true in .env
- [ ] Confirm worker queue depth is 0
- [ ] Execute database backup: `pg_dump ...`
- [ ] Apply changes
- [ ] Verify health endpoints
- [ ] Set MAINTENANCE_MODE=false
```

### 44.3 Template 3: Disaster Recovery Drill Record Template
```markdown
# Disaster Recovery Drill Record: [DR-YYYYMMDD]

**Drill Date:** 2026-10-20  
**Drill Lead:** Lead / Integrator  
**Simulated Disaster:** Total loss of PostgreSQL volume and MinIO storage container.

### Execution Log
- **10:00:** Container fleet halted via `docker compose down -v`.
- **10:02:** Clean volumes initialized.
- **10:05:** PostgreSQL restored from latest `.dump` file.
- **10:10:** MinIO data restored from archive snapshot.
- **10:12:** Health endpoints probed: All responded HTTP 200 OK.
- **10:14:** Test investigation run executed and verified.

### Recovery Metrics
- **Target RTO:** 15 minutes | **Actual RTO:** 12 minutes (PASS)
- **Target RPO:** 60 minutes | **Actual RPO:** 5 minutes (PASS)
```

### 44.4 Template 4: Target Onboarding Verification Checklist
```markdown
# Target Onboarding Verification: [TARGET-NAME]

**Target URL:** http://staging-target.internal:3000  
**Target Type:** Staging Test Application  
**Assigned Safety Tier:** Sandbox (is_sandbox = true)  

### Verification Items
- [ ] Domain origin matches configured whitelist.
- [ ] Database is completely isolated from production.
- [ ] Reset fixture endpoint responds HTTP 200 within 5000ms.
- [ ] Baseline restoration query verifies clean state.
- [ ] Test credentials stored safely in environment.
- [ ] Approved by Delivery Lead: [Signature / Date]
```

### 44.5 Template 5: Evaluation Benchmark Run Summary Template
```markdown
# Evaluation Benchmark Run Summary: [EVAL-RUN-XXXX]

**Date:** 2026-10-20  
**Benchmark Suite:** Canonical 8-Case Evaluation Corpus  
**Executor:** AI & Evaluation Engineer  

### Aggregate Performance Metrics
- **Total Cases Evaluated:** 8
- **Correct Reproductions (True Positives):** 4 / 4
- **Correct Non-Reproductions (True Negatives):** 2 / 2
- **Correct Guardrail Blockings:** 2 / 2
- **Reproduction Accuracy (Pc):** 100.0% (Threshold: >= 90%)
- **False Confirmation Rate (FCR):** 0.0% (Threshold: 0.0%)
- **Two-Run Consistency Rate (R2):** 100.0% (Threshold: >= 85%)
- **Evidence Completeness Index (ECI):** 1.00 (Threshold: 1.00)
- **Redaction Recall (Rred):** 100.0% (Threshold: 100.0%)
- **Average Cost per Investigation:** $0.84 (Threshold: <= $1.50)

### Final Evaluation Verdict: BENCHMARK SUITE PASSED
```

### 44.6 Template 6: Agent Evaluation Scorecard Template
```markdown
# Luna Agent Evaluation Scorecard: [Role 2: Planner]

**Prompt Version:** v1.2.0  
**Test Sample Size:** 20 bug reports  

| Evaluation Dimension | Weight | Target | Observed Score | Pass / Fail |
|---|---|---|---|---|
| JSON Schema Conformance | 30% | 100% | 100% | PASS |
| Action Tier Accuracy | 25% | >= 98% | 100% | PASS |
| Stable Selector Selection | 20% | >= 85% | 92% | PASS |
| Deterministic Assertion Logic | 15% | 100% | 100% | PASS |
| Token Budget Compliance (< 4k) | 10% | 100% | 100% | PASS |

**Weighted Aggregate Score:** 98.4 / 100 (EXCELLENT)
```

### 44.7 Template 7: Sanitization / Secret Scrubbing Audit Record
```markdown
# Secret Scrubbing Audit Record: [AUDIT-YYYYMMDD]

**Target Artifact:** s3://tracecase-public-safe/investigations/inv-992/console.log  
**Audit Tool:** Automated Regex Verifier Suite  
**Tested Regex Patterns:** JWT, OpenAI API Key, Bearer Token, AWS Key, Private Key  

### Findings
- Injected Secret 1 (JWT in console): Redacted as `[REDACTED_JWT_TOKEN]`
- Injected Secret 2 (Bearer token in header): Redacted as `Bearer [REDACTED_BEARER_TOKEN]`
- Plaintext Matches in Public Artifact: 0 matches found.
- Quarantined Raw Artifact Storage: Verified encrypted in restricted bucket.

**Audit Assessment: 100% SECURE PASS**
```

### 44.8 Template 8: Release Gate Sign-Off Form
```markdown
# Release Gate Sign-Off: [GATE-5: Benchmark Pass]

**Milestone:** Official Hackathon Scenario Verification  
**Evaluation Date:** 2026-10-20  

### Sign-Off Criteria Verification
- [x] TC1 verified reproduced twice with video, console, network.
- [x] TC2 verified not reproduced with clean baseline preserved.
- [x] TC3 verified deletion permitted in sandbox, blocked on prod.
- [x] TC4 verified auth token scrubbed in-stream.

**Lead / Integrator Sign-Off:** [Signed: Lead / Integrator, 2026-10-20]  
**AI Engineer Sign-Off:** [Signed: AI Engineer, 2026-10-20]  
**UI Engineer Sign-Off:** [Signed: UI Engineer, 2026-10-20]  
```

### 44.9 Template 9: Architecture Decision Record (ADR)
```markdown
# ADR-008: Deterministic Verifier Exclusivity (TC-INV-014)

**Status:** Accepted  
**Date:** 2026-10-20  
**Deciders:** Delivery Lead, AI Engineer, UI Engineer  

### Context
We must decide whether reproduction assertions (e.g. checking if a task was deleted) should be evaluated by asking GPT-6 Luna to inspect screenshots or by programmatic code assertions.

### Decision
Assertion evaluation must be 100% deterministic code executing within the verifier engine. Luna is never asked to judge whether a test passed or failed.

### Consequences
- Eliminates hallucinated reproduction verdicts.
- Guarantees $FCR = 0.0%$.
- Requires explicit assertion definitions in the execution plan.
```

### 44.10 Template 10: Change Request / Scope Modification Template
```markdown
# Scope Change Request: [CR-XXXX]

**Title:** [Short title]  
**Requestor:** [Role / Name]  
**Date:** 2026-10-20  

### Proposed Change
[Description of change to requirements or architecture]

### Impact Assessment
- Impact on Invariants: [None / Explain]
- Impact on WBS / Schedule: [+X hours / None]
- Impact on Risk Profile: [Explain]

### Decision: Approved / Rejected / Deferred
```

### 44.11 Template 11: Daily Hackathon Standup / Handover Template
```markdown
# Hackathon Sync Record: [Hour 24 Sync]

**Attendees:** Lead / Integrator, AI Engineer, UI Engineer  

### Work Completed (Past 12 Hours)
- Lead: Playwright worker daemon functional; Drizzle schema applied.
- AI Engineer: Prompts for Roles 1 & 2 tuned; Zod schemas passing.
- UI Engineer: Layout components and lavender/cobalt theme built.

### Work Planned (Next 12 Hours)
- Lead: Wire state machine controller and pg-boss queue.
- AI Engineer: Build TC1–TC4 benchmark harness.
- UI Engineer: Implement SSE stream listener and Triad player.

### Blockers / Open Decisions
- None. System on track for Gate 4.
```

### 44.12 Template 12: Demo Script & Evaluator Walkthrough Template
```markdown
# Evaluator Demo Script: 5-Minute TraceCase Walkthrough

### 1. Introduction (0:00 - 0:45)
- Welcome evaluator; introduce TraceCase problem statement: "Autonomous, reproducible bug investigations with cryptographic safety and verified evidence."
- Point out UI design language (lavender cards, cobalt actions).

### 2. Live Reproduction: Scenario TC1 (0:45 - 2:30)
- Ingest bug report: "Deleting active task deletes completed task instead".
- Show Luna Role 1 normalizing report in real-time.
- Show Luna Role 2 generating multi-step plan.
- Highlight Tier 4 Destructive step requiring human approval.
- Click "Approve Plan" (demonstrate hash verification).
- Observe Run 1 execution via live SSE stream.
- Observe automated fixture reset hook execution.
- Observe Run 2 execution and identical failure signature match.
- Show final verdict: `CONFIRMED_REPRODUCED`.

### 3. Evidence Triad Inspection (2:30 - 3:45)
- Open Synced Evidence Player.
- Scrub timeline to timestamp 00:04.2: Show video, console warning, and DELETE request in sync.
- Point out in-stream secret redaction (`[REDACTED_*]`).

### 4. Safety Guardrail: Scenario TC3-B (3:45 - 4:30)
- Attempt destructive action on non-sandbox target.
- Show Policy Engine blocking execution immediately (`TC-INV-008`).

### 5. Summary & Q&A (4:30 - 5:00)
- Highlight metrics: 0% hallucinated confirmations, 100% secret scrubbing recall.
```

### 44.13 Template 13: Final Project Handover & Archive Checklist
```markdown
# Final Project Handover Checklist

- [ ] All code committed and pushed to `main`.
- [ ] Docker images tagged and pushed to registry.
- [ ] Documentation directory `docs/` up-to-date.
- [ ] Database backup snapshot archived.
- [ ] OpenAI API spend reconciled (verified $< $20.00).
- [ ] Repository README contains clear setup instructions.
```

---

## 45. Mermaid Architectural and Operational Diagrams (7 Diagrams)

### Diagram 1: Tri-Dimensional Verification & Evaluation Flow
```mermaid
flowchart TD
    subgraph Intake["1. Intake & Planning"]
        A["Incoming Bug Report"] --> B["Luna Role 1: Intake & Clarifier"]
        B --> C{"Ambiguity >= 0.6?"}
        C -- "Yes" --> D["Clarification Card in UI"]
        C -- "No" --> E["Luna Role 2: Experiment Planner"]
        E --> F["Plan Hash & Safety Tiers Generated"]
    end

    subgraph Approval["2. Policy & Authorization"]
        F --> G{"Contains Tier 4 Action?"}
        G -- "Yes" --> H["Human Operator Approval Modal"]
        H --> I["Cryptographic Signature Recorded"]
        G -- "No" --> I
        I --> J{"Target is Sandbox?"}
        J -- "No & Tier 4" --> K["BLOCKED: Policy Engine Violation"]
        J -- "Yes or Tier 1-3" --> L["Dispatch Job to Worker Queue"]
    end

    subgraph Execution["3. Two-Run Deterministic Execution"]
        L --> M["Run 1: Fresh Context + Video + Net + Console"]
        M --> N{"Run 1 Failure Observed?"}
        N -- "No" --> O["Run 1 Defect Absent"]
        N -- "Yes" --> P["Execute Target Reset Hook (HTTP 200)"]
        O --> P
        P --> Q["Run 2: Fresh Context + Video + Net + Console"]
        Q --> R{"Run 2 Failure Observed?"}
        R -- "Matches Run 1 Defect" --> S["VERDICT: CONFIRMED_REPRODUCED"]
        R -- "Matches Run 1 Clean" --> T["VERDICT: NOT_REPRODUCED"]
        R -- "Mismatched Signatures" --> U["VERDICT: INCONSISTENT_OBSERVATIONS"]
    end

    subgraph Evidence["4. Evidence & Synthesis"]
        S --> V["In-Stream Secret Redaction Pipeline"]
        T --> V
        U --> V
        V --> W["S3 Storage: PUBLIC_SAFE_READY"]
        W --> X["Luna Role 3: Evidence Synthesizer"]
        X --> Y["Audited Reproduction Report in UI"]
    end
```

### Diagram 2: Eleven-Level Test & Verification Architecture
```mermaid
flowchart TB
    L11["Level 11: Benchmark Corpus & Official TC1-TC4 Evaluation"] --> L10["Level 10: Fault Injection & Resilience Testing"]
    L10 --> L9["Level 9: Security, Secret Redaction & Quarantine Audit"]
    L9 --> L8["Level 8: Target Onboarding & Reset Hook Validation"]
    L8 --> L7["Level 7: Synced Evidence Triad End-to-End Test"]
    L7 --> L6["Level 6: End-to-End Orchestrator & State Machine Integration"]
    L6 --> L5["Level 5: AI Role Evaluation & Schema Compliance (Luna Roles 1-3)"]
    L5 --> L4["Level 4: Tool-Policy Permission & Sandbox Boundary Enforcement"]
    L4 --> L3["Level 3: Browser Worker CDP Execution & Isolation"]
    L3 --> L2["Level 2: Database Schemas, Drizzle Migrations & Queue Tests"]
    L2 --> L1["Level 1: Static Analysis, TypeScript Types & Zod Schemas"]
    L1 --> L0["Level 0: Architecture, Spec Invariants & Boundary Sign-off"]
```

### Diagram 3: Deployment Topology & Network Isolation
```mermaid
flowchart TD
    subgraph Host["Host Environment (Developer / Evaluation VM)"]
        Browser["Operator Browser"] -- "HTTP / SSE (Port 3000)" --> Web["frontend-backend (Next.js 15)"]
        Browser -- "Admin UI (Port 9001)" --> MinIO["storage (MinIO S3)"]
    end

    subgraph DockerNet["Docker Bridge Network: tracecase-net"]
        Web -- "Drizzle ORM (5432)" --> Postgres[("postgres (PostgreSQL 15)")]
        Web -- "Job Queue (pg-boss)" --> Postgres
        Worker["browser-worker (Playwright)"] -- "Consume Jobs" --> Postgres
        Worker -- "CDP Browser Control" --> Target["demo-target (TraceCase-Demo-Tasks:3000)"]
        Worker -- "Reset Fixture Hook" --> Target
        Worker -- "Upload Public Safe" --> MinIO
        Worker -- "Upload Restricted Raw" --> MinIO
        Web -- "Read Public Evidence" --> MinIO
    end

    subgraph External["External Cloud Services"]
        Web -- "Structured API Calls (HTTPS:443)" --> OpenAI["OpenAI GPT-6 Luna API"]
    end
```

### Diagram 4: Worker Daemon Lifecycle & Concurrency
```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> CLAIMING_JOB : Job Available in pg-boss
    CLAIMING_JOB --> ACQUIRING_LOCK : Lease Assigned
    ACQUIRING_LOCK --> IDLE : Lock Collision / Target Busy
    ACQUIRING_LOCK --> LAUNCHING_BROWSER : Target Lock Acquired
    LAUNCHING_BROWSER --> EXECUTING_RUN_1 : Context & Video Initialized
    EXECUTING_RUN_1 --> EVALUATING_RUN_1 : Actions Complete
    EVALUATING_RUN_1 --> RESETTING_TARGET : Defect Detected
    EVALUATING_RUN_1 --> RESETTING_TARGET : Defect Not Detected
    RESETTING_TARGET --> ABORTED_RESET_FAILED : Reset HTTP != 200
    RESETTING_TARGET --> EXECUTING_RUN_2 : Reset HTTP == 200
    EXECUTING_RUN_2 --> PACKAGING_EVIDENCE : Run 2 Complete
    PACKAGING_EVIDENCE --> UPLOADING_S3 : In-Stream Redaction & Transcode
    UPLOADING_S3 --> RELEASING_LOCK : Storage Confirmed
    RELEASING_LOCK --> IDLE : Lock Released & Job Completed
    ABORTED_RESET_FAILED --> RELEASING_LOCK : Set INCONCLUSIVE
```

### Diagram 5: Uncertain Mutation & Timeout Recovery
```mermaid
flowchart TD
    A["Execute Mutating Action (Tier 3/4 Button Click)"] --> B{"Response within 15,000ms?"}
    B -- "Yes" --> C["Record Action Success & HTTP Status"]
    B -- "No / Network Timeout" --> D["Flag Action as MUTATION_UNCERTAIN"]
    D --> E["Halt Plan Execution Immediately"]
    E --> F["Enforce TC-INV-013: Zero Blind Retries"]
    F --> G["Capture Failure Screenshot & DOM Dump"]
    G --> H["Surface Operator Recovery Modal in UI"]
    H --> I{"Operator Selection"}
    I -- "Abort & Reset Fixture" --> J["Invoke POST /api/test/reset-fixture"]
    J --> K["Mark Investigation INCONCLUSIVE"]
    I -- "Accept Mutation & Continue" --> L["Resume Subsequent Verification Assertion"]
```

### Diagram 6: Implementation Stage Dependencies & Gates
```mermaid
flowchart LR
    S0["Stage 0: Spec Freeze"] -->|Gate 0| S1["Stage 1: Infra & DB"]
    S1 -->|Gate 1| S2["Stage 2: Worker & Policy"]
    S1 -->|Gate 1| S3["Stage 3: AI Luna Adapter"]
    S2 -->|Gates 2 & 3| S4["Stage 4: Controller"]
    S3 -->|Gate 4| S4
    S4 --> S5["Stage 5: Demo Target"]
    S4 --> S6["Stage 6: Product UI"]
    S5 --> S7["Stage 7: Benchmark Suite"]
    S6 --> S7
    S7 -->|Gates 5 & 6| S8["Stage 8: Demo & Sign-off"]
    S8 -->|Gate 7| Complete["Production Release"]
```

### Diagram 7: Team Ownership & Cross-Role Handoffs
```mermaid
sequenceDiagram
    autonumber
    actor Lead as Lead / Integrator
    actor AI as AI & Evaluation Eng
    actor UI as Product UI Eng

    Note over Lead,UI: Stage 1: Data Contracts Frozen
    Lead->>AI: Handoff 01: DB Schema & Zod Types (pnpm tsc pass)
    Lead->>UI: Handoff 03: REST & SSE Contract Specifications

    Note over Lead,AI: Stage 3 & 4: Core Engine Integration
    AI->>Lead: Handoff 02: Validated Luna Adapter & Test Mock
    AI->>UI: Handoff 05: Evidence Citation Syntax & Token Display

    Note over Lead,UI: Stage 6: Dashboard & Stream Integration
    UI->>Lead: Handoff 04: Completed UI Components & Approval Hook

    Note over Lead,UI: Stage 7 & 8: Benchmark & Final Demo
    AI->>Lead: Benchmark Test Results (TC1-TC4 Pass)
    Lead->>UI: Deployment Environment URL & Staging Target
    UI->>Lead: Final UI Walkthrough & Sign-Off
    Note over Lead,UI: Handoff 06: Full Team Demonstration Sign-Off
```

---

## 46. Full Traceability and Cross-Reference Matrix

This matrix demonstrates complete, unbroken traceability between source hackathon requirements, companion specifications, and this unified plan.

| Source / Spec Requirement | Document ID | Section in Companion Spec | Section in This Document | Operational Enforcement Mechanism |
|---|---|---|---|---|
| **PS Case 1 (Two-Run Reproduction)** | TC-PRD-001, TC-TRD-001 | PRD §4.1, TRD §3.2 | §10.1 (`TEP-CASE-TC1`), §44.5 | Two-run loop in worker; `POST /api/test/reset-fixture` hook. |
| **PS Case 2 (Cannot Reproduce)** | TC-PRD-001, TC-VES-001 | PRD §4.2, VES §5.2 | §10.2 (`TEP-CASE-TC2`), §15.1 | Negative assertion validation; `FCR = 0.0%` threshold. |
| **PS Case 3 (Sandbox Deletion Guard)** | TC-VES-001, TC-SAD-001 | VES §6.1, SAD §8.3 | §10.3 (`TEP-CASE-TC3`), §13.1 | Policy engine intercepts Tier 4; checks `target.is_sandbox`. |
| **PS Case 4 (Auth Token Redaction)** | TC-VES-001, TC-DBD-001 | VES §7.2, DBD §4.4 | §10.4 (`TEP-CASE-TC4`), §29.1 | In-stream regex scrubber; `tracecase-restricted-raw` quarantine. |
| **Tri-Dimensional State Decoupling** | TC-WFM-001 | WFM §3.1 | §4.2, §10.1, §45 (Diagram 1) | `execution_state` $
eq$ `verdict` $
eq$ `evidence_state`. |
| **Cryptographic Plan Approval** | TC-VES-001, TC-AGT-001 | VES §6.2, AGT §5.4 | §4.1 (`TC-INV-003`), §32 (INC-008) | `SHA-256(plan)` validation before worker execution. |
| **Mutation Uncertainty Guard** | TC-VES-001, TC-TRD-001 | VES §8.1, TRD §6.4 | §4.1 (`TC-INV-013`), §45 (Diagram 5) | Worker halts on timeout; zero blind retries; UI intervention. |
| **Single Concurrency per Worker** | TC-SAD-001 | SAD §5.2 | §4.1 (`TC-INV-011`), §26.1 | `WORKER_CONCURRENCY = 1`; row-level target locking. |
| **Financial Budget Hard Stop** | TC-TRD-001, TC-AEC-001 | TRD §7.1, AEC §6.3 | §28.1, §32 (INC-016) | Hard stop ceiling at $20.00 blocks OpenAI client calls. |
| **UI Design System Compliance** | TC-UIX-001 | UIX §3.1 - §3.6 | §35.1 (Role 3), §44.12 | Pale-lavender surfaces, cobalt actions, navy text, rounded cards. |

---

## 47. Decision and Open Question Register

### 47.1 Decision Register (DEC-01 through DEC-10)

| Decision ID | Summary of Decision | Architectural Justification | Alternatives Considered |
|---|---|---|---|
| **DEC-01** | Exclusive AI Model: GPT-6 Luna via OpenAI API exclusively. | Maximizes reasoning fidelity, structured output compliance, and adheres to prompt guidelines. | Secondary fallback to Claude 3.5 Sonnet (Rejected: violates unified single-model eval). |
| **DEC-02** | Queue Engine: PostgreSQL `pg-boss` rather than Redis/BullMQ. | Leverages existing PostgreSQL container, minimizing operational footprint and backup complexity. | Redis + BullMQ (Rejected: introduces additional container and failure point). |
| **DEC-03** | Dual S3 Bucket Architecture for Public vs Raw Evidence. | Guarantees physical separation of sanitized exports from quarantined raw memory dumps. | Single bucket with prefix permissions (Rejected: higher risk of accidental public leak). |
| **DEC-04** | Deterministic Verifier Exclusivity (Code over AI). | Guarantees zero false confirmations ($FCR = 0.0%$) and verifiable, audit-proof verdicts. | Asking LLM to judge pass/fail from screenshots (Rejected: non-deterministic). |
| **DEC-05** | Browser Worker Concurrency = 1. | Eliminates CPU contention during video encoding and ensures 100% deterministic timings. | Multi-worker concurrent execution (Rejected: causes frame drops and port clashes). |
| **DEC-06** | In-Stream Regex Redaction over Post-Execution Batch Scrub. | Prevents plaintext secrets from ever touching persistent storage or public streams. | Post-run string replace (Rejected: leak occurs if worker crashes before scrub). |
| **DEC-07** | Server-Sent Events (SSE) over WebSockets for UI Updates. | Simpler HTTP/1.1 and HTTP/2 proxying; native auto-reconnect with `Last-Event-ID`. | Full-duplex WebSockets (Rejected: unnecessary complexity for unidirectional push). |
| **DEC-08** | Ephemeral Target Application Container (`demo-target`). | Provides deterministic sandbox with defect toggles and reset endpoints for hackathon benchmarks. | Testing against live public websites (Rejected: unpredictable network and anti-bot gates). |
| **DEC-09** | Three-Person Role Specialization. | Distributes workload cleanly across Lead, AI Engineer, and UI Engineer with zero overlap. | Generalist free-for-all (Rejected: leads to git merge conflicts and broken contracts). |
| **DEC-10** | Strict 72-Hour TTL on Restricted Raw Storage. | Minimizes liability and compliance risk regarding captured session credentials and PII. | Indefinite archival of raw traces (Rejected: violates security minimization best practices). |

### 47.2 Open Question Register (OQ-01 through OQ-06)

| Question ID | Open Question Description | Technical Trade-Off | Recommended Resolution | Resolution Milestone |
|---|---|---|---|---|
| **OQ-01** | Should video transcoding to MP4/H.264 be supported in addition to WebM/VP8? | WebM is natively produced by Chromium; MP4 requires CPU-intensive FFmpeg transcoding. | Retain WebM as default; only transcode to MP4 if client browser lacks WebM support. | Gate 3 |
| **OQ-02** | What is the optimal AXTree node reduction strategy for complex DOMs? | Pruning too aggressively loses context; keeping too much inflates token costs. | Prune script, style, SVG paths, and hidden elements; retain interactive nodes and aria labels. | Gate 4 |
| **OQ-03** | Should the target reset hook support full database snapshot restores? | SQL snapshots are completely clean but slower (~2s); API endpoint resets are fast (~200ms). | Use API reset endpoint for hackathon demo; add snapshot restore for enterprise targets. | Gate 5 |
| **OQ-04** | How should the UI handle high-frequency console log flooding (> 1,000 lines/sec)? | Rendering every line causes DOM lag; dropping lines loses diagnostic context. | Client-side virtualized list with throttling buffer (flush to DOM every 250ms). | Gate 6 |
| **OQ-05** | Should manual operator intervention allow live browser interaction via CDP? | Full remote control adds UI complexity; basic form fill solves most auth blocks. | Provide embedded iframe with input proxy for CAPTCHA/2FA solving only. | Gate 7 |
| **OQ-06** | How to handle target sites that reject automated Chromium user agents? | Masking user agent bypasses bot detection; could hide bot-specific bugs. | Use realistic default user agent; do not alter navigator properties unless requested. | Gate 7 |

---

## 48. Document Sign-Off and Execution Readiness Statement

### 48.1 Final Delivery Sign-Off Block

| Role Name | Designated Team Member | Review Status | Formal Sign-Off Signature | Date |
|---|---|---|---|---|
| **Technical Delivery, Quality & Operations Lead** | Antigravity AI Agent | **Recommended Approval** | *Lead Agent (Draft for Review)* | 2026-10-20 |
| **Lead / Integrator** | User (Proposed) | **Pending Sign-Off** | `_________________________` | DD-MM-YYYY |
| **AI & Evaluation Engineer** | Assigned Peer | **Pending Sign-Off** | `_________________________` | DD-MM-YYYY |
| **Product UI & Evidence Engineer** | Assigned Peer | **Pending Sign-Off** | `_________________________` | DD-MM-YYYY |

### 48.2 Execution Readiness Statement
> **READINESS DECLARATION:**  
> This specification document (`TC-TEO-001`) establishes a complete, source-grounded, and internally consistent operational baseline for TraceCase. It provides exhaustive coverage across test architecture, operational procedures, incident playbooks, role ownership, release gates, and architectural models.
>
> In accordance with project governance boundaries, **this document is submitted with status DRAFT FOR REVIEW**. It does not constitute authorization to execute live database mutations, initiate paid third-party API requests, provision production cloud infrastructure, or bypass established team sign-off gates. Implementation begins upon unanimous team approval of Stage 0.
