import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TransactionalOutboxDispatcher } from '@/server/queue/outbox-dispatcher';
import { OutboxRelayService } from '@/server/queue/outbox-relay.service';
import { InMemoryQueueAdapter } from '@/server/queue/queue-adapter';
import { QUEUE_INVESTIGATION_EXECUTION } from '@/server/queue/types';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase4TestDbMock } from './test-db-mock';

describe('P1-04: Transactional Outbox and Queue Relay Pipeline', () => {
  let mockDb: Phase4TestDbMock;
  let queueAdapter: InMemoryQueueAdapter;
  let relayService: OutboxRelayService;
  let dispatcher: TransactionalOutboxDispatcher;

  const invId = '11111111-2222-3333-4444-555555555555';
  const targetId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const ownerId = '99999999-8888-7777-6666-555555555555';
  const planHash = 'a'.repeat(64);

  beforeEach(async () => {
    mockDb = new Phase4TestDbMock();
    setDbInstanceForTesting(mockDb as any);

    queueAdapter = new InMemoryQueueAdapter();
    await queueAdapter.start();

    relayService = new OutboxRelayService(queueAdapter, () => mockDb as any);
    dispatcher = new TransactionalOutboxDispatcher(relayService, () => mockDb as any);

    // Seed investigation
    mockDb.investigations.push({
      id: invId,
      ownerId,
      targetId,
      reportId: 'rep-1',
      lifecycleStatus: 'INITIALIZED',
      reviewStatus: 'APPROVED',
      workflowRevision: 1,
      eventSequenceCounter: 0,
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
  });

  afterEach(async () => {
    await queueAdapter.stop();
    resetDbInstanceForTesting();
  });

  it('enqueues an investigation by creating execution request and pending outbox record', async () => {
    const dispatchResult = await dispatcher.enqueueInvestigation({
      investigationId: invId,
      planVersion: 1,
    });

    expect(dispatchResult.jobId).toBeDefined();
    expect(dispatchResult.queuedAt).toBeDefined();

    // Verify execution request
    expect(mockDb.executionRequests.length).toBe(1);
    const execReq = mockDb.executionRequests[0];
    expect(execReq.investigationId).toBe(invId);
    expect(execReq.planVersion).toBe(1);
    expect(execReq.planHash).toBe(planHash);
    expect(execReq.status).toBe('ADMITTED');

    // Verify outbox message
    expect(mockDb.outboxMessages.length).toBe(1);
    const outboxMsg = mockDb.outboxMessages[0];
    expect(outboxMsg.queueName).toBe(QUEUE_INVESTIGATION_EXECUTION);
    expect(outboxMsg.status).toBe('PENDING');
    expect(outboxMsg.singletonKey).toBe(invId);
    expect(outboxMsg.payload.executionRequestId).toBe(execReq.id);
  });

  it('rejects enqueue if no active approval exists for plan version', async () => {
    // Revoke approval
    mockDb.planApprovals[0].revokedAt = new Date();

    await expect(
      dispatcher.enqueueInvestigation({
        investigationId: invId,
        planVersion: 1,
      })
    ).rejects.toThrow(/no active approval/);
  });

  it('relays pending outbox messages to queue adapter and marks them SENT', async () => {
    // Enqueue message
    await dispatcher.enqueueInvestigation({
      investigationId: invId,
      planVersion: 1,
    });

    expect(mockDb.outboxMessages[0].status).toBe('PENDING');

    // Run relay
    const relayedCount = await relayService.relayPendingMessages();
    expect(relayedCount).toBe(1);

    expect(mockDb.outboxMessages[0].status).toBe('SENT');
    expect(mockDb.outboxMessages[0].sentAt).toBeDefined();
  });

  it('increments attempts on queue failure and marks FAILED after 5 retries', async () => {
    // Create failing queue adapter
    const failingQueue: any = {
      send: async () => {
        throw new Error('Queue connection refused');
      },
    };
    const failingRelay = new OutboxRelayService(failingQueue, () => mockDb as any);

    // Seed outbox message with 4 existing attempts
    mockDb.outboxMessages.push({
      id: 'outbox-fail',
      queueName: QUEUE_INVESTIGATION_EXECUTION,
      payload: { test: true },
      singletonKey: 'fail-1',
      status: 'PENDING',
      attempts: 4,
      errorMessage: null,
      createdAt: new Date(),
    });

    const relayedCount = await failingRelay.relayPendingMessages();
    expect(relayedCount).toBe(0);

    const msg = mockDb.outboxMessages[0];
    expect(msg.attempts).toBe(5);
    expect(msg.status).toBe('FAILED');
    expect(msg.errorMessage).toContain('Queue connection refused');
  });
});
