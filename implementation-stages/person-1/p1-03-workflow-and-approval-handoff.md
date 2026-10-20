# TraceCase — Person 1: Phase P1-03 Workflow and Approval Handoff

**Phase:** P1-03 — Investigation Workflow, Clarification, Versioned Plans, and Persisted Human Approval  
**Status:** Completed Locally / Ready for Integration  
**Date:** 20 October 2026 (Asia/Calcutta)  
**Author:** Person 1 (Core Platform, Browser Execution, and Verification Lead)  

---

## 1. Overview and Purpose

This document outlines the operational contracts, workflow engine interfaces, proposal policy rules, and admission boundary established in **Phase P1-03**. It serves as the authoritative handoff for Person 2 (AI/Clarification), Person 3 (UI/Evidence), and upcoming Phase P1-04 (Queue Scheduling & Worker Dispatch).

---

## 2. Handoff for Person 2 (AI, Clarification, and Proposal Lead)

### 2.1. Port Contract: `ReportClarificationAgentPort`

The workflow service interacts with Luna Role 1 via `ReportClarificationAgentPort` defined in `src/server/services/ports.ts`:

```ts
export interface ReportClarificationAgentPort {
  generateProposal(params: {
    report: DraftReportIntake | ClarifiedReportContext;
    target: SafeModelTargetContext;
  }): Promise<ReportPlannerOutput>;
}
```

### 2.2. Expected Planner Output Formats

Your agent implementation can return one of three discriminated unions:

#### 1. Clarification Request (`CLARIFICATION_NEEDED`)
Return this when the bug report lacks essential preconditions, browser environment details, or authentication parameters:
```json
{
  "status": "CLARIFICATION_NEEDED",
  "preliminaryUnderstanding": "Checkout button fails with 500 when items in cart are discounted",
  "questions": [
    {
      "questionIndex": 0,
      "questionText": "What payment method was selected when the checkout failed?",
      "explanation": "Different gateways have distinct client-side validation logic.",
      "suggestedOptions": ["Credit Card", "PayPal", "Bank Transfer"]
    }
  ]
}
```
*Note:* The model outputs pure questions (`ProposedClarificationQuestionSchema`). The server automatically assigns UUIDs, tracks `isAnswered: false`, records `investigation_id`, and manages answer state.

#### 2. Experiment Plan Proposal (`EXPERIMENT_PROPOSED`)
Return this when sufficient facts exist to formulate a deterministic browser experiment:
```json
{
  "status": "EXPERIMENT_PROPOSED",
  "proposal": {
    "preconditions": [
      "Target app is reachable at baseURL",
      "User cart has at least 1 item"
    ],
    "steps": [
      {
        "stepIndex": 0,
        "semanticAction": "Navigate to cart checkout page",
        "toolKind": "navigate",
        "value": "https://demo.app.local/cart",
        "tier": "TIER_1_READ_ONLY",
        "timeoutMs": 15000
      },
      {
        "stepIndex": 1,
        "semanticAction": "Click checkout submit button",
        "toolKind": "click_button",
        "selector": "#checkout-submit-btn",
        "tier": "TIER_3_MUTATING_INTERACTION",
        "timeoutMs": 10000
      }
    ],
    "expectedCorrectBehavior": "Order confirmation page displays confirmation number and receipt",
    "reportedFailureSignature": "Error 500 toast notification appears and transaction aborts",
    "assertions": [
      {
        "id": "11111111-1111-4111-8111-111111111111",
        "kind": "ENTITY_PRESENCE",
        "source": "DOM_ELEMENT",
        "purpose": "EXPECTED_CORRECT_BEHAVIOR",
        "subjectRef": ".order-confirmation",
        "operator": "EXISTS",
        "settlingPoint": "AFTER_NETWORK_IDLE",
        "description": "Verify confirmation card exists"
      },
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "kind": "ENTITY_PRESENCE",
        "source": "DOM_ELEMENT",
        "purpose": "REPORTED_FAILURE_SIGNATURE",
        "subjectRef": ".error-toast",
        "operator": "EXISTS",
        "settlingPoint": "AFTER_NETWORK_IDLE",
        "description": "Verify error toast exists"
      }
    ],
    "requiresResetHook": true
  }
}
```

#### 3. Blocked / Unable to Proceed (`UNABLE_TO_PROCEED`)
Return this when the report is fundamentally outside scope (e.g. non-web targets, OTP/CAPTCHA bypass requested):
```json
{
  "status": "UNABLE_TO_PROCEED",
  "reason": "Bug report requires two-factor SMS OTP authentication, which TraceCase does not bypass (TC-INV-009).",
  "missingPrerequisites": ["Manual session fixture credentials"]
}
```

