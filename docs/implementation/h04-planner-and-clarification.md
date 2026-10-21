# TraceCase — H-04 Report Interpretation, Clarification, and Experiment Proposals Handoff

**Document ID:** `H-04-HANDOFF`  
**Author:** Person 2 (AI, Controlled Target, and Evaluation Lead)  
**Recipients:** Person 1 (Backend Orchestrator Lead) & Person 3 (Product & UI Lead)  
**Date:** 20 October 2026  
**Implementation Source:** [`src/server/ai/planner.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/planner.ts)  
**Status**: IMPLEMENTED AND NON-BROWSER VERIFIED (Deterministic Planner & Clarifier Tests Passing; Browser/Deployed Acceptance DEFERRED BY USER)  

---

## 1. Executive Summary & Operation

In accordance with **P2-04**, Person 2 has delivered the **Report & Experiment Agent (AT-ROLE-001)**.

### Entrypoint Operation:
```typescript
import { ReportExperimentAgent } from '@/server/ai/planner';
import { OllamaLocalModelProvider } from '@/server/ai/provider';

const provider = new OllamaLocalModelProvider({ modelIdentifier: 'phi4-mini:latest' });
const plannerAgent = new ReportExperimentAgent(provider);

const { output, usage } = await plannerAgent.evaluateReport(reportAgentInput);
```

---

## 2. Discriminated Output Contracts & Examples

The agent produces a strictly discriminated union matching `ReportAgentOutput`:

### 2.1 Variant 1: `NEEDS_CLARIFICATION`
Emitted when missing facts (such as target element, expected outcome, or precondition) prevent constructing a deterministic reproduction experiment:

```json
{
  "variant": "NEEDS_CLARIFICATION",
  "extractedClaim": {
    "summary": "Task deletion failure under filter",
    "affectedFeature": "Task Deletion",
    "missingFacts": ["Specific task intended to be deleted", "Expected correct outcome"]
  },
  "questions": [
    {
      "questionId": "q_target_task",
      "questionText": "Which task did you click to delete while the filter was active?",
      "whyItMatters": "To identify the exact target control in the DOM",
      "options": ["Task B (the active task)", "Task A (the completed task)", "Another task"],
      "blocksExecution": true
    },
    {
      "questionId": "q_expected_behavior",
      "questionText": "What did you expect to happen upon clicking delete?",
      "whyItMatters": "To establish the correctBehaviorAssertion predicate",
      "options": ["Task B is removed, Task A is kept", "Both tasks remain untouched"],
      "blocksExecution": true
    }
  ]
}
```

### 2.2 Variant 2: `PLAN_PROPOSED`
Emitted when sufficient facts exist to form a bounded, executable plan with testable predicates:

```json
{
  "variant": "PLAN_PROPOSED",
  "extractedClaim": {
    "summary": "Deleting filtered active task removes completed task instead",
    "reportedProblem": "Task A disappears instead of Task B",
    "claimedExpectedBehavior": "Task B is deleted and Task A remains present",
    "affectedEntities": ["Task A", "Task B"]
  },
  "experimentPlan": {
    "planRevision": 1,
    "preconditions": [
      "Target baseline restored via POST /api/test/reset-fixture",
      "Task A is completed and Task B is active"
    ],
    "requiredRole": "test_user",
    "steps": [
      {
        "stepNumber": 1,
        "actionType": "NAVIGATE",
        "intentDescription": "Open demo tasks application",
        "isDestructive": false
      },
      {
        "stepNumber": 2,
        "actionType": "CLICK",
        "intentDescription": "Filter to show only active tasks",
        "targetRole": "button",
        "targetAccessibleName": "Active",
        "isDestructive": false
      },
      {
        "stepNumber": 3,
        "actionType": "CLICK",
        "intentDescription": "Delete Task B",
        "targetRole": "button",
        "targetAccessibleName": "Delete Task B",
        "isDestructive": true,
        "affectedDataScope": "task-b"
      }
    ],
    "correctBehaviorAssertions": [
      {
        "predicateId": "assert_task_b_deleted",
        "assertionType": "CORRECT_BEHAVIOR",
        "target": "DOM_ELEMENT",
        "selector": "[data-task-id=\"task-b\"]",
        "expectedCondition": "NOT_EXISTS",
        "expectedValue": true,
        "description": "Task B should be removed from DOM"
      },
      {
        "predicateId": "assert_task_a_preserved",
        "assertionType": "CORRECT_BEHAVIOR",
        "target": "DOM_ELEMENT",
        "selector": "[data-task-id=\"task-a\"]",
        "expectedCondition": "EXISTS",
        "expectedValue": true,
        "description": "Task A should remain in DOM"
      }
    ],
    "reportedFailureAssertions": [
      {
        "predicateId": "assert_task_b_remains",
        "assertionType": "REPORTED_FAILURE_SIGNATURE",
        "target": "DOM_ELEMENT",
        "selector": "[data-task-id=\"task-b\"]",
        "expectedCondition": "EXISTS",
        "expectedValue": true,
        "description": "Bug signature: Task B was not removed"
      },
      {
        "predicateId": "assert_task_a_wrongly_removed",
        "assertionType": "REPORTED_FAILURE_SIGNATURE",
        "target": "DOM_ELEMENT",
        "selector": "[data-task-id=\"task-a\"]",
        "expectedCondition": "NOT_EXISTS",
        "expectedValue": true,
        "description": "Bug signature: Task A was erroneously deleted"
      }
    ]
  }
}
```

---

## 3. Integration Guidelines for Person 1 (Backend)

1. **Clarification Persistence:** If `output.variant === 'NEEDS_CLARIFICATION'`, Person 1 persists the questions in `clarification_questions` table, and transitions lifecycle status to `AWAITING_APPROVAL` / `CLARIFYING`.
2. **Server-Side Plan Enrichment:** If `output.variant === 'PLAN_PROPOSED'`, Person 1's trusted controller:
   - Assigns authoritative `id: randomUUID()`.
   - Computes canonical SHA-256 fingerprint: `calculatePlanFingerprint(enrichedPlan)`.
   - Persists to `investigations.plan_hash` and `plan_version`.
   - Strips any untrusted authority fields.
   - Transitions state to `AWAITING_APPROVAL` (awaiting human operator approval).

---

## 4. Integration Guidelines for Person 3 (UI / Frontend)

1. **Clarification Screen:** Person 3 renders `output.questions` as structured interactive cards (`@/components/clarification-card.tsx`).
2. **Plan Review Screen:** Person 3 renders `output.experimentPlan.steps` and distinct `correctBehaviorAssertions` vs `reportedFailureAssertions`. Zero prose parsing needed.
