import { z } from 'zod';

/**
 * ============================================================================
 * TRACECASE PERSON 2: AI ROLE CONTRACTS & BOUNDARIES (H-01 PROPOSAL)
 * ============================================================================
 * 
 * In accordance with:
 * - docs/agent-and-tool-contracts.md (TC-AGT-001)
 * - docs/system-architecture.md (TC-SAD-001)
 * - docs/verification-evidence-and-safety-specification.md (TC-VES-001)
 * 
 * CORE ARCHITECTURAL INVARIANTS ENFORCED:
 * 1. TC-INV-001: Model is an advisory reasoning engine. Proposes; code verifies.
 * 2. TC-INV-004: Models cannot mutate plan hashes, versions, or approval state.
 * 3. TC-INV-007: Lifecycle State != Reproduction Verdict != Evidence Readiness.
 * 4. TC-INV-008: Destructive actions blocked unless target.isSandbox = true.
 * 5. TC-INV-014: Assertion outcomes evaluated by deterministic TypeScript code,
 *    never by asking model opinion.
 */

// ============================================================================
// 1. CONTEXT TRUST SEPARATION & DATA PROVENANCE
// ============================================================================

/**
 * Server-authoritative context injected solely by trusted backend.
 * The model NEVER sees or mutates these fields directly.
 */
