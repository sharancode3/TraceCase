import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { InvestigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { ConflictError, PolicyViolationError, NotFoundError } from '@/server/workflow/workflow-errors';
import { ReportClarificationAgentPort } from '@/server/services/ports';
import { ModelExperimentProposal } from '@/contracts/planning';
import { calculateAuthoritativePlanFingerprint } from '@/server/policy/plan-fingerprint';
import { Phase3TestDbMock } from './test-db-mock';

describe('P1-03: Workflow State Machine & Human Approval Lifecycle', () => {
  let mockDb: Phase3TestDbMock;
  let workflowService: InvestigationWorkflowService;

  const principalA = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'operator1@tracecase.internal',
    role: 'operator',
  };

  const principalB = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'operator2@tracecase.internal',
    role: 'operator',
  };

  const targetA = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ownerId: principalA.id,
    name: 'Verified Target Demo',
    environment: 'demo',
    baseUrl: 'https://demo.app.local',
    allowedOrigins: ['https://demo.app.local'],
    isSandbox: true,
    isSandboxVerified: true,
    maxAllowedTier: 'TIER_4_DESTRUCTIVE',
    hasResetCapability: true,
  };

  const reportA = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ownerId: principalA.id,
    targetId: targetA.id,
    title: 'Checkout button fails with 500',
    rawDescription: 'Clicking checkout with 2 items yields an error banner',
    expectedBehavior: 'Order confirmation page loads',
    observedBehavior: 'Error 500 banner is displayed',
  };

  const sampleProposal: ModelExperimentProposal = {
    preconditions: ['Target app is reachable', 'Cart has 2 items'],
    steps: [
      {
        stepIndex: 0,
        semanticAction: 'Navigate to cart page',
        toolKind: 'navigate',
        value: 'https://demo.app.local/cart',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: 15000,
      },
      {
        stepIndex: 1,
        semanticAction: 'Click checkout submit',
        toolKind: 'click_button',
        selector: '#checkout-submit-btn',
        tier: 'TIER_3_MUTATING_INTERACTION',
        timeoutMs: 10000,
      },
    ],
    expectedCorrectBehavior: 'Order confirmation page loads successfully',
    reportedFailureSignature: 'Error 500 banner is displayed with transaction aborted',
    assertions: [
      {
        id: '99999999-9999-4999-8999-999999999991',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: '.order-success-card',
        operator: 'EXISTS',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'Verify success card exists',
      },
      {
        id: '99999999-9999-4999-8999-999999999992',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'REPORTED_FAILURE_SIGNATURE',
        subjectRef: '.error-500-banner',
        operator: 'EXISTS',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'Verify error banner is displayed',
      },
    ],
    requiresResetHook: true,
  };

  const mockPlannerPort: ReportClarificationAgentPort = {
    async generateProposal() {
      return {
        status: 'EXPERIMENT_PROPOSED',
        proposal: sampleProposal,
      };
    },
  };

  beforeEach(() => {
    mockDb = new Phase3TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    workflowService = new InvestigationWorkflowService(() => mockDb as any);

    // Seed tenant target and report
    mockDb.targets.push({ ...targetA });
    mockDb.bugReports.push({ ...reportA });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  async function createInitialInvestigation() {
    const inv = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ownerId: principalA.id,
      targetId: targetA.id,
      reportId: reportA.id,
      lifecycleStatus: 'INITIALIZED',
      reviewStatus: 'PENDING_PLANNING',
      workflowRevision: 1,
      planVersion: null,
      planHash: null,
      activeAttemptNumber: null,
      tokenCostUsd: '0.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.investigations.push(inv);
    return inv;
  }

  describe('Planning and Proposal Publication', () => {
    it('generates immutable plan v1, publishes hash, and transitions to PROPOSAL_READY', async () => {
      const inv = await createInitialInvestigation();

      const result = await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        plannerPort: mockPlannerPort,
      });

      expect(result.status).toBe('PROPOSAL_READY');
      if (result.status === 'PROPOSAL_READY') {
        expect(result.plan.version).toBe(1);
        expect(result.plan.targetUrl).toBe(targetA.baseUrl);
        expect(result.plan.planHash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.workflowRevision).toBe(2);

        // Verify stored plan revision
        const storedPlan = mockDb.experimentPlanRevisions.find((r) => r.investigationId === inv.id);
        expect(storedPlan).toBeDefined();
        expect(storedPlan.version).toBe(1);
        expect(storedPlan.planHash).toBe(result.plan.planHash);

        // Verify updated investigation state
        const updatedInv = mockDb.investigations.find((i) => i.id === inv.id);
        expect(updatedInv.reviewStatus).toBe('PROPOSAL_READY');
        expect(updatedInv.planVersion).toBe(1);
        expect(updatedInv.planHash).toBe(result.plan.planHash);
        expect(updatedInv.workflowRevision).toBe(2);
      }
    });

    it('enforces optimistic concurrency if expectedWorkflowRevision is stale', async () => {
      const inv = await createInitialInvestigation();

      // Mismatched expected revision (inv is at 1, request claims 99)
      await expect(
        workflowService.requestPlanning({
          investigationId: inv.id,
          ownerId: principalA.id,
          expectedWorkflowRevision: 99,
          plannerPort: mockPlannerPort,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('prevents another principal from triggering planning on non-owned investigation', async () => {
      const inv = await createInitialInvestigation();

      await expect(
        workflowService.requestPlanning({
          investigationId: inv.id,
          ownerId: principalB.id, // Tenant B attempting to access Tenant A's record
          plannerPort: mockPlannerPort,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Human Approval and Integrity Verification', () => {
    it('successfully approves a valid plan matching stored fingerprint', async () => {
      const inv = await createInitialInvestigation();
      const planResult = await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        plannerPort: mockPlannerPort,
      });

      if (planResult.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');

      const approval = await workflowService.approvePlan({
        investigationId: inv.id,
        ownerId: principalA.id,
        planVersion: 1,
        approvedPlanHash: planResult.plan.planHash,
        operatorNotes: 'Approved after inspecting checkout steps',
        expectedWorkflowRevision: planResult.workflowRevision,
      });

      expect(approval.approved).toBe(true);
      expect(approval.approvalRecord.authorizedActorId).toBe(principalA.id);
      expect(approval.approvalRecord.maxActionTierPermitted).toBe('TIER_3_MUTATING_INTERACTION');
      expect(approval.workflowRevision).toBe(3);

      const updatedInv = mockDb.investigations.find((i) => i.id === inv.id);
      expect(updatedInv.reviewStatus).toBe('APPROVED');
      expect(updatedInv.workflowRevision).toBe(3);

      // Verify read-model snapshot reflects genuine approval
      const snapshot = await workflowService.getInvestigationSnapshot(inv.id, principalA.id);
      expect(snapshot.isApproved).toBe(true);
      expect(snapshot.approvedBy).toBe(principalA.id);
      expect(snapshot.reviewStatus).toBe('APPROVED');
    });

    it('rejects approval when reviewed plan hash does not match stored revision hash', async () => {
      const inv = await createInitialInvestigation();
      const planResult = await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        plannerPort: mockPlannerPort,
      });

      if (planResult.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');

      const tamperedHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

      await expect(
        workflowService.approvePlan({
          investigationId: inv.id,
          ownerId: principalA.id,
          planVersion: 1,
          approvedPlanHash: tamperedHash,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('rejects approval when attempting to approve a stale plan version', async () => {
      const inv = await createInitialInvestigation();
      await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        plannerPort: mockPlannerPort,
      });

      await expect(
        workflowService.approvePlan({
          investigationId: inv.id,
          ownerId: principalA.id,
          planVersion: 99, // stale / non-existent version
          approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('re-planning generates plan v2 and invalidates prior approval', async () => {
      const inv = await createInitialInvestigation();

      // 1. Plan v1
      const plan1 = await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        plannerPort: mockPlannerPort,
      });
      if (plan1.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');

      // 2. Approve v1
      await workflowService.approvePlan({
        investigationId: inv.id,
        ownerId: principalA.id,
        planVersion: 1,
        approvedPlanHash: plan1.plan.planHash,
      });

      let snapshot = await workflowService.getInvestigationSnapshot(inv.id, principalA.id);
      expect(snapshot.isApproved).toBe(true);
      expect(snapshot.planVersion).toBe(1);

      // 3. Replanning generates v2
      const plan2 = await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        userGuidance: 'Focus strictly on cart discount codes',
        plannerPort: mockPlannerPort,
      });
      if (plan2.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');
      expect(plan2.plan.version).toBe(2);

      // 4. Verify snapshot shows v2 is unapproved
      snapshot = await workflowService.getInvestigationSnapshot(inv.id, principalA.id);
      expect(snapshot.isApproved).toBe(false);
      expect(snapshot.planVersion).toBe(2);
      expect(snapshot.reviewStatus).toBe('PROPOSAL_READY');
    });
  });

  describe('Rejection, Revocation, and Cancellation', () => {
    it('operator rejection transitions reviewStatus to REJECTED with persisted reason', async () => {
      const inv = await createInitialInvestigation();
      const plan = await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        plannerPort: mockPlannerPort,
      });
      if (plan.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');

      const result = await workflowService.rejectPlan({
        investigationId: inv.id,
        ownerId: principalA.id,
        planVersion: 1,
        rejectionReason: 'Scope includes unnecessary navigation steps',
      });

      expect(result.rejected).toBe(true);

      const snapshot = await workflowService.getInvestigationSnapshot(inv.id, principalA.id);
      expect(snapshot.reviewStatus).toBe('REJECTED');
      expect(snapshot.rejectionReason).toBe('Scope includes unnecessary navigation steps');
      expect(snapshot.isApproved).toBe(false);
    });

    it('operator revocation marks approval revoked and invalidates approval snapshot', async () => {
      const inv = await createInitialInvestigation();
      const plan = await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        plannerPort: mockPlannerPort,
      });
      if (plan.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');

      await workflowService.approvePlan({
        investigationId: inv.id,
        ownerId: principalA.id,
        planVersion: 1,
        approvedPlanHash: plan.plan.planHash,
      });

      const revokeResult = await workflowService.revokeApproval({
        investigationId: inv.id,
        ownerId: principalA.id,
        planVersion: 1,
        revocationReason: 'Staging environment undergoing scheduled maintenance',
      });

      expect(revokeResult.revoked).toBe(true);

      const snapshot = await workflowService.getInvestigationSnapshot(inv.id, principalA.id);
      expect(snapshot.reviewStatus).toBe('REVOKED');
      expect(snapshot.isApproved).toBe(false);

      // Verify DB record has revokedAt
      const approvalRecord = mockDb.planApprovals.find((a) => a.investigationId === inv.id);
      expect(approvalRecord.revokedAt).toBeDefined();
    });

    it('pre-execution cancellation cancels investigation and revokes any active approval', async () => {
      const inv = await createInitialInvestigation();
      const plan = await workflowService.requestPlanning({
        investigationId: inv.id,
        ownerId: principalA.id,
        plannerPort: mockPlannerPort,
      });
      if (plan.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');

      await workflowService.approvePlan({
        investigationId: inv.id,
        ownerId: principalA.id,
        planVersion: 1,
        approvedPlanHash: plan.plan.planHash,
      });

      const cancelResult = await workflowService.cancelInvestigation({
        investigationId: inv.id,
        ownerId: principalA.id,
        cancellationReason: 'Defect already resolved in newer release',
      });

      expect(cancelResult.cancelled).toBe(true);

      const snapshot = await workflowService.getInvestigationSnapshot(inv.id, principalA.id);
      expect(snapshot.lifecycleStatus).toBe('CANCELLED');
      expect(snapshot.reviewStatus).toBe('CANCELLED');
      expect(snapshot.cancellationReason).toBe('Defect already resolved in newer release');
      expect(snapshot.isApproved).toBe(false);

      // Subsequent planning request must fail closed
      await expect(
        workflowService.requestPlanning({
          investigationId: inv.id,
          ownerId: principalA.id,
          plannerPort: mockPlannerPort,
        })
      ).rejects.toThrow(ConflictError);
    });
  });
});
