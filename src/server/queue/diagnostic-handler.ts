import { eq } from 'drizzle-orm';
import { diagnosticRunsTable } from '@/server/db/schema';
import { getDb, DbClient } from '@/server/db';
import { ExecutionLeaseService } from './execution-lease.service';
import { DiagnosticJobData } from './types';
import { DiagnosticJobResult } from '@/contracts/execution';

export class DiagnosticJobHandler {
  constructor(
    private leaseService: ExecutionLeaseService,
    private dbProvider: () => DbClient = getDb
  ) {}

  async executeDiagnostic(
    data: DiagnosticJobData,
    workerInstanceId: string
  ): Promise<DiagnosticJobResult> {
    const db = this.dbProvider();
    const startTime = Date.now();

    // 1. Acquire global execution lease
    const lease = await this.leaseService.acquireGlobalLease({
      workerInstanceId,
      leaseTtlMs: 20000,
    });

    if (!lease.acquired) {
      throw new Error(
        `[DiagnosticJobHandler] Unable to acquire global execution lease: ${lease.reason} (holder: ${lease.currentHolder ?? 'none'})`
      );
    }

    const epoch = lease.epoch;

    // 2. Check for duplicate run record
    const [existing] = await db
      .select()
      .from(diagnosticRunsTable)
      .where(eq(diagnosticRunsTable.jobId, data.diagnosticId))
      .limit(1);

    if (existing && existing.status === 'COMPLETED') {
      // Idempotent duplicate: already completed
      await this.leaseService.releaseGlobalLease({ workerInstanceId, epoch });
      return {
        diagnosticId: data.diagnosticId,
        workerInstanceId: existing.workerInstanceId,
        ownershipEpoch: existing.fencingEpoch,
        durationMs: existing.completedAt ? existing.completedAt.getTime() - existing.startedAt.getTime() : 0,
        success: true,
        databaseTime: existing.completedAt ? existing.completedAt.toISOString() : undefined,
      };
    }

    if (!existing) {
      await db.insert(diagnosticRunsTable).values({
        jobId: data.diagnosticId,
        workerInstanceId,
        status: 'STARTED',
        fencingEpoch: epoch,
        startedAt: new Date(),
        details: { requestedBy: data.requestedBy || 'system' },
      });
    }

    try {
      // 3. Perform diagnostic checks
      const dbCheckTime = new Date().toISOString();
      const memoryUsage = process.memoryUsage();

      // 4. Assert fencing epoch before writing completion
      await this.leaseService.assertFencingEpoch({ workerInstanceId, epoch });

      const completedAt = new Date();
      await db
        .update(diagnosticRunsTable)
        .set({
          status: 'COMPLETED',
          completedAt,
          details: {
            dbCheckTime,
            memoryHeapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            completedBy: workerInstanceId,
          },
        })
        .where(eq(diagnosticRunsTable.jobId, data.diagnosticId));

      return {
        diagnosticId: data.diagnosticId,
        workerInstanceId,
        ownershipEpoch: epoch,
        durationMs: Date.now() - startTime,
        success: true,
        databaseTime: dbCheckTime,
      };
    } finally {
      // 5. Always release lease
      await this.leaseService.releaseGlobalLease({ workerInstanceId, epoch });
    }
  }
}
