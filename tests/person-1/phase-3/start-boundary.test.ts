import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { POST as startRoute } from '@/app/api/v1/investigations/[id]/start/route';
import { POST as approveRoute } from '@/app/api/v1/investigations/[id]/approve/route';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { QueueDispatcherPort, unavailableQueueDispatcher } from '@/server/services/ports';
import { setServiceContainerForTesting, createDefaultServiceContainer } from '@/server/services/service-container';
import { PolicyViolationError, ConflictError } from '@/server/workflow/workflow-errors';
import { setCustomPrincipalResolverForTesting } from '@/server/auth';
import { _resetCachedEnvForTesting } from '@/server/config/env';
import { calculateAuthoritativePlanFingerprint } from '@/server/policy/plan-fingerprint';
import { Phase3TestDbMock } from './test-db-mock';

describe('P1-03: Start / Admission Boundary and Truthful Dispatcher', () => {
  let mockDb: Phase3TestDbMock;

  const principal = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'operator@tracecase.internal',
    role: 'operator' as const,
    externalIssuer: 'https://auth.tracecase.test',
    externalSubject: 'usr-test-01',
  };

  const targetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const invId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const planPayload = {
    id: 'plan-1',
    investigationId: invId,
    version: 1,
    targetId,
    targetUrl: 'https://demo.app.local',
    allowedOrigins: ['https://demo.app.local'],
    preconditions: ['Target app is reachable'],
    steps: [
      {
        stepIndex: 0,
        semanticAction: 'Navigate to target',
        toolKind: 'navigate' as const,
        value: 'https://demo.app.local',
        tier: 'TIER_1_READ_ONLY' as const,
        timeoutMs: 15000,
      },
    ],
    expectedCorrectBehavior: 'Dashboard loads',
    reportedFailureSignature: 'Crash page displayed',
    assertions: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'ENTITY_PRESENCE' as const,
        source: 'DOM_ELEMENT' as const,
        purpose: 'EXPECTED_CORRECT_BEHAVIOR' as const,
        subjectRef: '#dashboard',
        operator: 'EXISTS' as const,
        settlingPoint: 'AFTER_NETWORK_IDLE' as const,
        description: 'Verify dashboard',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'ENTITY_PRESENCE' as const,
        source: 'DOM_ELEMENT' as const,
        purpose: 'REPORTED_FAILURE_SIGNATURE' as const,
        subjectRef: '#crash',
        operator: 'EXISTS' as const,
        settlingPoint: 'AFTER_NETWORK_IDLE' as const,
        description: 'Verify crash',
      },
    ],
    maxAttempts: 2 as const,
    maxDurationMs: 120000,
    requiresResetHook: true,
  };

  const canonicalHash = calculateAuthoritativePlanFingerprint(planPayload);

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    process.env.DEV_PREVIEW_MODE = 'false';
    _resetCachedEnvForTesting();
    setCustomPrincipalResolverForTesting(async () => principal);

    mockDb = new Phase3TestDbMock();
    setDbInstanceForTesting(mockDb as any);

    // Seed target
    mockDb.targets.push({
      id: targetId,
      ownerId: principal.id,
      name: 'Test Target',
      baseUrl: 'https://demo.app.local',
      allowedOrigins: ['https://demo.app.local'],
      isSandbox: true,
      isSandboxVerified: true,
    });

    // Seed investigation
    mockDb.investigations.push({
      id: invId,
      ownerId: principal.id,
      targetId,
      reportId: 'rep-1',
      lifecycleStatus: 'INITIALIZED',
      reviewStatus: 'PROPOSAL_READY',
      workflowRevision: 2,
      planVersion: 1,
      planHash: canonicalHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed plan revision
    mockDb.experimentPlanRevisions.push({
      id: 'plan-1',
      investigationId: invId,
      version: 1,
      planHash: canonicalHash,
      planPayload: { ...planPayload, planHash: canonicalHash },
      createdBy: principal.id,
      createdAt: new Date(),
    });
  });

  afterEach(() => {
    setCustomPrincipalResolverForTesting(null);
    resetDbInstanceForTesting();
    setServiceContainerForTesting(null);
  });

  describe('Two-Step Invariant and Approval Enforcement', () => {
    it('rejects start if plan has not yet received human approval', async () => {
      const req = new NextRequest(
        new Request(`http://localhost:3000/api/v1/investigations/${invId}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investigationId: invId,
            planVersion: 1,
            approvedPlanHash: canonicalHash,
          }),
        })
      );

      const res = await startRoute(req, { params: Promise.resolve({ id: invId }) });
      expect(res.status).toBe(422); // PolicyViolationError -> 422
      const json = await res.json();
      expect(json.error.message).toContain('must be \'APPROVED\'');
    });

    it('verifies approval does not automatically enqueue or start the investigation', async () => {
      // 1. Approve plan
      const approveReq = new NextRequest(
        new Request(`http://localhost:3000/api/v1/investigations/${invId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investigationId: invId,
            planVersion: 1,
            approvedPlanHash: canonicalHash,
            operatorNotes: 'Approved for test',
          }),
        })
      );
      const approveRes = await approveRoute(approveReq, { params: Promise.resolve({ id: invId }) });
      expect(approveRes.status).toBe(200);

      // 2. Verify investigation status is APPROVED, but NOT queued or executing
      const inv = mockDb.investigations.find((i) => i.id === invId);
      expect(inv.reviewStatus).toBe('APPROVED');
      expect(inv.lifecycleStatus).toBe('INITIALIZED'); // still unqueued
    });
  });

  describe('Truthful Dispatcher Reporting in Live Mode', () => {
    it('returns 503 SERVICE_NOT_CONFIGURED truthfully stating queue dispatcher is scheduled for Stage 4', async () => {
      setServiceContainerForTesting({
        ...createDefaultServiceContainer(),
        queueDispatcher: unavailableQueueDispatcher,
      });

      // Seed approval
      mockDb.planApprovals.push({
        id: 'appr-1',
        investigationId: invId,
        targetId,
        planVersion: 1,
        planHash: canonicalHash,
        authorizedActorId: principal.id,
        maxActionTierPermitted: 'TIER_1_READ_ONLY',
        approvedBy: principal.id,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });
      mockDb.investigations[0].reviewStatus = 'APPROVED';

      const startReq = new NextRequest(
        new Request(`http://localhost:3000/api/v1/investigations/${invId}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investigationId: invId,
            planVersion: 1,
            approvedPlanHash: canonicalHash,
          }),
        })
      );

      const res = await startRoute(startReq, { params: Promise.resolve({ id: invId }) });
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.error.category).toBe('SERVICE_NOT_CONFIGURED');
      expect(json.error.message).toContain('pg-boss job queue scheduling is scheduled for Stage 4');
    });
  });

  describe('Injected Queue Dispatcher Port Support', () => {
    it('successfully dispatches when a mock QueueDispatcherPort is provided', async () => {
      // Seed approval
      mockDb.planApprovals.push({
        id: 'appr-1',
        investigationId: invId,
        targetId,
        planVersion: 1,
        planHash: canonicalHash,
        authorizedActorId: principal.id,
        maxActionTierPermitted: 'TIER_1_READ_ONLY',
        approvedBy: principal.id,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });
      mockDb.investigations[0].reviewStatus = 'APPROVED';

      const mockDispatcher: QueueDispatcherPort = {
        async enqueueInvestigation(params) {
          return {
            jobId: `job-${params.investigationId}-v${params.planVersion}`,
            queuedAt: new Date().toISOString(),
          };
        },
      };

      const result = await investigationWorkflowService.startInvestigation({
        investigationId: invId,
        ownerId: principal.id,
        planVersion: 1,
        approvedPlanHash: canonicalHash,
        dispatcherPort: mockDispatcher,
      });

      expect(result.started).toBe(true);
      expect(result.jobId).toBe(`job-${invId}-v1`);
      expect(result.queuedAt).toBeDefined();
    });
  });
});
