import { eq, and, gt, asc, sql } from 'drizzle-orm';
import { investigationEventsTable, investigationsTable } from '../schema';
import { getDb, DbClient } from '../index';

export class EventsRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  async appendEvent(
    params: {
      investigationId: string;
      eventType: string;
      message?: string;
      payload?: Record<string, unknown>;
    },
    tx?: DbClient
  ) {
    const db = tx || this.dbProvider();
    const [inv] = await db
      .update(investigationsTable)
      .set({
        eventSequenceCounter: sql`${investigationsTable.eventSequenceCounter} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(investigationsTable.id, params.investigationId))
      .returning({ watermark: investigationsTable.eventSequenceCounter });

    const seq = inv?.watermark ?? 1;

    const payloadObj: Record<string, unknown> = {
      ...(params.payload || {}),
    };
    if (params.message) {
      payloadObj.message = params.message;
    }

    const [created] = await db
      .insert(investigationEventsTable)
      .values({
        investigationId: params.investigationId,
        sequenceIndex: seq,
        eventType: params.eventType,
        payload: payloadObj,
        emittedAt: new Date(),
      })
      .returning();

    return created;
  }

  async getEventsByInvestigation(params: {
    investigationId: string;
    afterSequence?: number;
    limit?: number;
  }) {
    const db = this.dbProvider();
    const afterSeq = params.afterSequence ?? 0;
    const maxLimit = Math.min(params.limit ?? 50, 200);

    // Get current watermark
    const [inv] = await db
      .select({ watermark: investigationsTable.eventSequenceCounter })
      .from(investigationsTable)
      .where(eq(investigationsTable.id, params.investigationId))
      .limit(1);

    const events = await db
      .select()
      .from(investigationEventsTable)
      .where(
        and(
          eq(investigationEventsTable.investigationId, params.investigationId),
          gt(investigationEventsTable.sequenceIndex, afterSeq)
        )
      )
      .orderBy(asc(investigationEventsTable.sequenceIndex))
      .limit(maxLimit);

    return {
      investigationId: params.investigationId,
      currentWatermark: inv?.watermark ?? 0,
      events: events.map((e) => ({
        id: e.id,
        sequenceIndex: e.sequenceIndex,
        eventType: e.eventType,
        payload: e.payload,
        emittedAt: e.emittedAt.toISOString(),
      })),
    };
  }
}

export const eventsRepository = new EventsRepository();
