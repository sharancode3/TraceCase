import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyAuthoritativeApprovalCompatibility } from '@/server/policy/approval-guard';
import { calculateAuthoritativePlanFingerprint } from '@/server/policy/plan-fingerprint';
import { getServerEnv, _resetCachedEnvForTesting } from '@/server/config/env';
import { AuthoritativeApprovalRecord, AuthoritativeExperimentPlan } from '@/contracts/planning';

describe('P1-02: Policy Regressions & Approval Boundary Guardrails', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetCachedEnvForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetCachedEnvForTesting();
  });

  const basePlanTemplate: AuthoritativeExperimentPlan = {
    id: '33333333-3333-4333-8333-333333333333',
    investigationId: '22222222-2222-4222-8222-222222222222',
    version: 1,
    targetId: '44444444-4444-4444-8444-444444444444',
    targetUrl: 'https://staging.example.com',
    allowedOrigins: ['https://staging.example.com'],
    preconditions: ['User is logged in'],
    steps: [
      {
        stepIndex: 0,
        semanticAction: 'navigate to home',
        toolKind: 'navigate',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: 5000,
      },
    ],
    expectedCorrectBehavior: 'Home page loads successfully',
    reportedFailureSignature: 'Page fails with error 500',
    assertions: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: '#app',
        operator: 'EXISTS',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'App container exists',
      },
    ],
    maxAttempts: 2,
    maxDurationMs: 60000,
    requiresResetHook: true,
    planHash: '',
    createdAt: new Date().toISOString(),
  };

  const planHash = calculateAuthoritativePlanFingerprint(basePlanTemplate);
  const basePlan: AuthoritativeExperimentPlan = { ...basePlanTemplate, planHash };

  const baseApproval: AuthoritativeApprovalRecord = {
    id: '11111111-1111-4111-8111-111111111111',
    investigationId: basePlan.investigationId,
    planVersion: 1,
    planHash: planHash,
    targetId: basePlan.targetId,
    authorizedActorId: 'operator-alice-123',
    maxActionTierPermitted: 'TIER_3_MUTATING_INTERACTION',
    approvedAt: new Date(Date.now() - 60000).toISOString(),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  it('rejects approval when executing actor does not match authorized actor (P1-02 fix)', () => {
    const result = verifyAuthoritativeApprovalCompatibility({
      plan: basePlan,
      approval: baseApproval,
      trustedContext: {
        targetId: basePlan.targetId,
        actorId: 'attacker-or-different-operator', // Mismatched actor
      },
    });

    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('Approval actor mismatch');
  });

  it('allows execution when executing actor matches authorized actor', () => {
    const result = verifyAuthoritativeApprovalCompatibility({
      plan: basePlan,
      approval: baseApproval,
      trustedContext: {
        targetId: basePlan.targetId,
        actorId: 'operator-alice-123',
      },
    });

    expect(result.isCompatible).toBe(true);
  });

  it('enforces action tier ceiling hierarchy strictly (P1-02 fix)', () => {
    // Approval grants up to TIER_2_SAFE_INTERACTION
    const limitedApproval: AuthoritativeApprovalRecord = {
      ...baseApproval,
      maxActionTierPermitted: 'TIER_2_SAFE_INTERACTION',
    };

    // Plan steps contain TIER_3_MUTATING_INTERACTION which exceeds tier ceiling
    const planWithMutatingStep: AuthoritativeExperimentPlan = {
      ...basePlanTemplate,
      steps: [
        {
          stepIndex: 0,
          semanticAction: 'Delete account button clicked',
          toolKind: 'click_button',
          tier: 'TIER_3_MUTATING_INTERACTION',
          timeoutMs: 5000,
        },
      ],
    };
    const mutatingHash = calculateAuthoritativePlanFingerprint(planWithMutatingStep);
    const planToTest = { ...planWithMutatingStep, planHash: mutatingHash };
    const approvalToTest = { ...limitedApproval, planHash: mutatingHash };

    const result = verifyAuthoritativeApprovalCompatibility({
      plan: planToTest,
      approval: approvalToTest,
      trustedContext: {
        targetId: basePlan.targetId,
        actorId: 'operator-alice-123',
      },
    });

    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('exceeds approved maximum tier');
  });

  it('rejects approval when approval expiry string is an invalid timestamp (P1-02 fix)', () => {
    const invalidDateApproval: AuthoritativeApprovalRecord = {
      ...baseApproval,
      expiresAt: 'not-a-valid-iso-date',
    };

    const result = verifyAuthoritativeApprovalCompatibility({
      plan: basePlan,
      approval: invalidDateApproval,
      trustedContext: {
        targetId: basePlan.targetId,
        actorId: 'operator-alice-123',
      },
    });

    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('Invalid expiration timestamp');
  });

  it('defaults DEV_PREVIEW_MODE strictly to false when omitted or empty (P1-02 fix)', () => {
    delete process.env.DEV_PREVIEW_MODE;
    _resetCachedEnvForTesting();

    const env = getServerEnv();
    expect(env.DEV_PREVIEW_MODE).toBe(false);
  });
});
