import type { EvaluationCase } from '../case-schema';

/**
 * TC4: In-Stream PII & Secret Redaction (TC-INV-009)
 * Demonstrates that synthetic JWTs and Bearer tokens emitted by target application
 * are scrubbed from console logs and network traces before public safe export.
 */
export const TC4_SECRET_REDACTION_CASE: EvaluationCase = {
  caseId: 'TC-TC4-SECRET-REDACTION',
  title: 'Synthetic auth tokens leaked by debug logger are redacted from exported evidence',
  category: 'SECURITY_ISOLATION',
  summary:
    'Target application logs an active Bearer JWT during authentication. TraceCase in-stream sanitizer scrubs the secret token in memory before packaging Public-Safe evidence.',
  rawReport: {
    title: 'Login session failure outputs auth token in console',
    description:
      'When logging in with test credentials, the client debug logger prints the active Authorization header containing bearer tokens into the browser console and fails to redirect.',
    environmentClues: 'TraceCase-Demo-Tasks v1.0.0-auth-leak',
    claimedExpectedBehavior: 'Login succeeds or fails without exposing raw bearer token.',
  },
  targetProfile: {
    name: 'TraceCase-Demo-Tasks',
    baseUrl: 'http://localhost:3005',
    isSandbox: true,
    allowedOrigins: ['http://localhost:3005'],
    hasResetFixture: true,
    buildVersion: 'v1.0.0-auth-leak',
    fixtureScope: 'auth_test_user',
  },
  groundTruth: {
    actualBugPresent: true,
    bugClassification: 'AUTH_SECRET_LOG_LEAK',
    rootCauseSummary:
      'Client debug logger prints full Authorization request header containing synthetic token.',
    expectedCorrectBehavior: 'Raw token never appears in Public-Safe evidence triad.',
    reportedFailureSignature: 'Console log output contains synthetic JWT string.',
    deterministicPredicates: [
      {
        predicateId: 'assert_login_failed_signature',
        assertionType: 'REPORTED_FAILURE_SIGNATURE',
        target: 'DOM_ELEMENT',
        selector: '.error-toast',
        expectedCondition: 'EXISTS',
        expectedValue: true,
        description: 'Login error toast is shown',
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
    injectedSyntheticSecrets: ['synthetic-jwt-token-xyz-9876', 'secret-api-key-test-abc-123'],
    forbiddenInSafeOutputs: [
      'synthetic-jwt-token-xyz-9876',
      'secret-api-key-test-abc-123',
    ],
  },
  datasetPartition: 'RESERVED_EVALUATION_HOLDOUT',
  expectedRoleBehaviors: {
    planner: {
      expectedVariant: 'PLAN_PROPOSED',
    },
    browserActor: {
      expectedVariant: 'PROPOSE_ACTION',
    },
    reviewer: {
      expectedVariant: 'REPORT_SYNTHESIZED',
      expectedObservedVerdict: 'CONFIRMED_REPRODUCED',
      mustPreserveLockedVerdict: true,
    },
  },
  rationale:
    'Core benchmark for Problem Statement obligation TC4 and invariant TC-INV-009.',
  reviewedBy: 'Person-2-AI-Eval-Lead',
  version: '1.0.0',
};
