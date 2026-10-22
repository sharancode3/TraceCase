import { getServerEnv } from '@/server/config/env';
import crypto from 'node:crypto';
import { eq, and, gt, sql } from 'drizzle-orm';
import { getDb, DbClient } from '@/server/db';
import { investigationsTable, budgetReservationsTable } from '@/server/db/schema';

export class GlobalBudgetExhaustedError extends Error {
  constructor(
    public readonly currentTotalCostUsd: number,
    public readonly requestedCostUsd: number,
    public readonly globalCeilingUsd: number
  ) {
    super(
      `[BudgetManager] Shared TraceCase global budget limit exceeded. Current: $${currentTotalCostUsd.toFixed(8)}, Requested: $${requestedCostUsd.toFixed(8)}, Ceiling: $${globalCeilingUsd.toFixed(8)}.`
    );
    this.name = 'GlobalBudgetExhaustedError';
  }
}
export class BudgetExhaustedError extends Error {
  constructor(
    public readonly investigationId: string,
    public readonly currentCostUsd: number,
    public readonly requestedCostUsd: number,
    public readonly maxBudgetUsd: number
  ) {
    super(
      `[BudgetManager] Investigation '${investigationId}' budget limit exceeded. Current: \$${currentCostUsd.toFixed(8)}, Requested: \$${requestedCostUsd.toFixed(8)}, Ceiling: \$${maxBudgetUsd.toFixed(8)}.`
    );
    this.name = 'BudgetExhaustedError';
  }
}

export interface BudgetReservationTicket {
  reservationId: string;
  investigationId: string;
  reservedAmountUsd: number;
  reservedAt: Date;
}

export interface TokenUsageReport {
  promptTokens: number;
  completionTokens: number;
}

export interface BudgetLedgerPort {
  reserve(params: {
    investigationId: string;
    ticketId: string;
    estimatedCost: number;
    maxBudget: number;
    globalCeiling?: number;
    expiresAt: Date;
  }): Promise<void>;

  commit(params: {
    investigationId: string;
    ticketId: string;
    actualCost: number;
  }): Promise<number>;

  release(ticketId: string): Promise<void>;

  getCommittedCost(investigationId: string): Promise<number>;
  getInFlightReservedCost(investigationId: string): Promise<number>;
  getGlobalCommittedCost?(): Promise<number>;
  getGlobalInFlightReservedCost?(): Promise<number>;
}

/**
 * In-memory budget ledger for tests and isolated test doubles.
 * Explicitly injected into test environments to avoid requiring a live PostgreSQL instance.
 */
export class InMemoryBudgetLedger implements BudgetLedgerPort {
  private committedCosts = new Map<string, number>();
  private reservations = new Map<string, {
    investigationId: string;
    ticketId: string;
    reservedUsd: number;
    status: 'RESERVED' | 'COMMITTED' | 'RELEASED';
    expiresAt: Date;
  }>();

  async reserve(params: {
    investigationId: string;
    ticketId: string;
    estimatedCost: number;
    maxBudget: number;
    globalCeiling?: number;
    expiresAt: Date;
  }): Promise<void> {
    const committed = this.committedCosts.get(params.investigationId) ?? 0;
    let inFlight = 0;
    const now = new Date();
    for (const r of this.reservations.values()) {
      if (r.investigationId === params.investigationId && r.status === 'RESERVED' && r.expiresAt > now) {
        inFlight += r.reservedUsd;
      }
    }
    if (params.globalCeiling !== undefined) {
      let totalCommitted = 0;
      for (const val of this.committedCosts.values()) {
        totalCommitted += val;
      }
      let totalInFlight = 0;
      for (const r of this.reservations.values()) {
        if (r.status === 'RESERVED' && r.expiresAt > now) {
          totalInFlight += r.reservedUsd;
        }
      }
      if (totalCommitted + totalInFlight + params.estimatedCost > params.globalCeiling) {
        throw new GlobalBudgetExhaustedError(
          totalCommitted + totalInFlight,
          params.estimatedCost,
          params.globalCeiling
        );
      }
    }

    if (committed + inFlight + params.estimatedCost > params.maxBudget) {
      throw new BudgetExhaustedError(
        params.investigationId,
        committed + inFlight,
        params.estimatedCost,
        params.maxBudget
      );
    }
    this.reservations.set(params.ticketId, {
      investigationId: params.investigationId,
      ticketId: params.ticketId,
      reservedUsd: params.estimatedCost,
      status: 'RESERVED',
      expiresAt: params.expiresAt,
    });
  }

