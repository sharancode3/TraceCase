import { eq, and } from 'drizzle-orm';
import { experimentPlanRevisionsTable, investigationsTable } from '../schema';
import { getDb, DbClient } from '../index';
import { AuthorizationError } from '@/server/auth';

export type PlanRevisionRecord = typeof experimentPlanRevisionsTable.$inferSelect;

export class PlansRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  async createPlanRevision(params: {
    investigationId: string;
    ownerId: string;
    version: number;
    planHash: string;
    planPayload: Record<string, unknown>;
    createdBy: string;
  }): Promise<PlanRevisionRecord> {
    const db = this.dbProvider();

    // 1. Verify investigation ownership
    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(and(eq(investigationsTable.id, params.investigationId), eq(investigationsTable.ownerId, params.ownerId)))
      .limit(1);

    if (!inv) {
      throw new AuthorizationError('Investigation does not exist or is not owned by the requesting principal.');
    }

    // 2. Immutability check: check if this version already exists
    const [existing] = await db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(
        and(
          eq(experimentPlanRevisionsTable.investigationId, params.investigationId),
          eq(experimentPlanRevisionsTable.version, params.version)
        )
      )
      .limit(1);

    if (existing) {
      throw new Error(`Plan revision version ${params.version} already exists and is immutable.`);
    }

    // 3. Atomic transaction: record revision and update active plan version on investigation
    return db.transaction(async (tx) => {
      const [revision] = await tx
        .insert(experimentPlanRevisionsTable)
        .values({
          investigationId: params.investigationId,
          version: params.version,
          planHash: params.planHash,
          planPayload: params.planPayload,
          createdBy: params.createdBy,
        })
        .returning();

      await tx
        .update(investigationsTable)
        .set({
          planVersion: params.version,
          planHash: params.planHash,
          updatedAt: new Date(),
        })
        .where(eq(investigationsTable.id, params.investigationId));

      return revision;
    });
  }

  async getPlanRevisions(investigationId: string, ownerId: string): Promise<PlanRevisionRecord[]> {
    const db = this.dbProvider();

    // Verify ownership
    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(and(eq(investigationsTable.id, investigationId), eq(investigationsTable.ownerId, ownerId)))
      .limit(1);

    if (!inv) {
      return [];
    }

    return db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(eq(experimentPlanRevisionsTable.investigationId, investigationId));
  }

  async getPlanRevisionByVersion(
    investigationId: string,
    version: number,
    ownerId: string
  ): Promise<PlanRevisionRecord | null> {
    const db = this.dbProvider();

    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(and(eq(investigationsTable.id, investigationId), eq(investigationsTable.ownerId, ownerId)))
      .limit(1);

    if (!inv) {
      return null;
    }

    const [revision] = await db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(
        and(
          eq(experimentPlanRevisionsTable.investigationId, investigationId),
          eq(experimentPlanRevisionsTable.version, version)
        )
      )
      .limit(1);

    return revision || null;
  }
}

export const plansRepository = new PlansRepository();
