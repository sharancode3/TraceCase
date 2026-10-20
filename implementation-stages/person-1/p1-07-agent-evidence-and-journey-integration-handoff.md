# Person 1, Phase P1-07: Trusted Integration of AI Proposals, Browser Execution, Deterministic Verification, Evidence Processing, and User-Facing APIs — Handoff

## Phase Status: Completed

All deliverables for **Phase P1-07** have been implemented, verified, and integrated into the local working tree without committing or pushing.

---

## 1. What Was Built in Phase P1-07

1. **Trusted End-to-End Investigation Lifecycle Integration**:
   - Seamless progression across all lifecycle boundaries:
     `DRAFT` -> `CLARIFYING` -> `PLAN_PROPOSED` -> `APPROVED` -> `QUEUED` -> `CLAIMED` -> `RUNNING_ATTEMPT_1` -> `RESETTING_TARGET` -> `RUNNING_ATTEMPT_2` -> `FINALIZING_EVIDENCE` -> `COMPLETED` (or terminal `FAILED` / `CANCELLED`).
   - Integrated user-facing endpoints: `createInvestigation`, `submitClarificationAnswers`, `approvePlan`, `rejectPlan`, `revokeApproval`, `startInvestigation`, `cancelInvestigation`, and `getInvestigationSnapshot`.

2. **Strict AI Role Isolation and Budget Controls**:
   - `BudgetManager` (`src/server/ai/budget-manager.ts`): Thread-safe budget reservations, commit/release mechanics, and cost tracking with a strict \$1.50 default ceiling per investigation.
   - `OpenAIClient` (`src/server/ai/openai-client.ts`): Bound strictly to OpenAI `gpt-6-luna`. Fails closed with structured diagnostics when unconfigured.
   - `BrowserInvestigationAgentLoop` (`src/server/ai/browser-agent-loop.ts`): Bounded step-based loop enforcing tool allowlists, tier permissions, 3-step cycle detection, and halting on mutation uncertainty.
   - `EvidenceReviewService` (`src/server/ai/evidence-review-service.ts`): Produces structured markdown explanations strictly derived from locked deterministic verification findings and safe evidence artifacts. Persisted in `synthesis_explanations`.

3. **Evidence Registration and Processing Pipeline**:
   - `CaptureRegistrar` (`src/server/evidence/capture-registrar.ts`): Automatically catalogues raw session video (`.webm`), console log traces (`.json`), network HAR traces (`.json`), and screenshots from local attempt directories into `evidence_artifacts` as `RESTRICTED_RAW` with SHA-256 hashes and byte counts.
   - `EvidencePipeline` (`src/server/evidence/evidence-pipeline.ts`): Manages packaging and storage sync via `EvidenceStoragePort`. Invariant **TC-INV-007** is strictly maintained: packaging or storage sync failures set evidence status to `STORAGE_SYNC_FAILED` but never alter the deterministic `reproductionVerdict`.

4. **Service Composition and Truthful Readiness**:
   - `ServiceContainer` (`src/server/services/service-container.ts`): Centralized dependency injection container exposing typed interfaces for AI ports, browser workers, target reset clients, queue dispatchers, and evidence storage.
   - Dynamic System Readiness: Probes live database connectivity, background queue configuration, Playwright browser engine, OpenAI credentials, and storage status. Surfaces honest status via `/api/ready`.

5. **Verification Hardening and Defect Remediation**:
   - Hardened `TwoAttemptController` with exact plan version and hash binding, pre-flight baseline verification before Attempt 1, multi-checkpoint lease fencing and approval checks, and dynamic `scopeAdhered` calculation.
   - Safe regex length limits in `DeterministicAssertionEvaluator` and locator error boundary handling in `ObservationCollector`.

6. **Relational Database Migrations**:
   - Migration `0005_late_lizard.sql` applied, adding `evidence_artifacts` and `synthesis_explanations` tables.

---

## 2. Information and Contracts for Person 2 (AI Agents & Controlled Target Internals)

### Pluggable Agent Ports

Person 2 can provide specialized agent implementations by conforming to the following interfaces:

