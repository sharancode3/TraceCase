import { eq, and } from 'drizzle-orm';
import { investigationsTable, targetsTable, bugReportsTable } from '../schema';
import { getDb, DbClient } from '../index';

export type InvestigationRecord = typeof investigationsTable.$inferSelect;

export class InvestigationsRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  async getInvestigationById(id: string, ownerId: string): Promise<InvestigationRecord | null> {
    const db = this.dbProvider();

    const [investigation] = await db
      .select()
      .from(investigationsTable)
      .where(and(eq(investigationsTable.id, id), eq(investigationsTable.ownerId, ownerId)))
      .limit(1);

    return investigation || null;
  }

  async listInvestigations(ownerId: string): Promise<InvestigationRecord[]> {
    const db = this.dbProvider();

    return db
      .select()
      .from(investigationsTable)
      .where(eq(investigationsTable.ownerId, ownerId));
  }

  async getInvestigationWithDetails(id: string, ownerId: string) {
    const db = this.dbProvider();

    const [result] = await db
      .select({
        investigation: investigationsTable,
        target: targetsTable,
        report: bugReportsTable,
      })
      .from(investigationsTable)
      .innerJoin(targetsTable, eq(investigationsTable.targetId, targetsTable.id))
      .innerJoin(bugReportsTable, eq(investigationsTable.reportId, bugReportsTable.id))
      .where(and(eq(investigationsTable.id, id), eq(investigationsTable.ownerId, ownerId)))
      .limit(1);

    return result || null;
  }
}

export const investigationsRepository = new InvestigationsRepository();
