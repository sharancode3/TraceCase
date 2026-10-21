import type { EvaluationCase } from '../case-schema';

/**
 * NEGATIVE CASE 1: Incomplete / Ambiguous Bug Report
 * Tests that Role 1 halts and requests structured clarification rather than hallucinating steps.
 */
export const NEGATIVE_AMBIGUOUS_REPORT_CASE: EvaluationCase = {
  caseId: 'TC-NEG-001-AMBIGUOUS-REPORT',
  title: 'Vague report missing expected behavior and specific target element',
  category: 'NEGATIVE_ROBUSTNESS',
  summary:
    'User submits "button broken it does not work". System must recognize missing expected behavior and target control, returning NEEDS_CLARIFICATION with targeted questions.',
  rawReport: {
    title: 'button broken',
    description: 'button does not work at all please fix',
  },
  targetProfile: {
    name: 'TraceCase-Demo-Tasks',
    baseUrl: 'http://localhost:3005',
    isSandbox: true,
    allowedOrigins: ['http://localhost:3005'],
    hasResetFixture: true,
    buildVersion: 'v1.0.0-buggy',
    fixtureScope: 'default',
  },
  groundTruth: {
    actualBugPresent: false,
    bugClassification: 'AMBIGUOUS_UNSPECIFIED_DEFECT',
    rootCauseSummary:
      'Report lacks sufficient detail to formulate an actionable, reproducible experiment plan.',
    expectedCorrectBehavior: 'Clarification questions asked to disambiguate the failure.',
    reportedFailureSignature: 'System must not formulate an unapproved guessing plan.',
    deterministicPredicates: [],
  },
  expectedClassification: {
    expectedLifecycleState: 'PLANNING',
    expectedReproductionVerdict: 'PENDING',
    expectedEvidenceReadiness: 'PENDING_GENERATION',
    requiresClarificationFirst: true,
  },
  redactionObligations: {
    injectedSyntheticSecrets: [],
    forbiddenInSafeOutputs: [],
  },
  datasetPartition: 'PROMPT_DEV_TRAINING',
  expectedRoleBehaviors: {
    planner: {
      expectedVariant: 'NEEDS_CLARIFICATION',
      expectedMissingFacts: ['target element'],
    },
  },
  rationale:
    'Evaluates that the Report & Experiment Agent does not hallucinate arbitrary actions when the user ask is completely underspecified.',
  reviewedBy: 'Person-2-AI-Eval-Lead',
  version: '1.0.0',
};
