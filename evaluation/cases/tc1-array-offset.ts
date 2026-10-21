import type { EvaluationCase } from '../case-schema';

/**
 * TC1: Deterministic Two-Run Confirmation (Array Index Offset Defect)
 * In accordance with Problem Statement benchmark TC1.
 */
export const TC1_ARRAY_OFFSET_CASE: EvaluationCase = {
  caseId: 'TC-TC1-ARRAY-OFFSET',
  title: 'Deleting filtered task deletes wrong item due to array index offset',
  category: 'OFFICIAL_PS_BENCHMARK',
  summary:
    'When Active filter is applied, clicking Delete on the second visible task (Task B) removes Task A instead because delete mutation indexes raw unfiltered array.',
  rawReport: {
    title: 'Delete deletes the wrong task when filter is applied',
    description:
      'I have two tasks: Task A (completed) and Task B (active). When I switch filter to Active, only Task B is shown. I click delete on Task B, but when I switch back to All, Task B is still there and Task A was deleted!',
    environmentClues: 'Chrome 122, TraceCase-Demo-Tasks build v1.0.0-buggy',
    claimedExpectedBehavior: 'Deleting Task B should delete Task B, leaving Task A intact.',
  },
  targetProfile: {
    name: 'TraceCase-Demo-Tasks',
    baseUrl: 'http://localhost:3005',
    isSandbox: true,
    allowedOrigins: ['http://localhost:3005'],
    hasResetFixture: true,
    buildVersion: 'v1.0.0-buggy',
    fixtureScope: 'two_tasks_one_completed',
  },
  groundTruth: {
    actualBugPresent: true,
    bugClassification: 'INDEX_OFFSET_STATE_DESYNC',
    rootCauseSummary:
      'The UI handles delete by index relative to filtered display array instead of by unique task ID, causing offset in storage array.',
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
      {
        predicateId: 'assert_task_b_still_present',
        assertionType: 'REPORTED_FAILURE_SIGNATURE',
        target: 'DOM_ELEMENT',
        selector: '[data-task-id="task-b"]',
        expectedCondition: 'EXISTS',
        expectedValue: true,
        description: 'Bug signature: Task B was not deleted',
      },
      {
        predicateId: 'assert_task_a_wrongly_removed',
        assertionType: 'REPORTED_FAILURE_SIGNATURE',
        target: 'DOM_ELEMENT',
        selector: '[data-task-id="task-a"]',
        expectedCondition: 'NOT_EXISTS',
        expectedValue: true,
        description: 'Bug signature: Task A was erroneously deleted',
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
  datasetPartition: 'RESERVED_EVALUATION_HOLDOUT',
  expectedRoleBehaviors: {
    planner: {
      expectedVariant: 'PLAN_PROPOSED',
    },
    browserActor: {
      expectedVariant: 'PROPOSE_ACTION',
      expectedTargetNodeId: 'node_5',
      forbiddenNodeIds: ['node_3'],
    },
    reviewer: {
      expectedVariant: 'REPORT_SYNTHESIZED',
      expectedObservedVerdict: 'CONFIRMED_REPRODUCED',
      mustPreserveLockedVerdict: true,
    },
  },
  rationale:
    'Core benchmark for Problem Statement obligation TC1. Validates two-run confirmation with baseline reset.',
  reviewedBy: 'Person-2-AI-Eval-Lead',
  version: '1.0.0',
  expectedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
};
