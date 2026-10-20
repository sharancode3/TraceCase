# TraceCase — Person 1: Phase P1-01 Contract Handoff Specification

**Phase:** P1-01 — Foundation Review and Shared Contracts  
**Status:** Locally Implemented & Verified; Teammate Review Pending  
**Author:** Person 1 (Core Platform, Browser Execution, and Verification Lead)  
**Baseline Commit:** `af56f5a`  
**Date:** 20 October 2026 (Asia/Calcutta)

---

## 1. Executive Summary

This handoff document establishes the canonical contracts, interface ports, and safe projection rules produced by **Person 1** in Phase P1-01. It defines explicit, versioned boundaries between:

$$\text{Model Proposal} \longrightarrow \text{Server Enrichment \& Validation} \longrightarrow \text{Human Approval Gate} \longrightarrow \text{Controlled Browser Action} \longrightarrow \text{Deterministic Verification} \longrightarrow \text{Sanitized Evidence Triad}$$

This specification allows **Person 2 (AI & Target Lead)** and **Person 3 (UI & Evidence Lead)** to implement their respective modules with zero ambiguity regarding ownership, types, and security constraints.

---

## 2. Global Safety and Authority Invariants

1. **Server Authority Invariant**: Neither AI model outputs nor client requests may assign resource IDs, plan hashes, version numbers, approval statuses, verification findings, or sandbox trust. Any attempt to pass server-owned fields to live proposal endpoints fails validation.
2. **Secret Non-Exposure Invariant**: Target reset secrets (`fixtureResetAuthSecret`), target database URLs, and operator credentials must never appear in client UI projections or AI model prompts. Only allowlisted projections (`projectSafeTargetProfile`, `projectSafeModelTargetContext`) are permitted across process boundaries.
3. **Tri-Dimensional State Decoupling (`TC-INV-007`)**: Lifecycle status, reproduction findings, and evidence readiness are independent dimensions in persistence, API contracts, and event streams.
4. **Two-Run Invariant (`TC-INV-002`)**: Reproduction confirmation strictly requires two valid matching attempts under equivalent, verified baseline conditions.

---

## 3. Dedicated Handoff for Person 2 (AI & Target Lead)

Person 2 owns the GPT-6 Luna model integration (OpenAI API only), structured prompt synthesis, and demo-target fixture resets. Person 2 consumes the following typed contracts and service ports.

### 3.1. AI Role 1: Report Clarification and Experiment Planner

- **Port**: `ReportClarificationAgentPort` in `src/server/services/ports.ts`
- **Inputs**:
  - `report: DraftReportIntake | ClarifiedReportContext` (from `src/contracts/reports.ts`)
  - `target: SafeModelTargetContext` (from `src/contracts/targets.ts`)
- **Output Discriminants** (`ReportPlannerOutput` from `src/contracts/ai.ts`):
  - `status: 'CLARIFICATION_NEEDED'` $\rightarrow$ returns `questions: ClarificationQuestion[]`
  - `status: 'EXPERIMENT_PROPOSED'` $\rightarrow$ returns `proposal: ModelExperimentProposal`
  - `status: 'UNABLE_TO_PROCEED'` $\rightarrow$ returns `reason: string`, `missingPrerequisites: string[]`
- **Valid Synthetic Example**:
  ```json
  {
    "status": "EXPERIMENT_PROPOSED",
    "proposal": {
      "preconditions": ["Target fixture reset to baseline", "Active filter selected"],
      "steps": [
        {
          "stepIndex": 0,
          "semanticAction": "Click Active filter tab",
          "toolKind": "click_button",
          "selector": "#filter-active",
          "tier": "TIER_1_READ_ONLY",
          "timeoutMs": 5000
        },
        {
          "stepIndex": 1,
          "semanticAction": "Click delete on first active item",
          "toolKind": "click_button",
          "selector": ".item-row:first-child .delete-btn",
          "tier": "TIER_3_MUTATING_INTERACTION",
          "timeoutMs": 5000
        }
      ],
      "expectedCorrectBehavior": "First active item is removed from view",
      "reportedFailureSignature": "Wrong completed item is deleted from array",
      "assertions": [
        {
          "id": "11111111-1111-4111-8111-111111111111",
          "kind": "ENTITY_PRESENCE",
          "source": "DOM_ELEMENT",
          "purpose": "REPORTED_FAILURE_SIGNATURE",
          "subjectRef": ".item-row[data-id='task-1']",
          "operator": "EXISTS",
          "settlingPoint": "AFTER_NETWORK_IDLE",
          "description": "Assert wrong item deleted"
        }
      ],
      "requiresResetHook": true
    }
  }
  ```
