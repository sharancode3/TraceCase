import { z } from 'zod';
import {
  InvestigationLifecycleStatusSchema,
  ReproductionVerdictSchema,
  ActionTierSchema,
  MutationUncertaintySchema,
} from './status';
import { AssertionEvaluationResultSchema, SupportedToolKindSchema } from './planning';
import { ArtifactKindSchema, StorageTierSchema } from './evidence';

export const ProgressEventTypeSchema = z.enum([
  'STATUS_CHANGED',
  'CLARIFICATION_REQUESTED',
  'CLARIFICATION_ANSWERED',
  'PLAN_GENERATED',
  'PLAN_APPROVED',
  'PLAN_REJECTED',
  'APPROVAL_REVOKED',
  'PLANNING_BLOCKED',
  'EXECUTION_ADMITTED',
  'INVESTIGATION_CANCELLED',
  'ATTEMPT_STARTED',
  'STEP_STARTED',
  'STEP_COMPLETED',
  'MUTATION_DETECTED',
  'RESET_STARTED',
  'RESET_COMPLETED',
  'ASSERTION_EVALUATED',
  'ARTIFACT_STORED',
  'INVESTIGATION_COMPLETED',
  'INVESTIGATION_HALTED',
  'DIAGNOSTIC_STARTED',
  'DIAGNOSTIC_COMPLETED',
]);
export type ProgressEventType = z.infer<typeof ProgressEventTypeSchema>;

/* -------------------------------------------------------------------------- */
/* Discriminated Event Payload Schemas for Live Execution                      */
/* -------------------------------------------------------------------------- */

export const StatusChangedPayloadSchema = z.object({
  previousStatus: InvestigationLifecycleStatusSchema,
  newStatus: InvestigationLifecycleStatusSchema,
  reason: z.string().max(500).optional(),
}).strict();

export const ClarificationRequestedPayloadSchema = z.object({
  questionCount: z.number().int().positive(),
  preliminaryUnderstanding: z.string().max(1000).optional(),
}).strict();

export const ClarificationAnsweredPayloadSchema = z.object({
  answeredCount: z.number().int().positive(),
}).strict();

export const PlanRejectedPayloadSchema = z.object({
  planVersion: z.number().int().positive(),
  rejectionReason: z.string().max(1000),
}).strict();

export const ApprovalRevokedPayloadSchema = z.object({
  planVersion: z.number().int().positive(),
  revocationReason: z.string().max(1000),
}).strict();

export const PlanningBlockedPayloadSchema = z.object({
  reason: z.string().max(1000),
  missingPrerequisites: z.array(z.string()).optional(),
}).strict();

