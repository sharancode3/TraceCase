import { eq, and } from 'drizzle-orm';
import { targetsTable } from '../schema';
import { getDb, DbClient } from '../index';

export type TargetRecord = typeof targetsTable.$inferSelect;
export type NewTargetRecord = typeof targetsTable.$inferInsert;

export class TargetsRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  async createTarget(data: {
    ownerId: string;
    name: string;
    baseUrl: string;
    allowedOrigins: string[];
    isSandbox?: boolean;
    isSandboxVerified?: boolean;
    testAccountRef?: string | null;
    fixtureResetEndpoint?: string | null;
    fixtureResetAuthSecretRef?: string | null;
    environment?: 'staging' | 'development' | 'demo' | 'production';
    createdBy: string;
  }): Promise<TargetRecord> {
    const db = this.dbProvider();

    const [target] = await db
      .insert(targetsTable)
      .values({
        ownerId: data.ownerId,
        name: data.name,
        baseUrl: data.baseUrl,
        allowedOrigins: data.allowedOrigins,
        isSandbox: Boolean(data.isSandbox),
        isSandboxVerified: Boolean(data.isSandboxVerified),
        testAccountRef: data.testAccountRef || null,
        fixtureResetEndpoint: data.fixtureResetEndpoint || null,
        fixtureResetAuthSecretRef: data.fixtureResetAuthSecretRef || null,
        environment: data.environment || 'staging',
        createdBy: data.createdBy,
      })
      .returning();

    return target;
  }

  async getTargetById(id: string, ownerId: string): Promise<TargetRecord | null> {
    const db = this.dbProvider();

    // Strict ownership filter: never return records owned by another principal
    const [target] = await db
      .select()
      .from(targetsTable)
      .where(and(eq(targetsTable.id, id), eq(targetsTable.ownerId, ownerId)))
      .limit(1);

    return target || null;
  }

  async listTargets(ownerId: string): Promise<TargetRecord[]> {
    const db = this.dbProvider();

    // Strict ownership filter: only return records owned by the requesting principal
    return db
      .select()
      .from(targetsTable)
      .where(eq(targetsTable.ownerId, ownerId));
  }
}

export const targetsRepository = new TargetsRepository();
