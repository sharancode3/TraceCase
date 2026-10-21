import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DemoTargetStore } from '../demo-target/store';
import { createDemoTargetServer } from '../demo-target/server';
import type { FixtureResetReceipt, FixtureReadbackResult } from '../demo-target/types';
import type { TargetUnauthorizedError } from '../demo-target/client';

describe('Person 2: Controlled Demo Target, Fixtures, and Reset/Readback (P2-02)', () => {
  describe('Direct In-Memory Store Logic & Defect Invariants', () => {
    it('implements exact buggy deletion outcome under active filter (TC1)', () => {
      // Buggy mode active
      const store = new DemoTargetStore(true, 'v1.0.0-buggy');
      const scope = 'two_tasks_one_completed';

      // Verify baseline: Task A (completed), Task B (active)
      const initialTasks = store.getTasks(scope, 'all');
      expect(initialTasks.map((t) => t.id)).toEqual(['task-a', 'task-b']);
      expect(initialTasks[0].completed).toBe(true);
      expect(initialTasks[1].completed).toBe(false);

      // Under Active filter, only Task B is visible
      const activeTasks = store.getTasks(scope, 'active');
      expect(activeTasks.map((t) => t.id)).toEqual(['task-b']);

      // User intends to delete Task B while Active filter is on
      const result = store.deleteTask(scope, 'task-b', 'active');

      // THE BUG OCCURS: Task A was deleted instead of Task B!
      expect(result.deletedTaskId).toBe('task-a');
      expect(result.deletedTaskTitle).toBe('Task A (Completed)');

      // Verify backing array state: Task B remains, Task A is gone!
      const remainingTasks = store.getTasks(scope, 'all');
      expect(remainingTasks.map((t) => t.id)).toEqual(['task-b']);
      expect(remainingTasks.find((t) => t.id === 'task-a')).toBeUndefined();
      expect(remainingTasks.find((t) => t.id === 'task-b')).toBeDefined();
    });

    it('implements exact fixed deletion outcome by stable ID (TC2)', () => {
      // Fixed mode active
      const store = new DemoTargetStore(false, 'v1.0.1-fixed');
      const scope = 'two_tasks_one_completed';

      // User intends to delete Task B while Active filter is on
      const result = store.deleteTask(scope, 'task-b', 'active');

      // FIXED BEHAVIOR: Task B is deleted, Task A is preserved!
      expect(result.deletedTaskId).toBe('task-b');
      expect(result.deletedTaskTitle).toBe('Task B (Active)');

      const remainingTasks = store.getTasks(scope, 'all');
      expect(remainingTasks.map((t) => t.id)).toEqual(['task-a']);
      expect(remainingTasks.find((t) => t.id === 'task-a')).toBeDefined();
      expect(remainingTasks.find((t) => t.id === 'task-b')).toBeUndefined();
    });

    it('filters tasks accurately by completion status', () => {
      const store = new DemoTargetStore();
      const scope = 'three_tasks_multi_status';

      expect(store.getTasks(scope, 'all')).toHaveLength(3);
      expect(store.getTasks(scope, 'active')).toHaveLength(2);
      expect(store.getTasks(scope, 'completed')).toHaveLength(1);
    });

    it('preserves cross-fixture isolation', () => {
      const store = new DemoTargetStore();

      // Mutate two_tasks_one_completed
      store.deleteTask('two_tasks_one_completed', 'task-a', 'all');
      expect(store.getTasks('two_tasks_one_completed', 'all')).toHaveLength(1);

      // three_tasks_multi_status remains pristine
      expect(store.getTasks('three_tasks_multi_status', 'all')).toHaveLength(3);
    });

    it('executes repeated reset and readback equivalence cycles', () => {
      const store = new DemoTargetStore(true, 'v1.0.0-buggy');
      const scope = 'two_tasks_one_completed';

      // Cycle 1: Mutate -> Reset -> Readback
      store.deleteTask(scope, 'task-b', 'active');
      expect(store.getTasks(scope, 'all')).toHaveLength(1);

      const receipt1 = store.resetFixture(scope);
      expect(receipt1.success).toBe(true);
      expect(receipt1.itemsRestored).toBe(2);

      const readback1 = store.readbackFixture(scope);
      expect(readback1.itemCount).toBe(2);
      expect(readback1.items[0].id).toBe('task-a');
      expect(readback1.items[1].id).toBe('task-b');

      // Cycle 2: Repeat identical mutation -> Reset -> Readback
      store.deleteTask(scope, 'task-b', 'active');
      expect(store.getTasks(scope, 'all')).toHaveLength(1);

      const receipt2 = store.resetFixture(scope);
      expect(receipt2.itemsRestored).toBe(2);

      const readback2 = store.readbackFixture(scope);
      expect(readback2.itemCount).toBe(2);
      expect(readback2.items).toEqual(readback1.items);
    });

    it('detects controlled partial-reset fault injection', () => {
      const store = new DemoTargetStore();
      const scope = 'two_tasks_one_completed';

      const receipt = store.resetFixture(scope, 'PARTIAL_RESET');
      expect(receipt.itemsRestored).toBe(1);

      const readback = store.readbackFixture(scope);
      expect(readback.itemCount).toBe(1);
      expect(readback.items[0].id).toBe('task-a');
    });

    it('rejects unrecognized fixture scope names', () => {
      const store = new DemoTargetStore();
      expect(() => store.resetFixture('malicious_table_drop' as any)).toThrow(
        /INVALID_FIXTURE_SCOPE/
      );
      expect(() => store.readbackFixture('arbitrary_sql_injection' as any)).toThrow(
        /INVALID_FIXTURE_SCOPE/
      );
    });
  });

  describe('HTTP Server & Privileged Webhook API', () => {
    let app: ReturnType<typeof createDemoTargetServer>;
    let baseUrl: string;
    const testSecret = 'tc-test-auth-secret-123';

    beforeAll(async () => {
      app = createDemoTargetServer({
        port: 0, // OS assigns random available port
        resetSecret: testSecret,
        bugModeActive: true,
        buildVersion: 'v1.0.0-buggy',
      });
      const port = await app.start(0, '127.0.0.1');
      baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
      await app.stop();
    });

    it('serves accessible HTML user interface on GET /', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const body = await res.text();
      expect(body).toContain('Task Management Demo');
      expect(body).toContain('data-filter="active"');
      expect(body).toContain('data-task-id="task-a"');
      expect(body).toContain('data-task-id="task-b"');
      expect(body).toContain('Build: v1.0.0-buggy');
    });

    it('returns safe build and health metadata on GET /api/build-info', async () => {
      const res = await fetch(`${baseUrl}/api/build-info`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { applicationName: string; buildVersion: string; bugModeActive?: boolean };
      expect(data.applicationName).toBe('TraceCase-Demo-Tasks');
      expect(data.buildVersion).toBe('v1.0.0-buggy');
      expect(data).not.toHaveProperty('bugModeActive');
    });

    it('rejects unauthenticated reset requests with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixtureScope: 'two_tasks_one_completed' }),
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('UNAUTHORIZED_RESET');
    });

    it('rejects invalid reset credentials with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': 'wrong-secret',
        },
        body: JSON.stringify({ fixtureScope: 'two_tasks_one_completed' }),
      });

      expect(res.status).toBe(401);
    });

    it('executes authenticated fixture reset and returns receipt (TC-INV-006)', async () => {
      const res = await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': testSecret,
        },
        body: JSON.stringify({ fixtureScope: 'two_tasks_one_completed' }),
      });

      expect(res.status).toBe(200);
      const receipt = (await res.json()) as FixtureResetReceipt;
      expect(receipt.success).toBe(true);
      expect(receipt.itemsRestored).toBe(2);
      expect(receipt.buildVersion).toBe('v1.0.0-buggy');
      expect(receipt.receiptId).toBeDefined();
    });

    it('provides independent readback of baseline items on GET /api/test/readback', async () => {
      const res = await fetch(`${baseUrl}/api/test/readback?scope=two_tasks_one_completed`, {
        headers: {
          'X-TraceCase-Reset-Auth': testSecret,
        },
      });

      expect(res.status).toBe(200);
      const readback = (await res.json()) as FixtureReadbackResult;
      expect(readback.fixtureScope).toBe('two_tasks_one_completed');
      expect(readback.itemCount).toBe(2);
      expect(readback.items[0].id).toBe('task-a');
      expect(readback.items[1].id).toBe('task-b');
    });

    it('rejects reset requests for unknown disposable scopes with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': testSecret,
        },
        body: JSON.stringify({ fixtureScope: 'DROP_TABLE_TASKS' }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('UNKNOWN_FIXTURE_SCOPE');
    });

    it('emits synthetic token in console for TC4 secret redaction surface', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test_diagnostics_user' }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; user: string };
      expect(data.success).toBe(true);
      expect(data.user).toBe('test_diagnostics_user');
    });

    it('rejects prototype-like scope names on reset with HTTP 400', async () => {
      for (const protoScope of ['__proto__', 'constructor', 'prototype', 'toString']) {
        const res = await fetch(`${baseUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': testSecret,
          },
          body: JSON.stringify({ fixtureScope: protoScope }),
        });

        expect(res.status).toBe(400);
        const data = (await res.json()) as { error: { code: string } };
        expect(data.error.code).toBe('UNKNOWN_FIXTURE_SCOPE');
      }
    });

    it('rejects invalid request bodies with HTTP 400', async () => {
      // Array instead of object
      const resArray = await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': testSecret,
        },
        body: JSON.stringify(['two_tasks_one_completed']),
      });
      expect(resArray.status).toBe(400);
      const dataArray = (await resArray.json()) as { error: { code: string } };
      expect(dataArray.error.code).toBe('INVALID_REQUEST_BODY');

      // Malformed JSON
      const resMalformed = await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': testSecret,
        },
        body: '{ malformed json',
      });
      expect(resMalformed.status).toBe(400);
      const dataMalformed = (await resMalformed.json()) as { error: { code: string } };
      expect(dataMalformed.error.code).toBe('INVALID_REQUEST_BODY');
    });

    it('rejects invalid filter parameter values with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/tasks?filter=invalid_filter`);
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('INVALID_FILTER');
    });

    it('executes authenticated cleanup and readback confirms empty scope', async () => {
      const cleanupRes = await fetch(`${baseUrl}/api/test/cleanup-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': testSecret,
        },
        body: JSON.stringify({ fixtureScope: 'auth_test_user' }),
      });
      expect(cleanupRes.status).toBe(200);

      // Verify readback confirms 0 items
      const readbackRes = await fetch(`${baseUrl}/api/test/readback?scope=auth_test_user`, {
        headers: {
          'X-TraceCase-Reset-Auth': testSecret,
        },
      });
      expect(readbackRes.status).toBe(200);
      const readbackData = (await readbackRes.json()) as FixtureReadbackResult;
      expect(readbackData.itemCount).toBe(0);
      expect(readbackData.items).toHaveLength(0);

      // Restore fixture for subsequent tests
      await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': testSecret,
        },
        body: JSON.stringify({ fixtureScope: 'auth_test_user' }),
      });
    });

    it('fails closed and disables privileged target operations when TARGET_RESET_SECRET is unset (missing configuration)', async () => {
      const origSecret = process.env.TARGET_RESET_SECRET;
      delete process.env.TARGET_RESET_SECRET;

      const unsetApp = createDemoTargetServer({
        port: 0,
        // no resetSecret passed - relies entirely on environment, which is unset
      });
      expect(unsetApp.config.resetSecret).toBe('');
      const unsetPort = await unsetApp.start(0, '127.0.0.1');

      try {
        // 1. Reset fixture must be rejected with HTTP 401 even if caller provides a token
        const resetRes = await fetch(`http://127.0.0.1:${unsetPort}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': 'some-token',
          },
          body: JSON.stringify({ fixtureScope: 'two_tasks_one_completed' }),
        });
        expect(resetRes.status).toBe(401);
        const resetData = (await resetRes.json()) as { error: { code: string } };
        expect(resetData.error.code).toBe('UNAUTHORIZED_RESET');

        // 2. Readback must be rejected with HTTP 401
        const readbackRes = await fetch(
          `http://127.0.0.1:${unsetPort}/api/test/readback?scope=two_tasks_one_completed`,
          {
            headers: { 'X-TraceCase-Reset-Auth': 'some-token' },
          }
        );
        expect(readbackRes.status).toBe(401);
        const readbackData = (await readbackRes.json()) as { error: { code: string } };
        expect(readbackData.error.code).toBe('UNAUTHORIZED_READBACK');

        // 3. Cleanup must be rejected with HTTP 401
        const cleanupRes = await fetch(`http://127.0.0.1:${unsetPort}/api/test/cleanup-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': 'some-token',
          },
          body: JSON.stringify({ fixtureScope: 'two_tasks_one_completed' }),
        });
        expect(cleanupRes.status).toBe(401);
      } finally {
        await unsetApp.stop();
        if (origSecret !== undefined) {
          process.env.TARGET_RESET_SECRET = origSecret;
        }
      }
    });

    it('fails closed and disables privileged target operations when configured with explicitly empty or whitespace secret', async () => {
      for (const emptySecret of ['', '   ', '\t\n']) {
        const emptyApp = createDemoTargetServer({
          port: 0,
          resetSecret: emptySecret,
        });
        expect(emptyApp.config.resetSecret).toBe('');
        const port = await emptyApp.start(0, '127.0.0.1');

        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/test/reset-fixture`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-TraceCase-Reset-Auth': emptySecret,
            },
            body: JSON.stringify({ fixtureScope: 'two_tasks_one_completed' }),
          });
          expect(res.status).toBe(401);

          const readbackRes = await fetch(
            `http://127.0.0.1:${port}/api/test/readback?scope=two_tasks_one_completed`,
            {
              headers: { 'X-TraceCase-Reset-Auth': emptySecret },
            }
          );
          expect(readbackRes.status).toBe(401);
        } finally {
          await emptyApp.stop();
        }
      }
    });

    it('enforces development/evaluation fault-injection boundary when enabled vs disabled', async () => {
      // 1. Enabled Mode: Fault injection works as expected
      const enabledRes = await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': testSecret,
        },
        body: JSON.stringify({
          fixtureScope: 'two_tasks_one_completed',
          faultInjection: 'PARTIAL_RESET',
        }),
      });
      expect(enabledRes.status).toBe(200);
      const enabledReceipt = (await enabledRes.json()) as FixtureResetReceipt;
      expect(enabledReceipt.itemsRestored).toBe(1);

      // 2. Disabled Mode: PARTIAL_RESET and TIMEOUT_SIMULATION are strictly rejected
      const disabledFaultApp = createDemoTargetServer({
        port: 0,
        resetSecret: testSecret,
        allowFaultInjection: false,
      });
      const disabledPort = await disabledFaultApp.start(0, '127.0.0.1');

      try {
        // Attempt PARTIAL_RESET when disabled -> Rejected with HTTP 400 FAULT_INJECTION_DISABLED
        const partialRes = await fetch(`http://127.0.0.1:${disabledPort}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': testSecret,
          },
          body: JSON.stringify({
            fixtureScope: 'two_tasks_one_completed',
            faultInjection: 'PARTIAL_RESET',
          }),
        });
        expect(partialRes.status).toBe(400);
        const partialErr = (await partialRes.json()) as { error: { code: string; message: string } };
        expect(partialErr.error.code).toBe('FAULT_INJECTION_DISABLED');
        expect(partialErr.error.message).toContain('PARTIAL_RESET');

        // Attempt TIMEOUT_SIMULATION when disabled -> Rejected with HTTP 400 FAULT_INJECTION_DISABLED
        const timeoutRes = await fetch(`http://127.0.0.1:${disabledPort}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': testSecret,
          },
          body: JSON.stringify({
            fixtureScope: 'two_tasks_one_completed',
            faultInjection: 'TIMEOUT_SIMULATION',
          }),
        });
        expect(timeoutRes.status).toBe(400);
        const timeoutErr = (await timeoutRes.json()) as { error: { code: string; message: string } };
        expect(timeoutErr.error.code).toBe('FAULT_INJECTION_DISABLED');

        // 3. Ordinary authorized reset continues working in disabled mode
        const ordinaryRes = await fetch(`http://127.0.0.1:${disabledPort}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': testSecret,
          },
          body: JSON.stringify({
            fixtureScope: 'two_tasks_one_completed',
            faultInjection: 'NONE',
          }),
        });
        expect(ordinaryRes.status).toBe(200);
        const ordinaryReceipt = (await ordinaryRes.json()) as FixtureResetReceipt;
        expect(ordinaryReceipt.success).toBe(true);
        expect(ordinaryReceipt.itemsRestored).toBe(2);

        // Omission of faultInjection field also succeeds with ordinary reset
        const defaultRes = await fetch(`http://127.0.0.1:${disabledPort}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': testSecret,
          },
          body: JSON.stringify({
            fixtureScope: 'two_tasks_one_completed',
          }),
        });
        expect(defaultRes.status).toBe(200);
        const defaultReceipt = (await defaultRes.json()) as FixtureResetReceipt;
        expect(defaultReceipt.success).toBe(true);
        expect(defaultReceipt.itemsRestored).toBe(2);
      } finally {
        await disabledFaultApp.stop();
      }

      // Restore baseline on primary test server
      await fetch(`${baseUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': testSecret,
        },
        body: JSON.stringify({ fixtureScope: 'two_tasks_one_completed' }),
      });
    });

    it('verifies client adapter DemoTargetClient against live endpoints', async () => {
      const { DemoTargetClient } = await import('../demo-target/client');
      const client = new DemoTargetClient({
        baseUrl,
        resetSecret: testSecret,
      });

      // 1. getBuildInfo calls /api/build-info and returns validated schema free of bugModeActive
      const buildInfo = await client.getBuildInfo();
      expect(buildInfo.applicationName).toBe('TraceCase-Demo-Tasks');
      expect(buildInfo.buildVersion).toBe('v1.0.0-buggy');
      expect(buildInfo.environment).toBe('sandbox');
      expect(typeof buildInfo.serverTimestamp).toBe('string');
      expect((buildInfo as unknown as Record<string, unknown>).bugModeActive).toBeUndefined();

      // 2. resetFixture
      const receipt = await client.resetFixture('two_tasks_one_completed');
      expect(receipt.success).toBe(true);
      expect(receipt.itemsRestored).toBe(2);

      // 3. readbackFixture
      const readback = await client.readbackFixture('two_tasks_one_completed');
      expect(readback.itemCount).toBe(2);
      expect(readback.items[0].id).toBe('task-a');
      expect(readback.items[1].id).toBe('task-b');

      // 4. cleanupFixture
      const cleanup = await client.cleanupFixture('two_tasks_one_completed');
      expect(cleanup.success).toBe(true);

      // Verify readback confirms 0 items
      const readbackClean = await client.readbackFixture('two_tasks_one_completed');
      expect(readbackClean.itemCount).toBe(0);

      // Re-reset to leave clean state
      await client.resetFixture('two_tasks_one_completed');
    });

    it('tests all SupportedFixtureScopes through DemoTargetClient against the actual server', async () => {
      const { DemoTargetClient } = await import('../demo-target/client');
      const client = new DemoTargetClient({
        baseUrl,
        resetSecret: testSecret,
      });

      const scopeExpectations = [
        {
          scope: 'two_tasks_one_completed' as const,
          expectedCount: 2,
          expectedIds: ['task-a', 'task-b'],
        },
        {
          scope: 'three_tasks_multi_status' as const,
          expectedCount: 3,
          expectedIds: ['task-a', 'task-b', 'task-c'],
        },
        {
          scope: 'auth_test_user' as const,
          expectedCount: 1,
          expectedIds: ['task-auth-1'],
        },
        {
          scope: 'default' as const,
          expectedCount: 2,
          expectedIds: ['task-a', 'task-b'],
        },
      ];

      for (const { scope, expectedCount, expectedIds } of scopeExpectations) {
        // 1. Reset fixture through client
        const resetReceipt = await client.resetFixture(scope);
        expect(resetReceipt.success).toBe(true);
        expect(resetReceipt.fixtureScope).toBe(scope);
        expect(resetReceipt.itemsRestored).toBe(expectedCount);
        expect(resetReceipt.buildVersion).toBe('v1.0.0-buggy');
        expect(resetReceipt.receiptId).toBeDefined();

        // 2. Readback fixture through client
        const readbackResult = await client.readbackFixture(scope);
        expect(readbackResult.fixtureScope).toBe(scope);
        expect(readbackResult.itemCount).toBe(expectedCount);
        expect(readbackResult.items.map((t) => t.id)).toEqual(expectedIds);
        expect(readbackResult.buildVersion).toBe('v1.0.0-buggy');
        expect(readbackResult.verifiedAt).toBeDefined();
      }
    });

    it('client adapter validates runtime schema and rejects malformed responses', async () => {
      const { DemoTargetClient, TargetClientError } = await import('../demo-target/client');
      const { vi } = await import('vitest');

      const client = new DemoTargetClient({
        baseUrl,
        resetSecret: testSecret,
      });

      // Mock fetch returning HTTP 200 but with malformed schema (missing required fields)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ unexpectedField: 'not-build-info' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      try {
        await expect(client.getBuildInfo()).rejects.toThrow(TargetClientError);
        fetchSpy.mockResolvedValueOnce(
          new Response(JSON.stringify({ unexpectedField: 'not-build-info' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
        await expect(client.getBuildInfo()).rejects.toThrow(/INVALID_RESPONSE_SCHEMA/);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('client adapter throws typed errors on auth failure and invalid scope', async () => {
      const { DemoTargetClient, TargetUnauthorizedError, TargetScopeError } = await import(
        '../demo-target/client'
      );
      const badAuthClient = new DemoTargetClient({
        baseUrl,
        resetSecret: 'bad-secret',
      });

      // Verify distinct operation-specific error codes
      try {
        await badAuthClient.resetFixture('two_tasks_one_completed');
        expect.unreachable('Should have thrown TargetUnauthorizedError');
      } catch (err) {
        expect(err).toBeInstanceOf(TargetUnauthorizedError);
        expect((err as TargetUnauthorizedError).code).toBe('UNAUTHORIZED_RESET');
      }

      try {
        await badAuthClient.readbackFixture('two_tasks_one_completed');
        expect.unreachable('Should have thrown TargetUnauthorizedError');
      } catch (err) {
        expect(err).toBeInstanceOf(TargetUnauthorizedError);
        expect((err as TargetUnauthorizedError).code).toBe('UNAUTHORIZED_READBACK');
      }

      try {
        await badAuthClient.cleanupFixture('two_tasks_one_completed');
        expect.unreachable('Should have thrown TargetUnauthorizedError');
      } catch (err) {
        expect(err).toBeInstanceOf(TargetUnauthorizedError);
        expect((err as TargetUnauthorizedError).code).toBe('UNAUTHORIZED_CLEANUP');
      }

      const validClient = new DemoTargetClient({
        baseUrl,
        resetSecret: testSecret,
      });

      await expect(validClient.resetFixture('INVALID_SCOPE_NAME' as any)).rejects.toThrow(
        TargetScopeError
      );
    });
  });
});

