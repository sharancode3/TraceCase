import { eq, and } from 'drizzle-orm';
import { globalExecutionLeasesTable } from '@/server/db/schema';
import { getDb, DbClient } from '@/server/db';

export const GLOBAL_SLOT_NAME = 'GLOBAL_SLOT_SINGLETON';
export const DEFAULT_LEASE_TTL_MS = 30_000; // 30 seconds

export class StaleWorkerFencingError extends Error {
  constructor(
    public readonly workerInstanceId: string,
    public readonly expectedEpoch: number,
    public readonly currentEpoch?: number,
    public readonly reason: string = 'Fencing epoch validation failed.'
  ) {
    super(
      `[TraceCase] Stale worker write rejected: worker '${workerInstanceId}' with epoch ${expectedEpoch} is fenced out (current epoch: ${currentEpoch ?? 'none'}). Reason: ${reason}`
    );
    this.name = 'StaleWorkerFencingError';
  }
}

export type LeaseAcquireResult =
  | { acquired: true; epoch: number; leaseExpiresAt: Date }
  | {
      acquired: false;
      reason: 'SLOT_OCCUPIED' | 'RACE_LOST' | 'SLOT_QUARANTINED';
      currentHolder?: string;
      expiresAt?: Date;
      epoch?: number;
      quarantineReason?: string | null;
    };

export class ExecutionLeaseService {
  constructor(private dbProvider: () => DbClient = getDb) {}

  /**
   * Attempts to acquire the global execution slot singleton.
   * Enforces strict single active execution across all worker nodes.
   * Bounded retry on concurrent initial insert race.
   */
  async acquireGlobalLease(params: {
    workerInstanceId: string;
    executionRequestId?: string | null;
    investigationId?: string | null;
    leaseTtlMs?: number;
  }): Promise<LeaseAcquireResult> {
    const db = this.dbProvider();
    const ttl = params.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;

    for (let attempt = 0; attempt < 3; attempt++) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl);

