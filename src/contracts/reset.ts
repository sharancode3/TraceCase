import { z } from 'zod';

export const ResetRequestSchema = z.object({
  targetId: z.string().uuid(),
  fixtureScope: z.string().min(1).max(100),
  attemptPairId: z.string().uuid(),
}).strict();
export type ResetRequest = z.infer<typeof ResetRequestSchema>;

export const ResetTransportResponseSchema = z.object({
  success: z.boolean(),
  itemsRestored: z.number().int().nonnegative().optional(),
  targetTimestamp: z.string().optional(),
  rawPayload: z.record(z.unknown()).optional(),
});
export type ResetTransportResponse = z.infer<typeof ResetTransportResponseSchema>;

export const BaselineReadbackSchema = z.object({
  targetId: z.string().uuid(),
  expectedStateHash: z.string().min(1),
  observedStateHash: z.string().min(1),
  isEquivalent: z.boolean(),
  targetBuildId: z.string().optional(),
  discrepancies: z.array(z.string()).max(20).optional(),
  checkedAt: z.string().datetime(),
});
export type BaselineReadback = z.infer<typeof BaselineReadbackSchema>;

/**
 * Authoritative verified reset receipt.
 * Requires BOTH transport success AND independent baseline readback equivalence.
 */
export const VerifiedResetReceiptSchema = z.object({
  id: z.string().uuid(),
  targetId: z.string().uuid(),
  investigationId: z.string().uuid(),
  attemptNumber: z.literal(2),
  transportSuccess: z.boolean(),
  baselineEquivalent: z.boolean(),
  isVerifiedRestored: z.boolean(),
  targetBuildId: z.string().optional(),
  readback: BaselineReadbackSchema,
  verifiedAt: z.string().datetime(),
});
export type VerifiedResetReceipt = z.infer<typeof VerifiedResetReceiptSchema>;
