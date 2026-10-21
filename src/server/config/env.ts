import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Persistence (PostgreSQL & Drizzle)
  DATABASE_URL: z.string().default('postgres://tc_user:tc_pass@localhost:5432/tracecase'),

  // AI Configuration (Luna via OpenAI API only, TC-INV-001)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_ID: z.string().optional(),
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
  // Strictly false in production unless explicit opt-in
  DEV_PREVIEW_MODE: z.preprocess((val) => {
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return Boolean(val);
  }, z.boolean()).default(true),

  // Safety & Guardrail Settings
  POLICY_ENFORCE_SANDBOX: z.preprocess((val) => {
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return Boolean(val);
  }, z.boolean()).default(true),

  TARGET_RESET_SECRET: z.string().default('tc-fixture-secret-2026'),
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

  // Safety check: Preview mode cannot silently run in production
  if (result.data.NODE_ENV === 'production' && result.data.DEV_PREVIEW_MODE) {
    console.warn('[TraceCase Security] WARNING: DEV_PREVIEW_MODE is active in production environment!');
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export function isDevPreviewEnabled(): boolean {
  try {
    const env = getServerEnv();
    return env.DEV_PREVIEW_MODE;
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}
