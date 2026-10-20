import { z } from 'zod';

export const ProgressEventTypeSchema = z.enum([
  'STATUS_CHANGED',
  'PLAN_GENERATED',
  'PLAN_APPROVED',
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
]);
export type ProgressEventType = z.infer<typeof ProgressEventTypeSchema>;

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