      // Read current lease
      const [existing] = await db
        .select()
        .from(globalExecutionLeasesTable)
        .where(eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME))
        .limit(1);

      if (!existing) {
        // First time initialization: insert epoch 1
        try {
          const [inserted] = await db
            .insert(globalExecutionLeasesTable)
            .values({
              slotName: GLOBAL_SLOT_NAME,
              workerInstanceId: params.workerInstanceId,
              executionRequestId: params.executionRequestId ?? null,
              investigationId: params.investigationId ?? null,
              ownershipEpoch: 1,
              leaseExpiresAt: expiresAt,
              acquiredAt: now,
              updatedAt: now,
            })
            .returning();

          return {
            acquired: true,
            epoch: inserted.ownershipEpoch,
            leaseExpiresAt: inserted.leaseExpiresAt,
          };
        } catch {
          // Concurrent race on initial insert, retry bounded loop
          continue;
        }
      }

      if (existing.isQuarantined) {
        return {
          acquired: false,
          reason: 'SLOT_QUARANTINED',
          quarantineReason: existing.quarantineReason,
          epoch: existing.ownershipEpoch,
          expiresAt: existing.leaseExpiresAt,
        };
      }

      const isExpired = existing.leaseExpiresAt.getTime() <= now.getTime();
      const isSameExecution = Boolean(
        existing.executionRequestId &&
          params.executionRequestId &&
          existing.executionRequestId === params.executionRequestId &&
          existing.workerInstanceId === params.workerInstanceId
      );

      // Disallow re-acquiring for a different job while slot is still unexpired
      if (!isExpired && !isSameExecution) {
        return {
          acquired: false,
          reason: 'SLOT_OCCUPIED',
          currentHolder: existing.workerInstanceId,
          expiresAt: existing.leaseExpiresAt,
          epoch: existing.ownershipEpoch,
        };
      }

      // Acquire or renew expired/held slot with monotonic epoch increment
      const nextEpoch = existing.ownershipEpoch + 1;
      const [updated] = await db
        .update(globalExecutionLeasesTable)
        .set({
          workerInstanceId: params.workerInstanceId,
          executionRequestId: params.executionRequestId ?? null,
          investigationId: params.investigationId ?? null,
          ownershipEpoch: nextEpoch,
          leaseExpiresAt: expiresAt,
          acquiredAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME),
            eq(globalExecutionLeasesTable.ownershipEpoch, existing.ownershipEpoch)
          )
        )
        .returning();

      if (!updated) {
        return {
          acquired: false,
          reason: 'RACE_LOST',
          epoch: existing.ownershipEpoch,
        };
      }

      return {
        acquired: true,
        epoch: updated.ownershipEpoch,
        leaseExpiresAt: updated.leaseExpiresAt,
      };
    }

    return {
      acquired: false,
      reason: 'RACE_LOST',
    };
  }

  /**
   * Renews the lease heartbeat if the worker still holds the valid fencing epoch.
   * Strictly rejects renewal if the lease has already expired.
   */
  async renewGlobalLease(params: {
    workerInstanceId: string;
    epoch: number;
    leaseTtlMs?: number;
  }): Promise<boolean> {
    const db = this.dbProvider();
    const now = new Date();
    const ttl = params.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    const expiresAt = new Date(now.getTime() + ttl);

    // 1. Re-read lease to ensure it hasn't expired already
    const [existing] = await db
      .select()
      .from(globalExecutionLeasesTable)
      .where(eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME))
      .limit(1);

    if (
      !existing ||
      existing.ownershipEpoch !== params.epoch ||
      existing.workerInstanceId !== params.workerInstanceId ||
      existing.leaseExpiresAt.getTime() <= now.getTime()
    ) {
      return false; // Already expired or fenced out!
    }

    // 2. Perform conditional update
    const [updated] = await db
      .update(globalExecutionLeasesTable)
      .set({
        leaseExpiresAt: expiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME),
          eq(globalExecutionLeasesTable.workerInstanceId, params.workerInstanceId),
          eq(globalExecutionLeasesTable.ownershipEpoch, params.epoch)
        )
      )
      .returning();

    return Boolean(updated);
  }

  /**
   * Releases the lease on graceful completion or cancellation.
   */
  async releaseGlobalLease(params: {
    workerInstanceId: string;
    epoch: number;
  }): Promise<boolean> {
    const db = this.dbProvider();
    const now = new Date();

    const [updated] = await db
      .update(globalExecutionLeasesTable)
      .set({
        leaseExpiresAt: new Date(0), // Expire immediately
        updatedAt: now,
      })
      .where(
        and(
          eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME),
          eq(globalExecutionLeasesTable.workerInstanceId, params.workerInstanceId),
          eq(globalExecutionLeasesTable.ownershipEpoch, params.epoch)
        )
      )
      .returning();

    return Boolean(updated);
  }

  /**
   * Quarantines the lease if an execution outcome is uncertain or a browser crash occurs.
   * Keeps the slot occupied so another worker does not blindly replay potentially mutating actions.
   * Persists a durable quarantine state that requires administrative resolution.
   */
  async quarantineLease(params: {
    workerInstanceId: string;
    epoch: number;
    quarantineMs?: number;
    reason?: string;
  }): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();
    const quarantineDuration = params.quarantineMs ?? 60 * 60 * 1000; // 1 hour quarantine
    const expiresAt = new Date(now.getTime() + quarantineDuration);

    await db
      .update(globalExecutionLeasesTable)
      .set({
        isQuarantined: true,
        quarantineReason: params.reason || 'MUTATION_UNCERTAIN',
        quarantinedAt: now,
        quarantinedByWorker: params.workerInstanceId,
        leaseExpiresAt: expiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME),
          eq(globalExecutionLeasesTable.workerInstanceId, params.workerInstanceId),
          eq(globalExecutionLeasesTable.ownershipEpoch, params.epoch)
        )
      );
  }

  /**
   * Clears the durable quarantine status following manual administrative inspection.
   */
  async clearQuarantine(params: { clearedBy: string }): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();

    await db
      .update(globalExecutionLeasesTable)
      .set({
        isQuarantined: false,
        quarantineClearedAt: now,
        quarantineClearedBy: params.clearedBy,
        updatedAt: now,
      })
      .where(eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME));
  }

  /**
   * Verifies that the worker still holds the current unexpired lease epoch before performing a fenced write.
   * Throws StaleWorkerFencingError if the worker has been fenced out.
   */
  async assertFencingEpoch(params: {
    workerInstanceId: string;
    epoch: number;
  }): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();

    const [current] = await db
      .select()
      .from(globalExecutionLeasesTable)
      .where(eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME))
      .limit(1);

    if (!current) {
      throw new StaleWorkerFencingError(params.workerInstanceId, params.epoch, undefined, 'No lease record exists.');
    }

    if (current.ownershipEpoch !== params.epoch) {
      throw new StaleWorkerFencingError(
        params.workerInstanceId,
        params.epoch,
        current.ownershipEpoch,
        `Epoch mismatch: current active epoch is ${current.ownershipEpoch}`
      );
    }

    if (current.workerInstanceId !== params.workerInstanceId) {
      throw new StaleWorkerFencingError(
        params.workerInstanceId,
        params.epoch,
        current.ownershipEpoch,
        `Worker mismatch: current holder is '${current.workerInstanceId}'`
      );
    }

    if (current.leaseExpiresAt.getTime() <= now.getTime()) {
      throw new StaleWorkerFencingError(
        params.workerInstanceId,
        params.epoch,
        current.ownershipEpoch,
        `Lease expired at ${current.leaseExpiresAt.toISOString()} (current: ${now.toISOString()})`
      );
    }
  }

  /**
   * Executes a database mutation inside a short transaction guarded by an atomic fence check.
   */
  async executeFencedMutation<T>(params: {
    workerInstanceId: string;
    epoch: number;
    mutation: (tx: DbClient) => Promise<T>;
  }): Promise<T> {
    const db = this.dbProvider();
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [current] = await tx
        .select()
        .from(globalExecutionLeasesTable)
        .where(eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME))
        .limit(1);

      if (
        !current ||
        current.isQuarantined ||
        current.ownershipEpoch !== params.epoch ||
        current.workerInstanceId !== params.workerInstanceId ||
        current.leaseExpiresAt.getTime() <= now.getTime()
      ) {
        throw new StaleWorkerFencingError(
          params.workerInstanceId,
          params.epoch,
          current?.ownershipEpoch,
          current?.isQuarantined
            ? 'Execution slot is quarantined.'
            : 'Fencing epoch invalidated inside transaction.'
        );
      }

      return await params.mutation(tx as unknown as DbClient);
    });
  }

  /**
   * Returns current lease information without modifying state.
   */
  async getCurrentLease() {
    const db = this.dbProvider();
    const [current] = await db
      .select()
      .from(globalExecutionLeasesTable)
      .where(eq(globalExecutionLeasesTable.slotName, GLOBAL_SLOT_NAME))
      .limit(1);

    return current || null;
  }
}

export const executionLeaseService = new ExecutionLeaseService();