- **Rejected Example**: Passing `id`, `planHash`, or `approved: true` inside the proposal will be rejected by `ModelExperimentProposalSchema.strict()`.

### 3.2. AI Role 2: Browser Investigation Agent

- **Port**: `BrowserInvestigationAgentPort` in `src/server/services/ports.ts`
- **Inputs**:
  - `approvedIntent: string`
  - `currentObservation: SanitizedBrowserObservation` (from `src/contracts/observations.ts`)
  - `remainingAllowedTiers: string[]`
- **Output Discriminants** (`BrowserActionProposal` from `src/contracts/ai.ts`):
  - `kind: 'EXECUTE_ACTION'` $\rightarrow$ proposes next scoped `PlanStep`
  - `kind: 'REQUEST_MANUAL_HELP'` $\rightarrow$ reasons: `'CAPTCHA_DETECTED' | 'OTP_REQUIRED' | 'AUTH_EXPIRED' | 'BLOCKED_EXTERNAL_HOST'`
  - `kind: 'STOP_NO_PROGRESS'` $\rightarrow$ halts bounded exploration after consecutive failures
  - `kind: 'READY_FOR_VERIFICATION'` $\rightarrow$ signals that actions reached settling point
- **CRITICAL RESTRICTION**: Role 2 **cannot** return a reproduction verdict or mark a defect reproduced.

### 3.3. AI Role 3: Evidence Review Agent

- **Port**: `EvidenceReviewAgentPort` in `src/server/services/ports.ts`
- **Inputs**:
  - `lockedVerdict: ReproductionVerdict` (immutable findings evaluated by deterministic verifier)
  - `verifiedAssertions: VerificationAssertionResult[]`
  - `eligibleEvidence: FinalizedCaptureReference[]`
- **Output** (`EvidenceExplanationProposal` from `src/contracts/ai.ts`):
  - `naturalLanguageSummary: string`
  - `verifiedFactsExplanation: string`
  - `observationsVsHypotheses: Array<{ observation: string, hypothesis: string }>`
  - `evidenceReferences: Array<{ artifactId: string, description: string }>`
  - `limitationsAndGaps: string[]`
- **CRITICAL RESTRICTION**: Role 3 **cannot** modify verification findings, downgrade quarantine flags, or alter storage tiers.

---

## 4. Dedicated Handoff for Person 3 (UI & Evidence Lead)

Person 3 owns the user interface pages, components, the shared text/structured data sanitizer, and private evidence storage operations. Person 3 consumes the following contracts.

### 4.1. Safe Projections

- **Contract**: `SafeTargetProfile` (from `src/contracts/targets.ts`)
  - Used in UI components and forms.
  - Guarantees zero leak of `fixtureResetAuthSecret` or backend credentials.
  - Projection helper: `projectSafeTargetProfile(target)` available for safe client mapping.
- **Contract**: `BugReportResponse` (from `src/contracts/reports.ts`)
  - UI report summary rendering.

### 4.2. Discriminated Live Progress Events

- **Contract**: `LiveProgressEventSchema` (from `src/contracts/events.ts`)
- **Discriminant**: `eventType`
- **Available Event Types and Payloads**:
  1. `STATUS_CHANGED`: `{ previousStatus, newStatus, reason }`
  2. `PLAN_GENERATED`: `{ planId, planVersion, stepCount, planHash }`
  3. `PLAN_APPROVED`: `{ planVersion, approvedBy, planHash }`
  4. `ATTEMPT_STARTED`: `{ attemptNumber: 1 | 2, totalAttempts: 2, startedAt }`
  5. `STEP_STARTED`: `{ attemptNumber, stepIndex, semanticAction, toolKind, tier }`
  6. `STEP_COMPLETED`: `{ attemptNumber, stepIndex, durationMs, status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' }`
  7. `MUTATION_DETECTED`: `{ attemptNumber, stepIndex, tier, uncertainty }`
  8. `RESET_STARTED`: `{ targetId, attemptNumber: 2 }`
  9. `RESET_COMPLETED`: `{ targetId, success, itemsRestored, durationMs }`
  10. `ASSERTION_EVALUATED`: `{ attemptNumber, assertionId, result, details }`
  11. `ARTIFACT_STORED`: `{ artifactId, kind, storageTier, sizeBytes, redactionApplied }`
  12. `INVESTIGATION_COMPLETED`: `{ verdict, attemptsCompleted, durationMs, summary }`
  13. `INVESTIGATION_HALTED`: `{ reason, category, recoverable }`