export const ServerAuthoritativeContextSchema = z.object({
  contractVersion: z.literal('1.0.0'),
  investigationId: z.string().uuid(),
  reportId: z.string().uuid(),
  targetId: z.string().uuid(),
  activeRole: z.enum(['AT-ROLE-001', 'AT-ROLE-002', 'AT-ROLE-003']),
  currentPhase: z.string(),
  planRevision: z.number().int().positive(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
  isApproved: z.boolean(),
  approvedScope: z.object({
    allowedOrigins: z.array(z.string()),
    isSandbox: z.boolean(),
    maxStepCount: z.number().int().positive().max(30),
    allowedActionTypes: z.array(z.string()),
  }),
  activeAttemptIndex: z.union([z.literal(1), z.literal(2)]).nullable(),
  workerLeaseId: z.string(),
  remainingBudgetUsd: z.number().nonnegative().max(20.0),
  isCancelled: z.boolean(),
});
export type ServerAuthoritativeContext = z.infer<typeof ServerAuthoritativeContextSchema>;

/**
 * Accessibility Tree Interactive Node Schema (AXTree Pruned Context).
 * Strictly interactive roles, capped at 150 nodes / <1,500 tokens.
 */
export const PrunedAXTreeNodeSchema = z.object({
  nodeId: z.string().regex(/^node_\d+$/),
  role: z.enum([
    'button',
    'checkbox',
    'combobox',
    'link',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'radio',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'textbox',
    'treeitem',
    'StaticText',
    'alert',
    'status',
  ]),
  name: z.string().max(100),
  value: z.string().max(100).optional(),
  description: z.string().max(150).optional(),
  disabled: z.boolean().optional(),
  focused: z.boolean().optional(),
});
export type PrunedAXTreeNode = z.infer<typeof PrunedAXTreeNodeSchema>;

// ============================================================================
// 2. SUPPORTED ASSERTION VOCABULARY (TC-INV-014)
// Replaces free-text verification strings with deterministic testable predicates.
// ============================================================================

export const PlanAssertionSchema = z.object({
  predicateId: z.string().regex(/^assert_[a-z0-9_]+$/),
  assertionType: z.enum(['CORRECT_BEHAVIOR', 'REPORTED_FAILURE_SIGNATURE']),
  target: z.enum(['DOM_ELEMENT', 'HTTP_STATUS', 'API_RESPONSE_BODY', 'URL_PATH']),
  selector: z.string().max(500).optional(),
  expectedCondition: z.enum([
    'EXISTS',
    'NOT_EXISTS',
    'TEXT_CONTAINS',
    'STATUS_CODE_EQUALS',
    'URL_MATCHES',
  ]),
  expectedValue: z.union([z.string(), z.number(), z.boolean()]),
  description: z.string().max(200).optional(),
});
export type PlanAssertion = z.infer<typeof PlanAssertionSchema>;

// ============================================================================
// 3. ROLE 1: REPORT & EXPERIMENT AGENT (AT-ROLE-001)
// Phases: INTAKE, CLARIFYING, PLANNING
// ============================================================================

export const ReportAgentInputSchema = z.object({
  contractVersion: z.literal('1.0.0'),
  investigationId: z.string().uuid(),
  targetProfile: z.object({
    name: z.string().max(100),
    baseUrl: z.string().url(),
    isSandbox: z.boolean(),
    allowedOrigins: z.array(z.string()),
    hasResetFixture: z.boolean(),
    defaultCredentialsRole: z.string().optional(),
  }),
  rawReport: z.object({
    title: z.string().min(3).max(200),
    description: z.string().min(5).max(4000),
    environmentClues: z.string().max(500).optional(),
    claimedExpectedBehavior: z.string().max(1000).optional(),
  }),
  clarificationHistory: z
    .array(
      z.object({
        questionId: z.string(),
        questionText: z.string(),
        purpose: z.string().optional(),
        selectedOption: z.string(),
        customText: z.string().max(500).optional(),
      })
    )
    .default([]),
});
export type ReportAgentInput = z.infer<typeof ReportAgentInputSchema>;

export const ClarificationQuestionProposalSchema = z.object({
  questionId: z.string().regex(/^q_[a-z0-9_]+$/),
  questionText: z.string().min(10).max(250),
  whyItMatters: z.string().max(200),
  purpose: z.string().optional(),
  options: z.array(z.string().min(2).max(100)).min(2).max(4),
  blocksExecution: z.boolean().default(true),
});
export type ClarificationQuestionProposal = z.infer<typeof ClarificationQuestionProposalSchema>;

export const ProposedExperimentPlanStepSchema = z.object({
  stepNumber: z.number().int().min(1).max(15),
  actionType: z.preprocess((val) => {
    if (typeof val === 'string') {
      const upper = val.toUpperCase();
      if (upper === 'SET_INPUT' || upper === 'TYPE' || upper === 'INPUT' || upper === 'FILL_INPUT' || upper === 'PRESS_KEY' || upper === 'KEY_PRESS') return 'FILL';
      if (upper === 'CLICK_BUTTON' || upper === 'CLICK_LINK' || upper === 'PRESS') return 'CLICK';
      if (upper === 'GOTO' || upper === 'OPEN') return 'NAVIGATE';
      if (upper === 'SELECT_OPTION') return 'SELECT';
      if (upper === 'WAIT' || upper === 'WAIT_FOR') return 'WAIT_FOR_SELECTOR';
      return upper;
    }
    return val;
  }, z.enum(['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'WAIT_FOR_SELECTOR'])),
  intentDescription: z.string().min(5).max(200),
  targetRole: z.string().optional(),
  targetAccessibleName: z.string().optional(),
  inputValue: z.string().max(500).optional(),
  isDestructive: z.boolean().default(false),
  affectedDataScope: z.string().max(100).optional(),
});
export type ProposedExperimentPlanStep = z.infer<typeof ProposedExperimentPlanStepSchema>;

export const ReportAgentOutputSchema = z.discriminatedUnion('variant', [
  z.object({
    variant: z.literal('NEEDS_CLARIFICATION'),
    extractedClaim: z.object({
      summary: z.string().max(200),
      affectedFeature: z.string().max(100),
      missingFacts: z.array(z.string()).min(1).max(5),
    }),
    questions: z.array(ClarificationQuestionProposalSchema).min(1).max(3),
  }),
  z.object({
    variant: z.literal('PLAN_PROPOSED'),
    extractedClaim: z.object({
      summary: z.string().max(200),
      reportedProblem: z.string().max(500),
      claimedExpectedBehavior: z.string().max(500),
      affectedEntities: z.array(z.string()).max(10),
    }),
    experimentPlan: z.object({
      planRevision: z.number().int().positive().default(1),
      preconditions: z.array(z.string()).min(1).max(10),
      requiredRole: z.string().default('test_user'),
      steps: z.array(ProposedExperimentPlanStepSchema).min(1).max(15),
      correctBehaviorAssertions: z.array(PlanAssertionSchema).min(1).max(5),
      reportedFailureAssertions: z.array(PlanAssertionSchema).min(1).max(5),
    }),
  }),
  z.object({
    variant: z.literal('UNSUPPORTED_CLAIM'),
    reason: z.string().max(300),
    unsupportedFeatures: z.array(z.string()),
    recommendation: z.string().max(300),
  }),
  z.object({
    variant: z.literal('SCOPE_CONFLICT'),
    conflictDetails: z.string().max(400),
    attemptedScope: z.string(),
    permittedScope: z.string(),
  }),
  z.object({
    variant: z.literal('UNABLE_TO_INTERPRET'),
    explanation: z.string().max(400),
  }),
]);
export type ReportAgentOutput = z.infer<typeof ReportAgentOutputSchema>;

// ============================================================================
// 4. ROLE 2: BROWSER INVESTIGATION AGENT (AT-ROLE-002)
// Phases: ATTEMPT_1_RUNNING, ATTEMPT_2_RUNNING (dynamic locator healing only)
// ============================================================================

export const BrowserAgentInputSchema = z.object({
  contractVersion: z.literal('1.0.0'),
  investigationId: z.string().uuid(),
  attemptIndex: z.union([z.literal(1), z.literal(2)]),
  approvedPlanHash: z.string().length(64),
  currentStep: z.object({
    stepNumber: z.number().int().positive(),
    actionType: z.preprocess((val) => {
    if (typeof val === 'string') {
      const upper = val.toUpperCase();
      if (upper === 'SET_INPUT' || upper === 'TYPE' || upper === 'INPUT' || upper === 'FILL_INPUT' || upper === 'PRESS_KEY' || upper === 'KEY_PRESS') return 'FILL';
      if (upper === 'CLICK_BUTTON' || upper === 'CLICK_LINK' || upper === 'PRESS') return 'CLICK';
      if (upper === 'GOTO' || upper === 'OPEN') return 'NAVIGATE';
      if (upper === 'SELECT_OPTION') return 'SELECT';
      if (upper === 'WAIT' || upper === 'WAIT_FOR') return 'WAIT_FOR_SELECTOR';
      return upper;
    }
    return val;
  }, z.enum(['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'WAIT_FOR_SELECTOR'])),
    intentDescription: z.string().max(200),
    targetDescription: z.string().max(200),
    approvedValue: z.string().max(500).optional(),
    isDestructive: z.boolean(),
  }),
  observation: z.object({
    observationId: z.string().uuid(),
    pageUrl: z.string().url(),
    pageTitle: z.string().max(150),
    axTree: z.array(PrunedAXTreeNodeSchema).max(150),
  }),
  priorActionHistory: z
    .array(
      z.object({
        stepNumber: z.number().int(),
        actionType: z.string(),
        executedSuccessfully: z.boolean(),
        errorSummary: z.string().optional(),
      })
    )
    .max(15),
  allowedOrigins: z.array(z.string()).optional(),
  isRevokedOrCancelled: z.boolean().optional(),
  remainingStepBudget: z.number().int().optional(),
  lastActionMutationUncertain: z.boolean().optional(),
});
export type BrowserAgentInput = z.infer<typeof BrowserAgentInputSchema>;

export const BrowserDecisionOutputSchema = z.discriminatedUnion('variant', [
  z.object({
    variant: z.literal('PROPOSE_ACTION'),
    echoedStepNumber: z.number().int().positive(),
    echoedObservationId: z.string().uuid(),
    action: z.object({
      actionType: z.preprocess((val) => {
    if (typeof val === 'string') {
      const upper = val.toUpperCase();
      if (upper === 'SET_INPUT' || upper === 'TYPE' || upper === 'INPUT' || upper === 'FILL_INPUT' || upper === 'PRESS_KEY' || upper === 'KEY_PRESS') return 'FILL';
      if (upper === 'CLICK_BUTTON' || upper === 'CLICK_LINK' || upper === 'PRESS') return 'CLICK';
      if (upper === 'GOTO' || upper === 'OPEN') return 'NAVIGATE';
      if (upper === 'SELECT_OPTION') return 'SELECT';
      if (upper === 'WAIT' || upper === 'WAIT_FOR') return 'WAIT_FOR_SELECTOR';
      return upper;
    }
    return val;
  }, z.enum(['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'WAIT_FOR_SELECTOR'])),
      targetNodeId: z.string().regex(/^node_\d+$/).optional(),
      primarySelector: z.string().max(200),
      cssFallback: z.string().max(200).optional(),
      inputValue: z.string().max(500).optional(),
    }),
    expectedPostcondition: z.string().max(200),
    rationale: z.string().max(200),
  }),
  z.object({
    variant: z.literal('REQUEST_OBSERVATION'),
    reason: z.string().max(200),
    waitForTimeoutMs: z.number().int().min(500).max(5000).default(1000),
  }),
  z.object({
    variant: z.literal('WAIT_FOR_STATE'),
    waitForSelector: z.string().max(200),
    timeoutMs: z.number().int().min(1000).max(10000).default(5000),
  }),
  z.object({
    variant: z.literal('REQUEST_HUMAN_HELP'),
    blockerType: z.enum(['CAPTCHA_DETECTED', 'OTP_REQUIRED', 'UNKNOWN_MODAL', 'SESSION_LOCKED']),
    blockerDescription: z.string().max(300),
    suggestedUserAction: z.string().max(300),
  }),
  z.object({
    variant: z.literal('PROCEDURE_READY_FOR_VERIFICATION'),
    summaryOfActionsExecuted: z.string().max(300),
    finalUrl: z.string().url(),
  }),
  z.object({
    variant: z.literal('STOP_BLOCKED'),
    errorCode: z.string().max(50),
    errorDescription: z.string().max(300),
  }),
]);
export type BrowserDecisionOutput = z.infer<typeof BrowserDecisionOutputSchema>;

// ============================================================================
// 5. ROLE 3: EVIDENCE REVIEW AGENT (AT-ROLE-003)
// Phase: REPORT_DRAFTING
// ============================================================================

export const AttemptEvaluationDataSchema = z.object({
  status: z.enum(['PASSED_ASSERTIONS', 'FAILED_ASSERTIONS', 'ERROR_HALTED']),
  failureSignatureMatched: z.boolean(),
  executionDurationMs: z.number().positive(),
  assertionsEvaluated: z.array(
    z.object({
      predicateId: z.string(),
      predicateDescription: z.string(),
      passed: z.boolean(),
      actualValue: z.string(),
      expectedValue: z.string(),
    })
  ),
  safeArtifacts: z.object({
    videoId: z.string().optional(),
    videoUrl: z.string().url().optional(),
    consoleLogId: z.string().optional(),
    consoleLogUrl: z.string().url().optional(),
    networkLogId: z.string().optional(),
    networkLogUrl: z.string().url().optional(),
  }),
  sanitizedConsoleExcerpts: z.array(z.string()).max(20),
  isValid: z.boolean().default(true),
  actualSteps: z.array(z.string()).optional(),
  captureErrors: z.array(z.string()).optional(),
  restrictedArtifactTypes: z.array(z.string()).optional(),
});
export type AttemptEvaluationData = z.infer<typeof AttemptEvaluationDataSchema>;

export const EvidenceReviewAgentInputSchema = z.object({
  contractVersion: z.literal('1.0.0'),
  investigationId: z.string().uuid(),
  reproductionVerdict: z.enum([
    'CONFIRMED_REPRODUCED',
    'NOT_REPRODUCED',
    'INCONSISTENT_OBSERVATIONS',
    'INCONCLUSIVE_EXECUTION_FAILURE',
  ]),
  rawReport: z
    .object({
      title: z.string(),
      description: z.string(),
      claimedExpectedBehavior: z.string().optional(),
    })
    .optional(),
  testedEnvironment: z.string().optional(),
  resetStatus: z
    .object({
      executed: z.boolean(),
      success: z.boolean(),
      details: z.string().optional(),
    })
    .optional(),
  knownGaps: z.array(z.string()).optional(),
  attempt1: AttemptEvaluationDataSchema,
  attempt2: AttemptEvaluationDataSchema.nullable(),
});
export type EvidenceReviewAgentInput = z.infer<typeof EvidenceReviewAgentInputSchema>;

export const EvidenceReviewOutputSchema = z.discriminatedUnion('variant', [
  z.object({
    variant: z.literal('REPORT_SYNTHESIZED'),
    executiveSummary: z.string().max(1500),
    observedReproductionVerdict: z.enum([
      'CONFIRMED_REPRODUCED',
      'NOT_REPRODUCED',
      'INCONSISTENT_OBSERVATIONS',
      'INCONCLUSIVE_EXECUTION_FAILURE',
    ]),
    attempt1Comparison: z.object({
      summary: z.string().max(1000),
      failedAssertions: z.array(z.string()).default([]),
      matchingFailureObserved: z.boolean(),
    }),
    attempt2Comparison: z
      .object({
        summary: z.string().max(1000),
        failedAssertions: z.array(z.string()).default([]),
        matchingFailureObserved: z.boolean(),
      })
      .nullable(),
    evidenceCitations: z
      .array(
        z.object({
          artifactId: z.string().optional(),
          artifactType: z.enum(['VIDEO', 'CONSOLE_LOG', 'NETWORK_LOG']),
          safeUrl: z.string().url(),
          timestampOffsetMs: z.number().int().nonnegative().optional(),
          relevanceExplanation: z.string().max(200),
        })
      )
      .default([]),
    manualReproductionSteps: z.array(z.string().max(200)).min(1).max(15),
    diagnosticHypothesis: z
      .object({
        isVerifiedFact: z.literal(false), // STRICT INVARIANT: Must always be false!
        hypothesisText: z.string().max(500),
        supportingEvidenceTokens: z.array(z.string()).max(10),
        suggestedInvestigationDirection: z.string().max(300),
      })
      .nullable(),
    limitationsAndCaveats: z.array(z.string().max(250)).default([]),
  }),
  z.object({
    variant: z.literal('EVIDENCE_GAP_DETECTED'),
    missingArtifactTypes: z.array(z.string()).min(1),
    impactOnConfirmation: z.string().max(300),
  }),
  z.object({
    variant: z.literal('INCONSISTENT_EVIDENCE_DETECTED'),
    inconsistencySummary: z.string().max(400),
    conflictingObservations: z.array(z.string()).max(5),
  }),
  z.object({
    variant: z.literal('REVIEW_UNABLE_TO_COMPLETE'),
    errorCode: z.string().max(50),
    errorDescription: z.string().max(300),
  }),
  z.object({
    variant: z.literal('EXPLANATION_UNAVAILABLE_FALLBACK'),
    reproductionVerdict: z.enum([
      'CONFIRMED_REPRODUCED',
      'NOT_REPRODUCED',
      'INCONSISTENT_OBSERVATIONS',
      'INCONCLUSIVE_EXECUTION_FAILURE',
    ]),
    fallbackReason: z.string().max(300),
    deterministicFacts: z.object({
      attempt1Status: z.string(),
      attempt1MatchedFailure: z.boolean(),
      attempt2MatchedFailure: z.boolean().nullable(),
      evaluatedAssertionsCount: z.number(),
      passedAssertionsCount: z.number(),
      failedAssertionsCount: z.number(),
      availableArtifacts: z.array(z.string()),
      missingOrRestrictedEvidence: z.array(z.string()),
    }),
  }),
]);
export type EvidenceReviewOutput = z.infer<typeof EvidenceReviewOutputSchema>;

// ============================================================================
// 6. SERVER-SIDE PROPOSAL SANITIZATION HELPER
// Strips any model-injected authoritative fields to prevent privilege escalation.
// ============================================================================

export function stripModelAuthorityFields(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...payload };
  const forbiddenAuthorityFields = [
    'isApproved',
    'approvedBy',
    'approvedAt',
    'planHash',
    'investigationId',
    'reproductionVerdict',
    'evidenceReadiness',
    'lifecycleStatus',
    'workerLeaseId',
  ];

  for (const field of forbiddenAuthorityFields) {
    if (field in sanitized) {
      delete sanitized[field];
    }
  }

  return sanitized;
}
