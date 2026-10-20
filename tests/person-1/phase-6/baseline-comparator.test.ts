import { describe, it, expect } from 'vitest';
import { BaselineComparator } from '@/server/verification/baseline-comparator';

describe('P1-06: Deterministic Baseline Comparator', () => {
  const baseExpected = {
    targetId: 'target-01',
    environment: 'staging',
    buildVersion: 'v2.4.1-build89',
    database: {
      accountCount: 1,
      defaultAccount: {
        id: 'acc-100',
        balance: 500,
        status: 'ACTIVE',
      },
    },
  };

  it('determines equivalence regardless of object key insertion order', () => {
    // Permuted key order in observed baseline
    const observedWithShuffledKeys = {
      environment: 'staging',
      buildVersion: 'v2.4.1-build89',
      targetId: 'target-01',
      database: {
        defaultAccount: {
          status: 'ACTIVE',
          id: 'acc-100',
          balance: 500,
        },
        accountCount: 1,
      },
    };

    const res = BaselineComparator.compareBaselines(baseExpected, observedWithShuffledKeys);
    expect(res.isEquivalent).toBe(true);
    expect(res.discrepancies).toHaveLength(0);
    expect(res.expectedStateHash).toBe(res.observedStateHash);
  });

  it('ignores declared volatile fields such as timestamps and session identifiers', () => {
    const observedWithVolatiles = {
      ...baseExpected,
      timestamp: '2026-10-21T00:00:00Z',
      createdAt: '2026-10-20T12:00:00Z',
      updatedAt: '2026-10-21T00:01:00Z',
      sessionId: 'sess-abc-xyz-999',
      etag: '"W/12345678"',
      database: {
        ...baseExpected.database,
        defaultAccount: {
          ...baseExpected.database.defaultAccount,
          lastModified: '2026-10-21T00:02:00Z',
        },
      },
    };

    const res = BaselineComparator.compareBaselines(baseExpected, observedWithVolatiles);
    expect(res.isEquivalent).toBe(true);
    expect(res.discrepancies).toHaveLength(0);
    expect(res.expectedStateHash).toBe(res.observedStateHash);
  });

  it('honors custom ignored keys passed to comparison', () => {
    const expected = {
      targetId: 't-1',
      transientMetric: 42,
    };
    const observed = {
      targetId: 't-1',
      transientMetric: 99,
    };

    const withoutIgnore = BaselineComparator.compareBaselines(expected, observed);
    expect(withoutIgnore.isEquivalent).toBe(false);

    const withIgnore = BaselineComparator.compareBaselines(expected, observed, ['transientMetric']);
    expect(withIgnore.isEquivalent).toBe(true);
    expect(withIgnore.discrepancies).toHaveLength(0);
  });

  it('fails equivalence when build version differs', () => {
    const wrongBuild = {
      ...baseExpected,
      buildVersion: 'v2.4.2-build90',
    };

    const res = BaselineComparator.compareBaselines(baseExpected, wrongBuild);
    expect(res.isEquivalent).toBe(false);
    expect(res.expectedStateHash).not.toBe(res.observedStateHash);
    expect(res.discrepancies.some((d) => d.includes('buildVersion'))).toBe(true);
  });

  it('fails equivalence when logical entity ID or state differs', () => {
    const dirtyBalance = {
      ...baseExpected,
      database: {
        ...baseExpected.database,
        defaultAccount: {
          ...baseExpected.database.defaultAccount,
          balance: 450, // Spent $50 during attempt 1, reset failed to restore!
        },
      },
    };

    const res = BaselineComparator.compareBaselines(baseExpected, dirtyBalance);
    expect(res.isEquivalent).toBe(false);
    expect(res.expectedStateHash).not.toBe(res.observedStateHash);
    expect(res.discrepancies.some((d) => d.includes('balance'))).toBe(true);
  });

  it('fails equivalence when required key is missing or unexpected key is present', () => {
    const missingTargetId = {
      environment: 'staging',
      buildVersion: 'v2.4.1-build89',
      database: baseExpected.database,
    };

    const resMissing = BaselineComparator.compareBaselines(baseExpected, missingTargetId);
    expect(resMissing.isEquivalent).toBe(false);
    expect(resMissing.discrepancies.some((d) => d.includes("Missing key in observed baseline: 'targetId'"))).toBe(true);

    const extraKey = {
      ...baseExpected,
      unexpectedEntity: { id: 'leak-1' },
    };
    const resExtra = BaselineComparator.compareBaselines(baseExpected, extraKey);
    expect(resExtra.isEquivalent).toBe(false);
    expect(resExtra.discrepancies.some((d) => d.includes("Unexpected additional key in observed baseline: 'unexpectedEntity'"))).toBe(true);
  });
});