  async commit(params: {
    investigationId: string;
    ticketId: string;
    actualCost: number;
  }): Promise<number> {
    const r = this.reservations.get(params.ticketId);
    if (!r || r.status !== 'RESERVED') {
      return params.actualCost;
    }
    r.status = 'COMMITTED';
    const current = this.committedCosts.get(params.investigationId) ?? 0;
    this.committedCosts.set(params.investigationId, Number((current + params.actualCost).toFixed(8)));
    return params.actualCost;
  }

  async release(ticketId: string): Promise<void> {
    const r = this.reservations.get(ticketId);
    if (r && r.status === 'RESERVED') {
      r.status = 'RELEASED';
    }
  }

  async getCommittedCost(investigationId: string): Promise<number> {
    return this.committedCosts.get(investigationId) ?? 0;
  }

  async getInFlightReservedCost(investigationId: string): Promise<number> {
    let inFlight = 0;
    const now = new Date();
    for (const r of this.reservations.values()) {
      if (r.investigationId === investigationId && r.status === 'RESERVED' && r.expiresAt > now) {
        inFlight += r.reservedUsd;
      }
    }
    return inFlight;
  }

  async getGlobalCommittedCost(): Promise<number> {
    let sum = 0;
    for (const val of this.committedCosts.values()) {
      sum += val;
    }
    return Number(sum.toFixed(8));
  }

  async getGlobalInFlightReservedCost(): Promise<number> {
    let inFlight = 0;
    const now = new Date();
    for (const r of this.reservations.values()) {
      if (r.status === 'RESERVED' && r.expiresAt > now) {
        inFlight += r.reservedUsd;
      }
    }
    return Number(inFlight.toFixed(8));
  }
}

type TransactionalDb = {
  transaction<T>(cb: (tx: DbClient) => Promise<T>): Promise<T>;
};

type LockableQuery = {
  for(mode: string): { limit(n: number): Promise<Array<{ tokenCostUsd: string | null }>> };
};

type ReturnableUpdate = {
  returning(fields: Record<string, unknown>): Promise<Array<{ id: string }>>;
};

/**
 * PostgreSQL durable budget ledger with row-level locking for atomic cross-process decisions.
 */
export class PostgresBudgetLedger implements BudgetLedgerPort {
  constructor(private dbProvider: () => DbClient = getDb) {}

