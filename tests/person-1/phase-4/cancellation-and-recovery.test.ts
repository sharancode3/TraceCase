import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InvestigationClaimHandler } from '@/server/queue/investigation-claim-handler';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import { BrowserWorkerPort } from '@/server/services/ports';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase4TestDbMock } from './test-db-mock';

describe('P1-04: Cancellation, Revocation at Claim, and Recovery Boundaries', () => {
  let mockDb: Phase4TestDbMock;
  let leaseService: ExecutionLeaseService;
  let claimHandler: InvestigationClaimHandler;

  const invId = '11111111-2222-3333-4444-555555555555';
  const execReqId = '99999999-8888-7777-6666-555555555555';
  const targetId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const ownerId = 'usr-01';
  const planHash = 'b'.repeat(64);

  beforeEach(() => {
    mockDb = new Phase4TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);
    claimHandler = new InvestigationClaimHandler(leaseService, undefined, () => mockDb as any);

    // Seed investigation
    mockDb.investigations.push({
      id: invId,
      ownerId,
      targetId,
      reportId: 'rep-1',
      lifecycleStatus: 'QUEUED',
      reviewStatus: 'APPROVED',
      workflowRevision: 3,
      eventSequenceCounter: 2,
    });

    // Seed execution request
    mockDb.executionRequests.push({
      id: execReqId,
      investigationId: invId,
      planVersion: 1,
      planHash,
      approvalId: 'appr-1',
      requestedBy: ownerId,
      status: 'ADMITTED',
      fencingEpoch: null,
      workerInstanceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed active approval
    mockDb.planApprovals.push({
      id: 'appr-1',
      investigationId: invId,
      targetId,
      planVersion: 1,
      planHash,
      authorizedActorId: ownerId,
      maxActionTierPermitted: 'TIER_1_READ_ONLY',
      approvedBy: ownerId,
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    });

    // Seed target
    mockDb.targets.push({
      id: targetId,
      name: 'Demo App',
      baseUrl: 'http://localhost:3000',
      allowedOrigins: ['http://localhost:3000'],
      isSandbox: true,
      isSandboxVerified: true,
      environment: 'staging',
    });

    // Seed plan revision
    mockDb.experimentPlanRevisions.push({
      investigationId: invId,
      version: 1,
      planHash,
      planPayload: {
        id: 'plan-1',
        investigationId: invId,
        version: 1,
        targetId,
        targetUrl: 'http://localhost:3000',
        allowedOrigins: ['http://localhost:3000'],
        preconditions: [],
        steps: [],
        expectedCorrectBehavior: 'OK',
        reportedFailureSignature: 'Crash',
        assertions: [],
        maxAttempts: 2,
        maxDurationMs: 60000,
        requiresResetHook: false,
      },
      createdBy: ownerId,
      createdAt: new Date(),
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  it('cancels execution request when approval was revoked while queued', async () => {
    // Revoke approval before worker claims job
    mockDb.planApprovals[0].revokedAt = new Date();

    const result = await claimHandler.handleInvestigationExecution(
      {
        executionRequestId: execReqId,
        investigationId: invId,
        planVersion: 1,
        planHash,
      },
      'worker-node-1'
    );

    expect(result.status).toBe('APPROVAL_INVALID_AT_CLAIM');

    // Verify execution request was marked CANCELLED
    const req = mockDb.executionRequests[0];
    expect(req.status).toBe('CANCELLED');

    // Verify lease was cleanly released
    const lease = await leaseService.getCurrentLease();
    expect(lease?.leaseExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('cancels execution request when investigation was cancelled before worker claim', async () => {
    // Investigation cancelled by human operator
    mockDb.investigations[0].lifecycleStatus = 'CANCELLED';

    const result = await claimHandler.handleInvestigationExecution(
      {
        executionRequestId: execReqId,
        investigationId: invId,
        planVersion: 1,
        planHash,
      },
      'worker-node-1'
    );

    expect(result.status).toBe('INVESTIGATION_CANCELLED');
    const req = mockDb.executionRequests[0];
    expect(req.status).toBe('CANCELLED');
  });

  it('truthfully records unavailable status when default live browser worker is not yet implemented', async () => {
    const result = await claimHandler.handleInvestigationExecution(
      {
        executionRequestId: execReqId,
        investigationId: invId,
        planVersion: 1,
        planHash,
      },
      'worker-node-1'
    );

    expect(result.status).toBe('EXECUTOR_UNAVAILABLE');
    expect(result.reason).toContain('Playwright worker execution is scheduled for Stage 2');

    const req = mockDb.executionRequests[0];
    expect(req.status).toBe('FAILED');
    expect(req.fencingEpoch).toBe(1);
    expect(req.workerInstanceId).toBe('worker-node-1');
  });

  it('successfully executes when an injected mock BrowserWorkerPort is provided', async () => {
    const mockWorker: BrowserWorkerPort = {
      executeAttempt: async (params) => ({
        investigationId: params.investigationId,
        attemptNumber: params.attemptNumber,
        actionsExecuted: [],
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
        totalDurationMs: 1200,
        completedCleanly: true,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      }),
    };

    const handlerWithWorker = new InvestigationClaimHandler(leaseService, mockWorker, () => mockDb as any);

    const result = await handlerWithWorker.handleInvestigationExecution(
      {
        executionRequestId: execReqId,
        investigationId: invId,
        planVersion: 1,
        planHash,
      },
      'worker-node-1'
    );

    expect(result.status).toBe('ATTEMPT_1_EXECUTED');
    const req = mockDb.executionRequests[0];
    expect(req.status).toBe('ACTIVE');
  });
});
