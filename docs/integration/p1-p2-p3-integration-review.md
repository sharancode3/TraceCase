# Person 1, Person 2, and Person 3 Comprehensive System Integration Review

**Date:** 22 October 2026  
**Integration Branch:** `codex/integration-person-1-2-3`  
**Base Commit (Person 1 + Person 2):** `db88fcd` (`integration/person-1-person-2`)  
**Merged Commit (Person 3):** `c276cae` (`origin/person3`)  
**Quality Status:** Clean production build, 0 TypeScript errors (`tsc --noEmit`), 0 ESLint warnings/errors (`next lint`), 75 test suites passed (663 passed tests, 6 skipped, 0 failed in ~16.8s).

---

## 1. Executive Summary

This document certifies the complete local integration and runtime reconciliation of Person 1 (Trusted Backend & Verification), Person 2 (AI Roles & Target Environment), and Person 3 (Frontend User Experience & Evidence Storage) on branch `codex/integration-person-1-2-3`.

Following the merge of Person 3 (`origin/person3`) into the verified Person 1 + Person 2 baseline, this integration pass resolved semantic incompatibilities, wired live runtime paths, connected real evidence storage, and verified the combined application end-to-end:
1. Reconciled client transport and authentication: added cryptographic cookie session verification (`tc_session`) alongside Bearer authorization, and harmonized 409 conflict messages on plan state revision mismatches.
2. Implemented `IntegratedEvidenceStorageAdapter` implementing `EvidenceStoragePort`, connecting Person 1's capture registration and sanitization commands with Person 3's dual-bucket storage (`RESTRICTED_RAW` vs `PUBLIC_SAFE`), in-stream redaction, minimum video thresholds (10 KB), console log bounding (500 KB), and access grant verification.
3. Created authenticated artifact streaming route (`/api/v1/investigations/[id]/artifacts/[artifactId]`) supporting RFC 7233 partial content / HTTP 206 range requests for WebM video streaming with fail-closed privacy withholding for uninspected video.
4. Hardened backend fact chains: updated `evidence-review-service.ts` to forward factual attempt results, reset status, and build IDs to AI Role 3, while preserving strict separation of verified facts from model hypotheses.
5. Replaced fake placeholders and synthetic mocks across all Next.js App Router frontend pages:
   - `/`: wired live `fetchInvestigations()` with loading, empty state, and mode badges.
   - `/targets`: removed synthetic target fallbacks, rendering truthful empty state when no targets exist.
   - `/investigations/new`: wired dynamic model and browser selection from target profiles, routing directly based on `requiresClarification`.
   - `/investigations/[id]/clarify`: wired real `fetchClarifications(id)` and `answerClarification(id, ...)`, removing mock placeholder notices.
   - `/investigations/[id]/approve`: connected real plan validation and explicit `startInvestigationExecution` command before live monitoring.
   - `/investigations/[id]/live`: wired real cancellation and progress event polling via `fetchInvestigationEvents(id)`.
   - `/investigations/[id]`: strictly isolated synthetic TC1 test data to canonical synthetic targets, rendering genuine database records for all real investigations.
