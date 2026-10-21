# TraceCase — H-06 Browser Next-Action Proposal Handoff

**Document ID:** `H-06-HANDOFF`  
**Author:** Person 2 (AI, Controlled Target, and Evaluation Lead)  
**Recipients:** Person 1 (Backend Orchestrator Lead) & Person 3 (Product & UI Lead)  
**Date:** 20 October 2026  
**Implementation Source:** [`src/server/ai/browser-actor.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/browser-actor.ts)  
**Status**: IMPLEMENTED AND NON-BROWSER VERIFIED (Deterministic Action-Grounding Tests Passing; Live Browser Execution DEFERRED BY USER)  

---

## 1. Executive Summary & Operation

In accordance with **P2-05**, Person 2 has delivered the **Browser Investigation Agent (AT-ROLE-002)** and the **Observation Pruning Module**.

The agent consumes an approved semantic step definition, live accessibility tree (AXTree) snapshot, prior action history, and safety limits. It grounds the approved step into a resilient, concrete DOM locator action proposal or safe stop signal.

### Core Architecture Principles:
1. **Strictly Non-Executable:** The AI role never invokes Playwright, never executes shell/SQL, and never touches live sockets. It produces a typed proposal AST.
2. **Untrusted Page Boundary:** Content within `<untrusted_live_observation>` tags (including text, task titles, and modal dialogs) is treated as untrusted page evidence. Prompt injection attempts cannot alter the approved step.
3. **Observation Pruning with Entity Preservation:** AXTree snapshots are pruned to $<1,500$ tokens while rigorously preserving entity context needed to distinguish Task B from Task A, active filters from inactive filters, and disabled controls.
4. **Authority Separation:** The model cannot evaluate assertions or declare bugs reproduced. Person 1 owns execution dispatch, origin checks, and deterministic verifiers.

---

## 2. Component Reference

### 2.1 Role Entrypoint
```typescript
import { BrowserInteractionAgent } from '@/server/ai/browser-actor';
import { OllamaLocalModelProvider } from '@/server/ai/provider';

const provider = new OllamaLocalModelProvider({ modelIdentifier: 'qwen2.5-coder:3b' });
const actorAgent = new BrowserInteractionAgent(provider);

const { output, usage, pruning } = await actorAgent.proposeNextAction({
  contractVersion: '1.0.0',
  investigationId: 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  attemptIndex: 1,
  approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  allowedOrigins: ['http://localhost:3005'],
  currentStep: {
    stepNumber: 3,
    actionType: 'CLICK',
    intentDescription: 'Click delete button for Task B',
    targetDescription: 'Delete button for Task B (active)',
    isDestructive: true,
  },
  observation: {
    observationId: '11111111-2222-3333-4444-555555555555',
    pageUrl: 'http://localhost:3005',
    pageTitle: 'TraceCase Synthetic Demo - Task Management',
    axTree: [...],
  },
  priorActionHistory: [...],
});
```

---

## 3. Discriminated Decision Variants

The role outputs a discriminated union matching `BrowserDecisionOutput`:

### 3.1 `PROPOSE_ACTION`
Grounds an approved step into an observed element reference:
```json
{
  "variant": "PROPOSE_ACTION",
  "echoedStepNumber": 3,
  "echoedObservationId": "11111111-2222-3333-4444-555555555555",
  "action": {
    "actionType": "CLICK",
    "targetNodeId": "node_5",
    "primarySelector": "button[data-task-id=\"task-b\"]",
    "cssFallback": "button:has-text(\"Delete\"):nth-of-type(2)"
  },
  "expectedPostcondition": "Task B removed from active list",
  "rationale": "Target node_5 corresponds to Delete button for Task B (active)"
}
```

### 3.2 `STOP_BLOCKED`
Haults execution when safety, budget, or entity clarity is compromised:
```json
{
  "variant": "STOP_BLOCKED",
  "errorCode": "AMBIGUOUS_ENTITY",
  "errorDescription": "Multiple identical controls observed without entity distinction; refusing to guess."
}
```

Standard Stop Error Codes:
- `AMBIGUOUS_ENTITY`: Multiple identical buttons exist without differentiating entity context.
- `MUTATION_UNCERTAIN_TIMEOUT`: Previous destructive action timed out. Prevents duplicate deletion attempts.
- `TARGET_CONTROL_DISABLED`: Targeted control has `disabled: true`.
- `DISALLOWED_ORIGIN`: Page navigated outside `allowedOrigins`.
- `NO_PROGRESS_LOOP`: 3 consecutive failures on the same step without state progression.
- `EXHAUSTED_LIMITS`: Remaining step budget is zero.
- `EXECUTION_CANCELLED_OR_REVOKED`: User or system revoked run authorization.

### 3.3 `REQUEST_HUMAN_HELP`
Pauses automation for interactive manual challenges:
```json
{
  "variant": "REQUEST_HUMAN_HELP",
  "blockerType": "CAPTCHA_DETECTED",
  "blockerDescription": "CAPTCHA challenge detected on target page.",
  "suggestedUserAction": "Please solve the CAPTCHA in the target browser window."
}
```

### 3.4 `PROCEDURE_READY_FOR_VERIFICATION`
Signals that all approved execution steps have been executed:
```json
{
  "variant": "PROCEDURE_READY_FOR_VERIFICATION",
  "summaryOfActionsExecuted": "Filtered Active tasks and deleted Task B",
  "finalUrl": "http://localhost:3005"
}
```

---

## 4. Observation Pruning Implementation

Located in [`src/server/ai/observation-pruner.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/observation-pruner.ts):
- Bounded to configurable `maxNodes` (default 150) and `maxEstimatedTokens` (default 1,500).
- Transparently reports `isTruncated: true` and `truncatedNodeCount` if material truncation occurs.
- Evaluates duplicate interactive controls to detect ambiguity before inference.

