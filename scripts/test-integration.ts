import { spawnSync } from 'node:child_process';

process.env.RUN_INTEGRATION_TESTS = 'true';

const args = ['vitest', 'run', 'tests/person-1/phase-4/real-db-integration.test.ts', ...process.argv.slice(2)];
const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    RUN_INTEGRATION_TESTS: 'true',
  },
});

process.exit(result.status ?? 0);