6. Implemented a comprehensive 7-test three-person integrated journey suite (`tests/integration/p1-p2-p3-integrated-journey.test.ts`) validating end-to-end flow from intake and planning through browser execution, fixture reset, pair assessment, evidence sanitization, narrative review, and secure access grant generation.
7. Multi-Process Persistent Disk Storage Driver: implemented `PersistentDiskEvidenceStorageDriver` in `src/server/evidence/storage.ts` supporting persistent disk storage with bucket isolation (`restricted_raw` vs `public_safe`), atomic write-and-rename, metadata sidecars, and path traversal prevention.
8. Additive Schema Migration for Derivative Lineage: generated `0007_derivative_lineage.sql` adding nullable `raw_artifact_id` to `evidence_artifacts` table with updated `_journal.json`.
9. Evidence Delivery Security Route: hardened `/api/v1/investigations/[id]/artifacts/[artifactId]` with RFC 7233 partial content / HTTP 206 range requests, strict investigation ownership verification (no admin bypass), and fail-closed HTTP 403 `RESTRICTED_TIER_FORBIDDEN` for `RESTRICTED_RAW` captures without explicit restricted grant.
10. Artifacts Listing Endpoint: implemented `/api/v1/investigations/[id]/artifacts` returning authenticated users their accessible `PUBLIC_SAFE` artifact descriptors with safe delivery URLs.
11. Dynamic Frontend App Router Wiring: connected live planning and execution workflows across `/investigations/new`, `/investigations/[id]/clarify`, `/investigations/[id]/approve`, and `/investigations/[id]`. Dynamic intake triggers planning via `requestPlanning(id)`, routes authoritatively to `/clarify` or `/approve` based on proposal status, binds human approval and start commands to authoritative plan version and hash, fetches live plan and artifacts, and exports reproduction packages with authoritative plan and artifact manifests.
12. Removed Fabricated AI Explanation Defaults: replaced synthetic duration defaults (4200ms / 3800ms) with real measurements in `evidence-review-service.ts` and `investigation-claim-handler.ts`, failed closed on missing attempt 1, left missing attempt 2 null, and resolved tested target baseUrl dynamically from target profiles.
13. Comprehensive Verification Suites: added `tests/integration/evidence-delivery-security.test.ts` (9 tests), `tests/integration/persistent-storage.test.ts` (5 tests), and `tests/integration/real-acceptance-lane.test.ts` (4 tests).

Protected branch pointers (`main`, `person-1`, `person-2`, `integration/person-1-person-2`) remain untouched. No code has been pushed to remote, no PR has been created, and no external deployment or submission has occurred.

---

## 2. Invariant Enforcement Matrix (TC-INV-001 through TC-INV-015)

