import { z } from 'zod';
import {
  AttemptValiditySchema,
  ReproductionVerdictSchema,
  MutationUncertaintySchema,
  ActionTierSchema,
} from './status';
import { AssertionEvaluationResultSchema, PlanStepSchema } from './planning';
import { CaptureCoverageReceiptSchema } from './evidence';

/**
 * Sanitized browser observation presented to AI Role 2.
 * Strictly free of injected credentials or raw secrets.
 */
export const SanitizedBrowserObservationSchema = z.object({
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  stepIndex: z.number().int().nonnegative(),
  currentUrl: z.string().url(),
  pageTitle: z.string().max(200),
  visibleDomElements: z.array(
    z.object({
      elementRef: z.string().min(1),
      tagName: z.string().min(1),
      textSnippet: z.string().max(300).optional(),
      ariaRole: z.string().optional(),
      isInteractive: z.boolean(),
    })
  ).max(100),
  recentConsoleEntries: z.array(
    z.object({
      level: z.enum(['log', 'warn', 'error', 'info']),
      text: z.string().max(500),
      timestamp: z.string().datetime(),
    })
  ).max(20),
  recentNetworkFailures: z.array(
    z.object({
      url: z.string().url(),
      method: z.string(),
      status: z.number().int(),
      timestamp: z.string().datetime(),
    })
  ).max(10),
  freshnessTimestamp: z.string().datetime(),
});
export type SanitizedBrowserObservation = z.infer<typeof SanitizedBrowserObservationSchema>;

/**
 * Action execution receipt recorded by trusted Playwright runner.
 */
export const ActionReceiptSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  action: PlanStepSchema,
  tier: ActionTierSchema,
  status: z.enum(['SUCCESS', 'FAILED', 'TIMED_OUT']),
  durationMs: z.number().int().nonnegative(),
  uncertainty: MutationUncertaintySchema.default('NONE'),
  errorDetails: z.string().max(500).optional(),
  dispatchedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});
export type ActionReceipt = z.infer<typeof ActionReceiptSchema>;

/**
 * Complete attempt execution receipt returned by the browser execution worker.
 * Contains execution facts and capture references, NOT final verdict assessment.
 */
export const AttemptExecutionReceiptSchema = z.object({
  investigationId: z.string().uuid(),
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  actionsExecuted: z.array(ActionReceiptSchema),
  captureCoverage: CaptureCoverageReceiptSchema,
  totalDurationMs: z.number().int().nonnegative(),
  completedCleanly: z.boolean(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  assertionObservations: z.any().optional(),
});
export type AttemptExecutionReceipt = z.infer<typeof AttemptExecutionReceiptSchema>;

/**
 * Independent classification of whether an attempt constitutes a valid scientific experiment.
 */
export const AttemptValidityAssessmentSchema = z.object({
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  validity: AttemptValiditySchema,
  invalidityReason: z.string().max(500).optional(),
  preconditionsMet: z.boolean(),
  procedureCompleted: z.boolean(),
  assessedAt: z.string().datetime(),
});
export type AttemptValidityAssessment = z.infer<typeof AttemptValidityAssessmentSchema>;

/**
 * Result of evaluating a single typed verification assertion.
 */
export const VerificationAssertionResultSchema = z.object({
  assertionId: z.string().uuid(),
  result: AssertionEvaluationResultSchema,
  observedValue: z.string().max(2000).optional(),
  expectedValue: z.string().max(2000).optional(),
  details: z.string().max(500).optional(),
  evaluatedAt: z.string().datetime(),
});
export type VerificationAssertionResult = z.infer<typeof VerificationAssertionResultSchema>;

/**
 * Authoritative reproduction finding calculated by trusted code across valid attempts.
 */
export const ReproductionAssessmentSchema = z.object({
  investigationId: z.string().uuid(),
  verdict: ReproductionVerdictSchema,
  validAttemptCount: z.number().int().min(0).max(2),
  matchingAttemptCount: z.number().int().min(0).max(2),
  oracleResultsAttempt1: z.array(VerificationAssertionResultSchema).optional(),
  oracleResultsAttempt2: z.array(VerificationAssertionResultSchema).optional(),
  summary: z.string().max(1000),
  assessedAt: z.string().datetime(),
});
export type ReproductionAssessment = z.infer<typeof ReproductionAssessmentSchema>;
