import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { TwoAttemptController } from '@/server/verification/two-attempt-controller';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import type { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import type { AttemptExecutionReceipt } from '@/contracts/observations';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase6TestDbMock } from './test-db-mock';

describe('P1-06: Two-Attempt Controller Orchestration & Gate Enforcement', () => {
  let mockDb: Phase6TestDbMock;
  let leaseService: ExecutionLeaseService;
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  const invId = '00000000-1111-4111-8111-000000000001';
  const execReqId = '00000000-2222-4222-8222-000000000002';
  const targetId = '00000000-3333-4333-8333-000000000003';
  const ownerId = 'usr-person-1';
  const planHash = 'c'.repeat(64);

  let fixtureBalance = 100;
  let resetShouldRestore = true;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${serverPort}`);

      if (url.pathname === '/api/test/reset-fixture' && req.method === 'POST') {
        if (resetShouldRestore) {
          fixtureBalance = 100; // successfully restore balance
        } else {
          fixtureBalance = 50; // fake reset: leaves dirty state
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (url.pathname === '/api/test/baseline' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            targetId,
            environment: 'development',
            fixtureScope: 'default',
            balance: fixtureBalance,
          })
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    mockDb = new Phase6TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);

    fixtureBalance = 100;
    resetShouldRestore = true;

    // Seed investigation
    mockDb.investigations.push({
      id: invId,
      ownerId,
      targetId,
      reportId: 'rep-01',
      lifecycleStatus: 'QUEUED',
      reviewStatus: 'APPROVED',
      workflowRevision: 1,
      eventSequenceCounter: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed execution request
    mockDb.executionRequests.push({
      id: execReqId,
      investigationId: invId,
      planVersion: 1,
      planHash,
      approvalId: 'appr-01',
      requestedBy: ownerId,
      status: 'ADMITTED',
      fencingEpoch: 1,
      workerInstanceId: 'worker-01',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed approval
    mockDb.planApprovals.push({
      id: 'appr-01',
      investigationId: invId,
      targetId,
      planVersion: 1,
      planHash,
      authorizedActorId: ownerId,
      maxActionTierPermitted: 'TIER_3_MUTATING_INTERACTION',
      approvedBy: ownerId,
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    });

    // Seed target
    mockDb.targets.push({
      id: targetId,
      name: 'Local Test Target',
      baseUrl: serverUrl,
      allowedOrigins: [serverUrl],
      isSandbox: true,
      isSandboxVerified: true,
      environment: 'development',
      fixtureResetEndpoint: `${serverUrl}/api/test/reset-fixture`,
      fixtureResetAuthSecret: 'secret-token',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed plan revision with executable assertions
    mockDb.experimentPlanRevisions.push({
      investigationId: invId,
      version: 1,
      planHash,
      planPayload: {
        id: 'plan-100',
        investigationId: invId,
        version: 1,
        targetId,
        targetUrl: serverUrl,
        allowedOrigins: [serverUrl],
        preconditions: ['Target is online'],
        steps: [
          {
            stepIndex: 1,
            semanticAction: 'Click submit button',
            toolKind: 'click_button',
            selector: '#btn-submit',
            tier: 'TIER_3_MUTATING_INTERACTION',
            timeoutMs: 5000,
          },
        ],
        expectedCorrectBehavior: 'Confirmation message is displayed',
        reportedFailureSignature: 'Crash alert banner appears',
        assertions: [
          {
            id: 'assert-correct',
            description: 'Confirmation message appears',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            purpose: 'EXPECTED_CORRECT_BEHAVIOR',
            subjectRef: '#confirmation-msg',
            operator: 'EXISTS',
            settlingPoint: 'AFTER_NETWORK_IDLE',
          },
          {
            id: 'assert-failure',
            description: 'Crash alert banner appears',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            purpose: 'REPORTED_FAILURE_SIGNATURE',
            subjectRef: '#crash-alert',
            operator: 'EXISTS',
            settlingPoint: 'AFTER_NETWORK_IDLE',
          },
        ],
        maxAttempts: 2,
        maxDurationMs: 60000,
        requiresResetHook: true,
        expectedBaseline: {
          targetId,
          environment: 'development',
          fixtureScope: 'default',
          balance: 100,
        },
        planHash,
        createdAt: new Date().toISOString(),
      },
      createdBy: ownerId,
      createdAt: new Date(),
    });

    // Acquire initial lease
    await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-01',
      executionRequestId: execReqId,
      investigationId: invId,
      leaseTtlMs: 60000,
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  it('orchestrates two matching attempts and concludes CONFIRMED_REPRODUCED under verified reset (TC-INV-002)', async () => {
    let attemptCount = 0;

    const mockBrowserWorker = {
      executeAttempt: async (params: any): Promise<AttemptExecutionReceipt> => {
        attemptCount++;
        const obsMap = new Map();

        // Simulate observing the bug: expected is absent, reported failure alert is present
        obsMap.set('assert-correct', {
          assertionId: 'assert-correct',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          status: 'NOT_FOUND',
          elementCount: 0,
          pageUrl: serverUrl,
          observedAt: new Date().toISOString(),
        });

        obsMap.set('assert-failure', {
          assertionId: 'assert-failure',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          status: 'AVAILABLE',
          elementCount: 1,
          pageUrl: serverUrl,
          observedAt: new Date().toISOString(),
        });

        return {
          investigationId: params.investigationId,
          attemptNumber: params.attemptNumber,
          actionsExecuted: [
            {
              stepIndex: 1,
              action: {
                stepIndex: 1,
                semanticAction: 'Click submit button',
                toolKind: 'click_button',
                selector: '#btn-submit',
                tier: 'TIER_3_MUTATING_INTERACTION',
                timeoutMs: 5000,
              },
              tier: 'TIER_3_MUTATING_INTERACTION',
              status: 'SUCCESS',
              uncertainty: 'NONE',
              durationMs: 120,
              dispatchedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ],
          assertionObservations: obsMap,
          captureCoverage: {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            hasVideoRecording: true,
            videoStatus: 'FINALIZED',
            hasConsoleLogs: true,
            consoleStatus: 'CAPTURED_WITH_ENTRIES',
            hasNetworkTrace: true,
            networkStatus: 'CAPTURED_WITH_REQUESTS',
            coverageComplete: true,
          },
          totalDurationMs: 450,
          completedCleanly: true,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      },
    } as unknown as PlaywrightBrowserWorker;

    const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

    const outcome = await controller.executeInvestigationPair({
      executionRequestId: execReqId,
      investigationId: invId,
      workerInstanceId: 'worker-01',
      epoch: 1,
    });

    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.verdict).toBe('CONFIRMED_REPRODUCED');
    expect(attemptCount).toBe(2);

    // Verify DB persistence of attempts
    expect(mockDb.investigationAttempts).toHaveLength(2);
    expect(mockDb.investigationAttempts[0].finding).toBe('REPORTED_FAILURE');
    expect(mockDb.investigationAttempts[1].finding).toBe('REPORTED_FAILURE');

    // Verify reset receipt was saved and verified
    expect(mockDb.resetReceipts).toHaveLength(1);
    expect(mockDb.resetReceipts[0].isVerifiedRestored).toBe(true);

    // Verify pair assessment was persisted
    expect(mockDb.pairAssessments).toHaveLength(1);
    expect(mockDb.pairAssessments[0].verdict).toBe('CONFIRMED_REPRODUCED');
    expect(mockDb.pairAssessments[0].isComparable).toBe(true);

    // Verify investigation lifecycle status (TC-INV-007: finding != evidence ready)
    const inv = mockDb.investigations[0];
    expect(inv.lifecycleStatus).toBe('FINALIZING_EVIDENCE');
    expect(inv.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
  });

  it('blocks Attempt 2 when reset verification fails even if reset returns HTTP 200 (fake reset gate)', async () => {
    resetShouldRestore = false; // reset endpoint returns 200, but readback balance will be dirty (50 instead of 100)
    let attemptCount = 0;

    const mockBrowserWorker = {
      executeAttempt: async (params: any): Promise<AttemptExecutionReceipt> => {
        attemptCount++;
        const obsMap = new Map();
        obsMap.set('assert-failure', {
          assertionId: 'assert-failure',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          status: 'AVAILABLE',
          elementCount: 1,
          pageUrl: serverUrl,
          observedAt: new Date().toISOString(),
        });
        return {
          investigationId: params.investigationId,
          attemptNumber: params.attemptNumber,
          actionsExecuted: [],
          assertionObservations: obsMap,
          captureCoverage: {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            hasVideoRecording: false,
            videoStatus: 'MISSING',
            hasConsoleLogs: false,
            consoleStatus: 'UNAVAILABLE',
            hasNetworkTrace: false,
            networkStatus: 'UNAVAILABLE',
            coverageComplete: false,
          },
          totalDurationMs: 200,
          completedCleanly: true,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      },
    } as unknown as PlaywrightBrowserWorker;

    const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

    const outcome = await controller.executeInvestigationPair({
      executionRequestId: execReqId,
      investigationId: invId,
      workerInstanceId: 'worker-01',
      epoch: 1,
    });

    expect(outcome.status).toBe('RESET_FAILED');
    expect(outcome.verdict).toBe('INCONCLUSIVE');
    // Attempt 2 MUST NOT have run!
    expect(attemptCount).toBe(1);

    // Verify DB records
    expect(mockDb.investigationAttempts).toHaveLength(1);
    expect(mockDb.resetReceipts).toHaveLength(1);
    expect(mockDb.resetReceipts[0].isVerifiedRestored).toBe(false);

    // Pair assessment must record INCONCLUSIVE
    expect(mockDb.pairAssessments[0].verdict).toBe('INCONCLUSIVE');
  });

  it('concludes NOT_REPRODUCED when both attempts show expected correct behavior', async () => {
    const mockBrowserWorker = {
      executeAttempt: async (params: any): Promise<AttemptExecutionReceipt> => {
        const obsMap = new Map();
        obsMap.set('assert-correct', {
          assertionId: 'assert-correct',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          status: 'AVAILABLE',
          elementCount: 1,
          pageUrl: serverUrl,
          observedAt: new Date().toISOString(),
        });
        obsMap.set('assert-failure', {
          assertionId: 'assert-failure',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          status: 'NOT_FOUND',
          elementCount: 0,
          pageUrl: serverUrl,
          observedAt: new Date().toISOString(),
        });
        return {
          investigationId: params.investigationId,
          attemptNumber: params.attemptNumber,
          actionsExecuted: [],
          assertionObservations: obsMap,
          captureCoverage: {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            hasVideoRecording: true,
            videoStatus: 'FINALIZED',
            hasConsoleLogs: true,
            consoleStatus: 'CAPTURED_WITH_ENTRIES',
            hasNetworkTrace: true,
            networkStatus: 'CAPTURED_WITH_REQUESTS',
            coverageComplete: true,
          },
          totalDurationMs: 300,
          completedCleanly: true,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      },
    } as unknown as PlaywrightBrowserWorker;

    const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

    const outcome = await controller.executeInvestigationPair({
      executionRequestId: execReqId,
      investigationId: invId,
      workerInstanceId: 'worker-01',
      epoch: 1,
    });

    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.verdict).toBe('NOT_REPRODUCED');
    expect(mockDb.pairAssessments[0].verdict).toBe('NOT_REPRODUCED');
  });
});
