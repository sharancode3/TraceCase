# Phase 2 Stage K Handoff: Actual Attempts, Results and Evidence Presentation

## Overview
Phase K implements factual, honest presentation of attempt records, reset/readback receipt outcomes, assertion observations, environment/build metadata, and accessible evidence. It eliminates fabricated fallback data and synthetic runs, enforces clear boundaries between deterministic execution measurements and AI narrative hypotheses, provides truthful retrieval error semantics, and ensures leak-proof reproduction package exports.

---

## Implemented Work

### 1. Schema & Contract Enhancements
- **InvestigationSnapshot & AttemptSummary Contracts** (`src/contracts/investigations.ts`):
  - Enriched `AttemptSummarySchema` with optional `buildId` and `summary`.
  - Extended `InvestigationSnapshotSchema` to capture `resetReceipt` (`VerifiedResetReceiptSchema`), `assertionEvaluations`, `targetEnvironment`, and `targetBuildVersion`.
- **Authorized Descriptor Alias** (`src/contracts/evidence.ts`):
  - Defined and exported `AuthorizedArtifactDescriptor` as an authoritative alias for `EvidenceArtifactMetadata`.
- **Reproduction Package Contract & Export Disclosures** (`src/features/investigations/evidence-presentation.ts`):
  - Added required `exportDisclosure` block containing `isPlanPersisted`, `missingPlanNotice`, `isManifestComplete`, `missingArtifactKinds`, `restrictedArtifactCount`, and `quarantineNotice`.
  - Propagates real `target.environment`, `target.buildVersion`, `attempts.resetReceipt`, and `attempts.assertionEvaluations`.

### 2. Dedicated Results API
- **Endpoint**: `GET /api/v1/investigations/[id]/results` (`src/app/api/v1/investigations/[id]/results/route.ts`):
  - Enforces authenticated principal resolution via `requireAuthenticatedPrincipal`.
  - Strictly asserts resource ownership; rejects unauthenticated calls (401) and unauthorized cross-user calls (404/403).
  - Queries authoritative investigation snapshot, verified reset receipt, assertion evaluations, and authorized artifact descriptors.
  - Withholds internal storage keys and restricts raw artifact download URLs for `RESTRICTED_RAW` and quarantined evidence.
- **Client Method**: `fetchInvestigationResults(id)` added to `src/features/investigations/api-client.ts`.

### 3. Investigation Detail & Evidence Triad UI (`src/app/investigations/[id]/page.tsx`)
- **Target Metadata**:
  - Displays `targetEnvironment` and `targetBuildVersion` in the header alongside `targetUrl`.
- **Two-Run Deterministic Confirmation Record**:
  - Renders Attempt 1's real validity status, step count, last observed step, non-fabricated duration, mutation state, and build ID.
  - Renders Attempt 1 assertion observations table (purpose, expected vs. observed values, pass/fail state).
  - Displays **Target Reset & Baseline Readback Receipt Banner**: transport success, baseline equivalence, expected and observed state hashes, verified timestamp, and observed discrepancies.
  - Renders Attempt 2 if executed; if not executed, provides an honest explanation (e.g. defect was not observed in clean run, reset verification failed, or mutation uncertainty was encountered). **Never manufactures an artificial second attempt, receipt, or duration.**
- **Telemetry Fetch Error Semantics (Fetch Failure != No Errors)**:
  - Tracks discrete fetch states (`LOADING`, `FAILED`, `RESTRICTED`, `EMPTY`, `READY`) for both console and network telemetry.
  - A fetch error (HTTP failure or network exception) renders an explicit failure alert informing the user that telemetry was inaccessible and that a retrieval failure must not be construed as "no errors."
  - Badges on the artifact selector cards dynamically communicate `Retrieval Failed`, `Restricted`, `Loading...`, or event/request counts.
- **Narrative vs. Measurement Separation**:
  - Titled `Evidence Explanation (AI-Synthesized Hypotheses)`. Subtitle explicitly specifies that causal claims and suggestions are AI hypotheses (TC-INV-008) and that deterministic execution measurements remain separately displayed below.

---

## Verification

### Automated Browser-Free Test Suites
- **Phase K Test Suite**: `tests/person-1/phase-2/attempts-results-and-evidence.test.ts`
  - 11/11 tests passing:
    1. Single-attempt honesty without manufactured second attempt.
    2. Null unrecorded duration representation.
    3. Unverified reset receipt preservation and blocked Attempt 2 explanation.
    4. Console log filtering and discrimination of empty vs. failed telemetry.
    5. Network trace filtering and transport failure differentiation.
    6. Distinct evidence availability states (`PUBLIC_SAFE_READY`, `QUARANTINED_LEAK_DETECTED`, `PENDING_GENERATION`).
    7. Unpersisted plan disclosure in exports without fallback fabrication.
    8. Manifest completeness check disclosing missing artifact kinds.
    9. `RESTRICTED_RAW` artifact publicUrl isolation and disclosure counting.
    10. Target environment and build version embedding in exports.
    11. Authenticated endpoint rejection (401 UNAUTHENTICATED).
- **Evidence Presentation Test Suite**: `tests/evidence-presentation.test.ts` (21/21 tests passing).
- **Authentication & Core Suites**: `tests/person-1/phase-2/jwt-auth.test.ts` (10/10 tests passing).
- **TypeScript Typecheck**: `npm run typecheck` exited with code 0.
- **ESLint**: `npm run lint` exited with code 0 (`✔ No ESLint warnings or errors`).

### Browser Verification Note
> **Browser verification not run, per instruction.**

---

## Boundaries & Constraints Preserved
- No modifications to `demo-target`.
- No new external providers, API keys, or leaked credentials.
- No branch switching, commits, or pushes.
- Restricted raw artifacts are isolated and never transmitted to external models or public exports.
- Work for Phase L was not initiated.
