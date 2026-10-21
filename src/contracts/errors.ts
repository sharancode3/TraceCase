import { z } from 'zod';

export const ErrorCategorySchema = z.enum([
  'UNAUTHENTICATED',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT_STALE_VERSION',
  'POLICY_VIOLATION',
  'SERVICE_NOT_CONFIGURED',
  'NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const SafeErrorEnvelopeSchema = z.object({
  success: z.literal(false).default(false),
  error: z.object({
    category: ErrorCategorySchema,
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    timestamp: z.string().datetime(),
    requestId: z.string().optional(),
  }),
});
export type SafeErrorEnvelope = z.infer<typeof SafeErrorEnvelopeSchema>;

export function createSafeError(
  category: ErrorCategory,
  code: string,
  message: string,
  details?: unknown,
  requestId?: string
): SafeErrorEnvelope {
  return {
    success: false,
    error: {
      category,
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

export const SafeSuccessEnvelopeSchema = z.object({
  success: z.literal(true).default(true),
  data: z.unknown(),
  timestamp: z.string().datetime(),
  requestId: z.string().optional(),
});
export type SafeSuccessEnvelope = z.infer<typeof SafeSuccessEnvelopeSchema>;

export function createSafeSuccessEnvelope<T>(data: T, requestId?: string): {
  success: true;
  data: T;
  timestamp: string;
  requestId?: string;
} {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId: requestId ?? `req_${Date.now().toString(36)}`,
  };
}
