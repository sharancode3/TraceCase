import { describe, it, expect } from 'vitest';
import { PairAssessor } from '@/server/verification/pair-assessor';
import type { AttemptAssessment } from '@/server/verification/types';
import type { VerifiedResetReceipt } from '@/contracts/reset';

describe('P1-06: Pair Assessor Master Decision Table', () => {
  const investigationId = 'inv-pair-100';

  const createAttempt = (
    num: 1 | 2,
    finding: 'REPORTED_FAILURE' | 'EXPECTED_BEHAVIOR' | 'UNEXPECTED_OUTCOME' | 'CONTRADICTORY' | 'UNRESOLVED',
    validity: 'VALID' | 'INVALID' = 'VALID',
    invalidityReason?: string
  ): AttemptAssessment => ({
    attemptNumber: num,
    finding,
    validity,
    invalidityReason,
    preconditionsMet: validity === 'VALID',
    procedureCompleted: validity === 'VALID',
    scopeAdhered: validity === 'VALID',
    requiredObservationsAvailable: validity === 'VALID',
    evaluations: [],
    assessedAt: new Date().toISOString(),
  });

  const validResetReceipt: VerifiedResetReceipt = {
    id: 'receipt-1',
    targetId: 't-1',
    investigationId,
    attemptNumber: 2,
    transportSuccess: true,
    baselineEquivalent: true,
    isVerifiedRestored: true,
    readback: {
      targetId: 't-1',
      expectedStateHash: 'hash-abc',
      observedStateHash: 'hash-abc',
      isEquivalent: true,
      discrepancies: [],
      checkedAt: new Date().toISOString(),
    },
    verifiedAt: new Date().toISOString(),
  };

  const failedResetReceipt: VerifiedResetReceipt = {
    ...validResetReceipt,
    baselineEquivalent: false,
    isVerifiedRestored: false,
    readback: {
      ...validResetReceipt.readback,
      isEquivalent: false,
      discrepancies: ['Account balance was dirty after reset.'],
    },
  };

  it('concludes CONFIRMED_REPRODUCED when two valid comparable runs both exhibit reported failure (TC1)', () => {
    const att1 = createAttempt(1, 'REPORTED_FAILURE');
    const att2 = createAttempt(2, 'REPORTED_FAILURE');

    const result = PairAssessor.assessPair({
      investigationId,
      attempt1: att1,
      attempt2: att2,
      resetReceipt: validResetReceipt,
      targetBuildIdAttempt1: 'v1.0.0',
      targetBuildIdAttempt2: 'v1.0.0',
    });

    expect(result.verdict).toBe('CONFIRMED_REPRODUCED');
    expect(result.isComparable).toBe(true);
    expect(result.validAttemptCount).toBe(2);
    expect(result.matchingAttemptCount).toBe(2);
    expect(result.summary).toContain('Defect confirmed');
  });

  it('concludes NOT_REPRODUCED when two valid comparable runs both show correct expected behavior (TC2)', () => {
    const att1 = createAttempt(1, 'EXPECTED_BEHAVIOR');
    const att2 = createAttempt(2, 'EXPECTED_BEHAVIOR');

    const result = PairAssessor.assessPair({
      investigationId,
      attempt1: att1,
      attempt2: att2,
      resetReceipt: validResetReceipt,
      targetBuildIdAttempt1: 'v1.0.0',
      targetBuildIdAttempt2: 'v1.0.0',
    });

    expect(result.verdict).toBe('NOT_REPRODUCED');
    expect(result.isComparable).toBe(true);
    expect(result.validAttemptCount).toBe(2);
    expect(result.matchingAttemptCount).toBe(0);
    expect(result.summary).toContain('Bug not reproduced');
  });

  it('concludes INCONSISTENT_OBSERVATIONS when failure is observed once (Att 1 failure, Att 2 clean)', () => {
    const att1 = createAttempt(1, 'REPORTED_FAILURE');
    const att2 = createAttempt(2, 'EXPECTED_BEHAVIOR');

    const result = PairAssessor.assessPair({
      investigationId,
      attempt1: att1,
      attempt2: att2,
      resetReceipt: validResetReceipt,
    });

    expect(result.verdict).toBe('INCONSISTENT_OBSERVATIONS');
    expect(result.isComparable).toBe(true);
    expect(result.validAttemptCount).toBe(2);
    expect(result.matchingAttemptCount).toBe(1);
    expect(result.limitations.some((l) => l.includes('observed in only one of the two runs'))).toBe(true);
  });

  it('concludes INCONSISTENT_OBSERVATIONS in reverse order (Att 1 clean, Att 2 failure)', () => {
    const att1 = createAttempt(1, 'EXPECTED_BEHAVIOR');
    const att2 = createAttempt(2, 'REPORTED_FAILURE');

    const result = PairAssessor.assessPair({
      investigationId,
      attempt1: att1,
      attempt2: att2,
      resetReceipt: validResetReceipt,
    });

    expect(result.verdict).toBe('INCONSISTENT_OBSERVATIONS');
    expect(result.matchingAttemptCount).toBe(1);
  });

  it('concludes INCONSISTENT_OBSERVATIONS when both runs show unexpected unrelated outcomes', () => {
    const att1 = createAttempt(1, 'UNEXPECTED_OUTCOME');
    const att2 = createAttempt(2, 'UNEXPECTED_OUTCOME');

    const result = PairAssessor.assessPair({
      investigationId,
      attempt1: att1,
      attempt2: att2,
      resetReceipt: validResetReceipt,
    });

    expect(result.verdict).toBe('INCONSISTENT_OBSERVATIONS');
    expect(result.verdict).not.toBe('CONFIRMED_REPRODUCED');
    expect(result.verdict).not.toBe('NOT_REPRODUCED');
  });

  it('concludes INCONCLUSIVE when Attempt 1 observed failure but Attempt 2 is reset-blocked (observed once preserved)', () => {
    const att1 = createAttempt(1, 'REPORTED_FAILURE');
    // Attempt 2 not executed because reset failed

    const result = PairAssessor.assessPair({
      investigationId,
      attempt1: att1,
      attempt2: undefined,
      resetReceipt: failedResetReceipt,
    });

    expect(result.verdict).toBe('INCONCLUSIVE');
    expect(result.isComparable).toBe(false);
    expect(result.validAttemptCount).toBe(1);
    expect(result.matchingAttemptCount).toBe(1);
    // Preserves observed once fact in limitations
    expect(result.limitations.some((l) => l.includes('observed once in Attempt 1'))).toBe(true);
  });

  it('concludes INCONCLUSIVE when target build changes between attempts', () => {
    const att1 = createAttempt(1, 'REPORTED_FAILURE');
    const att2 = createAttempt(2, 'REPORTED_FAILURE');

    const result = PairAssessor.assessPair({
      investigationId,
      attempt1: att1,
      attempt2: att2,
      resetReceipt: validResetReceipt,
      targetBuildIdAttempt1: 'build-v1.0.0',
      targetBuildIdAttempt2: 'build-v1.0.1', // Build modified mid-experiment!
    });

    expect(result.verdict).toBe('INCONCLUSIVE');
    expect(result.isComparable).toBe(false);
    expect(result.limitations.some((l) => l.includes('build identity changed'))).toBe(true);
  });

  it('concludes INCONCLUSIVE when investigation was cancelled by human operator', () => {
    const att1 = createAttempt(1, 'REPORTED_FAILURE');

    const result = PairAssessor.assessPair({
      investigationId,
      attempt1: att1,
      isCancelled: true,
    });

    expect(result.verdict).toBe('INCONCLUSIVE');
    expect(result.summary).toContain('cancelled by user operator');
  });
});