### 2.3. Proposal Validation Rules Enforced Server-Side
All proposals must satisfy `validateExperimentProposal`:
- **Tools Allowlist:** Only 12 safe tools permitted (`navigate`, `click_button`, `click_link`, `fill_input`, `select_option`, `set_checkbox`, `press_key`, `hover_element`, `scroll_page`, `inspect_dom`, `get_text`, `screenshot`). Rejects `delete_element` and `clear_storage`.
- **Step Indices:** Must be strictly sequential integers starting from 0.
- **Timeouts:** `1000ms <= timeoutMs <= 60000ms`.
- **RegEx Operator Rejection:** `MATCHES_REGEX` is strictly rejected to prevent ReDoS vulnerabilities.
- **Dual Assertion Rule:** Must include both `EXPECTED_CORRECT_BEHAVIOR` and `REPORTED_FAILURE_SIGNATURE`.
- **Sandbox Requirement:** Any step with `TIER_4_DESTRUCTIVE` requires `target.isSandboxVerified === true`.

---

## 3. Handoff for Person 3 (UI, Evidence, and State Lead)

### 3.1. Clarification Dialogue Integration (`/investigations/[id]/clarify`)
- **Querying Questions:** `GET /api/v1/investigations/[id]/clarifications` returns the persisted list of clarification questions.
- **Submitting Answers:** `POST /api/v1/investigations/[id]/clarifications/answer` accepts:
```json
{
  "answers": [
    { "questionId": "c33ac10b-58cc-4372-a567-0e02b2c3d403", "answerText": "Chrome 122 on macOS" }
  ],
  "expectedWorkflowRevision": 2
}
```

### 3.2. Human Operator Approval Gate (`/investigations/[id]/approve`)
- **Reading Active Plan:** `GET /api/v1/investigations/[id]/plan` returns the active plan revision along with its authoritative `planHash`.
- **Approving Plan:** `POST /api/v1/investigations/[id]/approve` accepts:
```json
{
  "investigationId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "planVersion": 1,
  "approvedPlanHash": "a8f4c2e5917412db9e54a3901b50428d7162b483e5891d4e0839e12d4a2345bc",
  "operatorNotes": "Inspected steps and confirmed safe checkout assertions",
  "expectedWorkflowRevision": 2
}
```
- **Rejection:** `POST /api/v1/investigations/[id]/reject` accepts:
```json
{
  "investigationId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "planVersion": 1,
  "rejectionReason": "Navigation to third-party payment portal not permitted"
}
```
- **Revocation:** `POST /api/v1/investigations/[id]/revoke` accepts:
```json
{
  "investigationId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "planVersion": 1,
  "revocationReason": "Target application undergoing maintenance"
}
```

### 3.3. Idempotency Header
Clients should send an `X-Idempotency-Key: <unique-uuid>` header on all mutating POST requests. Retrying identical requests returns cached 200/202 responses with identical bodies without duplicate state transitions or duplicate DB rows.

### 3.4. Read-Model Snapshot Fields
`GET /api/v1/investigations/[id]` provides truthful lifecycle status:
- `workflowRevision`: Optimistic concurrency integer. Send back as `expectedWorkflowRevision` to prevent race conditions.
- `reviewStatus`: Current state (`NONE`, `CLARIFICATION_PENDING`, `PROPOSAL_READY`, `APPROVED`, `REJECTED`, `REVOKED`, `CANCELLED`).
- `isApproved`: Boolean. True strictly when `reviewStatus === 'APPROVED'`, plan hashes match, and approval is unexpired and unrevoked.
- `approvedBy`: Principal ID of approving operator.
- `approvedAt`: ISO timestamp of approval.
- `rejectionReason` / `cancellationReason`: Audit strings explaining why an experiment was rejected or cancelled.

---

## 4. Handoff for Phase P1-04 (Queue Scheduling & Worker Dispatch)

### 4.1. Start / Admission Boundary Contract
Phase P1-03 establishes `POST /api/v1/investigations/[id]/start`:
- Request schema:
```json
{
  "investigationId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "planVersion": 1,
  "approvedPlanHash": "a8f4c2e5917412db9e54a3901b50428d7162b483e5891d4e0839e12d4a2345bc"
}
```
- **Preconditions Verified:**
  1. Authenticated principal owns the investigation.
  2. Investigation `reviewStatus === 'APPROVED'`.
  3. `planVersion` matches the active approved version.
  4. Approval record exists in `plan_approvals` for `(investigation_id, plan_version)`.
  5. Approval is unrevoked (`revoked_at IS NULL`).
  6. Approval is unexpired (`expires_at > NOW()`).
  7. `approvedPlanHash` matches the cryptographic fingerprint of the stored plan payload.
  8. Approval compatibility guard passes (target match, actor match, action tier ceiling).

### 4.2. Next Step for P1-04
In Phase P1-03, `startInvestigation` uses `unavailableQueueDispatcher` in live mode, which throws `ServiceUnavailableError('QueueDispatcherPort')` (HTTP 503).  
In Phase P1-04:
1. Implement `PgBossQueueDispatcher` conforming to `QueueDispatcherPort`.
2. Connect pg-boss to the shared PostgreSQL database.
3. Replace the placeholder dispatcher in `investigationWorkflowService`.
4. Return HTTP 202 `{ status: "QUEUED", jobId: result.jobId, queuedAt: result.queuedAt }`.
