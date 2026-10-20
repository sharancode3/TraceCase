import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetManager, BudgetExhaustedError } from '@/server/ai/budget-manager';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase7TestDbMock } from './test-db-mock';

describe('P1-07: Budget Manager & Token Reservation Safety', () => {
  let mockDb: Phase7TestDbMock;
  let budgetManager: BudgetManager;

  const invId = '00000000-1111-4111-8111-000000000001';

  beforeEach(() => {
    mockDb = new Phase7TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    budgetManager = new BudgetManager(() => mockDb as any, {
      maxBudgetPerInvestigationUsd: 1.0, // $1.00 limit for testing
      promptPricePer1kTokens: 0.003,
      completionPricePer1kTokens: 0.015,
      defaultEstimatedTokens: 2000,
    });

    mockDb.investigations.push({
      id: invId,
      ownerId: 'user-1',
      reportId: 'rep-1',
      targetId: 'target-1',
      tokenCostUsd: '0.0000',
      lifecycleStatus: 'DRAFT',
      reproductionVerdict: 'PENDING',
      evidenceReadiness: 'PENDING_GENERATION',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  it('calculates cost accurately based on input and output token rates', () => {
    // 1000 prompt tokens = $0.003
    // 1000 completion tokens = $0.015
    // Total = $0.018
    const cost = budgetManager.calculateCost({
      promptTokens: 1000,
      completionTokens: 1000,
    });
    expect(cost).toBeCloseTo(0.018, 5);
  });

  it('reserves headroom successfully when within budget limit', async () => {
    const ticket = await budgetManager.reserveBudget({
      investigationId: invId,
      estimatedTokens: 2000,
    });

    expect(ticket.reservationId).toBeDefined();
    expect(ticket.investigationId).toBe(invId);
    expect(ticket.reservedAmountUsd).toBeGreaterThan(0);
    expect(budgetManager.getActiveReservationCount()).toBe(1);
  });

  it('fails closed when reservation would exceed the investigation budget ceiling', async () => {
    // Set investigation already close to budget ceiling
    mockDb.investigations[0].tokenCostUsd = '0.9900'; // $0.99 out of $1.00 spent

    // Requesting 5000 tokens would cost ~$0.033, exceeding $1.00 ceiling
    await expect(
      budgetManager.reserveBudget({
        investigationId: invId,
        estimatedTokens: 5000,
      })
    ).rejects.toThrow(BudgetExhaustedError);

    // Verify no ticket was left active
    expect(budgetManager.getActiveReservationCount()).toBe(0);
  });

  it('prevents concurrent race conditions by accounting for active in-flight reservations', async () => {
    mockDb.investigations[0].tokenCostUsd = '0.9600'; // $0.96 spent, $0.04 remaining

    // First reservation requests 2000 tokens (~$0.0132) -> succeeds
    const ticket1 = await budgetManager.reserveBudget({
      investigationId: invId,
      estimatedTokens: 2000,
    });
    expect(ticket1).toBeDefined();

    // Second reservation requests 2000 tokens (~$0.0132) -> succeeds (total in flight ~$0.0264, cumulative $0.9864)
    const ticket2 = await budgetManager.reserveBudget({
      investigationId: invId,
      estimatedTokens: 2000,
    });
    expect(ticket2).toBeDefined();

    // Third reservation requests 3000 tokens (~$0.0198) -> exceeds $1.00 ceiling because of ticket1 + ticket2
    await expect(
      budgetManager.reserveBudget({
        investigationId: invId,
        estimatedTokens: 3000,
      })
    ).rejects.toThrow(BudgetExhaustedError);

    // Clean up
    budgetManager.releaseReservation(ticket1.reservationId);
    budgetManager.releaseReservation(ticket2.reservationId);
    expect(budgetManager.getActiveReservationCount()).toBe(0);
  });

  it('commits actual token usage, updates database cost, and frees the reservation', async () => {
    const ticket = await budgetManager.reserveBudget({
      investigationId: invId,
      estimatedTokens: 2000,
    });

    const actualCost = await budgetManager.commitUsage(ticket, {
      promptTokens: 800,
      completionTokens: 400,
    });

    // 800 * 0.003 / 1000 = 0.0024
    // 400 * 0.015 / 1000 = 0.0060
    // Total = 0.0084
    expect(actualCost).toBeCloseTo(0.0084, 4);
    expect(budgetManager.getActiveReservationCount()).toBe(0);

    // Verify DB updated
    const committed = await budgetManager.getCommittedCost(invId);
    expect(committed).toBeCloseTo(0.0084, 4);
  });

  it('releases in-flight reservation cleanly upon abort without deducting cost', async () => {
    const ticket = await budgetManager.reserveBudget({
      investigationId: invId,
      estimatedTokens: 2000,
    });
    expect(budgetManager.getActiveReservationCount()).toBe(1);

    budgetManager.releaseReservation(ticket.reservationId);
    expect(budgetManager.getActiveReservationCount()).toBe(0);

    const committed = await budgetManager.getCommittedCost(invId);
    expect(committed).toBe(0);
  });
});
