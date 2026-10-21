import { z } from 'zod';
import { PlanAssertionSchema } from '../src/server/ai/contracts';

/**
 * ============================================================================
 * TRACECASE PERSON 2: EVALUATION CASE SCHEMA
 * ============================================================================
 * 
 * Provides an independent, source-grounded specification for benchmark cases
 * (TC1-TC4 and negative robustness cases) completely decoupled from AI model outputs.
 */

export const EvaluationCaseCategorySchema = z.enum([
  'OFFICIAL_PS_BENCHMARK', // TC1, TC2, TC3, TC4
  'NEGATIVE_ROBUSTNESS',   // Prompt injection, ambiguous claim, untestable request
  'SECURITY_ISOLATION',    // Secret scrubbing, sandbox guardrail
]);
export type EvaluationCaseCategory = z.infer<typeof EvaluationCaseCategorySchema>;

export const EvaluationCaseSchema = z.object({
  caseId: z.string().regex(/^TC-[A-Z0-9_-]+$/),
  title: z.string().min(5).max(150),
  category: EvaluationCaseCategorySchema,
  summary: z.string().max(500),

  // Input Data provided to the system
  rawReport: z.object({
    title: z.string().min(3),
    description: z.string().min(5),
    environmentClues: z.string().optional(),
    claimedExpectedBehavior: z.string().optional(),
  }),

  // Target application configuration
  targetProfile: z.object({
    name: z.string(),
    baseUrl: z.string().url(),
    isSandbox: z.boolean(),
    allowedOrigins: z.array(z.string()),
    hasResetFixture: z.boolean(),
    buildVersion: z.string(),
    fixtureScope: z.string(),
  }),

  // Independent Ground Truth (What is factually true about the target app)
  groundTruth: z.object({
    actualBugPresent: z.boolean(),
    bugClassification: z.string(),
    rootCauseSummary: z.string(),
    expectedCorrectBehavior: z.string(),
    reportedFailureSignature: z.string(),
    deterministicPredicates: z.array(PlanAssertionSchema),
  }),

  // Expected System-Level Output & Decoupled State (TC-INV-007)
  expectedClassification: z.object({
    expectedLifecycleState: z.enum([
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'AWAITING_APPROVAL',
      'PLANNING',
    ]),
    expectedReproductionVerdict: z.enum([
      'CONFIRMED_REPRODUCED',
      'NOT_REPRODUCED',
      'INCONCLUSIVE',
      'INCONSISTENT_OBSERVATIONS',
      'PENDING',
    ]),
    expectedEvidenceReadiness: z.enum([
      'PUBLIC_SAFE_READY',
      'PENDING_GENERATION',
      'QUARANTINED_LEAK_DETECTED',
      'STORAGE_SYNC_FAILED',
    ]),
    requiresClarificationFirst: z.boolean().default(false),
  }),

  // Data Privacy and Secret Redaction Requirements (TC-INV-009, TC4)
  redactionObligations: z.object({
    injectedSyntheticSecrets: z.array(z.string()).default([]),
    forbiddenInSafeOutputs: z.array(z.string()).default([]),
  }),

  // Evaluation dataset partitioning: prompt development vs reserved benchmark
  datasetPartition: z.enum(['PROMPT_DEV_TRAINING', 'RESERVED_EVALUATION_HOLDOUT']),

  // Explicit per-role behavioral expectations (replaces substring-based matching)
  expectedRoleBehaviors: z.object({
    planner: z.object({
      expectedVariant: z.enum([
        'PLAN_PROPOSED',
        'NEEDS_CLARIFICATION',
        'UNSUPPORTED_CLAIM',
        'UNABLE_TO_INTERPRET',
        'SCOPE_CONFLICT',
      ]),
      expectedMissingFacts: z.array(z.string()).optional(),
    }).optional(),
    browserActor: z.object({
      expectedVariant: z.enum(['PROPOSE_ACTION', 'REQUEST_HUMAN_ASSISTANCE', 'STOP_INVESTIGATION']).optional(),
      expectedTargetNodeId: z.string().optional(),
      forbiddenNodeIds: z.array(z.string()).optional(),
    }).optional(),
    reviewer: z.object({
      expectedVariant: z.enum([
        'REPORT_SYNTHESIZED',
        'PRELIMINARY_FINDINGS_ONLY',
        'EXPLANATION_UNAVAILABLE_FALLBACK',
      ]).optional(),
      expectedObservedVerdict: z.enum([
        'CONFIRMED_REPRODUCED',
        'NOT_REPRODUCED',
        'INCONCLUSIVE',
        'INCONSISTENT_OBSERVATIONS',
        'PENDING',
      ]).optional(),
      mustPreserveLockedVerdict: z.boolean().default(true),
    }).optional(),
  }).optional(),

  // Audit and provenance
  rationale: z.string().max(1000),
  reviewedBy: z.string().default('Person-2-AI-Eval-Lead'),
  version: z.string().default('1.0.0'),
  expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});
