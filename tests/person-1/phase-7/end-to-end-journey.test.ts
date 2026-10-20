import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { InvestigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { TwoAttemptController } from '@/server/verification/two-attempt-controller';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import { TargetResetClient } from '@/server/verification/target-reset-client';
import { CaptureRegistrar } from '@/server/evidence/capture-registrar';
import { EvidencePipeline } from '@/server/evidence/evidence-pipeline';
import { EvidenceReviewService } from '@/server/ai/evidence-review-service';
import { calculateAuthoritativePlanFingerprint } from '@/server/policy/plan-fingerprint';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase7TestDbMock } from './test-db-mock';
import type { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import type { AttemptExecutionReceipt } from '@/contracts/observations';
import type {
  ReportClarificationAgentPort,
  EvidenceStoragePort,
  EvidenceReviewAgentPort,
  QueueDispatcherPort,
} from '@/server/services/ports';

describe('P1-07: Master End-to-End Trusted Journey Integration', () => {
  let mockDb: Phase7TestDbMock;
  let workflowService: InvestigationWorkflowService;
  let leaseService: ExecutionLeaseService;
  let registrar: CaptureRegistrar;
  let evidencePipeline: EvidencePipeline;
  let reviewService: EvidenceReviewService;

  const ownerId = 'usr-lead-tester';
  const targetId = '00000000-0001-4001-8001-000000000001';
  const reportId = '00000000-0002-4002-8002-000000000002';
  const invId = '00000000-0003-4003-8003-000000000003';
  const targetUrl = 'https://app.test.local';

  beforeEach(() => {
    mockDb = new Phase7TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    workflowService = new InvestigationWorkflowService(() => mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);
    registrar = new CaptureRegistrar(() => mockDb as any);
    evidencePipeline = new EvidencePipeline(() => mockDb as any);
    reviewService = new EvidenceReviewService(() => mockDb as any);

    // 1. Seed target & draft report
    mockDb.principals.push({ id: ownerId, email: 'tester@tracecase.local', role: 'ADMIN' });
    mockDb.targets.push({
      id: targetId,
      name: 'E-Commerce Demo Target',
      baseUrl: targetUrl,
      allowedOrigins: [targetUrl],
      isSandbox: true,
      isSandboxVerified: true,
      environment: 'development',
      hasResetCapability: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    mockDb.bugReports.push({
      id: reportId,
      ownerId,
      targetId,
      title: 'Checkout button fails on cart page',
      bugDescription: 'When clicking checkout, order is not placed and error appears.',
      expectedBehavior: 'Order confirmed with receipt number.',
      observedBehavior: 'Error message: Payment Gateway 502 Bad Gateway.',
      createdBy: ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Seed initial investigation
    mockDb.investigations.push({
      id: invId,
      ownerId,
      targetId,
      reportId,
      lifecycleStatus: 'DRAFT',
      reproductionVerdict: 'PENDING',
      evidenceReadiness: 'PENDING_GENERATION',
      workflowRevision: 1,
      eventSequenceCounter: 0,
      reviewStatus: 'NONE',
      tokenCostUsd: '0.0000',
      createdBy: ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  it('runs complete trusted journey from vague report to confirmed reproduction, packaged evidence, and explanation', async () => {
    // -------------------------------------------------------------------------
    // STEP 1: Intake & Clarification Dialogue
    // -------------------------------------------------------------------------
    const clarificationMockAgent: ReportClarificationAgentPort = {
      generateProposal: async () => ({
        status: 'CLARIFICATION_NEEDED',
        questions: [
          {
            questionIndex: 1,
            questionText: 'Which items were in the shopping cart when checkout failed?',
            explanation: 'To reproduce the defect accurately under equivalent state.',
          },
        ],
        preliminaryUnderstanding: 'Checkout failure during payment step.',
      }),
    };

    const clarificationResult = await workflowService.requestPlanning({
      investigationId: invId,
      ownerId,
      plannerPort: clarificationMockAgent,
    });

    expect(clarificationResult.status).toBe('CLARIFICATION_NEEDED');
    let qId = '00000000-0000-0000-0000-000000000001';
    if (clarificationResult.status === 'CLARIFICATION_NEEDED') {
      expect(clarificationResult.questions).toHaveLength(1);
      qId = clarificationResult.questions[0].id;
    }

    // Answer the clarification question
    await workflowService.answerClarifications({
      investigationId: invId,
      ownerId,
      answers: [
        {
          questionId: qId,
          answerText: 'Item SKU #99281 (Premium Subscription).',
        },
      ],
    });

    // -------------------------------------------------------------------------
    // STEP 2: Proposal Generation with Clarified Context
    // -------------------------------------------------------------------------
    const planMockAgent: ReportClarificationAgentPort = {
      generateProposal: async () => ({
        status: 'EXPERIMENT_PROPOSED',
        proposal: {
          preconditions: ['Cart has SKU #99281', 'User is logged in'],
          steps: [
            {
              stepIndex: 0,
              semanticAction: 'Click Checkout Button',
              toolKind: 'click_button',
              selector: '#btn-checkout',
              tier: 'TIER_3_MUTATING_INTERACTION',
              timeoutMs: 5000,
            },
          ],
          expectedCorrectBehavior: 'Order confirmed banner is visible',
          reportedFailureSignature: 'Payment gateway error banner is visible',
          assertions: [
            {
              id: '00000000-000a-400a-800a-00000000000a',
              kind: 'ENTITY_PRESENCE',
              source: 'DOM_ELEMENT',
              purpose: 'EXPECTED_CORRECT_BEHAVIOR',
              subjectRef: '#order-confirmed-banner',
              operator: 'EXISTS',
              settlingPoint: 'AFTER_NETWORK_IDLE',
              description: 'Order confirmation displayed',
            },
            {
              id: '00000000-000b-400b-800b-00000000000b',
              kind: 'ENTITY_PRESENCE',
              source: 'DOM_ELEMENT',
              purpose: 'REPORTED_FAILURE_SIGNATURE',
              subjectRef: '#payment-error-banner',
              operator: 'EXISTS',
              settlingPoint: 'AFTER_NETWORK_IDLE',
              description: 'Payment error banner displayed',
            },
          ],
          requiresResetHook: false,
        },
      }),
    };

    const planResult = await workflowService.requestPlanning({
      investigationId: invId,
      ownerId,
      plannerPort: planMockAgent,
    });

    expect(planResult.status).toBe('PROPOSAL_READY');
    if (planResult.status !== 'PROPOSAL_READY') throw new Error('Expected PROPOSAL_READY');

    const generatedPlan = planResult.plan;
    expect(generatedPlan.version).toBe(1);
    expect(generatedPlan.planHash).toMatch(/^[a-f0-9]{64}$/);

    // -------------------------------------------------------------------------
    // STEP 3: Explicit Human Approval Binding
    // -------------------------------------------------------------------------
    await workflowService.approvePlan({
      investigationId: invId,
      ownerId,
      planVersion: 1,
      approvedPlanHash: generatedPlan.planHash,
    });

    const approvedInv = await workflowService.getInvestigationSnapshot(invId, ownerId);
    expect(approvedInv.isApproved).toBe(true);
    expect(approvedInv.reviewStatus).toBe('APPROVED');

    // -------------------------------------------------------------------------
    // STEP 4: Start Boundary & Execution Admission
    // -------------------------------------------------------------------------
    const mockDispatcherPort: QueueDispatcherPort = {
      enqueueInvestigation: async (params) => ({
        jobId: `job-${params.investigationId}`,
        queuedAt: new Date().toISOString(),
      }),
    };

    const startResult = await workflowService.startInvestigation({
      investigationId: invId,
      ownerId,
      planVersion: 1,
      approvedPlanHash: generatedPlan.planHash,
      dispatcherPort: mockDispatcherPort,
    });

    expect(startResult.started).toBe(true);

    // Create execution request record in DB to simulate worker claim
    const execReqId = '00000000-9999-4999-8999-000000000099';
    mockDb.executionRequests.push({
      id: execReqId,
      investigationId: invId,
      planVersion: 1,
      planHash: generatedPlan.planHash,
      approvalId: 'appr-01',
      requestedBy: ownerId,
      status: 'ADMITTED',
      fencingEpoch: 1,
      workerInstanceId: 'worker-01',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-01',
      executionRequestId: execReqId,
      investigationId: invId,
      leaseTtlMs: 60000,
    });

    // -------------------------------------------------------------------------
    // STEP 5: Browser Execution & Two-Attempt Assessment
    // -------------------------------------------------------------------------
    const mockBrowserWorker = {
      executeAttempt: async (params: any): Promise<AttemptExecutionReceipt> => {
        const obsMap = new Map();
        // Failure observed in both runs (reproduced defect!)
        obsMap.set('00000000-000a-400a-800a-00000000000a', {
          assertionId: '00000000-000a-400a-800a-00000000000a',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          status: 'NOT_FOUND',
          elementCount: 0,
          pageUrl: targetUrl,
          observedAt: new Date().toISOString(),
        });
        obsMap.set('00000000-000b-400b-800b-00000000000b', {
          assertionId: '00000000-000b-400b-800b-00000000000b',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          status: 'AVAILABLE',
          elementCount: 1,
          pageUrl: targetUrl,
          observedAt: new Date().toISOString(),
        });

        return {
          investigationId: params.investigationId,
          attemptNumber: params.attemptNumber,
          actionsExecuted: [
            {
              stepIndex: 1,
              action: generatedPlan.steps[0],
              tier: generatedPlan.steps[0].tier,
              status: 'SUCCESS',
              uncertainty: 'NONE',
              durationMs: 250,
              dispatchedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ],
          assertionObservations: obsMap,
          captureCoverage: {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            hasVideoRecording: true,
            videoStatus: 'FINALIZED',
            hasConsoleLogs: true,
            consoleStatus: 'CAPTURED_WITH_ENTRIES',
            hasNetworkTrace: true,
            networkStatus: 'CAPTURED_WITH_REQUESTS',
            coverageComplete: true,
          },
          totalDurationMs: 600,
          completedCleanly: true,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      },
    } as unknown as PlaywrightBrowserWorker;

    vi.spyOn(TargetResetClient, 'coordinateReset').mockResolvedValueOnce({
      id: 'receipt-1',
      targetId,
      investigationId: invId,
      attemptNumber: 2,
      transportSuccess: true,
      baselineEquivalent: true,
      isVerifiedRestored: true,
      readback: {
        targetId,
        expectedStateHash: 'hash-abc',
        observedStateHash: 'hash-abc',
        isEquivalent: true,
        discrepancies: [],
        checkedAt: new Date().toISOString(),
      },
      verifiedAt: new Date().toISOString(),
    });

    const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);
    const executionOutcome = await controller.executeInvestigationPair({
      executionRequestId: execReqId,
      investigationId: invId,
      workerInstanceId: 'worker-01',
      epoch: 1,
    });

    expect(executionOutcome.status).toBe('COMPLETED');
    expect(executionOutcome.verdict).toBe('CONFIRMED_REPRODUCED');

    // -------------------------------------------------------------------------
    // STEP 6: Capture Registration & Evidence Processing
    // -------------------------------------------------------------------------
    const tempDir = path.join(process.cwd(), '.tmp', 'journey-test');
    await fs.mkdir(tempDir, { recursive: true });
    const videoPath = path.join(tempDir, 'attempt-1-video.webm');
    await fs.writeFile(videoPath, 'fake-video-bytes-webm');

    const captureRef = await registrar.registerLocalCapture({
      investigationId: invId,
      attemptNumber: 1,
      kind: 'VIDEO_RECORDING',
      localTempPath: videoPath,
      mimeType: 'video/webm',
      capturedAt: new Date().toISOString(),
    });

    const mockStoragePort: EvidenceStoragePort = {
      registerCapture: async () => captureRef,
      processArtifacts: async (p) => [
        {
          artifactId: captureRef.captureId,
          investigationId: p.investigationId,
          kind: 'VIDEO_RECORDING',
          originalTier: 'RESTRICTED_RAW',
          publishedTier: 'PUBLIC_SAFE',
          redactionApplied: true,
          isEligibleForSharing: true,
        },
      ],
      createAccessGrant: async () => ({} as any),
    };

    const evidenceOutcome = await evidencePipeline.processInvestigationEvidence({
      investigationId: invId,
      storagePort: mockStoragePort,
    });

    expect(evidenceOutcome.readiness).toBe('PUBLIC_SAFE_READY');

    // -------------------------------------------------------------------------
    // STEP 7: AI Role 3 Explanation Synthesis (Locked Findings)
    // -------------------------------------------------------------------------
    const mockReviewAgent: EvidenceReviewAgentPort = {
      synthesizeExplanation: async (params) => ({
        investigationId: params.investigationId,
        naturalLanguageSummary: 'The reported checkout failure was reliably confirmed across two independent runs.',
        verifiedFactsExplanation: 'Payment Gateway returned 502 Bad Gateway during POST /api/checkout.',
        observationsVsHypotheses: [
          {
            observation: 'Payment error banner observed in DOM on both attempts.',
            hypothesis: 'Upstream payment provider connection timeout.',
          },
        ],
        evidenceReferences: [
          {
            artifactId: captureRef.captureId,
            description: 'Screen recording showing 502 error dialog.',
          },
        ],
        limitationsAndGaps: ['Sandbox environment simulated payment gateway.'],
      }),
    };

    const explanation = await reviewService.generateExplanation({
      investigationId: invId,
      pairAssessment: mockDb.pairAssessments[0],
      assertions: [],
      eligibleEvidence: [captureRef],
      agent: mockReviewAgent,
      tokenCostUsd: 0.012,
    });

    expect(explanation.naturalLanguageSummary).toContain('reliably confirmed');

    // -------------------------------------------------------------------------
    // STEP 8: Final Snapshot Authoritative Verification
    // -------------------------------------------------------------------------
    const finalSnapshot = await workflowService.getInvestigationSnapshot(invId, ownerId);

    // Verify Triad Invariant (TC-INV-007)
    expect(finalSnapshot.lifecycleStatus).toBe('FINALIZING_EVIDENCE');
    expect(finalSnapshot.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
    expect(finalSnapshot.evidenceReadiness).toBe('PUBLIC_SAFE_READY');

    // Verify Attempt summaries populated
    expect(finalSnapshot.attempt1).not.toBeNull();
    expect(finalSnapshot.attempt1?.defectDetected).toBe(true);
    expect(finalSnapshot.attempt2).not.toBeNull();
    expect(finalSnapshot.attempt2?.defectDetected).toBe(true);

    // Verify explanation was persisted
    const persistedExp = await reviewService.getPersistedExplanation(invId);
    expect(persistedExp).not.toBeNull();
    expect(persistedExp?.naturalLanguageSummary).toContain('reliably confirmed');
  });
});
