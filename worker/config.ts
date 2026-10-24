import { z } from 'zod';
import os from 'node:os';

export const WorkerConfigSchema = z.object({
  workerId: z.string().default(() => `worker-${os.hostname()}-${process.pid}`),
  port: z.coerce.number().default(3001),
  concurrency: z.literal(1).default(1), // TC-INV-011: Strict single investigation concurrency
  databaseUrl: z.string().default('postgres://tc_user:tc_pass@localhost:5432/tracecase'),
  heartbeatSec: z.coerce.number().default(10),
  drainTimeoutSec: z.coerce.number().default(30),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function getWorkerConfig(): WorkerConfig {
  return WorkerConfigSchema.parse({
    port: process.env.WORKER_PORT || process.env.PORT,
    concurrency: 1,
    databaseUrl: process.env.DATABASE_URL,
    heartbeatSec: process.env.WORKER_HEARTBEAT_SEC,
  });
}
