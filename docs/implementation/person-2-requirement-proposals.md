# TraceCase — Proposed Requirement & Contract Changes (Person 2)

**Document Type:** Formal Engineering Decision Proposal (RFC / Decision Log)  
**Author:** Person 2 (AI Roles, Controlled Target, and Evaluation Lead)  
**Baseline Document:** [`implementation-stages/person-2/person-2-implementation-plan.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/implementation-stages/person-2/person-2-implementation-plan.md)  
**Reviewers / Stakeholders:** Person 1 (Core Orchestration, Persistence, Worker), Person 3 (Sanitization & UI)  
**Date of Record:** 21 October 2026  
**Governance Notice:** **These items are PROPOSALS ONLY.** In accordance with rule 6 of the project charter, Person 2 does not treat this proposal as team approval. Canonical contracts remain as defined until counterparts formally review, accept, and land them. Person 2 provides defensive, backward-compatible shims in [`src/server/ai/compatibility-adapter.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/compatibility-adapter.ts) so that system operation does not rely on unilateral contract modifications.

---

## 1. Summary of Proposed Changes

| Decision ID | Target Contract / File | Counterpart | Proposed Modification | Status | Agreement Claimed |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **`DEC-001`** | `src/contracts/planning.ts` | Person 1 | Upgrade opaque string assertions to structured, typed assertion predicates (`PlanAssertionSchema`) | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
| **`DEC-002`** | `src/server/services/ports.ts` | Person 1 | Decompose monolithic `AiPlannerPort` into three distinct role ports (`ReportPlannerPort`, `BrowserActorPort`, `EvidenceReviewerPort`) | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
| **`DEC-003`** | `src/contracts/targets.ts` | Person 1 | Remove privileged reset authorization secret from client-facing `TargetProfileSchema` | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
| **`DEC-004`** | `src/contracts/evidence.ts` | Person 3 | Decouple immutable artifact identifiers (`artifactId`) from transient signed viewing URLs | `PROPOSED_PENDING_AGREEMENT` | **`false`** |
| **`DEC-005`** | `evaluation/case-schema.ts` | Person 1 | Standardize `ExecutionReceiptSchema` with strict ISO 8601 UTC timestamps and plan predicate binding | `PROPOSED_PENDING_AGREEMENT` | **`false`** |

---

## 2. Detailed Decision Proposals

### `DEC-001`: Structured Assertion Predicates for Automated Verification Oracles

- **Subsystem:** `src/contracts/planning.ts`
- **Counterparts:** Person 1 (Verification Engine / Worker)
- **Current Baseline Contract:**
  `assertions?: string[]` within the planning schema.
- **Proposed Contract:**
  ```typescript
  export const PlanAssertionSchema = z.object({
    predicateId: z.string().min(1),
    predicateType: z.enum([
      'DOM_ELEMENT_PRESENCE',
      'DOM_ELEMENT_ABSENCE',
      'DOM_TEXT_EXACT',
      'DOM_TEXT_CONTAINS',
      'NETWORK_REQUEST_MATCH',
      'APPLICATION_STATE_EQUAL'
    ]),
    subject: z.string().min(1),
    observationPoint: z.enum(['DURING_EXECUTION', 'IMMEDIATE_POST_ACTION', 'FINAL_STATE']),
    expectedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    explanation: z.string().optional()
  });
  export type PlanAssertion = z.infer<typeof PlanAssertionSchema>;
  ```
- **Engineering Rationale:**
  Free-text strings (e.g. `"Task A should still be visible"`) cannot be deterministically evaluated by an automated verification oracle. Without structured predicates, either an LLM must be called to guess whether the assertion passed (violating the oracle independence rule), or the verifier falls back to heuristic keyword matching. Structured predicates provide explicit subject locators, comparison relations, and observation checkpoints.
- **Affected Consumers:**
  - **Person 1 (Worker & Verifier):** Uses the structured predicate to evaluate AXTree observations or network receipts without heuristic guessing.
  - **Person 3 (UI):** Can render discrete pass/fail assertion chips on the run timeline.
