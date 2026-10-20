import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL || 'postgres://tc_user:tc_pass@localhost:5432/tracecase';

  // Parse safe target endpoint for logging without leaking credentials
  let safeTarget = 'PostgreSQL endpoint';
  try {
    const parsed = new URL(connectionString);
    safeTarget = `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    safeTarget = 'configured database target';
  }

  console.log(`[TraceCase Database] Checking database connectivity against ${safeTarget}...`);

  let sql: postgres.Sql | null = null;
  try {
    sql = postgres(connectionString, { max: 1, connect_timeout: 5 });
    // Test connectivity
    await sql`SELECT 1`;
    console.log('[TraceCase Database] Database connectivity established. Applying migrations...');

    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: './drizzle/migrations' });
    console.log('[TraceCase Database] Migrations applied successfully.');
  } catch (error) {
    console.error(`[TraceCase Database] FATAL: Database migration failed against ${safeTarget}.`);
    // Safe error reporting without printing credentials or raw connection URLs
    const safeMessage = error instanceof Error ? error.name : 'Unknown database error';
    console.error(`Reason: ${safeMessage}`);
    throw new Error(`[TraceCase Database] Migration execution aborted: ${safeMessage}`);
  } finally {
    if (sql) {
      await sql.end({ timeout: 2 });
    }
  }
}

if (require.main === module) {
  runMigrations().catch(() => {
    process.exit(1);
  });
}

export { runMigrations };