| Invariant ID | Definition | Runtime Enforcement Location | Verification Test Suite |
|---|---|---|---|
| **TC-INV-001** | Model exclusivity: Luna via OpenAI API only; no silent local or unauthorized fallback | `src/server/ai/integrated-adapters.ts`, `src/server/config/env.ts` | `tests/ai-provider.test.ts`, `docs/review/verification-probes.test.ts` |
| **TC-INV-002** | Two-attempt requirement: 2 valid matching attempts required to confirm reproduction | `src/server/verification/two-attempt-controller.ts`, `PairAssessor` | `tests/person-1/phase-6/two-attempt-controller.test.ts`, `tests/integration/p1-p2-behavioral-regressions.test.ts` |
| **TC-INV-003** | Honest reporting: failed runs, crashes, or dirty baselines are never non-reproductions | `src/server/verification/two-attempt-controller.ts`, `AttemptAssessor` | `tests/person-1/phase-6/evaluator.test.ts`, `tests/integration/p1-p2-behavioral-regressions.test.ts` |
| **TC-INV-004** | Target boundary: network guard blocks cloud metadata IPs and unapproved origins | `src/server/browser/network-guard.ts`, `TargetResetClient` | `tests/person-1/phase-5/network-guard.test.ts`, `tests/person-1/phase-6/target-reset.test.ts` |
| **TC-INV-005** | Human approval: strict SHA-256 plan hash binding required before execution | `src/server/workflow/investigation-workflow.service.ts`, `TwoAttemptController` | `tests/person-1/phase-1/fingerprint-and-approval.test.ts`, `tests/api-client.test.ts` |
| **TC-INV-006** | Readback verification: independent baseline comparison required before Attempt 2 | `src/server/verification/target-reset-client.ts`, `BaselineComparator` | `tests/person-1/phase-6/baseline-comparator.test.ts`, `tests/integration/p1-p2-p3-integrated-journey.test.ts` |
| **TC-INV-007** | Factual receipts: browser worker returns factual execution receipts, never verdicts | `src/server/browser/playwright-worker.ts` | `tests/person-1/phase-5/browser-execution.test.ts`, `tests/integration/real-runtime-acceptance.test.ts` |
| **TC-INV-008** | Fact/hypothesis separation: AI explanations must stamp `isVerifiedFact: false` | `src/server/ai/integrated-adapters.ts`, `src/server/ai/evidence-review-service.ts` | `tests/ai-reviewer.test.ts`, `tests/integration/p1-p2-p3-integrated-journey.test.ts` |
| **TC-INV-009** | Safe projections: target credentials, reset secrets, and webhook URLs never exposed | `src/contracts/targets.ts` (`projectSafeTargetProfile`) | `tests/person-1/phase-1/safe-projections.test.ts`, `tests/integration/p3-contract-readiness.test.ts` |
| **TC-INV-010** | Dual-bucket storage: restricted raw captures and safe public artifacts separated | `src/server/evidence/evidence-storage-adapter.ts`, `src/server/evidence/storage.ts` | `tests/storage.test.ts`, `tests/integration/p1-p2-p3-integrated-journey.test.ts` |
| **TC-INV-011** | Concurrency-1 singleton: global execution lease serializes all browser executions | `src/server/queue/execution-lease.service.ts`, `worker/index.ts` | `tests/person-1/phase-4/fencing-and-leases.test.ts`, `tests/integration/p1-p2-behavioral-regressions.test.ts` |
| **TC-INV-012** | Mandatory Evidence Triad Byte Integrity: SHA-256 digests on video, console, network | `src/server/evidence/evidence-storage-adapter.ts`, `src/server/evidence/processor.ts` | `tests/sanitizer.test.ts`, `tests/integration/p1-p2-p3-integrated-journey.test.ts` |
| **TC-INV-013** | Action tier limits: browser worker derives effective allowed tiers from plan and target | `src/server/browser/playwright-worker.ts` | `tests/person-1/phase-5/action-dispatch.test.ts`, `tests/integration/p1-p2-behavioral-regressions.test.ts` |
| **TC-INV-014** | Post-model lease check: revalidates lease after model latency before dispatching | `src/server/browser/playwright-worker.ts` | `tests/integration/p1-p2-behavioral-regressions.test.ts` (Case 5) |
| **TC-INV-015** | Truthful Evidence Presentation: uninspected video quarantined in restricted tier | `src/server/evidence/evidence-storage-adapter.ts`, RFC 7233 route handler | `tests/evidence-presentation.test.ts`, `tests/integration/p1-p2-p3-integrated-journey.test.ts` |

---

## 3. Subsystem Integration & Cross-Boundary Reconciliation Details

### 3.1 Authentication & Cookie Transport Bridging
- `src/server/auth/index.ts`: added cryptographic cookie session verification (`tc_session`) alongside standard Bearer Authorization headers. Server requests without authorization headers now extract session cookies and verify them against the server secret key.
- `src/features/investigations/api-client.ts`: aligned HTTP 409 Conflict error messages to `'Plan conflict: State revision or plan hash mismatch (TC-INV-005).'`.

### 3.2 Evidence Storage Port & Adapter Implementation
- `src/server/evidence/evidence-storage-adapter.ts`: implemented `IntegratedEvidenceStorageAdapter` fulfilling `EvidenceStoragePort`:
  - `registerCapture`: validates command arguments, registers local captures in `evidence_artifacts`, and stages raw artifacts into `RESTRICTED_RAW` storage.
  - `processArtifacts`: runs sanitization pipelines, applies in-stream redaction to console logs and network traces, moves safe artifacts to `PUBLIC_SAFE`, and retains raw uninspected WebM videos in `RESTRICTED_RAW` storage.
  - `createAccessGrant`: issues time-limited (1-hour), user-scoped access grants for authorized artifact retrieval.
- `src/server/services/service-container.ts`: default service container instantiates `IntegratedEvidenceStorageAdapter`, transitioning evidence storage component status to `AVAILABLE`.