export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>;

// ============================================================================
// AUTHORITATIVE P1 / P3 EXECUTION RECEIPTS SCHEMA (INTEGRATED_DEPLOYED)
// ============================================================================

export const IsoUtcTimestampSchema = z
  .string()
  .min(1)
  .refine(
    (val) => {
      if (typeof val !== 'string' || val.trim().length === 0) return false;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(val)) {
        return false;
      }
      const parsed = Date.parse(val);
      return !isNaN(parsed);
    },
    { message: 'is not a valid date or ISO-8601 UTC timestamp' }
  );

export const AttemptReceiptSchema = z.object({
  attemptId: z.string().min(1).optional(),
  attemptIndex: z.union([z.literal(1), z.literal(2)]),
  status: z.enum([
    'PASSED_ASSERTIONS',
    'FAILED_ASSERTIONS',
    'CRASHED',
    'TIMED_OUT',
    'STOPPED_BLOCKED',
  ]),
  failureSignatureMatched: z.boolean(),
  isValid: z.boolean(),
  executionDurationMs: z.number().int().min(1),
  readbackBaselineVerified: z.boolean(),
  startedAtUtc: IsoUtcTimestampSchema.optional(),
  completedAtUtc: IsoUtcTimestampSchema.optional(),
  assertionsEvaluated: z
    .array(
      z.object({
        predicateId: z.string(),
        predicateDescription: z.string(),
        passed: z.boolean(),
        actualValue: z.union([z.string(), z.number(), z.boolean()]),
        expectedValue: z.union([z.string(), z.number(), z.boolean()]),
      })
    )
    .min(1),
  artifactManifest: z.object({
    videoArtifactId: z.string().optional(),
    videoVerifiedUrl: z.string().url().optional(),
    consoleLogArtifactId: z.string().optional(),
    consoleLogVerifiedUrl: z.string().url().optional(),
    networkLogArtifactId: z.string().optional(),
    networkLogVerifiedUrl: z.string().url().optional(),
    restrictedArtifactTypes: z.array(z.string()).default([]),
    unverifiedOrMissing: z.array(z.string()).default([]),
  }),
  sanitizedConsoleExcerpts: z.array(z.string()).default([]),
});
export type AttemptReceipt = z.infer<typeof AttemptReceiptSchema>;

export const ResetReceiptSchema = z.object({
  receiptId: z.string().min(1),
  httpStatus: z.number().int(),
  baselineRestored: z.boolean(),
  fixtureScope: z.string().min(1),
  timestampUtc: IsoUtcTimestampSchema,
  attemptPair: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
});
export type ResetReceipt = z.infer<typeof ResetReceiptSchema>;

export const ExecutionReceiptSchema = z.object({
  investigationId: z.string().uuid(),
  workerId: z.string().min(1),
  leaseId: z.string().min(1),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetBuildVersion: z.string().min(1),
  fixtureScope: z.string().min(1),
  approvedPlanId: z.string().min(1).optional(),
  approvedPlanPredicateIds: z.array(z.string()).optional(),
  attempt1: AttemptReceiptSchema,
  attempt2: AttemptReceiptSchema.optional(),
  resetReceipt: ResetReceiptSchema.optional(),
  authoritativeReproductionVerdict: z.enum([
    'CONFIRMED_REPRODUCED',
    'NOT_REPRODUCED',
    'INCONSISTENT_OBSERVATIONS',
    'INCONCLUSIVE',
    'PENDING',
  ]),
  authoritativeLifecycleState: z.enum([
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'PLANNING',
    'AWAITING_APPROVAL',
  ]),
});
export type ExecutionReceipt = z.infer<typeof ExecutionReceiptSchema>;

