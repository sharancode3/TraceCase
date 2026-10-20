# TraceCase — Person 1: Phase P1-01 Foundation Review and Scope Inventory

**Phase:** P1-01 — Foundation Review and Shared Contracts  
**Status:** In Progress / Locally Implementing  
**Date:** 20 October 2026 (Asia/Calcutta)  
**Author:** Person 1 (Core Platform, Browser Execution, and Verification Lead)  
**Baseline Commit:** `af56f5a`

---

## 1. Executive Summary and Intent

This document establishes the scope and dependency inventory for **Phase P1-01**. The purpose of P1-01 is to review the Stage 0 foundation, correct Person 1 boundary defects, establish rigorous, versioned shared contracts, eliminate false live success in API scaffolds, implement pure policy guards (deterministic fingerprinting and scope-binding approval verification), and provide clear, unambiguous contract handoffs for Person 2 (AI/Target) and Person 3 (UI/Evidence).

P1-01 does **not** implement live database persistence, background queue job consumption, live Playwright browser automation, OpenAI API integration, or S3 storage uploads. Those capabilities are explicitly scheduled for subsequent phases (P1-02 through P1-09).

---

## 2. Foundation Follow-Up Checklist (F-01 through F-11)

Each item from the shared implementation guide (`implementation-stages/README.md`) is classified below:

| Item ID | Observed Gap or Risk | Required Decision / Change | P1-01 Status |
| :--- | :--- | :--- | :--- |
| **F-01** | `services/ports.ts` had a single planner port, a browser `defectDetected` boolean, and a monolithic evidence publish call. | Split into three distinct AI role ports, define browser action/observation receipts, separate verification findings, and split evidence capture registration from artifact access grants. | **Corrected in P1-01** (ports and contracts updated). |
| **F-02** | `planning.ts` used free-text criteria; plans carried identity/hash fields before server enrichment. | Add typed assertion vocabulary (`TypedAssertionSchema`); separate un-enriched `ModelExperimentProposalSchema` from server-owned `AuthoritativeExperimentPlanSchema`. | **Corrected in P1-01** (contracts defined, legacy preserved). |
| **F-03** | `targets.ts` included `fixtureResetAuthSecret` in general `TargetProfile`. | Introduce `SafeTargetProfileSchema`, `SafeModelTargetContextSchema`, and `TrustedTargetConfigSchema` with explicit allowlist projection functions. | **Corrected in P1-01**. |
| **F-04** | Preview configuration defaulted on; production preview only logged a console warning; config errors fell back to preview. | Strict fail-closed configuration: `DEV_PREVIEW_MODE` in production throws fatal error; no silent fallback on invalid config. | **Corrected in P1-01**. |
| **F-05** | Live approval route compared against `SYNTHETIC_PLAN_V1` and did not persist; live list scaffolds returned empty `[]`. | Live routes fail closed with safe 501 `NOT_CONFIGURED` / 503 `SERVICE_UNAVAILABLE` until P1-02 persistence lands; preview mode remains explicitly marked. | **Corrected in P1-01**. |
| **F-06** | Approval helper checked only version and hash, omitting investigation binding, actor, revocation, and scope. | Implement `verifyAuthoritativeApprovalCompatibility` checking investigation, target, actor, revocation, expiry, and execution limits. | **Corrected in P1-01**. |
| **F-07** | Relational tables do not yet provide frozen plan revisions, attempts, observations, or evidence registries. | Define authoritative relational schema requirements and repository interfaces. Runtime migration execution and persistence deferred to P1-02. | **Contract defined; runtime deferred to P1-02**. |
| **F-08** | Progress payload was `z.record(z.unknown())`; reducer cast status strings and could apply stale events. | Introduce `LiveProgressEventSchema` as a discriminated union with strict allowlisted payloads; define stream watermarks and stale-event handling rules. | **Corrected in P1-01** (reducer update deferred to P3). |
| **F-09** | Evidence metadata permitted generic `publicUrl`; storage port treated triad as in-memory buffers. | Introduce stable artifact IDs, scoped capture references, capture coverage receipts, and separate processing from access grants. | **Corrected in P1-01** (sanitization/storage service owned by P3). |
| **F-10** | Incomplete, observed-once, and blocked meanings need clear separation from terminal success booleans. | Define explicit status vocabularies and observation result schemas ensuring no terminal claim is conflated with an intermediate state. | **Corrected in P1-01**. |
| **F-11** | Migration runner caught all errors as "offline notices"; worker logged concurrency as enforced while queue was idle. | Differentiate network connectivity errors from fatal migration failures in `migrate.ts`; clarify local vs distributed concurrency in worker logging. | **Corrected in P1-01**. |

---

## 3. Inventory of Existing Schemas, APIs, and Consumers

