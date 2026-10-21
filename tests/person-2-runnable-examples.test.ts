import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runProviderExample,
  runPlannerExample,
  runActionProposerExample,
  runReviewerExample,
  runTargetResetAndReadbackExample,
} from '../examples/person-2-runnable-examples';
import { createDemoTargetServer } from '../demo-target/server';

describe('Person 2: Runnable Integration Examples Typecheck & Execution', () => {
  let serverPort: number;
  let targetServer: ReturnType<typeof createDemoTargetServer>;
  const testSecret = 'tc-disposable-secret-2026';

  beforeAll(async () => {
    targetServer = createDemoTargetServer({
      port: 0,
      resetSecret: testSecret,
      isSandbox: true,
      allowFaultInjection: true,
    });
    serverPort = await targetServer.start(0, '127.0.0.1');
  });

  afterAll(async () => {
    if (targetServer) {
      await targetServer.stop();
    }
  });

  it('runs Provider example cleanly without errors', async () => {
    await expect(runProviderExample()).resolves.toBeUndefined();
  });

  it('runs Planner example cleanly with mock provider', async () => {
    await expect(runPlannerExample()).resolves.toBeUndefined();
  });

  it('runs Action Proposer example cleanly with mock provider', async () => {
    await expect(runActionProposerExample()).resolves.toBeUndefined();
  });

  it('runs Reviewer example cleanly with mock provider', async () => {
    await expect(runReviewerExample()).resolves.toBeUndefined();
  });

  it('runs Target Reset & Readback example against authenticated target server', async () => {
    const baseUrl = `http://127.0.0.1:${serverPort}`;
    await expect(runTargetResetAndReadbackExample(baseUrl, testSecret)).resolves.toBeUndefined();
  });
});
