import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TwoAttemptController } from '@/server/verification/two-attempt-controller';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import { TargetResetClient } from '@/server/verification/target-reset-client';
import type { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import type { AttemptExecutionReceipt } from '@/contracts/observations';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase7TestDbMock } from './test-db-mock';

describe('P1-07: Two-Attempt Controller Invariant Hardening & Gap Closures', () => {
  let mockDb: Phase7TestDbMock;
  let leaseService: ExecutionLeaseService;

  const invId = '00000000-1111-4111-8111-000000000001';
  const execReqId = '00000000-2222-4222-8222-000000000002';
  const targetId = '00000000-3333-4333-8333-000000000003';
  const ownerId = 'usr-person-1';
  const planHash = 'b'.repeat(64);

  beforeEach(async () => {
    mockDb = new Phase7TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);

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

    // Seed execution request for plan version 1
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

    // Seed target (no reset capability for simplicity in this unit test)
    mockDb.targets.push({
      id: targetId,
      name: 'Hardened Target',
      baseUrl: 'https://app.test.local',
      allowedOrigins: ['https://app.test.local'],
      isSandbox: true,
      isSandboxVerified: true,
      environment: 'development',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed valid plan revision
    mockDb.experimentPlanRevisions.push({
      investigationId: invId,
      version: 1,
      planHash,
      planPayload: {
        id: '00000000-4444-4444-8444-000000000004',
        investigationId: invId,
        version: 1,
        targetId,
        targetUrl: 'https://app.test.local',
        allowedOrigins: ['https://app.test.local'],
        preconditions: ['Target is reachable'],
        steps: [
          {
            stepIndex: 1,
            semanticAction: 'Click submit',
            toolKind: 'click_button',
            selector: '#btn-submit',
            tier: 'TIER_2_SAFE_INTERACTION',
            timeoutMs: 5000,
          },
        ],
        expectedCorrectBehavior: 'Submitted cleanly',
        reportedFailureSignature: 'Internal server error 500',
        assertions: [],
      },
    });

    // Seed active approval
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

    // Acquire global lease
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

  it('rejects execution when plan revision version or hash does not match execution request', async () => {
    // Tamper with plan revision hash
    mockDb.experimentPlanRevisions[0].planHash = 'f'.repeat(64);

    const mockBrowserWorker = {} as PlaywrightBrowserWorker;
    const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

    await expect(
      controller.executeInvestigationPair({
        executionRequestId: execReqId,
        investigationId: invId,
        workerInstanceId: 'worker-01',
        epoch: 1,
      })
    ).rejects.toThrow(/does not match execution request plan hash/);
  });

  it('halts execution immediately if human operator revoked approval prior to run', async () => {
    // Revoke the approval
    mockDb.planApprovals[0].revokedAt = new Date();

    const mockBrowserWorker = {} as PlaywrightBrowserWorker;
    const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

    await expect(
      controller.executeInvestigationPair({
        executionRequestId: execReqId,
        investigationId: invId,
        workerInstanceId: 'worker-01',
        epoch: 1,
      })
    ).rejects.toThrow(/approval has been revoked or is not active/);
  });

  it('marks attempt scopeAdhered=false when action receipts record scope violation errors', async () => {
    let observedScopeAdhered = true;

    const mockBrowserWorker = {
      executeAttempt: async (params: any): Promise<AttemptExecutionReceipt> => {
        return {
          investigationId: params.investigationId,
          attemptNumber: params.attemptNumber,
          actionsExecuted: [
            {
              stepIndex: 1,
              action: {
                stepIndex: 1,
                semanticAction: 'Navigate external',
                toolKind: 'navigate',
                tier: 'TIER_1_READ_ONLY',
                timeoutMs: 5000,
              },
              tier: 'TIER_1_READ_ONLY',
              status: 'FAILED',
              uncertainty: 'NONE',
              durationMs: 0,
              errorDetails: 'TargetScopeViolationError: Navigation to external site blocked by TargetNetworkGuard',
              dispatchedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ],
          assertionObservations: new Map(),
          captureCoverage: {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            hasVideoRecording: false,
            videoStatus: 'FINALIZED',
            hasConsoleLogs: false,
            consoleStatus: 'CAPTURED_EMPTY',
            hasNetworkTrace: false,
            networkStatus: 'CAPTURED_EMPTY',
            coverageComplete: false,
          },
          totalDurationMs: 100,
          completedCleanly: false,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      },
    } as unknown as PlaywrightBrowserWorker;

    const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

    await controller.executeInvestigationPair({
      executionRequestId: execReqId,
      investigationId: invId,
      workerInstanceId: 'worker-01',
      epoch: 1,
    });

    // Check saved attempt record
    expect(mockDb.investigationAttempts).toHaveLength(1);
    expect(mockDb.investigationAttempts[0].validity).toBe('INVALID');
    expect(mockDb.investigationAttempts[0].invalidityReason).toContain('Target scope violation');
  });

  it('emits INVESTIGATION_COMPLETED event matching live progress schema on conclusion', async () => {
    vi.spyOn(TargetResetClient, 'coordinateReset').mockResolvedValueOnce({
      id: 'receipt-1',
      targetId,
      investigationId: invId,
      attemptNumber: 2,
      transportSuccess: true,
      baselineEquivalent: true,
      isVerifiedRestored: true,
      readback: {
        targetId,
        expectedStateHash: 'hash-abc',
        observedStateHash: 'hash-abc',
        isEquivalent: true,
        discrepancies: [],
        checkedAt: new Date().toISOString(),
      },
      verifiedAt: new Date().toISOString(),
    });

    const mockBrowserWorker = {
      executeAttempt: async (params: any): Promise<AttemptExecutionReceipt> => {
        return {
          investigationId: params.investigationId,
          attemptNumber: params.attemptNumber,
          actionsExecuted: [],
          assertionObservations: new Map(),
          captureCoverage: {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            hasVideoRecording: true,
            videoStatus: 'FINALIZED',
            hasConsoleLogs: true,
            consoleStatus: 'CAPTURED_EMPTY',
            hasNetworkTrace: true,
            networkStatus: 'CAPTURED_EMPTY',
            coverageComplete: true,
          },
          totalDurationMs: 200,
          completedCleanly: true,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      },
    } as unknown as PlaywrightBrowserWorker;

    const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

    await controller.executeInvestigationPair({
      executionRequestId: execReqId,
      investigationId: invId,
      workerInstanceId: 'worker-01',
      epoch: 1,
    });

    const completionEvents = mockDb.investigationEvents.filter(
      (e) => e.eventType === 'INVESTIGATION_COMPLETED'
    );
    expect(completionEvents).toHaveLength(1);
    expect(completionEvents[0].payload.verdict).toBeDefined();
    expect(completionEvents[0].payload.attemptsCompleted).toBe(2);
  });
});
