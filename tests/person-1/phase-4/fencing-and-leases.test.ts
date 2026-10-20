import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExecutionLeaseService, StaleWorkerFencingError } from '@/server/queue/execution-lease.service';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase4TestDbMock } from './test-db-mock';

describe('P1-04: Global Execution Lease and Monotonic Fencing Epochs', () => {
  let mockDb: Phase4TestDbMock;
  let leaseService: ExecutionLeaseService;

  beforeEach(() => {
    mockDb = new Phase4TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  it('allows worker-1 to acquire initial lease at epoch 1', async () => {
    const result = await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-node-1',
      leaseTtlMs: 30000,
    });

    expect(result.acquired).toBe(true);
    if (result.acquired) {
      expect(result.epoch).toBe(1);
      expect(result.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now());
    }

    const current = await leaseService.getCurrentLease();
    expect(current?.workerInstanceId).toBe('worker-node-1');
    expect(current?.ownershipEpoch).toBe(1);
  });

  it('rejects worker-2 when lease is actively held by worker-1 (SLOT_OCCUPIED)', async () => {
    await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-node-1',
      leaseTtlMs: 30000,
    });

    const result = await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-node-2',
      leaseTtlMs: 30000,
    });

    expect(result.acquired).toBe(false);
    if (!result.acquired) {
      expect(result.reason).toBe('SLOT_OCCUPIED');
      expect(result.currentHolder).toBe('worker-node-1');
      expect(result.epoch).toBe(1);
    }
  });

  it('allows worker-1 to renew heartbeat using the valid fencing epoch', async () => {
    const acquireResult = await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-node-1',
      leaseTtlMs: 10000,
    });
    expect(acquireResult.acquired).toBe(true);

    const renewed = await leaseService.renewGlobalLease({
      workerInstanceId: 'worker-node-1',
      epoch: 1,
      leaseTtlMs: 20000,
    });

    expect(renewed).toBe(true);
  });

  it('fails renewal if epoch does not match', async () => {
    await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-node-1',
      leaseTtlMs: 10000,
    });

    const renewed = await leaseService.renewGlobalLease({
      workerInstanceId: 'worker-node-1',
      epoch: 999, // Stale epoch
      leaseTtlMs: 20000,
    });

    expect(renewed).toBe(false);
  });

  it('allows worker-2 to take over expired lease and increments epoch monotonically', async () => {
    // Seed expired lease for worker-1 at epoch 3
    mockDb.globalExecutionLeases.push({
      slotName: 'GLOBAL_SLOT_SINGLETON',
      workerInstanceId: 'worker-node-1',
      ownershipEpoch: 3,
      leaseExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      acquiredAt: new Date(Date.now() - 35000),
      updatedAt: new Date(Date.now() - 5000),
    });

    const result = await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-node-2',
      leaseTtlMs: 30000,
    });

    expect(result.acquired).toBe(true);
    if (result.acquired) {
      expect(result.epoch).toBe(4); // Incremented from 3 to 4
    }

    const current = await leaseService.getCurrentLease();
    expect(current?.workerInstanceId).toBe('worker-node-2');
    expect(current?.ownershipEpoch).toBe(4);
  });

  it('strictly rejects stale worker write when asserting fencing epoch', async () => {
    // Active lease held by worker-2 at epoch 4
    mockDb.globalExecutionLeases.push({
      slotName: 'GLOBAL_SLOT_SINGLETON',
      workerInstanceId: 'worker-node-2',
      ownershipEpoch: 4,
      leaseExpiresAt: new Date(Date.now() + 20000),
      acquiredAt: new Date(),
      updatedAt: new Date(),
    });

    // Worker-1 tries to assert its old epoch 3
    await expect(
      leaseService.assertFencingEpoch({
        workerInstanceId: 'worker-node-1',
        epoch: 3,
      })
    ).rejects.toThrow(StaleWorkerFencingError);
  });

  it('releases lease cleanly on task completion', async () => {
    await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-node-1',
      leaseTtlMs: 30000,
    });

    const released = await leaseService.releaseGlobalLease({
      workerInstanceId: 'worker-node-1',
      epoch: 1,
    });

    expect(released).toBe(true);
    const current = await leaseService.getCurrentLease();
    expect(current?.leaseExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