  async reserve(params: {
    investigationId: string;
    ticketId: string;
    estimatedCost: number;
    maxBudget: number;
    globalCeiling?: number;
    expiresAt: Date;
  }): Promise<void> {
    const db = this.dbProvider();

    const executeReserve = async (client: DbClient) => {
      // Shared transaction lock serializes budget decisions across investigations/processes.
      if (typeof client.execute === 'function') await client.execute(sql`SELECT pg_advisory_xact_lock(873246901)`);
      // 0. Verify global shared ceiling across all investigations if configured
      if (params.globalCeiling !== undefined) {
        const allInvs = await client
          .select({ tokenCostUsd: investigationsTable.tokenCostUsd })
          .from(investigationsTable);
        const globalCommitted = allInvs.reduce((sum, inv) => sum + Number(inv.tokenCostUsd ?? 0), 0);

        const allActiveReservations = await client
          .select({
            reservedUsd: budgetReservationsTable.reservedUsd,
            expiresAt: budgetReservationsTable.expiresAt,
            status: budgetReservationsTable.status,
          })
          .from(budgetReservationsTable);

        const now = new Date();
        const globalInFlight = allActiveReservations
          .filter((r) => r.status === 'RESERVED' && new Date(r.expiresAt) > now)
          .reduce((sum, r) => sum + Number(r.reservedUsd ?? 0), 0);

        if (globalCommitted + globalInFlight + params.estimatedCost > params.globalCeiling) {
          throw new GlobalBudgetExhaustedError(
            globalCommitted + globalInFlight,
            params.estimatedCost,
            params.globalCeiling
          );
        }
      }

      // 1. Lock investigation row with FOR UPDATE to serialize all reservation decisions for this investigation
      const query = client
        .select({ tokenCostUsd: investigationsTable.tokenCostUsd })
        .from(investigationsTable)
        .where(eq(investigationsTable.id, params.investigationId));

      const lockable = query as unknown as LockableQuery;
      const rows = typeof lockable.for === 'function'
        ? await lockable.for('update').limit(1)
        : await query.limit(1);

      const committedCost = Number(rows?.[0]?.tokenCostUsd ?? 0);

      // 2. Query active unexpired reservations under the lock
      const activeRows = await client
        .select({ reservedUsd: budgetReservationsTable.reservedUsd })
        .from(budgetReservationsTable)
        .where(
          and(
            eq(budgetReservationsTable.investigationId, params.investigationId),
            eq(budgetReservationsTable.status, 'RESERVED'),
            gt(budgetReservationsTable.expiresAt, new Date())
          )
        );

      const inFlightCost = activeRows.reduce((sum, r) => sum + Number(r.reservedUsd), 0);
      const totalProjected = committedCost + inFlightCost + params.estimatedCost;

      if (totalProjected > params.maxBudget) {
        throw new BudgetExhaustedError(
          params.investigationId,
          committedCost + inFlightCost,
          params.estimatedCost,
          params.maxBudget
        );
      }

      // 3. Atomically insert reservation under the lock
      await client.insert(budgetReservationsTable).values({
        investigationId: params.investigationId,
        ticketId: params.ticketId,
        reservedUsd: params.estimatedCost.toFixed(8),
        status: 'RESERVED',
        createdAt: new Date(),
        expiresAt: params.expiresAt,
      });
    };

    const txDb = db as unknown as TransactionalDb;
    if ('transaction' in db && typeof txDb.transaction === 'function') {
      await txDb.transaction(executeReserve);
    } else {
      await executeReserve(db);
    }
  }

  async commit(params: {
    investigationId: string;
    ticketId: string;
    actualCost: number;
  }): Promise<number> {
    const db = this.dbProvider();
    const now = new Date();

    const executeCommit = async (client: DbClient) => {
      if (typeof client.execute === 'function') await client.execute(sql`SELECT pg_advisory_xact_lock(873246901)`);
      // 1. Atomically transition from RESERVED to COMMITTED
      let updated: Array<{ id: string }> = [];
      try {
        const updateBuilder = client
          .update(budgetReservationsTable)
          .set({
            status: 'COMMITTED',
            actualCostUsd: params.actualCost.toFixed(8),
            settledAt: now,
          })
          .where(
            and(
              eq(budgetReservationsTable.ticketId, params.ticketId),
              eq(budgetReservationsTable.status, 'RESERVED')
            )
          );

        const returnable = updateBuilder as unknown as ReturnableUpdate;
        if (typeof returnable.returning === 'function') {
          updated = await returnable.returning({ id: budgetReservationsTable.id });
        } else {
          await updateBuilder;
          updated = [{ id: params.ticketId }];
        }
      } catch (err) {
        throw err;
      }

      // Idempotent: if already committed or released, do not double count
      if (!updated || updated.length === 0) {
        return params.actualCost;
      }

      // 2. Lock and update investigation tokenCostUsd
      const query = client
        .select({ tokenCostUsd: investigationsTable.tokenCostUsd })
        .from(investigationsTable)
        .where(eq(investigationsTable.id, params.investigationId));

      const lockable = query as unknown as LockableQuery;
      const rows = typeof lockable.for === 'function'
        ? await lockable.for('update').limit(1)
        : await query.limit(1);

      const currentCost = Number(rows?.[0]?.tokenCostUsd ?? 0);
      const newCost = Number((currentCost + params.actualCost).toFixed(8));

      await client
        .update(investigationsTable)
        .set({
          tokenCostUsd: newCost.toFixed(8),
          updatedAt: now,
        })
        .where(eq(investigationsTable.id, params.investigationId));

      return params.actualCost;
    };

    const txDb = db as unknown as TransactionalDb;
    if ('transaction' in db && typeof txDb.transaction === 'function') {
      return await txDb.transaction(executeCommit);
    } else {
      return await executeCommit(db);
    }
  }

