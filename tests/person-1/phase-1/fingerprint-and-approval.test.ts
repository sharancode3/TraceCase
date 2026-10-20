import { describe, it, expect } from 'vitest';
import {
  calculateAuthoritativePlanFingerprint,
  canonicalJsonStringify,
} from '@/server/policy/plan-fingerprint';
import {
  verifyAuthoritativeApprovalCompatibility,
} from '@/server/policy/approval-guard';
import type { AuthoritativeExperimentPlan, AuthoritativeApprovalRecord } from '@/contracts/planning';

describe('P1-01: Fingerprint Determinism and Authoritative Approval Guard', () => {
  const basePlan: AuthoritativeExperimentPlan = {
    id: '11111111-1111-4111-8111-111111111111',
    investigationId: '22222222-2222-4222-8222-222222222222',
    version: 1,
    targetId: '33333333-3333-4333-8333-333333333333',
    targetUrl: 'http://localhost:3005',
    allowedOrigins: ['http://localhost:3005'],
    testAccountRef: 'test-admin',
    preconditions: ['Target fixture reset to baseline', 'Active filter selected'],
    steps: [
      {
        stepIndex: 0,
        semanticAction: 'Click Active filter',
        toolKind: 'click_button',
        selector: '#filter-active',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: 5000,
      },
      {
        stepIndex: 1,
        semanticAction: 'Click delete button for first item',
        toolKind: 'click_button',
        selector: '.item-row:first-child .delete-btn',
        tier: 'TIER_3_MUTATING_INTERACTION',
        timeoutMs: 5000,
      },
    ],
    expectedCorrectBehavior: 'First active item is deleted from list',
    reportedFailureSignature: 'First item remains; wrong completed item deleted',
    assertions: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'REPORTED_FAILURE_SIGNATURE',
        subjectRef: '.item-row[data-id="task-1"]',
        operator: 'EXISTS',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'Assert task-1 is still present after delete attempt',
      },
    ],
    maxAttempts: 2,
    maxDurationMs: 60000,
    requiresResetHook: true,
    planHash: '', // Will be calculated
    createdAt: '2026-10-20T12:00:00.000Z',
  };

  it('produces identical fingerprints regardless of JSON object-key insertion order', () => {
    const objA = { z: 1, a: 'hello', m: { b: 2, a: 1 } };
    const objB = { a: 'hello', m: { a: 1, b: 2 }, z: 1 };

    expect(canonicalJsonStringify(objA)).toBe(canonicalJsonStringify(objB));
  });

  it('alters fingerprint when semantic step order is reversed', () => {
    const forwardPlan = { ...basePlan };
    const reversedStepsPlan = {
      ...basePlan,
      steps: [basePlan.steps[1], basePlan.steps[0]],
    };

    const hash1 = calculateAuthoritativePlanFingerprint(forwardPlan);
    const hash2 = calculateAuthoritativePlanFingerprint(reversedStepsPlan);

    expect(hash1).not.toBe(hash2);
  });

  it('alters fingerprint when target or assertions change', () => {
    const hashOriginal = calculateAuthoritativePlanFingerprint(basePlan);

    const changedTargetPlan = {
      ...basePlan,
      targetId: '99999999-9999-4999-8999-999999999999',
    };
    expect(calculateAuthoritativePlanFingerprint(changedTargetPlan)).not.toBe(hashOriginal);

    const changedAssertionPlan = {
      ...basePlan,
      assertions: [
        {
          ...basePlan.assertions[0],
          operator: 'NOT_EXISTS' as const,
        },
      ],
    };
    expect(calculateAuthoritativePlanFingerprint(changedAssertionPlan)).not.toBe(hashOriginal);
  });

  it('strictly rejects incomplete or invalid authoritative payloads', () => {
    const incompletePlan = {
      version: 1,
      targetUrl: 'not-a-valid-url', // Invalid URL
    };

    expect(() => calculateAuthoritativePlanFingerprint(incompletePlan)).toThrow();
  });

  it('validates authoritative approval compatibility and rejects cross-investigation reuse', () => {
    const hash = calculateAuthoritativePlanFingerprint(basePlan);
    const validPlan: AuthoritativeExperimentPlan = { ...basePlan, planHash: hash };

    const validApproval: AuthoritativeApprovalRecord = {
      id: '55555555-5555-4555-8555-555555555555',
      investigationId: basePlan.investigationId,
      planVersion: basePlan.version,
      planHash: hash,
      targetId: basePlan.targetId,
      authorizedActorId: 'operator-alice',
      maxActionTierPermitted: 'TIER_3_MUTATING_INTERACTION',
      approvedAt: '2026-10-20T12:05:00.000Z',
    };

    const trustedContext = {
      targetId: basePlan.targetId,
      actorId: 'operator-alice',
    };

    // 1. Valid approval
    const resultValid = verifyAuthoritativeApprovalCompatibility({
      plan: validPlan,
      approval: validApproval,
      trustedContext,
    });
    expect(resultValid.isCompatible).toBe(true);

    // 2. Cross-investigation reuse rejected (TC-INV-004)
    const crossInvestigationApproval: AuthoritativeApprovalRecord = {
      ...validApproval,
      investigationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    const resultCross = verifyAuthoritativeApprovalCompatibility({
      plan: validPlan,
      approval: crossInvestigationApproval,
      trustedContext,
    });
    expect(resultCross.isCompatible).toBe(false);
    expect(resultCross.reason).toContain('Cross-investigation approval reuse rejected');

    // 3. Target scope mismatch rejected
    const wrongTargetApproval: AuthoritativeApprovalRecord = {
      ...validApproval,
      targetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const resultWrongTarget = verifyAuthoritativeApprovalCompatibility({
      plan: validPlan,
      approval: wrongTargetApproval,
      trustedContext,
    });
    expect(resultWrongTarget.isCompatible).toBe(false);
    expect(resultWrongTarget.reason).toContain('Target scope mismatch');

    // 4. Revoked approval fails closed
    const revokedApproval: AuthoritativeApprovalRecord = {
      ...validApproval,
      revokedAt: '2026-10-20T12:10:00.000Z',
    };
    const resultRevoked = verifyAuthoritativeApprovalCompatibility({
      plan: validPlan,
      approval: revokedApproval,
      trustedContext,
    });
    expect(resultRevoked.isCompatible).toBe(false);
    expect(resultRevoked.reason).toContain('explicitly revoked');

    // 5. Expired approval fails closed
    const expiredApproval: AuthoritativeApprovalRecord = {
      ...validApproval,
      expiresAt: '2026-10-20T12:00:00.000Z',
    };
    const resultExpired = verifyAuthoritativeApprovalCompatibility({
      plan: validPlan,
      approval: expiredApproval,
      trustedContext: { ...trustedContext, currentTimestamp: '2026-10-20T13:00:00.000Z' },
    });
    expect(resultExpired.isCompatible).toBe(false);
    expect(resultExpired.reason).toContain('Approval expired');
  });
});
