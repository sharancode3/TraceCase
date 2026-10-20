import { describe, it, expect } from 'vitest';
import { calculatePlanFingerprint, canonicalJsonStringify } from '@/server/policy/plan-fingerprint';
import { verifyApprovalCompatibility } from '@/server/policy/approval-guard';
import { createInitialProgressState, reduceProgressEvent } from '@/features/investigations/event-reducer';
import { SYNTHETIC_PLAN_V1 } from '@/dev/fixtures';
import type { InvestigationProgressEvent } from '@/contracts/events';

describe('Domain Logic and Pure Helpers Verification', () => {
  it('generates consistent hash regardless of object property ordering', () => {
    const objA = { z: 1, a: 2, m: { y: 10, x: 20 } };
    const objB = { a: 2, z: 1, m: { x: 20, y: 10 } };
    expect(canonicalJsonStringify(objA)).toEqual(canonicalJsonStringify(objB));
  });

  it('detects material plan modifications and alters fingerprint (TC-INV-004)', () => {
    const originalHash = calculatePlanFingerprint(SYNTHETIC_PLAN_V1);

    const modifiedPlan = {
      ...SYNTHETIC_PLAN_V1,
      steps: [
        ...SYNTHETIC_PLAN_V1.steps,
        {
          stepIndex: 3,
          semanticAction: 'Extra click action injected',
          toolKind: 'click_button' as const,
          selector: 'button#extra',
          tier: 'TIER_2_SAFE_INTERACTION' as const,
          timeoutMs: 5000,
        },
      ],
    };

    const modifiedHash = calculatePlanFingerprint(modifiedPlan);
    expect(modifiedHash).not.toEqual(originalHash);
  });

  it('fails approval compatibility when plan has been tampered with', () => {
    const validApproval = {
      id: 'app-001',
      investigationId: SYNTHETIC_PLAN_V1.investigationId,
      planVersion: SYNTHETIC_PLAN_V1.version,
      planHash: calculatePlanFingerprint(SYNTHETIC_PLAN_V1),
      approvedBy: 'usr-operator-01',
      operatorNotes: 'Approved for test run',
      approvedAt: new Date().toISOString(),
    };

    // Valid plan check
    const validCheck = verifyApprovalCompatibility(SYNTHETIC_PLAN_V1, validApproval);
    expect(validCheck.isCompatible).toBe(true);

    // Tampered plan check
    const tamperedPlan = {
      ...SYNTHETIC_PLAN_V1,
      expectedCorrectBehavior: 'Modified expectations after approval',
    };
    const tamperedCheck = verifyApprovalCompatibility(tamperedPlan, validApproval);
    expect(tamperedCheck.isCompatible).toBe(false);
    expect(tamperedCheck.reason).toContain('Plan content has been modified');
  });

  it('fails closed when approval record is missing', () => {
    const result = verifyApprovalCompatibility(SYNTHETIC_PLAN_V1, null);
    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('No approval record exists');
  });

  it('deduplicates progress events by event ID', () => {
    let state = createInitialProgressState('APPROVED');

    const duplicateEvent: InvestigationProgressEvent = {
      eventId: 'evt-unique-001',
      schemaVersion: 1,
      investigationId: 'inv-001',
      sequenceIndex: 0,
      eventType: 'ATTEMPT_STARTED',
      timestamp: new Date().toISOString(),
      payload: { attemptNumber: 1 },
    };

    state = reduceProgressEvent(state, duplicateEvent);
    expect(state.events.length).toBe(1);
    expect(state.currentAttempt).toBe(1);

    // Feed same event again
    state = reduceProgressEvent(state, duplicateEvent);
    expect(state.events.length).toBe(1); // Deduplicated!
  });
});