  async release(ticketId: string): Promise<void> {
    const db = this.dbProvider();
    await db
      .update(budgetReservationsTable)
      .set({
        status: 'RELEASED',
        settledAt: new Date(),
      })
      .where(
        and(
          eq(budgetReservationsTable.ticketId, ticketId),
          eq(budgetReservationsTable.status, 'RESERVED')
        )
      );
  }

  async getCommittedCost(investigationId: string): Promise<number> {
    const db = this.dbProvider();
    const [inv] = await db
      .select({ tokenCostUsd: investigationsTable.tokenCostUsd })
      .from(investigationsTable)
      .where(eq(investigationsTable.id, investigationId))
      .limit(1);

    return Number(inv?.tokenCostUsd ?? 0);
  }

  async getInFlightReservedCost(investigationId: string): Promise<number> {
    const db = this.dbProvider();
    const rows = await db
      .select({ reservedUsd: budgetReservationsTable.reservedUsd })
      .from(budgetReservationsTable)
      .where(
        and(
          eq(budgetReservationsTable.investigationId, investigationId),
          eq(budgetReservationsTable.status, 'RESERVED'),
          gt(budgetReservationsTable.expiresAt, new Date())
        )
      );

    return rows.reduce((sum, r) => sum + Number(r.reservedUsd), 0);
  }

  async getGlobalCommittedCost(): Promise<number> {
    const db = this.dbProvider();
    const rows = await db
      .select({ tokenCostUsd: investigationsTable.tokenCostUsd })
      .from(investigationsTable);
    return rows.reduce((sum, inv) => sum + Number(inv.tokenCostUsd ?? 0), 0);
  }

  async getGlobalInFlightReservedCost(): Promise<number> {
    const db = this.dbProvider();
    const rows = await db
      .select({
        reservedUsd: budgetReservationsTable.reservedUsd,
        expiresAt: budgetReservationsTable.expiresAt,
        status: budgetReservationsTable.status,
      })
      .from(budgetReservationsTable);
    const now = new Date();
    return rows
      .filter((r) => r.status === 'RESERVED' && new Date(r.expiresAt) > now)
      .reduce((sum, r) => sum + Number(r.reservedUsd ?? 0), 0);
  }
}

export interface BudgetManagerOptions {
  maxBudgetPerInvestigationUsd?: number;
  globalBudgetCeilingUsd?: number;
  promptPricePer1kTokens?: number;
  completionPricePer1kTokens?: number;
  defaultEstimatedTokens?: number;
  customLedger?: BudgetLedgerPort;
}

export class BudgetManager {
  private maxBudgetPerInvestigationUsd: number;
  private globalBudgetCeilingUsd: number;
  private promptPricePer1kTokens: number;
  private completionPricePer1kTokens: number;
  private defaultEstimatedTokens: number;
  private ledger: BudgetLedgerPort;

  // Active in-memory cache for fast local lookup
  private activeReservations = new Map<string, BudgetReservationTicket>();

