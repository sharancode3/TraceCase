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
  isSandboxRequested: z.boolean().optional(),
  environment: z.enum(['staging', 'development', 'demo', 'production']),
  hasResetCapability: z.boolean(),
  hasTestAccountConfigured: z.boolean(),
  fixtureScope: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type SafeTargetProfile = z.infer<typeof SafeTargetProfileSchema>;

/**
 * Result of parsing and validating a target application URL.
 */
export interface NormalizedTargetUrlResult {
  isValid: boolean;
  normalizedOrigin: string | null;
  normalizedBaseUrl: string | null;
  error?: string;
}

/**
 * Shared utility for parsing and normalizing a target base URL.
 * Enforces protocol safety (http/https only), credentials stripping,
 * SSRF protection against cloud metadata IPs, and uniform origin derivation.
 */
export function parseAndNormalizeTargetUrl(rawUrl: string): NormalizedTargetUrlResult {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { isValid: false, normalizedOrigin: null, normalizedBaseUrl: null, error: 'URL cannot be empty' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        isValid: false,
        normalizedOrigin: null,
        normalizedBaseUrl: null,
        error: `Protocol '${parsed.protocol}' is not supported. Target URLs must use http:// or https://.`,
      };
    }
    if (parsed.username || parsed.password) {
      return {
        isValid: false,
        normalizedOrigin: null,
        normalizedBaseUrl: null,
        error: 'Target URL must not contain embedded user credentials or passwords.',
      };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host === '169.254.169.253' ||
      host === '100.100.100.200'
    ) {
      return {
        isValid: false,
        normalizedOrigin: null,
        normalizedBaseUrl: null,
        error: 'Cloud provider metadata IP addresses are strictly prohibited (SSRF prevention).',
      };
    }
    const origin = parsed.origin.toLowerCase();
    // Normalize pathname without trailing slash (unless root /)
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    const normalizedBaseUrl = `${origin}${pathname}`;
    return {
      isValid: true,
      normalizedOrigin: origin,
      normalizedBaseUrl,
    };
  } catch {
    return {
      isValid: false,
      normalizedOrigin: null,
      normalizedBaseUrl: null,
      error: 'Please enter a valid HTTP or HTTPS URL (e.g. http://localhost:3005 or https://staging.example.com).',
    };
  }
}

/**
 * Validates that an internal returnTo or redirect path is strictly relative and safe.
 * Rejects protocol-relative URLs (//), full URLs with schemes, and backslashes to prevent open redirects.
 */
export function sanitizeInternalReturnPath(
  rawPath: string | null | undefined,
  fallback: string = '/investigations/new'
): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return fallback;
  }
  const trimmed = rawPath.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\') &&
    !trimmed.includes(':')
  ) {
    return trimmed;
  }
  return fallback;
}

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
  allowedOrigins: z.array(z.string().trim().url()).optional().default([]),
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
    isSandboxVerified: Boolean(target.isSandboxVerified || isTargetTrustedSandbox(target as any)),
    isSandboxRequested: Boolean(target.isSandbox ?? target.isSandboxRequested ?? isTargetTrustedSandbox(target as any)),
    environment: target.environment,
    fixtureScope: (target.fixtureScope as string) ?? (typeof target.baseUrl === 'string' && target.baseUrl.includes('/workbench') ? 'workbench_work_items' : undefined),
    hasResetCapability: Boolean(target.fixtureResetEndpoint || target.hasResetCapability || isTargetTrustedSandbox(target as any)),
    hasTestAccountConfigured: Boolean(target.testAccountRef || target.hasTestAccountConfigured),
    createdAt: target.createdAt instanceof Date ? target.createdAt.toISOString() : (target.createdAt ?? new Date().toISOString()),
    updatedAt: target.updatedAt instanceof Date ? target.updatedAt.toISOString() : (target.updatedAt ?? new Date().toISOString()),
  });
}

/**
 * Explicit allowlist projection for AI model context.
 * Never includes reset secrets, account credentials, or database connection info.
 */
/**
 * Authoritative check for whether a target represents a verified controlled sandbox.
 * Preserves fail-closed safety for arbitrary external sites (like example.com).
 */
export function isTargetTrustedSandbox(target: {
  baseUrl?: string | null;
  environment?: string | null;
  isSandboxVerified?: boolean | null;
}): boolean {
  if (target.isSandboxVerified) return true;
  if (!target.baseUrl) return false;

  try {
    const targetOrigin = new URL(target.baseUrl).origin.toLowerCase();
    const env = process.env;

    // Explicit environment configuration
    if (env.WORKBENCH_TARGET_URL) {
      try {
        if (targetOrigin === new URL(env.WORKBENCH_TARGET_URL).origin.toLowerCase()) {
          return true;
        }
      } catch {}
    }
    if (env.CART_TARGET_URL) {
      try {
        if (targetOrigin === new URL(env.CART_TARGET_URL).origin.toLowerCase()) {
          return true;
        }
      } catch {}
    }
    if (env.TRUSTED_TARGET_ORIGINS) {
      const origins = env.TRUSTED_TARGET_ORIGINS.split(',').map((o) => o.trim().toLowerCase());
      if (origins.includes(targetOrigin)) {
        return true;
      }
    }


    // Deployed controlled targets on Render:
    // Strictly scoped to the controlled workbench & cart target services
    if (
      targetOrigin.includes('tracecase-target-workbench') &&
      targetOrigin.endsWith('.onrender.com')
    ) {
      return true;
    }
    if (
      targetOrigin.includes('tracecase-target-cart') &&
      targetOrigin.endsWith('.onrender.com')
    ) {
      return true;
    }
  } catch {}

  return false;
}

export function projectSafeModelTargetContext(
  target: Record<string, unknown>
): SafeModelTargetContext {
  const isTrusted = isTargetTrustedSandbox(target as any);
  const baseUrl = typeof target.baseUrl === 'string' ? target.baseUrl : '';
  const isWorkbench = baseUrl.includes('/workbench') || (isTrusted && !baseUrl.includes('cart'));

  return SafeModelTargetContextSchema.parse({
    targetId: target.id ?? target.targetId,
    name: target.name,
    baseUrl: target.baseUrl,
    allowedOrigins: Array.isArray(target.allowedOrigins) ? [...target.allowedOrigins] : [],
    isSandboxVerified: isTrusted || Boolean(target.isSandboxVerified ?? target.isSandbox ?? false),
    environment: target.environment,
    fixtureScope:
      (target.fixtureScope as string) ??
      (isWorkbench ? 'workbench_work_items' : baseUrl.includes('cart') ? 'cart_baseline' : undefined),
    hasResetCapability:
      isTrusted ||
      Boolean(
        target.fixtureResetEndpoint ||
        target.hasResetCapability ||
        (typeof target.fixtureResetAuthSecretRef === 'string' && target.fixtureResetAuthSecretRef.length > 0)
      ),
  });
}
