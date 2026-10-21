import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  BudgetManager,
  BudgetExhaustedError,
  InMemoryBudgetLedger,
  PostgresBudgetLedger,
} from '@/server/ai/budget-manager';

describe('Budget Manager Concurrency & Durable Accounting Safety', () => {
  const invId = randomUUID();

  it('competing concurrent reservations near the cap serialize and enforce budget ceiling', async () => {
    // Shared ledger across competing worker instances
    const sharedLedger = new InMemoryBudgetLedger();

    const worker1Budget = new BudgetManager(undefined, {
      maxBudgetPerInvestigationUsd: 0.05, // $0.05 cap
      promptPricePer1kTokens: 0.01,
      completionPricePer1kTokens: 0.02,
      defaultEstimatedTokens: 2000, // costs ~$0.026
      customLedger: sharedLedger,
    });

    const worker2Budget = new BudgetManager(undefined, {
      maxBudgetPerInvestigationUsd: 0.05,
      promptPricePer1kTokens: 0.01,
      completionPricePer1kTokens: 0.02,
      defaultEstimatedTokens: 2000,
      customLedger: sharedLedger,
    });

    // Both workers attempt to reserve $0.026 concurrently when cap is $0.05
    // One will succeed ($0.026 reserved, remaining headroom $0.024)
    // The second will request $0.026, which would push total to $0.052 > $0.05, so it must be rejected!
    const results = await Promise.allSettled([
      worker1Budget.reserveBudget({ investigationId: invId }),
      worker2Budget.reserveBudget({ investigationId: invId }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BudgetExhaustedError);
  });

  it('simultaneous settlements of distinct reservations accumulate usage accurately', async () => {
    const sharedLedger = new InMemoryBudgetLedger();
    const manager = new BudgetManager(undefined, {
      maxBudgetPerInvestigationUsd: 1.0,
      customLedger: sharedLedger,
    });

    const ticketA = await manager.reserveBudget({ investigationId: invId });
    const ticketB = await manager.reserveBudget({ investigationId: invId });

    // Settle both concurrently
    await Promise.all([
      manager.commitUsage(ticketA, { promptTokens: 1000, completionTokens: 500 }),
      manager.commitUsage(ticketB, { promptTokens: 2000, completionTokens: 1000 }),
    ]);

    const committedCost = await manager.getCommittedCost(invId);
    const expectedA = manager.calculateCost({ promptTokens: 1000, completionTokens: 500 });
    const expectedB = manager.calculateCost({ promptTokens: 2000, completionTokens: 1000 });

    expect(committedCost).toBeCloseTo(expectedA + expectedB, 4);
  });

  it('duplicate settlement of the same reservation ticket is strictly idempotent', async () => {
    const sharedLedger = new InMemoryBudgetLedger();
    const manager = new BudgetManager(undefined, {
      maxBudgetPerInvestigationUsd: 1.0,
      customLedger: sharedLedger,
    });

    const ticket = await manager.reserveBudget({ investigationId: invId });

    // Settle first time
    const cost1 = await manager.commitUsage(ticket, { promptTokens: 1000, completionTokens: 1000 });
    const committedAfterFirst = await manager.getCommittedCost(invId);

    // Duplicate settle with same ticket
    const cost2 = await manager.commitUsage(ticket, { promptTokens: 1000, completionTokens: 1000 });
    const committedAfterSecond = await manager.getCommittedCost(invId);

    expect(committedAfterSecond).toBe(committedAfterFirst);
  });

  it('release after settlement does not erase committed costs', async () => {
    const sharedLedger = new InMemoryBudgetLedger();
    const manager = new BudgetManager(undefined, {
      maxBudgetPerInvestigationUsd: 1.0,
      customLedger: sharedLedger,
    });

    const ticket = await manager.reserveBudget({ investigationId: invId });
    await manager.commitUsage(ticket, { promptTokens: 1000, completionTokens: 500 });
    const committedBeforeRelease = await manager.getCommittedCost(invId);

    // Attempt to release already committed ticket
    await manager.releaseReservation(ticket.reservationId);
    const committedAfterRelease = await manager.getCommittedCost(invId);

    expect(committedAfterRelease).toBe(committedBeforeRelease);
  });

  it('database connection failure blocks reservation admission fail-closed', async () => {
    // Failing database client mock that throws connection error
    const brokenDbProvider = () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
    };

    const managerWithBrokenDb = new BudgetManager(brokenDbProvider as any);

    await expect(
      managerWithBrokenDb.reserveBudget({ investigationId: invId })
    ).rejects.toThrow();
  });
});
