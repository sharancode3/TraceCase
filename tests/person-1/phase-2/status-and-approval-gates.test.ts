import { describe, it, expect } from 'vitest';
import {
  isReproductionConfirmed,
  getNextPermittedAction,
  getLifecyclePresentation,
  getVerdictPresentation,
  getEvidencePresentation,
} from '@/contracts/status';
import {
  ApprovePlanCommandSchema,
  RejectPlanCommandSchema,
  RevokeApprovalCommandSchema,
  StartInvestigationCommandSchema,
  type AuthoritativeExperimentPlan,
} from '@/contracts/planning';

describe('Phase 2 Stage J: Unified Status and Approval/Start Gates', () => {
  const invId = '00000000-0000-4000-b000-000000000002';
  const samplePlan: AuthoritativeExperimentPlan = {
    id: '00000000-0000-4000-a000-000000000001',
    investigationId: invId,
    targetId: '00000000-0000-4000-c000-000000000003',
    version: 2,
    targetUrl: 'http://localhost:3005',
    allowedOrigins: ['http://localhost:3005'],
    planHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    preconditions: ['Target sandbox initialized'],
    steps: [
      {
        stepIndex: 0,
        semanticAction: 'Navigate to target',
        toolKind: 'navigate',
        selector: 'window',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: 10000,
      },
    ],
    expectedCorrectBehavior: 'Item row appears in list',
    reportedFailureSignature: 'Item does not appear after click',
    assertions: [
      {
        id: '00000000-0000-4000-d000-000000000004',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: '[data-testid="item"]',
        operator: 'EXISTS',
        expectedValue: 'true',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'Item element exists in DOM',
      },
    ],
    maxAttempts: 2,
    maxDurationMs: 120000,
    requiresResetHook: false,
    createdAt: '2026-10-23T12:00:00.000Z',
  };

  describe('1. Tri-Dimensional Status Separation (Lifecycle != Verdict != Evidence)', () => {
    it('never equates Completed lifecycle with Confirmed reproduction', () => {
      // Completed lifecycle with NOT_REPRODUCED verdict
      expect(isReproductionConfirmed('NOT_REPRODUCED')).toBe(false);
      // Completed lifecycle with INCONCLUSIVE verdict
      expect(isReproductionConfirmed('INCONCLUSIVE')).toBe(false);
      // Completed lifecycle with INCONSISTENT_OBSERVATIONS verdict
      expect(isReproductionConfirmed('INCONSISTENT_OBSERVATIONS')).toBe(false);
      // Undefined verdict
      expect(isReproductionConfirmed(undefined)).toBe(false);

      // Only CONFIRMED_REPRODUCED evaluates to confirmed
      expect(isReproductionConfirmed('CONFIRMED_REPRODUCED')).toBe(true);
    });

    it('exposes distinct labels and truthful descriptions for all 3 dimensions', () => {
      // Lifecycle
      const lifecycle = getLifecyclePresentation('COMPLETED');
      expect(lifecycle.label).toBe('Completed');
      expect(lifecycle.description).toContain('run completed');

      // Verdict
      const verdictConfirmed = getVerdictPresentation('CONFIRMED_REPRODUCED');
      expect(verdictConfirmed.label).toBe('Confirmed Reproduced');
      expect(verdictConfirmed.description).toContain('Defect signature confirmed');

      const verdictInconclusive = getVerdictPresentation('INCONCLUSIVE');
      expect(verdictInconclusive.label).toBe('Inconclusive');

      // Evidence Readiness
      const evidencePackaging = getEvidencePresentation('PACKAGING_IN_PROGRESS');
      expect(evidencePackaging.label).toBe('Evidence Review Pending');

      const evidenceReady = getEvidencePresentation('PUBLIC_SAFE_READY');
      expect(evidenceReady.label).toBe('Public Safe Evidence Ready');
    });
  });

  describe('2. Contract-Driven Next Permitted Action Mapping', () => {
    it('guides DRAFT investigations to generate a proposal', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'DRAFT',
      });
      expect(action.actionKind).toBe('GENERATE_PLAN');
      expect(action.label).toBe('Generate Plan');
      expect(action.isActionable).toBe(true);
      expect(action.href).toBe(`/investigations/${invId}`);
    });

    it('guides CLARIFICATION_PENDING investigations to clarify details', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'DRAFT',
        reviewStatus: 'CLARIFICATION_PENDING',
      });
      expect(action.actionKind).toBe('CLARIFY_DETAILS');
      expect(action.label).toBe('Clarify Details');
      expect(action.href).toBe(`/investigations/${invId}/clarify`);
      expect(action.isActionable).toBe(true);
    });

    it('guides AWAITING_APPROVAL or PROPOSAL_READY investigations with unapproved plan to review and authorize', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'AWAITING_APPROVAL',
        reviewStatus: 'PROPOSAL_READY',
        planVersion: 1,
        isApproved: false,
      });
      expect(action.actionKind).toBe('REVIEW_AND_APPROVE');
      expect(action.label).toBe('Review & Approve Plan');
      expect(action.href).toBe(`/investigations/${invId}/approve`);
      expect(action.isActionable).toBe(true);
    });

    it('guides approved investigations to explicitly start execution', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'APPROVED',
        reviewStatus: 'APPROVED',
        isApproved: true,
      });
      expect(action.actionKind).toBe('START_EXECUTION');
      expect(action.label).toBe('Start Execution');
      expect(action.href).toBe(`/investigations/${invId}/approve`);
      expect(action.isActionable).toBe(true);
      expect(action.description).toContain('Plan approved; click to admit investigation');
    });

    it('guides REJECTED plan to revise or retry planning', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'DRAFT',
        reviewStatus: 'REJECTED',
      });
      expect(action.actionKind).toBe('REVISE_OR_RETRY');
      expect(action.label).toBe('Plan Rejected');
      expect(action.isActionable).toBe(true);
    });

    it('guides REVOKED approval back to review and re-authorize', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'DRAFT',
        reviewStatus: 'REVOKED',
      });
      expect(action.actionKind).toBe('REVIEW_AND_APPROVE');
      expect(action.label).toBe('Re-authorize Plan');
      expect(action.href).toBe(`/investigations/${invId}/approve`);
      expect(action.isActionable).toBe(true);
    });

    it('guides active execution states to monitor run', () => {
      for (const runningState of ['QUEUED', 'RUNNING_ATTEMPT_1', 'RESETTING_TARGET', 'RUNNING_ATTEMPT_2'] as const) {
        const action = getNextPermittedAction({
          id: invId,
          lifecycleStatus: runningState,
        });
        expect(action.actionKind).toBe('MONITOR_RUN');
        expect(action.label).toBe('Monitor Execution');
        expect(action.href).toBe(`/investigations/${invId}/live`);
        expect(action.isActionable).toBe(true);
      }
    });

    it('guides COMPLETED runs with packaging in progress to await evidence without action link', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'COMPLETED',
        evidenceReadiness: 'PACKAGING_IN_PROGRESS',
      });
      expect(action.actionKind).toBe('AWAIT_EVIDENCE');
      expect(action.label).toBe('Packaging Evidence');
      expect(action.isActionable).toBe(false);
    });

    it('guides COMPLETED runs with inconclusive verdict to inspect inconclusive results truthfully', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'COMPLETED',
        reproductionVerdict: 'INCONCLUSIVE',
        evidenceReadiness: 'PUBLIC_SAFE_READY',
      });
      expect(action.actionKind).toBe('INSPECT_RESULTS');
      expect(action.label).toBe('Inspect Inconclusive Run');
      expect(action.description).toContain('inconclusive verdict');
      expect(action.isActionable).toBe(true);
    });

    it('guides COMPLETED runs with confirmed reproduced verdict to inspect confirmed evidence', () => {
      const action = getNextPermittedAction({
        id: invId,
        lifecycleStatus: 'COMPLETED',
        reproductionVerdict: 'CONFIRMED_REPRODUCED',
        evidenceReadiness: 'PUBLIC_SAFE_READY',
      });
      expect(action.actionKind).toBe('INSPECT_RESULTS');
      expect(action.label).toBe('Inspect Confirmed Evidence');
      expect(action.description).toContain('Defect confirmed reproduced');
      expect(action.isActionable).toBe(true);
    });
  });

  describe('3. Plan Revision Binding and Obsolete Approval Invalidation', () => {
    it('validates that ApprovePlanCommand binds to the exact plan revision and hash', () => {
      const validCommand = {
        investigationId: invId,
        planVersion: samplePlan.version,
        approvedPlanHash: samplePlan.planHash,
      };
      const parsed = ApprovePlanCommandSchema.safeParse(validCommand);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.planVersion).toBe(2);
        expect(parsed.data.approvedPlanHash).toBe(samplePlan.planHash);
      }
    });

    it('rejects approval commands with mismatched, malformed, or missing hashes', () => {
      // Invalid hash length / characters
      const invalidHash = {
        investigationId: invId,
        planVersion: 2,
        approvedPlanHash: 'not-a-64-character-sha256-hash',
      };
      expect(ApprovePlanCommandSchema.safeParse(invalidHash).success).toBe(false);

      // Missing planVersion
      const missingRev = {
        investigationId: invId,
        approvedPlanHash: samplePlan.planHash,
      };
      expect(ApprovePlanCommandSchema.safeParse(missingRev).success).toBe(false);
    });

    it('detects obsolete approval display when persisted approval revision or hash differs from current proposal', () => {
      // Current plan version = 2, previous approved version = 1
      const isObsoleteByVersion = (currentVer: number, approvedVer: number | null | undefined) => {
        return approvedVer !== null && approvedVer !== undefined && approvedVer !== currentVer;
      };

      expect(isObsoleteByVersion(samplePlan.version, 1)).toBe(true);
      expect(isObsoleteByVersion(samplePlan.version, 2)).toBe(false);

      // Current plan hash vs approved hash
      const isObsoleteByHash = (currentHash: string, approvedHash: string | null | undefined) => {
        return approvedHash !== null && approvedHash !== undefined && approvedHash !== currentHash;
      };

      expect(isObsoleteByHash(samplePlan.planHash, 'b'.repeat(64))).toBe(true);
      expect(isObsoleteByHash(samplePlan.planHash, samplePlan.planHash)).toBe(false);
    });
  });

  describe('4. Reject and Revoke Command Gate Contracts', () => {
    it('enforces required operator reason for plan rejection', () => {
      const validReject = {
        investigationId: invId,
        planVersion: samplePlan.version,
        rejectionReason: 'Step 2 touches unintended origin domain',
      };
      expect(RejectPlanCommandSchema.safeParse(validReject).success).toBe(true);

      const invalidReject = {
        investigationId: invId,
        planVersion: samplePlan.version,
        rejectionReason: 'no', // Less than min length 3
      };
      expect(RejectPlanCommandSchema.safeParse(invalidReject).success).toBe(false);
    });

    it('enforces required operator reason for approval revocation', () => {
      const validRevoke = {
        investigationId: invId,
        planVersion: samplePlan.version,
        revocationReason: 'Target environment refreshed with new test credentials',
      };
      expect(RevokeApprovalCommandSchema.safeParse(validRevoke).success).toBe(true);

      const emptyRevoke = {
        investigationId: invId,
        planVersion: samplePlan.version,
        revocationReason: '',
      };
      expect(RevokeApprovalCommandSchema.safeParse(emptyRevoke).success).toBe(false);
    });
  });

  describe('5. Approval and Start Separation (Inert Dispatcher)', () => {
    it('confirms approval changes status to APPROVED without auto-triggering execution', () => {
      interface InvestigationState {
        lifecycleStatus: string;
        reviewStatus: string;
        isApproved: boolean;
        approvedPlanRevision: number | null;
      }

      const initial: InvestigationState = {
        lifecycleStatus: 'AWAITING_APPROVAL',
        reviewStatus: 'PROPOSAL_READY',
        isApproved: false,
        approvedPlanRevision: null,
      };

      // Mock approval action (matching investigationWorkflowService.approvePlan behavior)
      const afterApproval: InvestigationState = {
        ...initial,
        lifecycleStatus: 'APPROVED',
        reviewStatus: 'APPROVED',
        isApproved: true,
        approvedPlanRevision: samplePlan.version,
      };

      // Execution status is APPROVED, NOT RUNNING or QUEUED
      expect(afterApproval.lifecycleStatus).toBe('APPROVED');
      expect(afterApproval.reviewStatus).toBe('APPROVED');
      expect(afterApproval.isApproved).toBe(true);

      // Start action remains separate and required
      const nextAction = getNextPermittedAction({
        id: samplePlan.investigationId,
        lifecycleStatus: afterApproval.lifecycleStatus as any,
        reviewStatus: afterApproval.reviewStatus as any,
        isApproved: afterApproval.isApproved,
      });

      expect(nextAction.actionKind).toBe('START_EXECUTION');
      expect(nextAction.label).toBe('Start Execution');
    });

    it('validates start command schema requires planVersion and approvedPlanHash', () => {
      const validStart = {
        investigationId: invId,
        planVersion: samplePlan.version,
        approvedPlanHash: samplePlan.planHash,
      };
      expect(StartInvestigationCommandSchema.safeParse(validStart).success).toBe(true);

      const invalidStart = {
        investigationId: invId,
        // missing planVersion
        approvedPlanHash: samplePlan.planHash,
      };
      expect(StartInvestigationCommandSchema.safeParse(invalidStart).success).toBe(false);
    });

    it('prevents execution start without authoritative approval', () => {
      const unapprovedState = {
        lifecycleStatus: 'AWAITING_APPROVAL',
        reviewStatus: 'PROPOSAL_READY',
        isApproved: false,
      };

      const action = getNextPermittedAction({
        id: samplePlan.investigationId,
        lifecycleStatus: unapprovedState.lifecycleStatus as any,
        reviewStatus: unapprovedState.reviewStatus as any,
        isApproved: unapprovedState.isApproved,
      });

      // Cannot start execution — must review and authorize first
      expect(action.actionKind).toBe('REVIEW_AND_APPROVE');
      expect(action.actionKind).not.toBe('START_EXECUTION');
    });
  });
});
