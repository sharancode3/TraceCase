import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { getServerEnv } from '../config/env';

let client: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (dbInstance) return dbInstance;

  const env = getServerEnv();
  if (!env.DATABASE_URL) {
    throw new Error('[TraceCase Database] DATABASE_URL is not configured.');
  }

  // Create single lazy connection instance
  client = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {}, // Suppress verbose notices in logs
  });

  dbInstance = drizzle(client, { schema });
  return dbInstance;
}
