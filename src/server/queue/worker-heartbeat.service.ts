import { eq, gt } from 'drizzle-orm';
import { getDb, DbClient } from '@/server/db';
import { workerHeartbeatsTable } from '@/server/db/schema';

export interface WorkerHeartbeatRecord {
  workerId: string;
  status: 'ACTIVE' | 'DRAINING' | 'OFFLINE';
  activeJobs: number;
  hostname?: string | null;
  pid?: number | null;
  lastHeartbeatAt: Date;
  startedAt: Date;
}

export class WorkerHeartbeatService {
  constructor(private dbProvider: () => DbClient = getDb) {}

  /**
   * Updates or registers worker heartbeat in the database.
   */
  async recordHeartbeat(params: {
    workerId: string;
    status?: 'ACTIVE' | 'DRAINING' | 'OFFLINE';
    activeJobs?: number;
    hostname?: string;
    pid?: number;
  }): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();

    const [existing] = await db
      .select({ workerId: workerHeartbeatsTable.workerId })
      .from(workerHeartbeatsTable)
      .where(eq(workerHeartbeatsTable.workerId, params.workerId))
      .limit(1);

    if (existing) {
      await db
        .update(workerHeartbeatsTable)
        .set({
          status: params.status ?? 'ACTIVE',
          activeJobs: params.activeJobs ?? 0,
          hostname: params.hostname,
          pid: params.pid,
          lastHeartbeatAt: now,
        })
        .where(eq(workerHeartbeatsTable.workerId, params.workerId));
    } else {
      await db.insert(workerHeartbeatsTable).values({
        workerId: params.workerId,
        status: params.status ?? 'ACTIVE',
        activeJobs: params.activeJobs ?? 0,
        hostname: params.hostname,
        pid: params.pid,
        lastHeartbeatAt: now,
        startedAt: now,
      });
    }
  }

  /**
   * Marks a worker as cleanly stopped / offline.
   */
  async recordShutdown(workerId: string): Promise<void> {
    const db = this.dbProvider();
    await db
      .update(workerHeartbeatsTable)
      .set({
        status: 'OFFLINE',
        activeJobs: 0,
        lastHeartbeatAt: new Date(),
      })
      .where(eq(workerHeartbeatsTable.workerId, workerId));
  }

  /**
   * Probes whether at least one persistent worker has reported a fresh heartbeat.
   */
  async isAnyWorkerActive(maxAgeMs: number = 60_000): Promise<{
    active: boolean;
    activeWorkerCount: number;
    drainingWorkerCount: number;
    freshestHeartbeatAgeMs: number | null;
  }> {
    const db = this.dbProvider();
    const cutoff = new Date(Date.now() - maxAgeMs);

    const rows = await db
      .select()
      .from(workerHeartbeatsTable)
      .where(gt(workerHeartbeatsTable.lastHeartbeatAt, cutoff));

    const activeWorkers = rows.filter((r) => r.status === 'ACTIVE');
    const drainingWorkers = rows.filter((r) => r.status === 'DRAINING');

    let freshestAgeMs: number | null = null;
    if (rows.length > 0) {
      const mostRecentTime = Math.max(...rows.map((r) => r.lastHeartbeatAt.getTime()));
      freshestAgeMs = Math.max(0, Date.now() - mostRecentTime);
    }

    return {
      active: activeWorkers.length > 0,
      activeWorkerCount: activeWorkers.length,
      drainingWorkerCount: drainingWorkers.length,
      freshestHeartbeatAgeMs: freshestAgeMs,
    };
  }
}

export const workerHeartbeatService = new WorkerHeartbeatService();
