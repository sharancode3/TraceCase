import { eq, and } from 'drizzle-orm';
import { bugReportsTable, investigationsTable, targetsTable } from '../schema';
import { getDb, DbClient } from '../index';
import { AuthorizationError } from '@/server/auth';

export type BugReportRecord = typeof bugReportsTable.$inferSelect;
export type InvestigationRecord = typeof investigationsTable.$inferSelect;

export class ReportsRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  async createReportWithInvestigation(params: {
    ownerId: string;
    targetId: string;
    title: string;
    bugDescription: string;
    rawDescription?: string;
    expectedBehavior?: string | null;
    observedBehavior?: string | null;
    suspectedSteps?: string[] | null;
    browserEnvironment?: string | null;
    buildVersion?: string | null;
    createdBy: string;
  }): Promise<{ report: BugReportRecord; investigation: InvestigationRecord }> {
    const db = this.dbProvider();

    // 1. Strict prerequisite: verify target exists and is owned by requesting principal
    const [target] = await db
      .select()
      .from(targetsTable)
      .where(and(eq(targetsTable.id, params.targetId), eq(targetsTable.ownerId, params.ownerId)))
      .limit(1);

    if (!target) {
      throw new AuthorizationError('Target does not exist or is not owned by the requesting principal.');
    }

    // 2. Atomic transaction: create bug report and draft investigation together
    return db.transaction(async (tx) => {
      const [report] = await tx
        .insert(bugReportsTable)
        .values({
          ownerId: params.ownerId,
          targetId: params.targetId,
          title: params.title,
          rawDescription: params.rawDescription || null,
          bugDescription: params.bugDescription,
          expectedBehavior: params.expectedBehavior || null,
          observedBehavior: params.observedBehavior || null,
          suspectedSteps: params.suspectedSteps || null,
          browserEnvironment: params.browserEnvironment || null,
          buildVersion: params.buildVersion || null,
          createdBy: params.createdBy,
        })
        .returning();

      const [investigation] = await tx
        .insert(investigationsTable)
        .values({
          ownerId: params.ownerId,
          reportId: report.id,
          targetId: params.targetId,
          lifecycleStatus: 'DRAFT',
          reproductionVerdict: 'PENDING',
          evidenceReadiness: 'PENDING_GENERATION',
          tokenCostUsd: '0.0000',
          createdBy: params.createdBy,
        })
        .returning();

      return { report, investigation };
    });
  }

  async getReportById(id: string, ownerId: string): Promise<BugReportRecord | null> {
    const db = this.dbProvider();

    const [report] = await db
      .select()
      .from(bugReportsTable)
      .where(and(eq(bugReportsTable.id, id), eq(bugReportsTable.ownerId, ownerId)))
      .limit(1);

    return report || null;
  }

  async listReports(ownerId: string, targetId?: string): Promise<BugReportRecord[]> {
    const db = this.dbProvider();

    if (targetId) {
      return db
        .select()
        .from(bugReportsTable)
        .where(and(eq(bugReportsTable.ownerId, ownerId), eq(bugReportsTable.targetId, targetId)));
    }

    return db
      .select()
      .from(bugReportsTable)
      .where(eq(bugReportsTable.ownerId, ownerId));
  }
}

export const reportsRepository = new ReportsRepository();
