# Phase P1-04: Durable Queue, Worker Ownership, and Replayable Progress — Handoff Contract

## 1. Context and Target Consumers

This document provides integration specifications for:
1. **Person 1, Phase P1-05 (Bounded Playwright Execution & Capture):** Details how the browser worker subscribes to the execution pipeline, binds to the global lease, and reports execution receipts.
2. **Person 3, Phase P3-05 (Live Investigation Progress UI & Replay):** Details how frontend clients consume replayable progress events via cursor-based HTTP queries and Server-Sent Events (SSE).

---

## 2. Queue and Worker Handoff (For Phase P1-05)

### 2.1 Queue Job Names and Data Shapes
- Queue Name: `'investigation-execution'` (`QUEUE_INVESTIGATION_EXECUTION`).
- Payload Contract (`InvestigationExecutionJobData`):
  ```typescript
  interface InvestigationExecutionJobData {
    executionRequestId: string;
    investigationId: string;
    planVersion: number;
    planHash: string;
    requestedBy?: string;
  }
  ```

### 2.2 Global Execution Lease Protocol
- Slot Name: `'GLOBAL_SLOT_SINGLETON'`
- Worker must acquire lease via `executionLeaseService.acquireGlobalLease(...)`.
- Worker must pass the returned `ownershipEpoch` in heartbeats via `executionLeaseService.renewGlobalLease(...)`.
- Worker must verify `assertFencingEpoch(...)` before recording attempt results or modifying investigation status.
- Worker must release lease via `executionLeaseService.releaseGlobalLease(...)` in `finally` blocks.

### 2.3 Browser Worker Port Binding
- In Phase P1-05, implement `BrowserWorkerPort`:
  ```typescript
  interface BrowserWorkerPort {
    executeAttempt(params: {
      investigationId: string;
      attemptNumber: 1 | 2;
      plan: AuthoritativeExperimentPlan | ExperimentPlan;
      target: SafeTargetProfile;
    }): Promise<AttemptExecutionReceipt>;
  }
  ```
- Register the live browser worker implementation with `InvestigationClaimHandler`.

---

## 3. Progress Event and Replay Contracts (For Person 3 / Phase P3-05)

### 3.1 Cursor-Based Event Replay Endpoint
- **Method:** `GET`
- **Path:** `/api/v1/investigations/[id]/events`
- **Authentication:** Bearer JWT required in `Authorization` header.
- **Query Parameters:**
  - `afterSequence` (integer, optional, default: `0`): Retrieve events with `sequenceIndex > afterSequence`.
  - `limit` (integer, optional, default: `50`, maximum: `200`): Maximum events per page.
- **Success Response (`200 OK`):**
  ```json
  {
    "investigationId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "currentWatermark": 12,
    "events": [
      {
        "id": "event-uuid",
        "sequenceIndex": 1,
        "eventType": "PLAN_PROPOSED",
        "payload": { ... },
        "emittedAt": "2026-10-20T18:00:00.000Z"
      }
    ]
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Missing or invalid credentials.
  - `404 Not Found`: Investigation not found or not owned by principal.

### 3.2 Real-Time Server-Sent Events (SSE) Streaming Endpoint
- **Method:** `GET`
- **Path:** `/api/v1/investigations/[id]/stream`
- **Authentication:** Bearer JWT required.
- **Headers:**
  - `Accept: text/event-stream`
  - `Last-Event-ID: <sequenceIndex>` (optional): Catches up from the specified sequence index.
- **Stream Format:**
  ```text
  id: 1
  event: PLAN_PROPOSED
  data: {"id":"event-uuid","sequenceIndex":1,"eventType":"PLAN_PROPOSED","payload":{...},"emittedAt":"2026-..."}

  : ping

  id: 2
  event: EXECUTION_ADMITTED
  data: {"id":"event-uuid","sequenceIndex":2,"eventType":"EXECUTION_ADMITTED","payload":{...},"emittedAt":"2026-..."}
  ```
- **Heartbeat:** Comment line `: ping\n\n` emitted every 15 seconds to prevent proxy connection dropouts.
- **Reconnection Behavior:** Reconnecting with `Last-Event-ID` does not trigger re-execution; it resumes playback directly from the persisted event log.

---

## 4. Verification Checkpoint
All contracts, endpoints, and background worker protocols are fully operational, tested by 131 automated tests, and ready for Phase P1-05 and Phase P3-05 consumption.
