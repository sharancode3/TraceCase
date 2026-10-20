# TraceCase — Person 1: Phase P1-02 Persistence and Identity Handoff

**Phase:** P1-02 — Real Identity, Persistence, and Owned Resources  
**Status:** Completed Locally / Ready for Integration  
**Date:** 20 October 2026 (Asia/Calcutta)  
**Author:** Person 1 (Core Platform, Browser Execution, and Verification Lead)  

---

## 1. Overview and Purpose

This handoff document details the operational database contracts, cryptographic authentication capabilities, and multi-tenant resource boundaries established in **Phase P1-02**. It guides Person 2 (AI/Target), Person 3 (UI/Evidence), and upcoming Phase P1-03 (Investigation Workflow and Human Approval) implementation.

---

## 2. Handoff for Person 2 (AI, Clarification, and Proposal Lead)

### 2.1. Incomplete/Vague Bug Intake Support
In Phase P1-01, bug report intake required strict non-empty strings for `expectedBehavior` and `observedBehavior`. In P1-02, the database schema and API have been updated to support realistic developer bug intake:
- `bug_reports.raw_description` stores the original, unstructured bug report from the reporter.
- `bug_reports.expected_behavior` and `bug_reports.observed_behavior` are nullable in the database.
- The `POST /api/v1/reports` endpoint accepts both `CreateReportCommandSchema` and `DraftReportIntakeSchema`.
- **Next Step for Person 2:** Luna Role 1 (Clarification Dialogues) can query the draft bug report, determine known facts vs missing facts, and generate clarification questions before proceeding to experiment planning.

### 2.2. Experiment Plan Storage & Versioning
- Table `experiment_plan_revisions` provides append-only, immutable storage for plans proposed by Luna Role 2.
- The repository method `plansRepository.createPlanRevision` enforces that plan versions cannot be overwritten or mutated once stored (`uniqueIndex(investigation_id, version)`).
- Plans must be enriched with server-owned authoritative fields (target URL, allowed origins, plan hash, timeout) before being submitted for operator approval.

### 2.3. Safe Model Target Context
- AI models must never receive credential references or fixture reset secrets.
- Use `projectSafeModelTargetContext(target)` to extract only the safe context:
```ts
{
  targetId: string;
  name: string;
  baseUrl: string;
  allowedOrigins: string[];
  isSandboxVerified: boolean;
  environment: 'staging' | 'development' | 'demo' | 'production';
}
```

---

## 3. Handoff for Person 3 (UI, Evidence, and State Lead)

### 3.1. Authentication Header Requirements
- Live API endpoints require a standard Bearer token header:
  `Authorization: Bearer <valid_jwt>`
- Requests presenting preview simulation headers (`x-tracecase-preview: true`) to live endpoints are rejected with 401 `UNAUTHENTICATED`.
- When `DEV_PREVIEW_MODE=true` is set in the server environment, all endpoints return synthetic fixture responses with `mode: 'preview_synthetic'`.

### 3.2. Safe Target Profiles for UI
- UI components consuming `/api/v1/targets` receive `SafeTargetProfile`:
  - `fixtureResetAuthSecret` and `fixtureResetAuthSecretRef` are never returned in JSON responses.
  - Boolean capability flags `hasResetCapability` and `hasTestAccountConfigured` indicate target readiness without revealing sensitive values.
  - `isSandboxVerified` indicates whether server-side sandbox verification has passed.

### 3.3. Standardized Error Responses
All API error responses continue to adhere strictly to `SafeErrorEnvelopeSchema`:
```json
{
  "success": false,
  "error": {
    "category": "UNAUTHORIZED",
    "code": "PERMISSION_DENIED",
    "message": "Target does not exist or is not owned by the requesting principal.",
    "timestamp": "2026-10-20T22:30:00.000Z"
  }
}
```
Standard status code mappings:
- `400`: `VALIDATION_FAILED` (malformed JSON or invalid schema).
- `401`: `UNAUTHENTICATED` (missing or invalid Bearer token).
- `403`: `UNAUTHORIZED` (attempt to access or cross-reference another principal's target or investigation).
- `404`: `NOT_FOUND` (non-existent resource or foreign resource hidden to prevent enumeration).
- `503`: `SERVICE_NOT_CONFIGURED` / `DATABASE_UNAVAILABLE` (database is offline or unreachable).

---

## 4. Handoff for Phase P1-03 (Investigation Lifecycle & Human Approval)

### 4.1. Persisted Approvals Schema
Table `plan_approvals` is prepared for the Phase P1-03 approval route:
- `investigation_id`: UUID reference to parent investigation.
- `plan_version`: Integer version of the approved plan revision.
- `plan_hash`: SHA-256 fingerprint of the canonical plan payload.
- `target_id`: UUID reference to the target application.
- `authorized_actor_id`: Principal ID of the operator granting approval.
- `max_action_tier_permitted`: Action tier ceiling (`TIER_1_READ_ONLY`, `TIER_2_SAFE_INTERACTION`, `TIER_3_MUTATING_INTERACTION`, `TIER_4_DESTRUCTIVE`).
- `revoked_at`: Timestamp if operator revokes authorization before execution.
- `expires_at`: Timestamp enforcing approval validity lifetime.

### 4.2. Approval Guard Binding
Phase P1-03 can directly invoke `verifyAuthoritativeApprovalCompatibility`:
```ts
const compatibility = verifyAuthoritativeApprovalCompatibility({
  plan: authoritativePlan,
  approval: persistedApprovalRecord,
  trustedContext: {
    targetId: authoritativePlan.targetId,
    actorId: principal.id,
    currentTimestamp: new Date().toISOString(),
  },
});

if (!compatibility.isCompatible) {
  // Reject execution or transition to BLOCKED
}
```

---

## 5. Environment and Operational Variables

For staging and production environments, configure:

| Variable | Type | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | URI | PostgreSQL 15 connection string (`postgres://user:pass@host:5432/db`) |
| `DEV_PREVIEW_MODE` | Boolean | Must be `false` (default) for live operations; fatal error if `true` in production |
| `AUTH_ISSUER` | URL | Expected JWT issuer claim (`iss`) |
| `AUTH_AUDIENCE` | String | Expected JWT audience claim (`aud`) |
| `AUTH_JWKS_URI` | URL | Remote JWKS endpoint for fetching public verification keys |
| `AUTH_CLOCK_TOLERANCE_SEC` | Number | Clock skew tolerance in seconds (default: `10`) |
