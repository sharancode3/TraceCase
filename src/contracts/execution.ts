import { z } from 'zod';

export const ExecutionRequestStatusSchema = z.enum([
  'PENDING_DISPATCH',
  'ADMITTED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
]);
export type ExecutionRequestStatus = z.infer<typeof ExecutionRequestStatusSchema>;

export const ExecutionRequestSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  ownerId: z.string().uuid(),
  targetId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
  approvalId: z.string().uuid(),
  transportJobId: z.string().nullable(),
  status: ExecutionRequestStatusSchema,
  fencingEpoch: z.number().int().nonnegative(),
  workerInstanceId: z.string().nullable(),
  admittedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
  failureReason: z.string().nullable(),
});
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export const GlobalExecutionLeaseStatusSchema = z.enum([
  'FREE',
  'ACQUIRED',
  'QUARANTINED',
]);
export type GlobalExecutionLeaseStatus = z.infer<typeof GlobalExecutionLeaseStatusSchema>;

export const GlobalExecutionLeaseSchema = z.object({
  slotId: z.literal('GLOBAL_SLOT_SINGLETON'),
  executionId: z.string().uuid().nullable(),
  investigationId: z.string().uuid().nullable(),
  workerInstanceId: z.string().nullable(),
  ownershipEpoch: z.number().int().positive(),
  heartbeatAt: z.string().datetime(),
  leaseExpiresAt: z.string().datetime(),
  status: GlobalExecutionLeaseStatusSchema,
});
export type GlobalExecutionLease = z.infer<typeof GlobalExecutionLeaseSchema>;

export const DiagnosticJobPayloadSchema = z.object({
  diagnosticId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  requestedBy: z.string().optional(),
}).strict();
export type DiagnosticJobPayload = z.infer<typeof DiagnosticJobPayloadSchema>;

export const DiagnosticJobResultSchema = z.object({
  diagnosticId: z.string().uuid(),
  workerInstanceId: z.string().min(1),
  ownershipEpoch: z.number().int().positive(),
  durationMs: z.number().int().nonnegative(),
  success: z.boolean(),
  databaseTime: z.string().datetime().optional(),
});
export type DiagnosticJobResult = z.infer<typeof DiagnosticJobResultSchema>;
