import type { EvaluationCase } from '../case-schema';

/**
 * ============================================================================
 * TRACECASE PERSON 2: PROMPT DEVELOPMENT & TRAINING EXAMPLES
 * ============================================================================
 * 
 * Partition: PROMPT_DEV_TRAINING
 * 
 * These cases are explicitly designated for prompt engineering, few-shot tuning,
 * and developer sanity checking. They are strictly decoupled from the holdout
 * benchmark set (`RESERVED_EVALUATION_HOLDOUT`) to prevent evaluation contamination.
 */

export const PROMPT_DEV_FILTER_EXAMPLE: EvaluationCase = {
  caseId: 'TC-DEV-001-FILTER-DELETE',
  title: 'Development example: Filtered task deletion with clarified answer',
  category: 'OFFICIAL_PS_BENCHMARK',
  summary:
    'Development training example for Planner few-shot prompts demonstrating how a clarified user report is structured into an executable plan.',
  rawReport: {
    title: 'Filtered task deletion defect',
    description: 'When filtering by Active, deleting Task B removes Task A from storage.',
    environmentClues: 'Development Staging Target v1.0.0-dev',
    claimedExpectedBehavior: 'Task B is removed, Task A remains in list.',
  },
  targetProfile: {
    name: 'TraceCase-Demo-Tasks-Dev',
    baseUrl: 'http://localhost:3005',
    isSandbox: true,
    allowedOrigins: ['http://localhost:3005'],
    hasResetFixture: true,
    buildVersion: 'v1.0.0-dev',
    fixtureScope: 'two_tasks_one_completed',
  },
  groundTruth: {
    actualBugPresent: true,
    bugClassification: 'INDEX_OFFSET_STATE_DESYNC',
    rootCauseSummary: 'Array index offset bug when filtering tasks.',
    expectedCorrectBehavior: 'Task B is removed, Task A remains.',
    reportedFailureSignature: 'Task B is present, Task A is missing.',
    deterministicPredicates: [
      {
        predicateId: 'assert_task_b_deleted',
        assertionType: 'CORRECT_BEHAVIOR',
        target: 'DOM_ELEMENT',
        selector: '[data-task-id="task-b"]',
        expectedCondition: 'NOT_EXISTS',
        expectedValue: true,
        description: 'Task B deleted',
      },
    ],
  },
  expectedClassification: {
    expectedLifecycleState: 'COMPLETED',
    expectedReproductionVerdict: 'CONFIRMED_REPRODUCED',
    expectedEvidenceReadiness: 'PUBLIC_SAFE_READY',
    requiresClarificationFirst: false,
  },
  redactionObligations: {
    injectedSyntheticSecrets: [],
    forbiddenInSafeOutputs: [],
  },
  datasetPartition: 'PROMPT_DEV_TRAINING',
  expectedRoleBehaviors: {
    planner: {
      expectedVariant: 'PLAN_PROPOSED',
    },
    browserActor: {
      expectedVariant: 'PROPOSE_ACTION',
      expectedTargetNodeId: 'node_5',
    },
    reviewer: {
      expectedVariant: 'REPORT_SYNTHESIZED',
      expectedObservedVerdict: 'CONFIRMED_REPRODUCED',
      mustPreserveLockedVerdict: true,
    },
  },
  rationale: 'Training fixture used for calibrating planner few-shot prompts without contaminating holdout cases.',
  reviewedBy: 'Person-2-AI-Eval-Lead',
  version: '1.0.0',
};