- **Person 2 Implementation / Fallback Shim:**
  [`src/server/ai/compatibility-adapter.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/compatibility-adapter.ts) converts `PlanAssertion[]` into human-readable strings if calling legacy string-based consumers, and synthesizes fallback predicates when consuming legacy strings.

---

### `DEC-002`: Three Distinct AI Role Ports in Service Architecture

- **Subsystem:** `src/server/services/ports.ts`
- **Counterparts:** Person 1 (Orchestration Service & Factory)
- **Current Baseline Contract:**
  Single monolithic `AiPlannerPort` attempting to cover report interpretation, action stepping, and review.
- **Proposed Contract:**
  Three dedicated port interfaces reflecting the distinct operational boundaries and execution phases:
  1. `ReportPlannerPort`: Ingests user report and returns either clarification questions or a bounded experiment plan.
  2. `BrowserActorPort`: Ingests current AXTree observation and returns the next browser action proposal.
  3. `EvidenceReviewerPort`: Ingests locked verifier outcomes and eligible evidence manifests to synthesize a developer handoff.
- **Engineering Rationale:**
  The three AI roles operate at completely different stages of the lifecycle, require different prompt architectures, enforce distinct security invariants, and consume different input data:
  - Role 1 (Planner) runs pre-execution and has no access to live browser data.
  - Role 2 (Actor) runs iteratively during execution and requires fresh, sanitized AXTree snapshots.
  - Role 3 (Reviewer) runs post-execution and must be strictly bound to locked verifier verdicts (`isVerifiedFact: false` for hypotheses).
  A single interface violates the Interface Segregation Principle and risks role confusion.
- **Affected Consumers:**
  - **Person 1 (Service Container / Dependency Injection):** Binds distinct role implementations into the worker pipeline.
- **Person 2 Implementation / Fallback Shim:**
  Person 2 implements `compatibility-adapter.ts` which exposes the monolithic `AiPlannerPort` methods by delegating to the underlying role agents, while preserving all authority boundaries.

---

### `DEC-003`: Removal of Reset Authorization Secrets from Client-Facing Target Profiles

- **Subsystem:** `src/contracts/targets.ts`
- **Counterparts:** Person 1 (Target Registry / API Handlers), Person 3 (Frontend Forms)
- **Current Baseline Contract:**
  `TargetProfileSchema` containing `resetSecret?: string` alongside public target URLs and metadata.
- **Proposed Contract:**
  Purge `resetSecret` from `TargetProfileSchema`. Keep `TargetProfile` as public target configuration (URLs, sandbox status, build version). Store reset authentication secrets strictly in trusted server environment configuration or server-side secret vaults, indexed by `targetId`.
- **Engineering Rationale:**
  If `resetSecret` is included in the client-facing `TargetProfileSchema`:
  1. It can leak to browser network tabs when target profiles are queried via REST.
  2. It can inadvertently be passed into AI prompt contexts when target metadata is supplied to the planner.
  Privileged reset operations (`POST /api/test/reset-fixture`) must be executed only by trusted server runners using server-held credentials (`TARGET_RESET_SECRET`).
- **Affected Consumers:**
  - **Person 1:** Server-side target runner reads secrets from environment (`process.env.TARGET_RESET_SECRET`) rather than request bodies.
  - **Person 3:** Frontend target configuration forms do not display or transmit reset secrets.
- **Person 2 Implementation / Fallback Shim:**
  [`demo-target/client.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/demo-target/client.ts) and [`demo-target/config.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/demo-target/config.ts) strictly require `TARGET_RESET_SECRET` from server environment variables and fail closed if unset or empty. Public `/api/build-info` exposes no secret or defect toggles.

---

### `DEC-004`: Decoupling Immutable Artifact Identifiers from Transient Signed URLs

- **Subsystem:** `src/contracts/evidence.ts`
- **Counterparts:** Person 3 (Artifact Pipeline & Evidence Cards)
- **Current Baseline Contract:**
  `EvidenceManifestItem` storing only direct storage URLs (`url: string`).
- **Proposed Contract:**
  ```typescript
  export interface EvidenceManifestItem {
    artifactId: string; // Immutable UUID/hash (e.g., "art_log_001")
    artifactType: 'VIDEO' | 'SCREENSHOT' | 'TRACE' | 'CONSOLE_LOG' | 'NETWORK_HAR';
    sanitizedLocation: string; // Storage path or object key
    transientSignedUrl?: string; // Short-lived URL for UI rendering
    capturedAt: string; // ISO 8601 UTC
    mimeType: string;
    isEligibleForModelReview: boolean;
  }
  ```
- **Engineering Rationale:**
  Presigned S3/GCS URLs expire after a short duration (e.g. 15–60 minutes). If AI reviewer citations, execution receipts, and test reports reference transient URLs, all citation links become invalid when the URL expires. Decoupling the stable `artifactId` from the transient signed URL allows:
  1. Permanent, tamper-evident citations (`artifactId: "art_log_001"`).
  2. Dynamic generation of fresh viewing URLs by Person 3's UI without rewriting historical run records.
  3. Strict filtering via `isEligibleForModelReview` to ensure raw unsanitized artifacts are never ingested by LLMs.
- **Affected Consumers:**
  - **Person 3 (Evidence Pipeline):** Issues signed URLs on demand while persisting stable artifact records.
  - **Person 2 (Evidence Reviewer):** Emits citations referencing `artifactId` rather than expiring web URLs.
- **Person 2 Implementation / Fallback Shim:**
  `EvidenceReviewAgent` enforces artifact citation validation against `manifest.map(m => m.artifactId)`. Any non-matching reference or raw URL is filtered out with safe fallbacks.

---

### `DEC-005`: Standardized Execution Receipts with Predicate Binding and ISO Timestamps

- **Subsystem:** `evaluation/case-schema.ts` / `src/contracts/evaluation.ts`
- **Counterparts:** Person 1 (Worker & Verification Engine), Evaluation Harness
- **Current Baseline Contract:**
  Informal receipt definitions with optional timestamps and unstructured boolean statuses.
- **Proposed Contract:**
  ```typescript
  export const ExecutionReceiptSchema = z.object({
    attemptId: z.string().min(1),
    runId: z.string().min(1),
    attemptNumber: z.union([z.literal(1), z.literal(2)]),
    status: z.enum(['COMPLETED', 'FAILED_VERIFICATION', 'ERROR_SYSTEM_CRASH', 'CANCELLED']),
    startedAt: z.string().datetime(), // Strict ISO 8601 UTC
    completedAt: z.string().datetime(), // Strict ISO 8601 UTC
    targetAppVersion: z.string().min(1),
    fixtureVersion: z.string().min(1),
    assertionResults: z.array(z.object({
      predicateId: z.string().min(1), // Bound strictly to approvedPlanPredicateId
      passed: z.boolean(),
      observedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      failureReason: z.string().optional()
    })),
    capturedArtifactIds: z.array(z.string()),
    verifiedBy: z.literal('TRUSTED_ORACLE_ENGINE')
  });
  ```
- **Engineering Rationale:**
  To guarantee honest reproduction metrics (TC1–TC4) and prevent evaluation greenwashing:
  1. Receipts must bind directly to the approved plan's `predicateId`. Unbound assertions cannot be used to declare reproduction.
  2. Attempt pair isolation requires verifying identical target builds, fixture scopes, and distinct attempt IDs.
  3. Timestamps must be valid ISO UTC strings to verify attempt sequencing and prevent replay attacks.
- **Affected Consumers:**
  - **Person 1 (Worker):** Emits standardized execution receipts upon attempt completion.
  - **Evaluation Harness (Person 2):** Ingests authoritative receipts to compute G4 reproduction metrics and detect false positives.
- **Person 2 Implementation / Fallback Shim:**
  [`evaluation/harness.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/evaluation/harness.ts) and [`tests/ai-evaluation-harness.test.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/tests/ai-evaluation-harness.test.ts) strictly validate `ExecutionReceiptSchema` at runtime and reject malformed or unbound receipts.

---

## 3. Governance Process & Next Steps

1. **Submission:** This proposal document is formally registered in `docs/implementation/person-2-requirement-proposals.md` and referenced in [`docs/implementation/person-2-progress.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/person-2-progress.md).
2. **Review:** Counterparts (Person 1 and Person 3) review the proposed schemas during H-01 contract reconciliation.
3. **Landing:** When agreed, Person 1 will land the canonical schemas in `src/contracts/`.
4. **Deprecation of Shims:** Once canonical schemas are landed, Person 2 will retire the defensive adapters in `src/server/ai/compatibility-adapter.ts` in favor of direct imports.
