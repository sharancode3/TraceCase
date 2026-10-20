import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestigationClaimHandler } from '@/server/queue/investigation-claim-handler';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import type { BrowserWorkerPort } from '@/server/services/ports';
import type { AttemptExecutionReceipt } from '@/contracts/observations';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { SafeTargetProfile } from '@/contracts/targets';

describe('P1-05: Mutation Uncertainty Preservation & Lease Quarantine', () => {
  let mockLeaseService: any;
  let mockBrowserWorker: any;
  let mockDb: any;
  let handler: InvestigationClaimHandler;

  const validPlan: AuthoritativeExperimentPlan = {
    id: '33333333-3333-4333-8333-333333333333',
    investigationId: '44444444-4444-4444-8444-444444444444',
    version: 1,
    targetId: '55555555-5555-4555-8555-555555555555',
    targetUrl: 'https://staging.testapp.com/dashboard',
    allowedOrigins: ['https://staging.testapp.com'],
    preconditions: ['User is logged in'],
    steps: [
      {
        stepIndex: 1,
        semanticAction: 'Click submit order button',
        toolKind: 'click_button',
        selector: '#order-btn',
        tier: 'TIER_3_MUTATING_INTERACTION',
        timeoutMs: 5000,
      },
    ],
    expectedCorrectBehavior: 'Order created',
    reportedFailureSignature: 'Order error',
    assertions: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        description: 'Order confirmed in DOM',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: '#order-success',
        operator: 'EXISTS',
        settlingPoint: 'AFTER_NETWORK_IDLE',
      },
    ],
    maxAttempts: 2,
    maxDurationMs: 60000,
    requiresResetHook: false,
    planHash: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
  };

  const safeTarget = {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Test App',
    baseUrl: 'https://staging.testapp.com',
    allowedOrigins: ['https://staging.testapp.com'],
    isSandboxVerified: true,
    environment: 'staging',
    fixtureResetEndpoint: null,
    testAccountRef: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockLeaseService = {
      acquireGlobalLease: vi.fn().mockResolvedValue({ acquired: true, epoch: 5 }),
      assertFencingEpoch: vi.fn().mockResolvedValue(true),
      renewGlobalLease: vi.fn().mockResolvedValue(true),
      releaseGlobalLease: vi.fn().mockResolvedValue(true),
      quarantineLease: vi.fn().mockResolvedValue(true),
    };

    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              return [
                {
                  id: 'exec-1',
                  status: 'ADMITTED',
                  planVersion: 1,
                  planHash: 'a'.repeat(64),
                },
              ];
            }),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue([
                {
                  id: 'appr-1',
                  planHash: 'a'.repeat(64),
                  expiresAt: new Date(Date.now() + 3600000),
                },
              ]),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'updated' }]),
        }),
      }),
    };
  });

  it('triggers lease quarantine and sets request to FAILED when execution experiences MUTATION_UNCERTAIN', async () => {
    const uncertainReceipt: AttemptExecutionReceipt = {
      investigationId: '44444444-4444-4444-8444-444444444444',
      attemptNumber: 1,
      actionsExecuted: [
        {
          stepIndex: 1,
          action: validPlan.steps[0],
          tier: 'TIER_3_MUTATING_INTERACTION',
          status: 'TIMED_OUT',
          durationMs: 5000,
          uncertainty: 'MUTATION_UNCERTAIN',
          errorDetails: 'Timeout waiting for response after click dispatch',
          dispatchedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      captureCoverage: {
        investigationId: '44444444-4444-4444-8444-444444444444',
        attemptNumber: 1,
        hasVideoRecording: true,
        videoStatus: 'FINALIZED',
        hasConsoleLogs: true,
        consoleStatus: 'CAPTURED_WITH_ENTRIES',
        hasNetworkTrace: true,
        networkStatus: 'CAPTURED_WITH_REQUESTS',
        coverageComplete: true,
      },
      totalDurationMs: 5100,
      completedCleanly: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };

    mockBrowserWorker = {
      executeAttempt: vi.fn().mockResolvedValue(uncertainReceipt),
    };

    // Mock DB queries for plan and target
    let callCount = 0;
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          return {
            limit: vi.fn().mockImplementation(() => {
              if (callCount === 1) {
                // req
                return [{ id: 'exec-1', status: 'ADMITTED' }];
              }
              if (callCount === 2) {
                // inv
                return [{ id: '44444444-4444-4444-8444-444444444444', lifecycleStatus: 'QUEUED' }];
              }
              if (callCount === 4) {
                // plan revision
                return [{ planPayload: validPlan }];
              }
              if (callCount === 5) {
                // target
                return [safeTarget];
              }
              return [];
            }),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue([
                {
                  id: 'appr-1',
                  planHash: 'a'.repeat(64),
                  expiresAt: new Date(Date.now() + 3600000),
                },
              ]),
            }),
          };
        }),
      }),
    });

    handler = new InvestigationClaimHandler(
      mockLeaseService as unknown as ExecutionLeaseService,
      mockBrowserWorker,
      (() => mockDb) as any
    );

    const outcome = await handler.handleInvestigationExecution(
      {
        executionRequestId: 'exec-1',
        investigationId: '44444444-4444-4444-8444-444444444444',
        planVersion: 1,
        planHash: 'a'.repeat(64),
      },
      'worker-instance-1'
    );

    expect(outcome.status).toBe('MUTATION_UNCERTAIN');
    // Verify quarantine was called
    expect(mockLeaseService.quarantineLease).toHaveBeenCalledWith(
      expect.objectContaining({
        workerInstanceId: 'worker-instance-1',
        epoch: 5,
        quarantineMs: 3600000,
      })
    );
    // Lease must NOT have been released normally
    expect(mockLeaseService.releaseGlobalLease).not.toHaveBeenCalled();
  });
});
