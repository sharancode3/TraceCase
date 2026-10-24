import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { getServerEnv } from '../config/env';

export { schema };
export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let client: postgres.Sql | null = null;
let dbInstance: DbClient | null = null;
let migrationPromise: Promise<void> | null = null;

export async function ensureDatabaseMigrated(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || !isDbConfigured()) return;
  if (!migrationPromise) {
    migrationPromise = (async () => {
      try {
        const db = getDb();
        const { migrate } = await import('drizzle-orm/postgres-js/migrator');
        const path = await import('node:path');
        const migrationsFolder = path.resolve(process.cwd(), 'drizzle/migrations');
        await migrate(db, { migrationsFolder });
        console.log('[TraceCase Database] Auto-migration successfully verified.');
      } catch (err) {
        console.warn('[TraceCase Database] Auto-migration status:', err instanceof Error ? err.message : err);
      }
    })();
  }
  await migrationPromise;
}

export function getDb(): DbClient {
  if (dbInstance) return dbInstance;

  const env = getServerEnv();
  if (!env.DATABASE_URL) {
    throw new Error('[TraceCase Database] DATABASE_URL is not configured.');
  }

  // Create single lazy connection instance
  client = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
    onnotice: () => {}, // Suppress verbose notices in logs
  });

  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export function isDbConfigured(): boolean {
  try {
    const env = getServerEnv();
    return Boolean(env.DATABASE_URL);
  } catch {
    return false;
  }
}

/**
 * Checks whether database is reachable or mocked for tests.
 */
export async function checkDbConnectivity(): Promise<boolean> {
  // If a mock DB was injected via setDbInstanceForTesting (where client is null), consider it connected
  if (dbInstance && client === null) {
    return true;
  }
  if (!isDbConfigured()) return false;
  try {
    getDb();
    if (client) {
      await client`SELECT 1`;
      return true;
    }
    return false;
  } catch {
    dbInstance = null;
    return false;
  }
}

/**
 * Injects a mock or test database instance for unit and integration testing.
 */
export function setDbInstanceForTesting(mockDb: unknown): void {
  dbInstance = mockDb as DbClient;
}

/**
 * Resets the cached database connection and instance.
 */
export function resetDbInstanceForTesting(): void {
  if (client) {
    client.end({ timeout: 2 }).catch(() => {});
    client = null;
  }
  dbInstance = null;
}