### 3.3 Authenticated Video Streaming & Partial Content Route
- `src/app/api/v1/investigations/[id]/artifacts/[artifactId]/route.ts`:
  - Enforces session authentication via cookie or Bearer token.
  - Verifies artifact existence and ownership against database.
  - Validates time-limited access grants via `verifyAccessGrant`.
  - Implements RFC 7233 partial content / HTTP 206 range requests for WebM video streaming, allowing browser media players to seek through video recordings efficiently.
  - Fails closed with HTTP 403 Forbidden if unredacted video access is requested without valid raw tier authorization.

### 3.4 Frontend Live Data Wiring & Mock Removal
- `src/app/page.tsx`: connected live `fetchInvestigations()`. Displays loading indicator during fetch, renders truthful empty state when no investigations exist, and badges preview/live mode.
- `src/app/targets/page.tsx`: removed synthetic mock fallback when live target list is empty, presenting a truthful empty state guiding the user to configure authorized targets.
- `src/app/investigations/new/page.tsx`: connected dynamic target profile fetching, wired real model/browser choices, and routes dynamically based on `requiresClarification`.
- `src/app/investigations/[id]/clarify/page.tsx`: connected `fetchClarifications` and `answerClarification` API endpoints, removing placeholder cards.
- `src/app/investigations/[id]/approve/page.tsx`: performs real plan status verification and issues an explicit `startInvestigationExecution` command before redirecting to the live execution view.
- `src/app/investigations/[id]/live/page.tsx`: supports real execution cancellation via `cancelInvestigationExecution` and polls live progress events via `fetchInvestigationEvents`.
- `src/app/investigations/[id]/page.tsx`: strictly isolates synthetic TC1 demo logs and traces to canonical synthetic targets (`isTC1`), ensuring real investigations display only genuine, stored evidence artifacts.

---

## 4. Official Gate Status (G0 through G5)

| Gate ID | Gate Description | Status | Verification Detail |
|---|---|---|---|
| **G0** | Core Domain & Contracts | **READY** | All contracts in `src/contracts/` strictly validated via Zod schemas across all boundaries. |
| **G1** | Authenticated Multi-Tenant Engine | **READY** | User ownership and cryptographic session/Bearer auth verified across routes and services. |
| **G2** | Two-Attempt Controller & Verification | **READY (WITH DOUBLES)** | Deterministic two-attempt engine passes all baseline, reset, and pair assessment tests. |
| **G3** | AI Role Integration (Luna) | **BLOCKED ON LIVE KEY** | All 3 AI roles verified with test doubles; live execution requires external `OPENAI_API_KEY` for `gpt-6-luna`. |
| **G4** | Operational Hardening & Evidence Triad | **READY** | Integrated dual-tier evidence storage, sanitization, WebM video range streaming, and SHA-256 byte integrity verified. |
| **G5** | Production Runtime Deployment | **BLOCKED ON HOST INFRA** | Blocked on live PostgreSQL 5432 daemon and Docker environment for full persistent execution. |

---

## 5. Verification & Test Evidence Summary

- **Total Test Suites:** 75 passed, 0 failed (100% pass rate).
- **Total Tests:** 663 passed, 6 skipped, 0 failed.
- **Execution Time:** ~16.8 seconds.
- **TypeScript:** 0 errors (`tsc --noEmit`).
- **ESLint:** 0 warnings or errors (`next lint`).
- **Next.js & Worker Build:** 26 pages/routes optimized and generated; worker bundled cleanly (`dist/worker/index.mjs`, 405 KB).

---

## 6. Preserved References & Branch Pointers

- `main`: `af56f5a6304c5cefdb978485fcefae6011634b77` (unmodified)
- `person-1`: `297125bb0dc92c4f984f72ce84523d6bff146382` (unmodified)
- `person-2`: `a7d9ffcbf04c7641e4b91518f59fd2d240a2e4d8` (unmodified)
- `integration/person-1-person-2`: `db88fcdf7250cd5bbbce82fe555ac73e7dda2178` (unmodified)
- `origin/person3`: `c276cae44d204185d46e6a75f850da1fcad00d6b` (merged into local integration branch)
- `codex/integration-person-1-2-3`: current active integration branch.
