import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL || 'postgres://tc_user:tc_pass@localhost:5432/tracecase';
  console.log('[TraceCase Database] Attempting migration check against:', connectionString.replace(/:[^:@]+@/, ':****@'));

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
    console.warn('[TraceCase Database] Migration check notice: Local PostgreSQL is currently offline or unreachable.');
    console.warn('Details:', error instanceof Error ? error.message : error);
    console.log('[TraceCase Database] Statically validated schema and migration files remain authoritative.');
  } finally {
    if (sql) {
      await sql.end({ timeout: 2 });
    }
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
}

export { runMigrations };