export const ExecutionAdmittedPayloadSchema = z.object({
  executionId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

export const InvestigationCancelledPayloadSchema = z.object({
  cancellationReason: z.string().max(1000),
}).strict();

export const DiagnosticStartedPayloadSchema = z.object({
  diagnosticId: z.string().uuid(),
  workerInstanceId: z.string().min(1),
}).strict();

export const DiagnosticCompletedPayloadSchema = z.object({
  diagnosticId: z.string().uuid(),
  durationMs: z.number().int().nonnegative(),
  success: z.literal(true),
}).strict();

export const PlanGeneratedPayloadSchema = z.object({
  planId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  stepCount: z.number().int().positive(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

export const PlanApprovedPayloadSchema = z.object({
  planVersion: z.number().int().positive(),
  approvedBy: z.string(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
  operatorNotes: z.string().nullable().optional(),
}).strict();

export const AttemptStartedPayloadSchema = z.object({
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  totalAttempts: z.literal(2),
  startedAt: z.string().datetime(),
}).strict();

export const StepStartedPayloadSchema = z.object({
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  stepIndex: z.number().int().nonnegative(),
  semanticAction: z.string(),
  toolKind: SupportedToolKindSchema,
  tier: ActionTierSchema,
}).strict();

export const StepCompletedPayloadSchema = z.object({
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  stepIndex: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(['SUCCESS', 'FAILED', 'TIMEOUT']),
  error: z.string().optional(),
}).strict();

export const MutationDetectedPayloadSchema = z.object({
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  stepIndex: z.number().int().nonnegative(),
  tier: ActionTierSchema,
  uncertainty: MutationUncertaintySchema,
}).strict();

export const ResetStartedPayloadSchema = z.object({
  targetId: z.string().uuid(),
  attemptNumber: z.literal(2),
}).strict();

export const ResetCompletedPayloadSchema = z.object({
  targetId: z.string().uuid(),
  success: z.boolean(),
  itemsRestored: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative(),
}).strict();

export const AssertionEvaluatedPayloadSchema = z.object({
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  assertionId: z.string().uuid(),
  result: AssertionEvaluationResultSchema,
  details: z.string().max(1000).optional(),
}).strict();

export const ArtifactStoredPayloadSchema = z.object({
  artifactId: z.string().uuid(),
  kind: ArtifactKindSchema,
  storageTier: StorageTierSchema,
  sizeBytes: z.number().int().nonnegative(),
  redactionApplied: z.boolean(),
}).strict();

export const InvestigationCompletedPayloadSchema = z.object({
  verdict: ReproductionVerdictSchema,
  attemptsCompleted: z.number().int().min(0).max(2),
  durationMs: z.number().int().nonnegative(),
  summary: z.string().max(1000).optional(),
}).strict();

export const InvestigationHaltedPayloadSchema = z.object({
  reason: z.string().max(500),
  category: z.string().max(100),
  recoverable: z.boolean(),
}).strict();

/**
 * Strongly-typed live progress event (Discriminated Union).
 * Prevents arbitrary unvalidated payloads from corrupting client state.
 */
export const LiveProgressEventSchema = z.discriminatedUnion('eventType', [
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('STATUS_CHANGED'), payload: StatusChangedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('CLARIFICATION_REQUESTED'), payload: ClarificationRequestedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('CLARIFICATION_ANSWERED'), payload: ClarificationAnsweredPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('PLAN_GENERATED'), payload: PlanGeneratedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('PLAN_APPROVED'), payload: PlanApprovedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('PLAN_REJECTED'), payload: PlanRejectedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('APPROVAL_REVOKED'), payload: ApprovalRevokedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('PLANNING_BLOCKED'), payload: PlanningBlockedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('EXECUTION_ADMITTED'), payload: ExecutionAdmittedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('INVESTIGATION_CANCELLED'), payload: InvestigationCancelledPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('ATTEMPT_STARTED'), payload: AttemptStartedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('STEP_STARTED'), payload: StepStartedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('STEP_COMPLETED'), payload: StepCompletedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('MUTATION_DETECTED'), payload: MutationDetectedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('RESET_STARTED'), payload: ResetStartedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('RESET_COMPLETED'), payload: ResetCompletedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('ASSERTION_EVALUATED'), payload: AssertionEvaluatedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('ARTIFACT_STORED'), payload: ArtifactStoredPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('INVESTIGATION_COMPLETED'), payload: InvestigationCompletedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('INVESTIGATION_HALTED'), payload: InvestigationHaltedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('DIAGNOSTIC_STARTED'), payload: DiagnosticStartedPayloadSchema }),
  z.object({ eventId: z.string().uuid(), schemaVersion: z.literal(1), investigationId: z.string().uuid(), sequenceIndex: z.number().int().nonnegative(), timestamp: z.string().datetime(), eventType: z.literal('DIAGNOSTIC_COMPLETED'), payload: DiagnosticCompletedPayloadSchema }),
]);
export type LiveProgressEvent = z.infer<typeof LiveProgressEventSchema>;

/**
 * Legacy progress event schema with generic payload.
 * Preserved for existing preview event reducer.
 */
export const InvestigationProgressEventSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  investigationId: z.string().uuid(),
  sequenceIndex: z.number().int().nonnegative(),
  eventType: ProgressEventTypeSchema,
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
});
export type InvestigationProgressEvent = z.infer<typeof InvestigationProgressEventSchema>;

/**
 * Event stream watermark for reliable snapshot reconnection and gap detection.
 */
export const EventStreamWatermarkSchema = z.object({
  investigationId: z.string().uuid(),
  lastDeliveredSequenceIndex: z.number().int().nonnegative(),
  snapshotTimestamp: z.string().datetime(),
  expectedNextSequenceIndex: z.number().int().nonnegative(),
});
export type EventStreamWatermark = z.infer<typeof EventStreamWatermarkSchema>;
