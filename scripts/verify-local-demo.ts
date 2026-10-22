/** Development-only operator provisioning for the repository's disposable demo.
 * This is not a general sandbox-verification endpoint or a client assertion.
 */
import postgres from 'postgres';
import { getServerEnv } from '../src/server/config/env';

async function main() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Requires NODE_ENV=development');
  const env = getServerEnv();
  if (!process.env.TARGET_RESET_SECRET) throw new Error('Configure TARGET_RESET_SECRET explicitly');
  const sql = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 5 });
  try {
    const rows = await sql`select t.id, t.base_url, t.environment, t.is_sandbox, t.allowed_origins,
      t.fixture_reset_endpoint from targets t join principals p on t.owner_id=p.id
      where p.external_subject='dev-operator-sub' and t.base_url='http://localhost:3005'`;
    if (rows.length !== 1) throw new Error('Register exactly one localhost:3005 target under the local development operator first');
    const t = rows[0];
    if (t.environment !== 'demo' || !t.is_sandbox ||
        JSON.stringify(t.allowed_origins) !== JSON.stringify(['http://localhost:3005']) ||
        t.fixture_reset_endpoint !== 'http://localhost:3005/api/test/reset-fixture') {
      throw new Error('Target must be the explicitly requested, origin-restricted local demo sandbox');
    }
    const request = async (path: string, init?: RequestInit) => {
      const res = await fetch(`http://localhost:3005${path}`, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', 'X-TraceCase-Reset-Auth': env.TARGET_RESET_SECRET },
      });
      if (!res.ok) throw new Error(`Demo check failed: ${path} returned ${res.status}`);
      return res.json();
    };
    const info = await request('/api/build-info');
    if (info.applicationName !== 'TraceCase-Demo-Tasks' || info.environment !== 'sandbox' ||
        info.buildVersion !== 'v1.0.0-buggy') throw new Error('Unexpected controlled demo identity/build');
    const reset = await request('/api/test/reset-fixture', {
      method: 'POST', body: JSON.stringify({ fixtureScope: 'default' }),
    });
    const baseline = await request('/api/test/readback?scope=default');
    if (!reset.success || baseline.itemCount !== 2 || !Array.isArray(baseline.items) ||
        !baseline.items.some((x: { id: string; completed: boolean }) => x.id === 'task-a' && x.completed) ||
        !baseline.items.some((x: { id: string; completed: boolean }) => x.id === 'task-b' && !x.completed)) {
      throw new Error('Authenticated reset/readback did not restore the known disposable baseline');
    }
    await sql`update targets set is_sandbox_verified=true,
      fixture_reset_auth_secret_ref='env:TARGET_RESET_SECRET', updated_at=now() where id=${t.id}`;
    console.log(`Verified local demo target ${t.id}: known source, sandbox build, authenticated reset and independent two-task readback.`);
  } finally { await sql.end({ timeout: 2 }); }
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });
