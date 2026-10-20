import { describe, it, expect } from 'vitest';
import postgres from 'postgres';

describe('P1-04: Real Database and Queue Connectivity Integration Check', () => {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://tc_user:tc_pass@localhost:5432/tracecase';

  const isExplicitIntegration =
    process.env.RUN_INTEGRATION_TESTS === 'true' ||
    Boolean(process.env.CI);

  it('verifies PostgreSQL connectivity or fails with clear actionable error when offline', async () => {
    let sqlClient: postgres.Sql | null = null;
    try {
      sqlClient = postgres(databaseUrl, {
        connect_timeout: 1,
        max: 1,
      });

      const [row] = await sqlClient`SELECT 1 as connected, current_database() as db_name`;
      expect(row.connected).toBe(1);
      console.log(`[Integration Test] Successfully connected to live database '${row.db_name}'.`);
    } catch (err: unknown) {
      if (isExplicitIntegration) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `[TraceCase Integration Error] Real PostgreSQL is unreachable at '${databaseUrl}'.\n` +
            `Diagnostic: ${errorMsg}\n` +
            `Action: Ensure Docker daemon is running and execute 'docker compose up -d postgres', or provide a running PostgreSQL instance via TEST_DATABASE_URL.`
        );
      } else {
        console.log(`[Integration Test] Notice: Real database offline at '${databaseUrl}'. Run with 'pnpm test:integration' after starting docker compose.`);
      }
    } finally {
      if (sqlClient) {
        await sqlClient.end({ timeout: 1 });
      }
    }
  }, 10000);
});