### 3.1. Contracts (`src/contracts/`)
- `status.ts`: Decoupled Tri-Dimensional status schemas (`InvestigationLifecycleStatus`, `ReproductionVerdict`, `EvidenceReadinessStatus`, `ActionTier`, `MutationUncertainty`). **Action**: Preserved; referenced by both preview and live contracts.
- `targets.ts`: `TargetProfileSchema`, `CreateTargetCommandSchema`. **Action**: Preserve `TargetProfile` for existing fixtures; add `SafeTargetProfile`, `SafeModelTargetContext`, `TrustedTargetConfig`, and projection helpers.
- `reports.ts`: `CreateReportCommandSchema`, `BugReportResponseSchema`. **Action**: Preserve for preview intake form; add `DraftReportIntakeSchema`, `ClarifiedReportContextSchema`, and `ExecutableExperimentPreconditionsSchema`.
- `planning.ts`: `SupportedToolKindSchema`, `PlanStepSchema`, `ExperimentPlanSchema`, `ApprovePlanCommandSchema`, `PlanApprovalRecordSchema`. **Action**: Preserve legacy schemas for fixtures; add `TypedAssertionSchema`, `ModelExperimentProposalSchema`, `AuthoritativeExperimentPlanSchema`, and `AuthoritativeApprovalRecordSchema`.
- `events.ts`: `InvestigationProgressEventSchema`. **Action**: Preserve base schema; add `LiveProgressEventSchema` (discriminated union) and `EventStreamWatermarkSchema`.
- `evidence.ts`: `ArtifactKindSchema`, `StorageTierSchema`, `EvidenceArtifactMetadataSchema`, `EvidenceManifestSchema`. **Action**: Preserve base metadata; add `CaptureRegistrationCommandSchema`, `FinalizedCaptureReferenceSchema`, `CaptureCoverageReceiptSchema`, and `ArtifactAccessGrantSchema`.
- `clarification.ts`: `ClarificationQuestionSchema`, `AnswerClarificationCommandSchema`. **Action**: Preserved.
- `investigations.ts`: `InvestigationSnapshotSchema`, `AttemptSummarySchema`. **Action**: Preserved.
- `errors.ts`: `createSafeError`, `SafeErrorEnvelopeSchema`. **Action**: Preserved.

### 3.2. Consumers of Existing Contracts
1. **Frontend UI Pages (`src/app/**`)** — *Read-only for Person 1*:
   - `src/app/investigations/new/page.tsx`: Uses `CreateReportCommandSchema`.
   - `src/app/preview/gallery/page.tsx` & `src/app/page.tsx`: Uses status enums.
   - `src/app/investigations/[id]/page.tsx`: Uses `InvestigationSnapshot`.
2. **Preview Fixtures (`src/dev/fixtures.ts`)** — *Read-only for Person 1*:
   - Uses `TargetProfile`, `ExperimentPlan`, `ClarificationQuestion`, `EvidenceManifest`, `InvestigationSnapshot`.
3. **Event Reducer (`src/features/investigations/event-reducer.ts`)** — *Read-only for Person 1 (Person 3 owned)*:
   - Uses `InvestigationProgressEvent`, `InvestigationLifecycleStatus`.
4. **API Routes (`src/app/api/**`)** — *Person 1 owned*:
   - Uses contracts across intake, approval, targets, investigations, health, and ready.

---

## 4. Person 1 Boundary and Policy Corrections

1. **Deterministic Plan Fingerprint**:
   - `calculatePlanFingerprint` preserved for legacy fixtures.
   - `calculateAuthoritativePlanFingerprint` added for live plans: validates `AuthoritativePlanFingerprintPayloadSchema`. Ensures semantic step order is strictly preserved (changing step order changes hash), object keys are canonicalized recursively, and missing required experiment scope is rejected (no silent empty string defaults).
2. **Authoritative Approval Guard**:
   - `verifyApprovalCompatibility` preserved for legacy previews.
   - `verifyAuthoritativeApprovalCompatibility` added: validates `investigationId`, `planVersion`, `planHash`, `targetId`, `authorizedActorId`, `revokedAt` (fails closed if non-null), and `expiresAt` (fails closed if expired).
3. **Strict Environment and Preview Security**:
   - `src/server/config/env.ts`: If `NODE_ENV === 'production'` and `DEV_PREVIEW_MODE === true`, throws fatal error. If env parsing fails, fails closed without fallback to preview mode.
4. **API Scaffold Sanitization**:
   - Eliminate false live success: In live mode without DB connection, return explicit safe errors (e.g. 501 `SERVICE_NOT_CONFIGURED` / 503 `SERVICE_UNAVAILABLE`).
   - Eliminate synthetic plan comparison on live approval route.
   - Preview mode requires explicit development/test configuration and is visibly tagged in metadata (`mode: 'preview_synthetic'`).

---

## 5. Teammate Handoff Boundaries

- **Person 2 (AI & Target Lead)**:
  - Consumes: `ReportClarificationAgentPort`, `BrowserInvestigationAgentPort`, `EvidenceReviewAgentPort`.
  - Supplies: Model proposal payloads conforming to `ModelExperimentProposalSchema`, `BrowserActionProposalSchema`, `EvidenceExplanationProposalSchema`.
  - Receives: `SafeReportContext`, `SafeModelTargetContext`, `SanitizedBrowserObservation`, `LockedVerificationFacts`. Secrets (`fixtureResetAuthSecret`, credentials) are strictly excluded from AI context.
- **Person 3 (UI & Evidence Lead)**:
  - Consumes: `SafeTargetProfile`, `BugReportResponse`, `AuthoritativeApprovalRecord`, `LiveProgressEvent`, `ArtifactAccessGrant`.
  - Supplies: Shared sanitization service (`SanitizerPort`) and private artifact processing/storage operations.
  - Future UI Migration: Wire form intake to `DraftReportIntakeSchema`, and update event reducer to consume `LiveProgressEventSchema`.
