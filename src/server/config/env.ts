import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Persistence (PostgreSQL & Drizzle)
  DATABASE_URL: z.string().default('postgres://tc_user:tc_pass@localhost:5432/tracecase'),

  // AI Configuration (Luna via OpenAI API only, TC-INV-001)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_ID: z.string().default('gpt-6-luna'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),

  // Object Storage (MinIO / S3)
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('tracecase_admin'),
  S3_SECRET_KEY: z.string().default('tracecase_secret_key_2026'),
  S3_BUCKET_PUBLIC: z.string().default('tracecase-public-safe'),
  S3_BUCKET_RESTRICTED: z.string().default('tracecase-restricted-raw'),
  S3_REGION: z.string().default('us-east-1'),

  // Worker Daemon Configuration
  WORKER_PORT: z.coerce.number().default(3001),
  WORKER_CONCURRENCY: z.literal(1).default(1), // TC-INV-011
  WORKER_HEARTBEAT_SEC: z.coerce.number().default(10),

  // Development Preview Mode Flag
  // Strictly false in production; fatal error if attempted in production
  DEV_PREVIEW_MODE: z.preprocess((val) => {
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return Boolean(val);
  }, z.boolean()).default(false),

  // Safety & Guardrail Settings
  POLICY_ENFORCE_SANDBOX: z.preprocess((val) => {
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return Boolean(val);
  }, z.boolean()).default(true),

  TARGET_RESET_SECRET: z.string().default('tc-fixture-secret-2026'),

  // External Identity Provider (OIDC / JWT)
  AUTH_ISSUER: z.string().url().optional(),
  AUTH_AUDIENCE: z.string().optional(),
  AUTH_JWKS_URI: z.string().url().optional(),
  AUTH_CLOCK_TOLERANCE_SEC: z.coerce.number().default(10),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const result = ServerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`[TraceCase] Invalid server environment configuration: ${errorDetails}`);
  }

  // Safety check: Preview mode strictly forbidden in production (F-04)
  if (result.data.NODE_ENV === 'production' && result.data.DEV_PREVIEW_MODE) {
    throw new Error('[TraceCase Security] FATAL: DEV_PREVIEW_MODE is strictly forbidden in production environments.');
  }

  cachedEnv = result.data;
  return cachedEnv;
}

/**
 * Checks whether development preview mode is enabled.
 * Fails closed in production or if environment parsing fails.
 */
export function isDevPreviewEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  try {
    const env = getServerEnv();
    return env.DEV_PREVIEW_MODE;
  } catch {
    // Fail closed: never default to preview if config is corrupted or missing
    return false;
  }
}

/**
 * Test helper to reset cached configuration between test runs.
 */
export function _resetCachedEnvForTesting(): void {
  cachedEnv = null;
}
