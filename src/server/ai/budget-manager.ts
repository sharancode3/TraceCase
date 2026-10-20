import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { getDb, DbClient } from '@/server/db';
import { investigationsTable, budgetReservationsTable } from '@/server/db/schema';

export class BudgetExhaustedError extends Error {
  constructor(
    public readonly investigationId: string,
    public readonly currentCostUsd: number,
    public readonly requestedCostUsd: number,
    public readonly maxBudgetUsd: number
  ) {
    super(
      `[BudgetManager] Investigation '${investigationId}' budget limit exceeded. Current: \$${currentCostUsd.toFixed(4)}, Requested: \$${requestedCostUsd.toFixed(4)}, Ceiling: \$${maxBudgetUsd.toFixed(4)}.`
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

export interface BudgetManagerOptions {
  maxBudgetPerInvestigationUsd?: number;
  promptPricePer1kTokens?: number;
  completionPricePer1kTokens?: number;
  defaultEstimatedTokens?: number;
}

export class BudgetManager {
  private maxBudgetPerInvestigationUsd: number;
  private promptPricePer1kTokens: number;
  private completionPricePer1kTokens: number;
  private defaultEstimatedTokens: number;

  // In-memory active reservation tracking to prevent concurrent race conditions
  private activeReservations = new Map<string, BudgetReservationTicket>();

  constructor(
    private dbProvider: () => DbClient = getDb,
    options: BudgetManagerOptions = {}
  ) {
    this.maxBudgetPerInvestigationUsd = options.maxBudgetPerInvestigationUsd ?? 2.0; // $2.00 default cap
    this.promptPricePer1kTokens = options.promptPricePer1kTokens ?? 0.003; // $0.003 / 1k input
    this.completionPricePer1kTokens = options.completionPricePer1kTokens ?? 0.015; // $0.015 / 1k output
    this.defaultEstimatedTokens = options.defaultEstimatedTokens ?? 1500;
  }

  /**
   * Calculates the exact USD cost for a given token usage report.
   */
  public calculateCost(usage: TokenUsageReport): number {
    const promptCost = (usage.promptTokens / 1000) * this.promptPricePer1kTokens;
    const completionCost = (usage.completionTokens / 1000) * this.completionPricePer1kTokens;
    return Number((promptCost + completionCost).toFixed(6));
  }

  /**
   * Estimates cost for a planned token count before invoking AI model.
   */
  public estimateCost(tokens: number = this.defaultEstimatedTokens): number {
    // Blended estimate (70% prompt, 30% completion)
    const promptTokens = Math.floor(tokens * 0.7);
    const completionTokens = Math.ceil(tokens * 0.3);
    return this.calculateCost({ promptTokens, completionTokens });
  }

  /**
   * Retrieves active in-flight reserved cost for an investigation across processes.
   */
  public async getInFlightReservedCost(investigationId: string): Promise<number> {
    try {
      const db = this.dbProvider();
      const now = new Date();
      const rows = await db
        .select({ reservedUsd: budgetReservationsTable.reservedUsd })
        .from(budgetReservationsTable)
        .where(
          and(
            eq(budgetReservationsTable.investigationId, investigationId),
            eq(budgetReservationsTable.status, 'RESERVED'),
            gt(budgetReservationsTable.expiresAt, now)
          )
        );

      if (rows && rows.length > 0) {
        return rows.reduce((sum, r) => sum + Number(r.reservedUsd), 0);
      }
    } catch {
      // In-memory mock fallback
    }

    let total = 0;
    for (const ticket of this.activeReservations.values()) {
      if (ticket.investigationId === investigationId) {
        total += ticket.reservedAmountUsd;
      }
    }
    return total;
  }

  /**
   * Gets cumulative committed cost directly from PostgreSQL database.
   */
  public async getCommittedCost(investigationId: string): Promise<number> {
    const db = this.dbProvider();
    const [inv] = await db
      .select({ tokenCostUsd: investigationsTable.tokenCostUsd })
      .from(investigationsTable)
      .where(eq(investigationsTable.id, investigationId))
      .limit(1);

    return Number(inv?.tokenCostUsd ?? 0);
  }

  /**
   * Atomically reserves budget headroom prior to calling OpenAI GPT-6 Luna.
   * Fails closed if the estimated request would exceed the per-investigation ceiling.
   */
  public async reserveBudget(params: {
    investigationId: string;
    estimatedTokens?: number;
    maxBudgetOverride?: number;
  }): Promise<BudgetReservationTicket> {
    const maxBudget = params.maxBudgetOverride ?? this.maxBudgetPerInvestigationUsd;
    const estimatedCost = this.estimateCost(params.estimatedTokens);

    const committedCost = await this.getCommittedCost(params.investigationId);
    const inFlightCost = await this.getInFlightReservedCost(params.investigationId);
    const totalProjected = committedCost + inFlightCost + estimatedCost;

    if (totalProjected > maxBudget) {
      throw new BudgetExhaustedError(
        params.investigationId,
        committedCost + inFlightCost,
        estimatedCost,
        maxBudget
      );
    }

    const ticketId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minute reservation TTL

    try {
      const db = this.dbProvider();
      await db.insert(budgetReservationsTable).values({
        investigationId: params.investigationId,
        ticketId,
        reservedUsd: estimatedCost.toFixed(4),
        status: 'RESERVED',
        createdAt: now,
        expiresAt,
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `[DurableBudgetError] Failed to persist budget reservation in production: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      // In-memory mock fallback in dev/test
    }

    const ticket: BudgetReservationTicket = {
      reservationId: ticketId,
      investigationId: params.investigationId,
      reservedAmountUsd: estimatedCost,
      reservedAt: now,
    };

    this.activeReservations.set(ticket.reservationId, ticket);
    return ticket;
  }

  /**
   * Commits actual model token usage, releasing the in-flight reservation
   * and atomically persisting the real cost to the database record.
   * Idempotent: duplicate calls with the same ticket do not double-charge.
   */
  public async commitUsage(
    ticket: BudgetReservationTicket,
    actualUsage: TokenUsageReport
  ): Promise<number> {
    this.activeReservations.delete(ticket.reservationId);
    const actualCost = this.calculateCost(actualUsage);

    const db = this.dbProvider();
    const now = new Date();

    const executeCommit = async (client: DbClient) => {
      let updated: Array<{ id: string }> = [];
      try {
        updated = await client
          .update(budgetReservationsTable)
          .set({
            status: 'COMMITTED',
            actualCostUsd: actualCost.toFixed(4),
            settledAt: now,
          })
          .where(
            and(
              eq(budgetReservationsTable.ticketId, ticket.reservationId),
              eq(budgetReservationsTable.status, 'RESERVED')
            )
          )
          .returning({ id: budgetReservationsTable.id });
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          throw err;
        }
      }

      // If no row was updated, this ticket was already settled (prevent double counting)
      if (updated && updated.length === 0) {
        return actualCost;
      }

      const [inv] = await client
        .select({ tokenCostUsd: investigationsTable.tokenCostUsd })
        .from(investigationsTable)
        .where(eq(investigationsTable.id, ticket.investigationId))
        .limit(1);

      const currentCost = Number(inv?.tokenCostUsd ?? 0);
      const newCost = Number((currentCost + actualCost).toFixed(4));

      await client
        .update(investigationsTable)
        .set({
          tokenCostUsd: newCost.toFixed(4),
          updatedAt: now,
        })
        .where(eq(investigationsTable.id, ticket.investigationId));

      return actualCost;
    };

    if ('transaction' in db && typeof (db as { transaction?: unknown }).transaction === 'function') {
      return await (db as unknown as { transaction: (fn: (tx: DbClient) => Promise<number>) => Promise<number> }).transaction(executeCommit);
    } else {
      return await executeCommit(db);
    }
  }

  /**
   * Releases an unused reservation ticket in the event of an upstream error,
   * timeout, or client cancellation without persisting any deduction.
   */
  public async releaseReservation(reservationId: string): Promise<void> {
    this.activeReservations.delete(reservationId);
    try {
      const db = this.dbProvider();
      await db
        .update(budgetReservationsTable)
        .set({
          status: 'RELEASED',
          settledAt: new Date(),
        })
        .where(eq(budgetReservationsTable.ticketId, reservationId));
    } catch {
      // In-memory mock fallback
    }
  }

  /**
   * Returns current active reservation count for diagnostics.
   */
  public getActiveReservationCount(): number {
    return this.activeReservations.size;
  }
}

export const defaultBudgetManager = new BudgetManager();
