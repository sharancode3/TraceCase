import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { POST as requestPlanningRoute, GET as getPlanRoute } from '@/app/api/v1/investigations/[id]/plan/route';
import { GET as getClarificationsRoute } from '@/app/api/v1/investigations/[id]/clarifications/route';
import { POST as answerClarificationsRoute } from '@/app/api/v1/investigations/[id]/clarifications/answer/route';
import { POST as approveRoute } from '@/app/api/v1/investigations/[id]/approve/route';
import { POST as startRoute } from '@/app/api/v1/investigations/[id]/start/route';
import { GET as getInvestigationSnapshotRoute } from '@/app/api/v1/investigations/[id]/route';
import { setCustomPrincipalResolverForTesting } from '@/server/auth';
import { _resetCachedEnvForTesting } from '@/server/config/env';
import { ReportClarificationAgentPort, unavailableQueueDispatcher } from '@/server/services/ports';
import { setServiceContainerForTesting, createDefaultServiceContainer } from '@/server/services/service-container';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { Phase3TestDbMock } from './test-db-mock';

describe('P1-03: End-to-End Investigation Workflow and Clarification Journey', () => {
  let mockDb: Phase3TestDbMock;

  const principal = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'operator@tracecase.internal',
    role: 'operator' as const,
    externalIssuer: 'https://auth.tracecase.test',
    externalSubject: 'usr-e2e-01',
  };

  const targetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const reportId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const invId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
      name: 'E2E Demo Target',
      environment: 'demo',
      baseUrl: 'https://demo.app.local',
      allowedOrigins: ['https://demo.app.local'],
      isSandbox: true,
      isSandboxVerified: true,
      maxAllowedTier: 'TIER_4_DESTRUCTIVE',
      hasResetCapability: true,
    });

    // Seed bug report
    mockDb.bugReports.push({
      id: reportId,
      ownerId: principal.id,
      targetId,
      title: 'Checkout button broken',
      rawDescription: 'Users cannot complete purchase in cart',
      expectedBehavior: 'Order confirmed successfully',
      observedBehavior: '500 internal server error banner',
    });

    // Seed investigation
    mockDb.investigations.push({
      id: invId,
      ownerId: principal.id,
      targetId,
      reportId,
      lifecycleStatus: 'INITIALIZED',
      reviewStatus: 'PENDING_PLANNING',
      workflowRevision: 1,
      planVersion: null,
      planHash: null,
      activeAttemptNumber: null,
      tokenCostUsd: '0.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    setCustomPrincipalResolverForTesting(null);
    resetDbInstanceForTesting();
    setServiceContainerForTesting(null);
  });

  it('runs complete lifecycle: clarification questions -> answering -> proposal -> approval -> start admission check', async () => {
    // 1. First planning invocation: model requests clarifications
    const mockClarificationPlanner: ReportClarificationAgentPort = {
      async generateProposal(params) {
        const hasUserClarifications = params.clarificationHistory && params.clarificationHistory.length > 0;
        if (!hasUserClarifications) {
          return {
            status: 'CLARIFICATION_NEEDED',
            preliminaryUnderstanding: 'Checkout failure reported during cart flow',
            questions: [
              {
                questionIndex: 0,
                questionText: 'What payment method was selected when checkout failed?',
                suggestedOptions: ['Credit Card', 'PayPal', 'Invoice'],
              },
              {
                questionIndex: 1,
                questionText: 'Was any discount voucher applied to the cart?',
                suggestedOptions: ['Yes', 'No'],
              },
            ],
          };
        }

        // Second invocation with facts supplied: returns experiment proposal
        return {
          status: 'EXPERIMENT_PROPOSED',
          proposal: {
            preconditions: ['Target cart contains 1 eligible item', 'Payment gateway mock is online'],
            steps: [
              {
                stepIndex: 0,
                semanticAction: 'Open cart page',
                toolKind: 'navigate',
                value: 'https://demo.app.local/cart',
                tier: 'TIER_1_READ_ONLY',
                timeoutMs: 15000,
              },
              {
                stepIndex: 1,
                semanticAction: 'Select Credit Card payment option',
                toolKind: 'click_button',
                selector: '#pay-credit-card',
                tier: 'TIER_2_SAFE_INTERACTION',
                timeoutMs: 10000,
              },
              {
                stepIndex: 2,
                semanticAction: 'Submit checkout order',
                toolKind: 'click_button',
                selector: '#submit-order',
                tier: 'TIER_3_MUTATING_INTERACTION',
                timeoutMs: 15000,
              },
            ],
            expectedCorrectBehavior: 'Order confirmation page displays order ID and receipt',
            reportedFailureSignature: 'Error 500 banner is displayed and checkout is halted',
            assertions: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                kind: 'ENTITY_PRESENCE',
                source: 'DOM_ELEMENT',
                purpose: 'EXPECTED_CORRECT_BEHAVIOR',
                subjectRef: '.order-confirmation',
                operator: 'EXISTS',
                settlingPoint: 'AFTER_NETWORK_IDLE',
                description: 'Order confirmation card exists',
              },
              {
                id: '22222222-2222-4222-8222-222222222222',
                kind: 'ENTITY_PRESENCE',
                source: 'DOM_ELEMENT',
                purpose: 'REPORTED_FAILURE_SIGNATURE',
                subjectRef: '.error-500-banner',
                operator: 'EXISTS',
                settlingPoint: 'AFTER_NETWORK_IDLE',
                description: 'Error 500 notification exists',
              },
            ],
            requiresResetHook: true,
          },
        };
      },
    };

    // Trigger planning with custom planner port
    const planResult1 = await investigationWorkflowService.requestPlanning({
      investigationId: invId,
      ownerId: principal.id,
      plannerPort: mockClarificationPlanner,
    });

    expect(planResult1.status).toBe('CLARIFICATION_NEEDED');
    if (planResult1.status !== 'CLARIFICATION_NEEDED') throw new Error('Expected CLARIFICATION_NEEDED');
    expect(planResult1.questions).toHaveLength(2);
    expect(planResult1.workflowRevision).toBe(2);

    // 2. Query questions via HTTP GET /clarifications
    const getQuestionsReq = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${invId}/clarifications`, {
        method: 'GET',
      })
    );
    const getQuestionsRes = await getClarificationsRoute(getQuestionsReq, { params: Promise.resolve({ id: invId }) });
    expect(getQuestionsRes.status).toBe(200);
    const questionsJson = await getQuestionsRes.json();
    expect(questionsJson.total).toBe(2);
    const [q0, q1] = questionsJson.data;

    // 3. Answer questions via HTTP POST /clarifications/answer
    const answerReq = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${invId}/clarifications/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: [
            { questionId: q0.id, answerText: 'Credit Card (Visa test card)' },
            { questionId: q1.id, answerText: 'No vouchers applied' },
          ],
        }),
      })
    );
    const answerRes = await answerClarificationsRoute(answerReq, { params: Promise.resolve({ id: invId }) });
    expect(answerRes.status).toBe(200);
    const answerJson = await answerRes.json();
    expect(answerJson.data).toHaveLength(2);

    // 4. Trigger second planning step
    const planResult2 = await investigationWorkflowService.requestPlanning({
      investigationId: invId,
      ownerId: principal.id,
      plannerPort: mockClarificationPlanner,
    });
    expect(planResult2.status).toBe('PROPOSAL_READY');
    if (planResult2.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');
    expect(planResult2.plan.version).toBe(1);
    expect(planResult2.plan.planHash).toMatch(/^[a-f0-9]{64}$/);

    // 5. Retrieve published plan via HTTP GET /plan
    const getPlanReq = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${invId}/plan`, {
        method: 'GET',
      })
    );
    const getPlanRes = await getPlanRoute(getPlanReq, { params: Promise.resolve({ id: invId }) });
    expect(getPlanRes.status).toBe(200);
    const planJson = await getPlanRes.json();
    expect(planJson.version).toBe(1);
    expect(planJson.planHash).toBe(planResult2.plan.planHash);

    // 6. Human Operator Plan Approval via HTTP POST /approve
    const approveReq = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${invId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigationId: invId,
          planVersion: 1,
          approvedPlanHash: planJson.planHash,
          operatorNotes: 'Verified steps and confirmed test card usage',
        }),
      })
    );
    const approveRes = await approveRoute(approveReq, { params: Promise.resolve({ id: invId }) });
    expect(approveRes.status).toBe(200);
    const approveJson = await approveRes.json();
    expect(approveJson.status).toBe('APPROVED');

    // 7. Verify full read model snapshot via HTTP GET /investigations/[id]
    const snapshotReq = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${invId}`, {
        method: 'GET',
      })
    );
    const snapshotRes = await getInvestigationSnapshotRoute(snapshotReq, { params: Promise.resolve({ id: invId }) });
    expect(snapshotRes.status).toBe(200);
    const snapshotJson = await snapshotRes.json();
    expect(snapshotJson.data.isApproved).toBe(true);
    expect(snapshotJson.data.reviewStatus).toBe('APPROVED');
    expect(snapshotJson.data.approvedBy).toBe(principal.id);
    expect(snapshotJson.data.planVersion).toBe(1);

    // 8. Start boundary check via HTTP POST /start
    setServiceContainerForTesting({
      ...createDefaultServiceContainer(),
      queueDispatcher: unavailableQueueDispatcher,
    });

    const startReq = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${invId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigationId: invId,
          planVersion: 1,
          approvedPlanHash: planJson.planHash,
        }),
      })
    );
    const startRes = await startRoute(startReq, { params: Promise.resolve({ id: invId }) });
    // Live mode truthfully returns 503 because queue dispatcher is scheduled for Stage 4
    expect(startRes.status).toBe(503);
    const startJson = await startRes.json();
    expect(startJson.error.category).toBe('SERVICE_NOT_CONFIGURED');
    expect(startJson.error.message).toContain('pg-boss job queue scheduling is scheduled for Stage 4');
  });
});
