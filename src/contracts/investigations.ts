import { z } from 'zod';
import {
  InvestigationLifecycleStatusSchema,
  ReproductionVerdictSchema,
  EvidenceReadinessStatusSchema,
  AttemptValiditySchema,
  MutationUncertaintySchema,
} from './status';
import { VerifiedResetReceiptSchema } from './reset';

export const AttemptSummarySchema = z.object({
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  validity: AttemptValiditySchema,
  defectDetected: z.boolean(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  actionsExecuted: z.number().int().nonnegative(),
  lastObservedStep: z.number().int().nonnegative().nullable(),
  mutationState: MutationUncertaintySchema,
  failureMessage: z.string().nullable().optional(),
  buildId: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
});
export type AttemptSummary = z.infer<typeof AttemptSummarySchema>;

export const InvestigationReviewStatusSchema = z.enum([
  'NONE',
  'CLARIFICATION_PENDING',
  'PROPOSAL_READY',
  'APPROVED',
  'REJECTED',
  'REVOKED',
  'CANCELLED',
  'BLOCKED',
]);
export type InvestigationReviewStatus = z.infer<typeof InvestigationReviewStatusSchema>;

export const InvestigationSnapshotSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
  targetId: z.string().uuid(),
  targetName: z.string(),
  targetUrl: z.string().url(),
  isSandbox: z.boolean(),
  title: z.string(),
  lifecycleStatus: InvestigationLifecycleStatusSchema,
  reproductionVerdict: ReproductionVerdictSchema,
  evidenceReadiness: EvidenceReadinessStatusSchema,
  workflowRevision: z.number().int().positive().default(1).optional(),
  reviewStatus: InvestigationReviewStatusSchema.default('NONE').optional(),
  eventWatermark: z.number().int().nonnegative().default(0).optional(),
  activeAttemptNumber: z.number().int().min(1).max(2).nullable(),
  attempt1: AttemptSummarySchema.nullable(),
  attempt2: AttemptSummarySchema.nullable(),
  planVersion: z.number().int().positive().nullable(),
  planHash: z.string().nullable(),
  isApproved: z.boolean(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().datetime().nullable(),
  rejectionReason: z.string().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
  tokenCostUsd: z.number().nonnegative(),
  resetReceipt: VerifiedResetReceiptSchema.nullable().optional(),
  assertionEvaluations: z.array(
    z.object({
      id: z.string().optional(),
      attemptNumber: z.number().int(),
      assertionId: z.string(),
      kind: z.string(),
      purpose: z.string(),
      result: z.string(),
      expectedValue: z.string().nullable().optional(),
      observedValue: z.string().nullable().optional(),
      details: z.string().nullable().optional(),
      evaluatedAt: z.string().optional(),
    })
  ).optional(),
  targetEnvironment: z.string().nullable().optional(),
  targetBuildVersion: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type InvestigationSnapshot = z.infer<typeof InvestigationSnapshotSchema>;