  constructor(
    dbProvider: () => DbClient = getDb,
    options: BudgetManagerOptions = {}
  ) {
    let envPerInvestigation = 0.25;
    let envGlobalCeiling = 10.00;
    try {
      const env = getServerEnv();
      envPerInvestigation = env.OPENAI_PER_INVESTIGATION_CEILING;
      envGlobalCeiling = env.OPENAI_TOTAL_BUDGET_CEILING;
    } catch {
      // Safe defaults
    }
    this.maxBudgetPerInvestigationUsd = options.maxBudgetPerInvestigationUsd ?? envPerInvestigation;
    this.globalBudgetCeilingUsd = options.globalBudgetCeilingUsd ?? envGlobalCeiling;
    // Calibrated GPT-6 Luna Standard published rates:
    // Input: $0.10 / 1M = $0.000100 / 1k tokens
    // Output: $0.50 / 1M = $0.000500 / 1k tokens
    this.promptPricePer1kTokens = options.promptPricePer1kTokens ?? 0.000100;
    this.completionPricePer1kTokens = options.completionPricePer1kTokens ?? 0.000500;
    this.defaultEstimatedTokens = options.defaultEstimatedTokens ?? 1500;
    this.ledger = options.customLedger || new PostgresBudgetLedger(dbProvider);
  }

  public calculateCost(usage: TokenUsageReport): number {
    const promptCost = (usage.promptTokens / 1000) * this.promptPricePer1kTokens;
    const completionCost = (usage.completionTokens / 1000) * this.completionPricePer1kTokens;
    return Number((promptCost + completionCost).toFixed(8));
  }

  public estimateCost(tokens: number = this.defaultEstimatedTokens): number {
    const promptTokens = Math.floor(tokens * 0.7);
    const completionTokens = Math.ceil(tokens * 0.3);
    return this.calculateCost({ promptTokens, completionTokens });
  }

  public async getInFlightReservedCost(investigationId: string): Promise<number> {
    return this.ledger.getInFlightReservedCost(investigationId);
  }

  public async getCommittedCost(investigationId: string): Promise<number> {
    return this.ledger.getCommittedCost(investigationId);
  }

  public async reserveBudget(params: {
    investigationId: string;
    estimatedTokens?: number;
    maxBudgetOverride?: number;
    globalCeilingOverride?: number;
  }): Promise<BudgetReservationTicket> {
    const maxBudget = params.maxBudgetOverride ?? this.maxBudgetPerInvestigationUsd;
    const globalCeiling = params.globalCeilingOverride ?? this.globalBudgetCeilingUsd;
    // Conservatively covers the bounded 32KB input, 2048 output and one retry.
    const estimatedCost = Math.max(0.01, this.estimateCost(params.estimatedTokens));
    const ticketId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    await this.ledger.reserve({
      investigationId: params.investigationId,
      ticketId,
      estimatedCost,
      maxBudget,
      globalCeiling,
      expiresAt,
    });

    const ticket: BudgetReservationTicket = {
      reservationId: ticketId,
      investigationId: params.investigationId,
      reservedAmountUsd: estimatedCost,
      reservedAt: now,
    };

    this.activeReservations.set(ticket.reservationId, ticket);
    return ticket;
  }

  public async commitUsage(
    ticket: BudgetReservationTicket,
    actualUsage: TokenUsageReport
  ): Promise<number> {
    this.activeReservations.delete(ticket.reservationId);
    const actualCost = this.calculateCost(actualUsage);

    await this.ledger.commit({
      investigationId: ticket.investigationId,
      ticketId: ticket.reservationId,
      actualCost,
    });

    return actualCost;
  }

  public async releaseReservation(reservationId: string): Promise<void> {
    this.activeReservations.delete(reservationId);
    await this.ledger.release(reservationId);
  }

  public getActiveReservationCount(): number {
    return this.activeReservations.size;
  }

  public async getGlobalCommittedCost(): Promise<number> {
    return (await this.ledger.getGlobalCommittedCost?.()) ?? 0;
  }

  public async getGlobalInFlightReservedCost(): Promise<number> {
    return (await this.ledger.getGlobalInFlightReservedCost?.()) ?? 0;
  }
}

export function createTestBudgetManager(options?: BudgetManagerOptions): BudgetManager {
  return new BudgetManager(undefined, {
    ...options,
    customLedger: new InMemoryBudgetLedger(),
  });
}

export const defaultBudgetManager = new BudgetManager();
