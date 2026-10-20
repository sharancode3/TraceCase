import { eq, and, sql } from 'drizzle-orm';
import { outboxMessagesTable } from '@/server/db/schema';
import { getDb, DbClient } from '@/server/db';
import { QueueAdapter } from './types';

export class OutboxRelayService {
  private isRelaying = false;

  constructor(
    private queueAdapter: QueueAdapter,
    private dbProvider: () => DbClient = getDb
  ) {}

  /**
   * Recovers abandoned messages stuck in PROCESSING state due to worker crashes.
   */
  async recoverAbandonedProcessingMessages(maxAgeMs: number = 300_000): Promise<number> {
    const db = this.dbProvider();
    const cutoff = new Date(Date.now() - maxAgeMs);

    try {
      const recovered = await db
        .update(outboxMessagesTable)
        .set({ status: 'PENDING', sentAt: null })
        .where(
          and(
            eq(outboxMessagesTable.status, 'PROCESSING'),
            sql`COALESCE(${outboxMessagesTable.sentAt}, ${outboxMessagesTable.createdAt}) < ${cutoff}`
          )
        )
        .returning();

      return recovered.length;
    } catch {
      return 0;
    }
  }

  /**
   * Scans for pending outbox messages and dispatches them to the queue adapter.
   * Uses exclusive claiming and state transitions to prevent duplicate dispatch.
   */
  async relayPendingMessages(limit: number = 50): Promise<number> {
    if (this.isRelaying) {
      return 0; // Prevent overlapping relay passes
    }

    this.isRelaying = true;
    try {
      const db = this.dbProvider();
      const now = new Date();

      // First recover any crashed/abandoned processing messages
      await this.recoverAbandonedProcessingMessages();

      const pending = await db
        .select()
        .from(outboxMessagesTable)
        .where(eq(outboxMessagesTable.status, 'PENDING'))
        .orderBy(outboxMessagesTable.createdAt)
        .limit(limit);

      if (pending.length === 0) {
        return 0;
      }

      let successCount = 0;

      for (const msg of pending) {
        // 1. Claim message exclusively by setting status to PROCESSING with conditional pending check
        const [claimed] = await db
          .update(outboxMessagesTable)
          .set({ status: 'PROCESSING', sentAt: now })
          .where(
            and(
              eq(outboxMessagesTable.id, msg.id),
              eq(outboxMessagesTable.status, 'PENDING')
            )
          )
          .returning();

        if (!claimed || claimed.status !== 'PROCESSING') {
          continue; // Claimed by another pass/node
        }

        try {
          const transportJobId = await this.queueAdapter.send(
            msg.queueName,
            msg.payload,
            msg.singletonKey ? { singletonKey: msg.singletonKey } : undefined
          );

          // 2. Mark message SENT with actual transport result
          await db
            .update(outboxMessagesTable)
            .set({
              status: 'SENT',
              sentAt: now,
              errorMessage: transportJobId ? `transportJobId:${transportJobId}` : 'deduplicated',
            })
            .where(eq(outboxMessagesTable.id, msg.id));

          successCount++;
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const nextAttempts = msg.attempts + 1;
          const newStatus = nextAttempts >= 5 ? 'FAILED' : 'PENDING';

          await db
            .update(outboxMessagesTable)
            .set({
              status: newStatus,
              attempts: nextAttempts,
              errorMessage: errorMsg,
              sentAt: null,
            })
            .where(eq(outboxMessagesTable.id, msg.id));
        }
      }

      return successCount;
    } finally {
      this.isRelaying = false;
    }
  }
}
