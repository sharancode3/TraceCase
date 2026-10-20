import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { QueueDispatcherPort } from '@/server/services/ports';
import {
  executionRequestsTable,
  outboxMessagesTable,
  planApprovalsTable,
  investigationsTable,
  investigationEventsTable,
} from '@/server/db/schema';
import { getDb, DbClient } from '@/server/db';
import { QUEUE_INVESTIGATION_EXECUTION } from './types';
import { OutboxRelayService } from './outbox-relay.service';

export interface EnqueueResult {
  executionRequestId: string;
  jobId: string; // Alias for backward compatibility
  queuedAt: string;
}

export class TransactionalOutboxDispatcher implements QueueDispatcherPort {
  constructor(
    private relayService?: OutboxRelayService,
    private dbProvider: () => DbClient = getDb
  ) {}

  async enqueueInvestigation(params: {
    investigationId: string;
    planVersion: number;
    priority?: number;
  }): Promise<EnqueueResult> {
    const db = this.dbProvider();
    const now = new Date();

    // Execute the complete admission within an atomic transaction
    return await db.transaction(async (tx) => {
      // 1. Re-verify plan approval exists and is unrevoked
      const [approval] = await tx
        .select()
        .from(planApprovalsTable)
        .where(
          and(
            eq(planApprovalsTable.investigationId, params.investigationId),
            eq(planApprovalsTable.planVersion, params.planVersion),
            isNull(planApprovalsTable.revokedAt)
          )
        )
        .orderBy(desc(planApprovalsTable.approvedAt))
        .limit(1);

      if (!approval) {
        throw new Error(
          `[TransactionalOutboxDispatcher] Cannot enqueue: no active approval for investigation ${params.investigationId} v${params.planVersion}.`
        );
      }

      // Check approval expiration
      if (approval.expiresAt && approval.expiresAt.getTime() <= now.getTime()) {
        throw new Error(
          `[TransactionalOutboxDispatcher] Cannot enqueue: approval has expired at ${approval.expiresAt.toISOString()}.`
        );
      }

      const [inv] = await tx
        .select()
        .from(investigationsTable)
        .where(eq(investigationsTable.id, params.investigationId))
        .limit(1);

      if (!inv) {
        throw new Error(`[TransactionalOutboxDispatcher] Investigation ${params.investigationId} not found.`);
      }

      // 2. Insert execution request record
      const [executionRequest] = await tx
        .insert(executionRequestsTable)
        .values({
          investigationId: params.investigationId,
          planVersion: params.planVersion,
          planHash: approval.planHash,
          approvalId: approval.id,
          requestedBy: inv.ownerId,
          status: 'ADMITTED',
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // 3. Insert outbox message
      await tx.insert(outboxMessagesTable).values({
        queueName: QUEUE_INVESTIGATION_EXECUTION,
        payload: {
          executionRequestId: executionRequest.id,
          investigationId: params.investigationId,
          planVersion: params.planVersion,
          planHash: approval.planHash,
          requestedBy: inv.ownerId,
        },
        singletonKey: params.investigationId,
        status: 'PENDING',
        createdAt: now,
      });

      // 4. Monotonically increment event counter & insert EXECUTION_ADMITTED event
      let nextSeq = 1;
      try {
        const [updatedInv] = await tx
          .update(investigationsTable)
          .set({
            lifecycleStatus: 'QUEUED',
            eventSequenceCounter: sql`${investigationsTable.eventSequenceCounter} + 1`,
            updatedAt: now,
          })
          .where(eq(investigationsTable.id, params.investigationId))
          .returning({ counter: investigationsTable.eventSequenceCounter });

        if (updatedInv && typeof updatedInv.counter === 'number') {
          nextSeq = updatedInv.counter;
        } else {
          nextSeq = (inv.eventSequenceCounter || 0) + 1;
        }
      } catch {
        nextSeq = (inv.eventSequenceCounter || 0) + 1;
      }

      await tx.insert(investigationEventsTable).values({
        investigationId: params.investigationId,
        sequenceIndex: nextSeq,
        eventType: 'EXECUTION_ADMITTED',
        payload: {
          executionRequestId: executionRequest.id,
          planVersion: params.planVersion,
          planHash: approval.planHash,
        },
        emittedAt: now,
      });

      // Optionally trigger immediate relay pass if relay service is registered
      if (this.relayService) {
        setTimeout(() => {
          this.relayService?.relayPendingMessages().catch(() => {});
        }, 0);
      }

      return {
        executionRequestId: executionRequest.id,
        jobId: executionRequest.id, // Backward-compatibility alias
        queuedAt: now.toISOString(),
      };
    });
  }
}