---

## 5. Person 1 Integration Pattern

Person 1 can plug `BrowserInteractionAgent` directly into its controlled execution loop:

```typescript
// Inside Person 1's Execution Controller (Worker Attempt Loop)
for (let stepIndex = 0; stepIndex < approvedSteps.length; stepIndex++) {
  const currentStep = approvedSteps[stepIndex];

  // 1. Capture live safe observation from CDP / Playwright Worker
  const rawObservation = await workerClient.captureObservation(sessionId);

  // 2. Query Browser Actor Proposal
  const { output } = await browserActor.proposeNextAction({
    contractVersion: '1.0.0',
    investigationId,
    attemptIndex,
    approvedPlanHash,
    allowedOrigins: targetProfile.allowedOrigins,
    currentStep,
    observation: rawObservation,
    priorActionHistory,
    remainingStepBudget: maxSteps - stepIndex,
    lastActionMutationUncertain: previousActionTimedOut,
    isRevokedOrCancelled: checkRevocationStatus(investigationId),
  });

  // 3. Handle Decision
  switch (output.variant) {
    case 'PROPOSE_ACTION':
      // Person 1 ToolPolicyEnforcer independently validates action against 16 policy rules:
      toolPolicyEnforcer.assertAllowed(output.action, targetProfile.allowedOrigins);
      
      // Dispatch action to Playwright worker
      const receipt = await workerClient.executeAction(output.action);
      priorActionHistory.push(receipt);
      break;

    case 'REQUEST_OBSERVATION':
      await sleep(output.waitForTimeoutMs);
      continue; // Retake snapshot

    case 'REQUEST_HUMAN_HELP':
      await transitionInvestigationStatus(investigationId, 'AWAITING_HUMAN_HELP', output);
      return;

    case 'STOP_BLOCKED':
      await transitionInvestigationStatus(investigationId, 'HALTED_BLOCKED', output);
      return;

    case 'PROCEDURE_READY_FOR_VERIFICATION':
      // Transition to DETERMINISTIC_VERIFYING phase
      await transitionInvestigationStatus(investigationId, 'ATTEMPT_1_VERIFYING');
      return;
  }
}
```

---

## 6. Verification Status

- 17 unit & deterministic integration tests passed in [`tests/ai-browser-actor.test.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/tests/ai-browser-actor.test.ts).
- Real local model execution verified on `qwen2.5-coder:3b` at `$0.0000` API cost.
- Full workspace test suite green: 77/77 tests passing across 8 files.
