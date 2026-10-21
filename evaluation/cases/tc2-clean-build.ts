import type { EvaluationCase } from '../case-schema';

/**
 * TC2: Non-Reproducible Defect (Clean Baseline / Fixed Application Build)
 * In accordance with Problem Statement benchmark TC2.
 */
export const TC2_CLEAN_BUILD_CASE: EvaluationCase = {
  caseId: 'TC-TC2-CLEAN-BUILD',
  title: 'Reported delete bug cannot be reproduced on fixed build',
  category: 'OFFICIAL_PS_BENCHMARK',
  summary:
    'Executing the identical reproduction steps on a fixed build (v1.0.1-fixed) removes Task B correctly across both runs. System must honestly report NOT_REPRODUCED.',
  rawReport: {
    title: 'Delete deletes the wrong task when filter is applied',
    description:
      'When filter is Active and I delete Task B, Task A disappears instead of Task B.',
    environmentClues: 'Chrome 122, TraceCase-Demo-Tasks v1.0.1-fixed',
    claimedExpectedBehavior: 'Task B deleted, Task A preserved.',
  },
  targetProfile: {
    name: 'TraceCase-Demo-Tasks',
    baseUrl: 'http://localhost:3005',
    isSandbox: true,
    allowedOrigins: ['http://localhost:3005'],
    hasResetFixture: true,
    buildVersion: 'v1.0.1-fixed',
    fixtureScope: 'two_tasks_one_completed',
  },
  groundTruth: {
    actualBugPresent: false,
    bugClassification: 'DEFECT_NOT_PRESENT',
    rootCauseSummary:
      'The fixed build correctly deletes items by persistent ID, preserving other items regardless of filter status.',
    expectedCorrectBehavior: 'Task B is removed from storage; Task A remains present and completed.',
    reportedFailureSignature: 'Task B remains in storage; Task A is missing from storage.',
    deterministicPredicates: [
      {
        predicateId: 'assert_task_b_deleted',
        assertionType: 'CORRECT_BEHAVIOR',
        target: 'DOM_ELEMENT',
        selector: '[data-task-id="task-b"]',
        expectedCondition: 'NOT_EXISTS',
        expectedValue: true,
        description: 'Task B should not exist in DOM after deletion',
      },
      {
        predicateId: 'assert_task_a_preserved',
        assertionType: 'CORRECT_BEHAVIOR',
        target: 'DOM_ELEMENT',
        selector: '[data-task-id="task-a"]',
        expectedCondition: 'EXISTS',
        expectedValue: true,
        description: 'Task A should still exist in DOM',
      },
    ],
  },
  expectedClassification: {
    expectedLifecycleState: 'COMPLETED',
    expectedReproductionVerdict: 'NOT_REPRODUCED',
    expectedEvidenceReadiness: 'PUBLIC_SAFE_READY',
    requiresClarificationFirst: false,
  },
  redactionObligations: {
    injectedSyntheticSecrets: [],
    forbiddenInSafeOutputs: [],
  },
  datasetPartition: 'RESERVED_EVALUATION_HOLDOUT',
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
      expectedObservedVerdict: 'NOT_REPRODUCED',
      mustPreserveLockedVerdict: true,
    },
  },
  rationale:
    'Core benchmark for Problem Statement obligation TC2. Must not hallucinate reproduction when target functions correctly.',
  reviewedBy: 'Person-2-AI-Eval-Lead',
  version: '1.0.0',
};