1. **Clarification Port (`ReportClarificationAgentPort`)**:
   ```typescript
   interface ReportClarificationAgentPort {
     generateClarificationQuestions(report: {
       rawReport: string;
       targetUrl: string;
       targetName?: string;
     }): Promise<ClarificationQuestion[]>;
   }
   ```
2. **Browser Investigation Port (`BrowserInvestigationAgentPort`)**:
   ```typescript
   interface BrowserInvestigationAgentPort {
     proposeExperimentPlan(
       rawReport: string,
       target: TargetProfile,
       clarifications?: Array<{ question: string; answer: string }>
     ): Promise<ModelExperimentProposal>;
   }
   ```
3. **Evidence Review Port (`EvidenceReviewAgentPort`)**:
   ```typescript
   interface EvidenceReviewAgentPort {
     synthesizeExplanation(
       lockedFacts: VerificationLockedSummary,
       publicArtifacts: PublicEvidenceSummary[]
     ): Promise<SynthesisExplanationResult>;
   }
   ```

### Constraints on AI Proposals

- **Model Constraint**: Must use OpenAI `gpt-6-luna`.
- **Step Indexing**: Action steps in `ModelExperimentProposal` must be 0-indexed (`0, 1, 2, ...`).
- **Assertion Vocabulary**: Only use valid kinds (`ENTITY_PRESENCE`, `VALUE_COMPARISON`, `READBACK_STATE`, `NETWORK_OBSERVATION`, `CONSOLE_LOG_OBSERVATION`) and operators (`EXISTS`, `NOT_EXISTS`, `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `NOT_CONTAINS`, `GREATER_THAN`, `LESS_THAN`, `MATCHES_REGEX`).
- **Budget Compliance**: All AI invocations must acquire a reservation through `BudgetManager.reserve(...)` before issuing API requests.

### Controlled Target Fixtures

- Endpoints must support authenticated POST `/api/test/reset-fixture` and GET `/api/test/baseline` using `X-TraceCase-Reset-Secret`.
- Target baselines must supply a stable, attested `buildVersion` string to ensure comparability between attempts.

---

## 3. Information and Contracts for Person 3 (Frontend, Sanitizer, and Storage)

### Evidence Storage Port (`EvidenceStoragePort`)

Person 3's cloud storage adapter (e.g., S3 or MinIO) should implement:
```typescript
interface EvidenceStoragePort {
  uploadArtifact(params: {
    investigationId: string;
    attemptNumber: number;
    localFilePath: string;
    contentType: string;
    accessTier: 'RESTRICTED_RAW' | 'PUBLIC_SAFE_READY';
  }): Promise<{ storageUrl: string; storageKey: string }>;

  getDownloadUrl(storageKey: string): Promise<string>;
}
```

### Triad Separation Compliance in Frontend Views

When presenting the investigation state via `GET /api/v1/investigations/:id` or WebSocket/SSE live stream, Person 3's UI must display the three dimensions separately:
1. **Lifecycle Status**: Indicates backend process state (`RUNNING_ATTEMPT_1`, `RESETTING_TARGET`, `COMPLETED`, etc.).
2. **Reproduction Verdict**: Deterministic outcome (`CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONSISTENT_OBSERVATIONS`, `INCONCLUSIVE`). Do not display as "failed" if a bug was confirmed reproduced!
3. **Evidence Readiness**: Availability of sanitized artifacts (`PACKAGING_IN_PROGRESS`, `PUBLIC_SAFE_READY`, `STORAGE_SYNC_FAILED`).

### Presentation of Explanatory Narratives

- Narrative summaries from `synthesis_explanations` must be explicitly badged as "AI-Synthesized Explanation" and visually separated from the deterministic assertion table.
- The UI must inform the user that the AI did not evaluate or produce the reproduction verdict.

---

## 4. Full Quality Gate Verification

All quality gates pass without regressions:
- **Test Suite**: 42 test files, 218 passing tests (`pnpm test`).
- **Type Checking**: 0 errors (`pnpm typecheck`).
- **ESLint**: 0 warnings or errors (`pnpm lint`).
- **Production Build**: Clean compilation of Next.js web application and tsup worker daemon (`pnpm build`).
