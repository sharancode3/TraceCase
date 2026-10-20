import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiagnosticJobHandler } from '@/server/queue/diagnostic-handler';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase4TestDbMock } from './test-db-mock';

describe('P1-04: Harmless System Diagnostic Job Execution', () => {
  let mockDb: Phase4TestDbMock;
  let leaseService: ExecutionLeaseService;
  let diagnosticHandler: DiagnosticJobHandler;

  beforeEach(() => {
    mockDb = new Phase4TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);
    diagnosticHandler = new DiagnosticJobHandler(leaseService, () => mockDb as any);
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  it('claims and completes diagnostic job with lease acquisition and receipt recording', async () => {
    const diagnosticId = '11111111-2222-3333-4444-555555555555';
    const workerInstanceId = 'test-worker-01';

    const result = await diagnosticHandler.executeDiagnostic(
      {
        diagnosticId,
        submittedAt: new Date().toISOString(),
        requestedBy: 'operator-test',
      },
      workerInstanceId
    );

    expect(result.success).toBe(true);
    expect(result.diagnosticId).toBe(diagnosticId);
    expect(result.workerInstanceId).toBe(workerInstanceId);
    expect(result.ownershipEpoch).toBe(1);

    // Verify diagnostic run was persisted in table
    expect(mockDb.diagnosticRuns.length).toBe(1);
    const run = mockDb.diagnosticRuns[0];
    expect(run.jobId).toBe(diagnosticId);
    expect(run.status).toBe('COMPLETED');
    expect(run.fencingEpoch).toBe(1);
    expect(run.completedAt).toBeDefined();

    // Verify lease was cleanly released
    const lease = await leaseService.getCurrentLease();
    expect(lease?.leaseExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('idempotently handles duplicate delivery of an already completed diagnostic run', async () => {
    const diagnosticId = '11111111-2222-3333-4444-555555555555';
    const workerInstanceId = 'test-worker-01';

    // First execution
    const firstResult = await diagnosticHandler.executeDiagnostic(
      {
        diagnosticId,
        submittedAt: new Date().toISOString(),
      },
      workerInstanceId
    );
    expect(firstResult.success).toBe(true);

    // Duplicate execution
    const duplicateResult = await diagnosticHandler.executeDiagnostic(
      {
        diagnosticId,
        submittedAt: new Date().toISOString(),
      },
      'test-worker-02'
    );

    expect(duplicateResult.success).toBe(true);
    expect(duplicateResult.diagnosticId).toBe(diagnosticId);
    expect(mockDb.diagnosticRuns.length).toBe(1); // No duplicate record inserted
  });

  it('rejects execution if global lease cannot be acquired due to active slot occupancy', async () => {
    // Occupy slot with another worker
    await leaseService.acquireGlobalLease({
      workerInstanceId: 'active-other-worker',
      leaseTtlMs: 30000,
    });

    await expect(
      diagnosticHandler.executeDiagnostic(
        {
          diagnosticId: '22222222-3333-4444-5555-666666666666',
          submittedAt: new Date().toISOString(),
        },
        'test-worker-01'
      )
    ).rejects.toThrow(/Unable to acquire global execution lease: SLOT_OCCUPIED/);
  });
});
