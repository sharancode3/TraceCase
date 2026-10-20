import { eq, and } from 'drizzle-orm';
import { idempotencyKeysTable } from '../schema';
import { getDb, DbClient } from '../index';

export type IdempotencyRecord = typeof idempotencyKeysTable.$inferSelect;

export type IdempotencyClaimResult =
  | { state: 'NEW' }
  | { state: 'REPLAY'; record: IdempotencyRecord }
  | { state: 'CONFLICT'; message: string }
  | { state: 'IN_PROGRESS'; message: string };

export class IdempotencyRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  async claimKey(params: {
    principalId: string;
    key: string;
    resourceId: string;
    commandName: string;
    commandFingerprint: string;
    ttlMs?: number;
  }): Promise<IdempotencyClaimResult> {
    const db = this.dbProvider();
    const now = new Date();
    const ttl = params.ttlMs ?? 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + ttl);

    // 1. Check existing claim
    const [existing] = await db
      .select()
      .from(idempotencyKeysTable)
      .where(
        and(
          eq(idempotencyKeysTable.principalId, params.principalId),
          eq(idempotencyKeysTable.key, params.key)
        )
      )
      .limit(1);

    if (existing) {
      // Check expiration
      if (existing.expiresAt.getTime() < now.getTime()) {
        // Expired claim: update with new command
        await db
          .update(idempotencyKeysTable)
          .set({
            resourceId: params.resourceId,
            commandName: params.commandName,
            commandFingerprint: params.commandFingerprint,
            status: 'IN_PROGRESS',
            responseStatus: null,
            responseBody: null,
            createdAt: now,
            expiresAt,
          })
          .where(
            and(
              eq(idempotencyKeysTable.principalId, params.principalId),
              eq(idempotencyKeysTable.key, params.key)
            )
          );
        return { state: 'NEW' };
      }

      // Check command name, resource id, and payload fingerprint
      if (
        existing.commandName !== params.commandName ||
        existing.resourceId !== params.resourceId ||
        existing.commandFingerprint !== params.commandFingerprint
      ) {
        return {
          state: 'CONFLICT',
          message: `Idempotency key '${params.key}' reused with a different command name, resource, or payload fingerprint.`,
        };
      }

      if (existing.status === 'IN_PROGRESS') {
        return {
          state: 'IN_PROGRESS',
          message: `An identical request with idempotency key '${params.key}' is currently in progress.`,
        };
      }

      if (existing.status === 'COMPLETED') {
        return {
          state: 'REPLAY',
          record: existing,
        };
      }

      // If previous status was FAILED, allow re-execution
      await db
        .update(idempotencyKeysTable)
        .set({ status: 'IN_PROGRESS', expiresAt })
        .where(
          and(
            eq(idempotencyKeysTable.principalId, params.principalId),
            eq(idempotencyKeysTable.key, params.key)
          )
        );
      return { state: 'NEW' };
    }

    // 2. Insert new in-progress claim
    try {
      await db.insert(idempotencyKeysTable).values({
        principalId: params.principalId,
        key: params.key,
        resourceId: params.resourceId,
        commandName: params.commandName,
        commandFingerprint: params.commandFingerprint,
        status: 'IN_PROGRESS',
        createdAt: now,
        expiresAt,
      });
      return { state: 'NEW' };
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      if (errorObj?.code === '23505' || errorObj?.message?.includes('duplicate key')) {
        return {
          state: 'IN_PROGRESS',
          message: `Concurrent request with idempotency key '${params.key}' already registered.`,
        };
      }
      throw err;
    }
  }

  async completeKey(params: {
    principalId: string;
    key: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void> {
    const db = this.dbProvider();

    await db
      .update(idempotencyKeysTable)
      .set({
        status: 'COMPLETED',
        responseStatus: params.responseStatus,
        responseBody: params.responseBody,
      })
      .where(
        and(
          eq(idempotencyKeysTable.principalId, params.principalId),
          eq(idempotencyKeysTable.key, params.key)
        )
      );
  }

  async releaseOrFailKey(principalId: string, key: string): Promise<void> {
    const db = this.dbProvider();

    await db
      .update(idempotencyKeysTable)
      .set({ status: 'FAILED' })
      .where(
        and(
          eq(idempotencyKeysTable.principalId, principalId),
          eq(idempotencyKeysTable.key, key)
        )
      );
  }
}

export const idempotencyRepository = new IdempotencyRepository();
