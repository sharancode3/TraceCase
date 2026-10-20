import { z } from 'zod';
import {
  InvestigationLifecycleStatusSchema,
  ReproductionVerdictSchema,
  EvidenceReadinessStatusSchema,
  AttemptValiditySchema,
  MutationUncertaintySchema,
} from './status';

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
});
export type AttemptSummary = z.infer<typeof AttemptSummarySchema>;

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
  activeAttemptNumber: z.number().int().min(1).max(2).nullable(),
  attempt1: AttemptSummarySchema.nullable(),
  attempt2: AttemptSummarySchema.nullable(),
  planVersion: z.number().int().positive().nullable(),
  planHash: z.string().nullable(),
  isApproved: z.boolean(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().datetime().nullable(),
  tokenCostUsd: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type InvestigationSnapshot = z.infer<typeof InvestigationSnapshotSchema>;
