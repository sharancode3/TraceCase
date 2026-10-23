import { z } from 'zod';

/**
 * Legacy/preview target profile representation.
 * Kept for backward compatibility with preview fixtures.
 */
export const TargetProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  allowedOrigins: z.array(z.string().url()).min(1),
  isSandbox: z.boolean(),
  testAccountRef: z.string().max(100).nullable().optional(),
  fixtureResetEndpoint: z.string().url().nullable().optional(),
  fixtureResetAuthSecret: z.string().nullable().optional(),
  fixtureScope: z.string().nullable().optional(),
  environment: z.enum(['staging', 'development', 'demo', 'production']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TargetProfile = z.infer<typeof TargetProfileSchema>;

/**
 * Safe, user-facing and UI-safe target profile.
 * Strictly excludes any reset-auth secrets or credential values.
 */
export const SafeTargetProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  allowedOrigins: z.array(z.string().url()).min(1),
  isSandboxVerified: z.boolean(),
  environment: z.enum(['staging', 'development', 'demo', 'production']),
  hasResetCapability: z.boolean(),
  hasTestAccountConfigured: z.boolean(),
  fixtureScope: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type SafeTargetProfile = z.infer<typeof SafeTargetProfileSchema>;

/**
 * Safe model target context.
 * Strictly limited to the context needed by AI roles (Luna) without internal infrastructure details.
 */
export const SafeModelTargetContextSchema = z.object({
  targetId: z.string().uuid(),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  allowedOrigins: z.array(z.string().url()).min(1),
  isSandboxVerified: z.boolean(),
  environment: z.enum(['staging', 'development', 'demo', 'production']),
  hasResetCapability: z.boolean().optional(),
  fixtureScope: z.string().optional(),
}).strict();
export type SafeModelTargetContext = z.infer<typeof SafeModelTargetContextSchema>;

/**
 * Server-only trusted target configuration.
 * Contains internal credential references and reset authorization secrets.
 * Must NEVER be passed to client UI or AI model prompts.
 */
export const TrustedTargetConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  allowedOrigins: z.array(z.string().url()).min(1),
  isSandboxVerified: z.boolean(),
  environment: z.enum(['staging', 'development', 'demo', 'production']),
  testAccountRef: z.string().max(100).nullable().optional(),
  fixtureResetEndpoint: z.string().url().nullable().optional(),
  fixtureResetAuthSecret: z.string().nullable().optional(),
  fixtureScope: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TrustedTargetConfig = z.infer<typeof TrustedTargetConfigSchema>;

/**
 * Compatibility projection schema retained exclusively for legacy preview fixtures.
 * Omit fixtureResetAuthSecret to protect secrets in test doubles (P3-01 / TC-INV-009).
 */
export const ClientSafeTargetProfileSchema = TargetProfileSchema.omit({
  fixtureResetAuthSecret: true,
}).strict();
export type ClientSafeTargetProfile = z.infer<typeof ClientSafeTargetProfileSchema>;

/**
 * Command schema for creating a new target profile.
 * Notice: 'isSandbox' in client commands is a requested classification;
 * trusted server code validates sandbox declarations against allowlists.
 */
export const CreateTargetCommandSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  baseUrl: z.string().trim().url('Must be a valid URL'),
  allowedOrigins: z.array(z.string().trim().url()).min(1, 'At least one allowed origin is required'),
  isSandboxRequested: z.boolean().default(true),
  testAccountRef: z.string().trim().max(100).optional(),
  fixtureResetEndpoint: z.string().trim().url().optional(),
  fixtureScope: z.string().trim().max(100).optional(),
  environment: z.enum(['staging', 'development', 'demo', 'production']).default('staging'),
}).strict(); // Reject unexpected fields to protect server authority
export type CreateTargetCommand = z.infer<typeof CreateTargetCommandSchema>;

/**
 * Explicit allowlist projection for safe UI/client target representations.
 * Never spreads internal objects; guarantees secrets are omitted even if unexpected fields are present.
 */
export function projectSafeTargetProfile(
  target: Record<string, unknown>
): SafeTargetProfile {
  return SafeTargetProfileSchema.parse({
    id: target.id,
    name: target.name,
    baseUrl: target.baseUrl,
    allowedOrigins: Array.isArray(target.allowedOrigins) ? [...target.allowedOrigins] : [],
    isSandboxVerified: Boolean(target.isSandboxVerified ?? target.isSandbox ?? false),
    environment: target.environment,
    fixtureScope: (target.fixtureScope as string) ?? (typeof target.baseUrl === 'string' && target.baseUrl.includes('/workbench') ? 'workbench_work_items' : undefined),
    hasResetCapability: Boolean(target.fixtureResetEndpoint),
    hasTestAccountConfigured: Boolean(target.testAccountRef),
    createdAt: target.createdAt instanceof Date ? target.createdAt.toISOString() : (target.createdAt ?? new Date().toISOString()),
    updatedAt: target.updatedAt instanceof Date ? target.updatedAt.toISOString() : (target.updatedAt ?? new Date().toISOString()),
  });
}

/**
 * Explicit allowlist projection for AI model context.
 * Never includes reset secrets, account credentials, or database connection info.
 */
export function projectSafeModelTargetContext(
  target: Record<string, unknown>
): SafeModelTargetContext {
  return SafeModelTargetContextSchema.parse({
    targetId: target.id ?? target.targetId,
    name: target.name,
    baseUrl: target.baseUrl,
    allowedOrigins: Array.isArray(target.allowedOrigins) ? [...target.allowedOrigins] : [],
    isSandboxVerified: Boolean(target.isSandboxVerified ?? target.isSandbox ?? false),
    environment: target.environment,
    fixtureScope: (target.fixtureScope as string) ?? (typeof target.baseUrl === 'string' && target.baseUrl.includes('/workbench') ? 'workbench_work_items' : undefined),
    hasResetCapability: Boolean(
      target.fixtureResetEndpoint ||
      target.hasResetCapability ||
      (typeof target.fixtureResetAuthSecretRef === 'string' && target.fixtureResetAuthSecretRef.length > 0)
    ),
  });
}