- **Migration Note for Person 3**: In Stage 3/4, update `src/features/investigations/event-reducer.ts` to switch from the generic `payload: z.record(z.unknown())` to `LiveProgressEventSchema`. The legacy contract `InvestigationProgressEventSchema` is preserved in P1-01 so existing reducer code continues to work without disruption.

### 4.3. Private Evidence Pipeline and Access Grants

- **Port**: `EvidenceStoragePort` in `src/server/services/ports.ts`
- **Responsibilities Implemented by Person 3**:
  1. `registerCapture(command: CaptureRegistrationCommand): Promise<FinalizedCaptureReference>`
     - Takes worker-local temp file paths (`localTempPath`), avoiding passing large in-memory buffers across APIs.
  2. `processArtifacts(params: { investigationId, captureRefs }): Promise<ArtifactProcessingResult[]>`
     - Executes P3's sanitizer to mask synthetic tokens and PII.
     - Produces sanitized derivatives for `PUBLIC_SAFE` tier while archiving unredacted files in `RESTRICTED_RAW`.
  3. `createAccessGrant(params: { artifactId, userId, tier }): Promise<ArtifactAccessGrant>`
     - Produces time-limited signed download grants (`downloadUrl`, `expiresAt`). Replaces permanent public bucket URLs.
- **Contract**: `CaptureCoverageReceiptSchema` (from `src/contracts/evidence.ts`)
  - Tracks capture status: separates `videoStatus: 'FINALIZED'` from `'UNFINALIZED_CORRUPT'`, and `consoleStatus: 'CAPTURED_EMPTY'` from `'CAPTURE_FAILED'`.

---

## 5. Person 1 Implementation Roadmap & Deferred Runtimes

| Phase | Title | What It Delivers | Dependencies |
| :--- | :--- | :--- | :--- |
| **P1-01** *(This Phase)* | Foundation Review & Shared Contracts | Usable contracts, safe projections, deterministic fingerprinting, scope-bound approval, fail-closed configs, truthful readiness, 46 passing tests. | Complete. |
| **P1-02** | Real Identity & Persistence | Drizzle PostgreSQL repositories for targets, reports, investigations, plans, approvals; applied migrations; cross-user isolation. | P1-01 contracts. |
| **P1-03** | Workflow & Orchestration APIs | Live `/api/v1` routes backed by real DB; versioned plan storage; cryptographic approval persistence; cancellation commands. | P1-02 persistence. |
| **P1-04** | Queue & Concurrency Lease | pg-boss background job integration; single-investigation platform lease (`TC-INV-011`); durable progress stream generation. | P1-03 APIs. |
| **P1-05** | Playwright Execution & Raw Capture | Server-side Chromium automation; action dispatcher; CDP event stream capture; video finalization. | P1-04 queue, P2 target, P3 sanitizer. |
| **P1-06** | Deterministic Verifier & Reset Readback | Two-attempt assessment; fixture baseline reset/readback verification; verdict classification. | P1-05 browser, P2 reset hook. |
| **P1-07** | Agentic Flow Integration | End-to-end wiring of report $\rightarrow$ clarify $\rightarrow$ plan $\rightarrow$ approve $\rightarrow$ execute $\rightarrow$ verify $\rightarrow$ explain. | P2 Luna, P3 UI/storage. |
| **P1-08** | Hardening & Production Deployment | Container fleet builds, operational runbooks, backup/restore, production egress constraints. | P1-07 flow. |
| **P1-09** | Official Acceptance (TC1–TC4) | Formal benchmark execution on hackathon test cases; release handoff package. | Deployed fleet. |
