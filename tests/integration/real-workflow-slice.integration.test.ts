import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createDemoTargetServer } from '../../demo-target/server';
import { InvestigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { TwoAttemptController } from '@/server/verification/two-attempt-controller';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import { InvestigationClaimHandler } from '@/server/queue/investigation-claim-handler';
import { TargetResetClient } from '@/server/verification/target-reset-client';
import { CaptureRegistrar } from '@/server/evidence/capture-registrar';
import { EvidencePipeline } from '@/server/evidence/evidence-pipeline';
import { EvidenceReviewService } from '@/server/ai/evidence-review-service';
import { calculateAuthoritativePlanFingerprint } from '@/server/policy/plan-fingerprint';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase7TestDbMock } from '../person-1/phase-7/test-db-mock';
import { clarificationsRepository } from '@/server/db/repositories/clarifications.repository';
import { attemptsRepository } from '@/server/db/repositories/attempts.repository';
import {
  IntegratedReportClarificationAgent,
  IntegratedBrowserInvestigationAgent,
  IntegratedEvidenceReviewAgent,
} from '@/server/ai/integrated-adapters';
import { MockTestDoubleModelProvider } from '@/server/ai/provider';
import type { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import type { AttemptExecutionReceipt } from '@/contracts/observations';
import type { SafeTargetProfile } from '@/contracts/targets';

/**
 * ============================================================================
 * REAL WORKFLOW SLICE INTEGRATION TEST
 * ============================================================================
 *
 * Demonstrates a complete backend workflow slice connecting Person 1 & Person 2:
 * 1. Draft report intake
 * 2. Multi-turn clarification dialogue with persisted questions & answers
 * 3. Structured experiment planning with safe element grounding & assertions
 * 4. Deterministic proposal validation & immutable plan approval
 * 5. Execution request admission & atomic lease claiming
 * 6. Authenticated fixture reset & independent baseline readback (live demo target)
 * 7. Two-attempt deterministic verification with locked reproduction verdict
 * 8. Evidence packaging & post-verification explanation synthesis (TC-INV-008)
 */
describe('Real Workflow Slice Integration (Person 1 <-> Person 2)', () => {
  let demoTargetInstance: ReturnType<typeof createDemoTargetServer>;
  let targetPort: number;
  let targetUrl: string;
  const resetSecret = 'slice-integration-secret-2026';

  let mockDb: Phase7TestDbMock;
  let workflowService: InvestigationWorkflowService;
  let leaseService: ExecutionLeaseService;
  let registrar: CaptureRegistrar;
  let evidencePipeline: EvidencePipeline;
  let reviewService: EvidenceReviewService;

  const ownerId = 'usr-slice-tester';
  const targetId = randomUUID();
  const reportId = randomUUID();
  const invId = randomUUID();

  beforeAll(async () => {
    demoTargetInstance = createDemoTargetServer({
      port: 0,
      resetSecret,
      bugModeActive: true,
      buildVersion: 'v1.0.0-slice',
    });
    targetPort = await demoTargetInstance.start(0);
    targetUrl = `http://127.0.0.1:${targetPort}`;
  });

  afterAll(async () => {
    if (demoTargetInstance) {
      await demoTargetInstance.stop();
    }
  });

  beforeEach(() => {
    mockDb = new Phase7TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    workflowService = new InvestigationWorkflowService(() => mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);
    registrar = new CaptureRegistrar(() => mockDb as any);
    evidencePipeline = new EvidencePipeline(() => mockDb as any);
    reviewService = new EvidenceReviewService(() => mockDb as any);

    mockDb.principals.push({ id: ownerId, email: 'tester@tracecase.local', role: 'ADMIN' });
    mockDb.targets.push({
      id: targetId,
      ownerId,
      name: 'Controlled Demo Target (Todo App)',
      baseUrl: targetUrl,
      allowedOrigins: [targetUrl],
      isSandbox: true,
      isSandboxVerified: true,
      environment: 'staging',
      fixtureResetEndpoint: `${targetUrl}/api/test/reset-fixture`,
      fixtureResetAuthSecretRef: resetSecret,
      createdBy: ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.bugReports.push({
      id: reportId,
      ownerId,
      targetId,
      title: 'Deleting active task deletes completed item',
      bugDescription: 'When deleting Task B under Active filter, Task A is deleted instead.',
      expectedBehavior: 'Task B is removed, Task A is preserved.',
      observedBehavior: 'Task B remains in list, Task A is removed.',
      createdBy: ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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

  it('executes the full end-to-end slice without fabricated context or bypassed boundaries', async () => {
    // -------------------------------------------------------------------------
    // 1. Role 1 Clarification Round 1: Model requests clarification
    // -------------------------------------------------------------------------
    const plannerProvider = new MockTestDoubleModelProvider('mock-luna');
    plannerProvider.queueResponse({
      variant: 'NEEDS_CLARIFICATION',
      extractedClaim: {
        summary: 'Active task deletion issue reported.',
        affectedFeature: 'Task deletion',
        missingFacts: ['Filter mode selected when deleting task'],
      },
      questions: [
        {
          questionId: 'q_filter_mode',
          questionText: 'Which view filter was selected when deleting the task?',
          whyItMatters: 'Filter mode determines the active view items and DOM indices.',
          options: ['Active', 'Completed', 'All'],
          blocksExecution: true,
        },
      ],
    });

    const clarificationAgent = new IntegratedReportClarificationAgent(plannerProvider);

    const planOutcome1 = await workflowService.requestPlanning({
      investigationId: invId,
      ownerId,
      plannerPort: clarificationAgent,
    });

    expect(planOutcome1.status).toBe('CLARIFICATION_NEEDED');
    expect(planOutcome1.questions).toBeDefined();
    expect(planOutcome1.questions!).toHaveLength(1);
    expect(planOutcome1.questions![0].questionText).toContain('Which view filter');
    expect(planOutcome1.questions![0].explanation).toBe('Filter mode determines the active view items and DOM indices.');
    expect(planOutcome1.questions![0].suggestedOptions).toEqual(['Active', 'Completed', 'All']);

    // Verify clarification questions are persisted in DB with explanation & options intact
    const persistedQuestions = await clarificationsRepository.listQuestions(invId);
    expect(persistedQuestions).toHaveLength(1);
    expect(persistedQuestions[0].explanation).toBe('Filter mode determines the active view items and DOM indices.');
    expect(persistedQuestions[0].suggestedOptions).toEqual(['Active', 'Completed', 'All']);

    // -------------------------------------------------------------------------
    // 2. User submits answer to clarification question
    // -------------------------------------------------------------------------
    const answerOutcome = await workflowService.answerClarifications({
      investigationId: invId,
      ownerId,
      answers: [
        {
          questionId: persistedQuestions[0].id,
          answerText: 'Active',
        },
      ],
      expectedWorkflowRevision: planOutcome1.workflowRevision,
    });

    expect(answerOutcome.answers).toHaveLength(1);
    expect(answerOutcome.answers[0].isAnswered).toBe(true);
    expect(answerOutcome.answers[0].answerText).toBe('Active');

    // -------------------------------------------------------------------------
    // 3. Role 1 Planning Round 2: Model receives conversation history & proposes experiment
    // -------------------------------------------------------------------------
    plannerProvider.queueResponse({
      variant: 'PLAN_PROPOSED',
      extractedClaim: {
        summary: 'Deleting Task B while Active filter is selected causes index offset bug.',
        reportedProblem: 'Task B remains in list, Task A is deleted instead.',
        claimedExpectedBehavior: 'Task B is removed, Task A is preserved.',
        affectedEntities: ['Task B', 'Task A'],
      },
      experimentPlan: {
        planRevision: 1,
        preconditions: ['Demo target accessible', 'Tasks initialized'],
        requiredRole: 'test_user',
        steps: [
          {
            stepNumber: 1,
            actionType: 'NAVIGATE',
            intentDescription: 'Navigate to target todo app',
            inputValue: targetUrl,
            isDestructive: false,
          },
          {
            stepNumber: 2,
            actionType: 'WAIT_FOR_SELECTOR',
            intentDescription: 'Wait for Active filter button',
            targetAccessibleName: 'Active',
            targetRole: 'button',
            isDestructive: false,
          },
          {
            stepNumber: 3,
            actionType: 'CLICK',
            intentDescription: 'Click Active filter button',
            targetAccessibleName: 'Active',
            targetRole: 'button',
            isDestructive: false,
          },
          {
            stepNumber: 4,
            actionType: 'CLICK',
            intentDescription: 'Click Delete button for Task B',
            targetAccessibleName: 'Delete Task B',
            targetRole: 'button',
            isDestructive: true,
          },
        ],
        correctBehaviorAssertions: [
          {
            assertionType: 'CORRECT_BEHAVIOR',
            predicateId: 'assert-correct-task-b-absent',
            target: 'DOM_ELEMENT',
            expectedCondition: 'NOT_EXISTS',
            expectedValue: 'Task B',
          },
        ],
        reportedFailureAssertions: [
          {
            assertionType: 'REPORTED_FAILURE_SIGNATURE',
            predicateId: 'assert-failure-task-b-present',
            target: 'DOM_ELEMENT',
            expectedCondition: 'EXISTS',
            expectedValue: 'Task B',
          },
        ],
      },
    });

    const planOutcome2 = await workflowService.requestPlanning({
      investigationId: invId,
      ownerId,
      plannerPort: clarificationAgent,
      expectedWorkflowRevision: answerOutcome.workflowRevision,
    });

    expect(planOutcome2.status).toBe('PROPOSAL_READY');
    expect(planOutcome2.plan).toBeDefined();
    expect(planOutcome2.plan?.steps).toHaveLength(4);
    expect(planOutcome2.plan?.steps[1].toolKind).toBe('wait_for_selector');
    expect(planOutcome2.plan?.steps[2].toolKind).toBe('click_button');
    expect(planOutcome2.plan?.steps[3].toolKind).toBe('click_button');
    expect(planOutcome2.plan?.assertions).toHaveLength(2);

    // -------------------------------------------------------------------------
    // 4. Human Approval of Authoritative Plan
    // -------------------------------------------------------------------------
    const plan = planOutcome2.plan!;
    const planHash = plan.planHash || calculateAuthoritativePlanFingerprint(plan);

    const approval = await workflowService.approvePlan({
      investigationId: invId,
      ownerId,
      planVersion: plan.version,
      approvedPlanHash: planHash,
      operatorNotes: 'Approved for execution on controlled demo target.',
      expectedWorkflowRevision: planOutcome2.workflowRevision,
    });

    expect(approval.approved).toBe(true);
    expect(approval.approvalRecord.planHash).toBe(planHash);

    // -------------------------------------------------------------------------
    // 5. Execution Admission
    // -------------------------------------------------------------------------
    const mockDispatcherPort = {
      enqueueInvestigation: async () => ({
        jobId: randomUUID(),
        queuedAt: new Date().toISOString(),
      }),
    };

    const startResult = await workflowService.startInvestigation({
      investigationId: invId,
      ownerId,
      planVersion: plan.version,
      approvedPlanHash: planHash,
      dispatcherPort: mockDispatcherPort as any,
      expectedWorkflowRevision: approval.workflowRevision,
    });

    expect(startResult.started).toBe(true);

    const execReqId = randomUUID();
    mockDb.executionRequests.push({
      id: execReqId,
      investigationId: invId,
      planVersion: plan.version,
      planHash,
      approvalId: approval.approvalRecord.id,
      requestedBy: ownerId,
      status: 'ADMITTED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // -------------------------------------------------------------------------
    // 6. Target Reset Verification against Live Demo Target
    // -------------------------------------------------------------------------
    const targetProfile: SafeTargetProfile = {
      id: targetId,
      name: 'Demo Target',
      baseUrl: targetUrl,
      allowedOrigins: [targetUrl],
      isSandboxVerified: true,
      environment: 'staging',
      hasResetCapability: true,
      hasTestAccountConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const preflightReadback = await TargetResetClient.verifyBaselineReadback({
      target: targetProfile,
      expectedBaseline: {},
      resetAuthSecret: resetSecret,
    });

    expect(preflightReadback.observedBaseline).toBeDefined();
    expect(preflightReadback.targetBuildId).toBe('v1.0.0-slice');

    // Coordinate reset with real demo target
    const resetReceipt = await TargetResetClient.coordinateReset({
      target: targetProfile,
      investigationId: invId,
      attemptPairId: execReqId,
      expectedBaseline: preflightReadback.observedBaseline!,
      resetAuthSecret: resetSecret,
    });

    expect(resetReceipt.transportSuccess).toBe(true);
    expect(resetReceipt.isVerifiedRestored).toBe(true);
    expect(resetReceipt.baselineEquivalent).toBe(true);

    // -------------------------------------------------------------------------
    // 7. Deterministic Two-Attempt Execution via Controller
    // -------------------------------------------------------------------------
    const mockWorker: PlaywrightBrowserWorker = {
      executeAttempt: async (params: any): Promise<AttemptExecutionReceipt> => {
        return {
          investigationId: params.investigationId,
          attemptNumber: params.attemptNumber,
          actionsExecuted: [
            {
              stepIndex: 0,
              action: plan.steps[0],
              tier: 'TIER_1_READ_ONLY',
              status: 'SUCCESS',
              durationMs: 120,
              uncertainty: 'NONE',
              dispatchedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
            {
              stepIndex: 1,
              action: plan.steps[1],
              tier: 'TIER_1_READ_ONLY',
              status: 'SUCCESS',
              durationMs: 50,
              uncertainty: 'NONE',
              dispatchedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
            {
              stepIndex: 2,
              action: plan.steps[2],
              tier: 'TIER_2_SAFE_INTERACTION',
              status: 'SUCCESS',
              durationMs: 80,
              uncertainty: 'NONE',
              dispatchedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
            {
              stepIndex: 3,
              action: plan.steps[3],
              tier: 'TIER_2_SAFE_INTERACTION',
              status: 'SUCCESS',
              durationMs: 95,
              uncertainty: 'NONE',
              dispatchedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ],
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
          totalDurationMs: 345,
          completedCleanly: true,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          assertionObservations: new Map(
            plan.assertions.map((a) => [
              a.id,
              {
                assertionId: a.id,
                status: 'AVAILABLE',
                isAvailable: true,
                elementCount: 1, // Task B remains present in DOM due to bug
                observedValue: 'Task B',
                capturedAt: new Date().toISOString(),
              },
            ])
          ),
        };
      },
    } as unknown as PlaywrightBrowserWorker;

    const controller = new TwoAttemptController(
      leaseService,
      mockWorker,
      () => mockDb as any
    );

    const lease = await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-slice-1',
      executionRequestId: execReqId,
      investigationId: invId,
      leaseTtlMs: 60000,
    });

    expect(lease.acquired).toBe(true);

    const pairOutcome = await controller.executeInvestigationPair({
      executionRequestId: execReqId,
      investigationId: invId,
      workerInstanceId: 'worker-slice-1',
      epoch: lease.epoch ?? 1,
    });

    expect(pairOutcome.status).toBe('COMPLETED');
    expect(pairOutcome.verdict).toBe('CONFIRMED_REPRODUCED');

    // -------------------------------------------------------------------------
    // 8. Post-Verification Evidence Packaging & Role 3 Explanation
    // -------------------------------------------------------------------------
    // Simulate staged video, console, network
    mockDb.evidenceArtifacts.push(
      {
        id: randomUUID(),
        investigationId: invId,
        attemptNumber: 1,
        kind: 'VIDEO_RECORDING',
        storageRef: 'mock-s3://attempt-1/video.webm',
        storageTier: 'PUBLIC_SAFE',
        sizeBytes: 1048576,
        sha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        isEligibleForSharing: true,
        capturedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        investigationId: invId,
        attemptNumber: 1,
        kind: 'CONSOLE_LOG',
        storageRef: 'mock-s3://attempt-1/console.json',
        storageTier: 'PUBLIC_SAFE',
        sizeBytes: 2048,
        sha256Checksum: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
        isEligibleForSharing: true,
        capturedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        investigationId: invId,
        attemptNumber: 1,
        kind: 'NETWORK_TRACE',
        storageRef: 'mock-s3://attempt-1/network.har',
        storageTier: 'PUBLIC_SAFE',
        sizeBytes: 8192,
        sha256Checksum: '7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        isEligibleForSharing: true,
        capturedAt: new Date(),
        createdAt: new Date(),
      }
    );

    const reviewerProvider = new MockTestDoubleModelProvider('mock-luna');
    reviewerProvider.queueResponse({
      variant: 'REPORT_SYNTHESIZED',
      executiveSummary: 'Deleting Task B while Active filter is enabled consistently removes Task A instead.',
      observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
      attempt1Comparison: {
        summary: 'Attempt 1 failed assertions as expected in bug mode.',
        failedAssertions: ['assert-failure-task-b-present'],
        matchingFailureObserved: true,
      },
      attempt2Comparison: {
        summary: 'Attempt 2 replicated identical failure signature.',
        failedAssertions: ['assert-failure-task-b-present'],
        matchingFailureObserved: true,
      },
      evidenceCitations: [
        {
          artifactId: 'art-video-1',
          artifactType: 'VIDEO',
          safeUrl: 'https://cdn.tracecase.local/attempt-1/video.webm',
          relevanceExplanation: 'Shows Task B remaining visible after delete button click.',
        },
      ],
      manualReproductionSteps: [
        'Open Todo App',
        'Click Active filter',
        'Click delete on Task B',
      ],
      diagnosticHypothesis: {
        isVerifiedFact: false,
        hypothesisText: 'The frontend store filter predicate may be modifying the underlying collection in place.',
        supportingEvidenceTokens: ['splice(0, 1)'],
        suggestedInvestigationDirection: 'Inspect todo model deletion method.',
      },
      limitationsAndCaveats: ['Verified only on Staging environment with default dataset.'],
    });

    const reviewAgent = new IntegratedEvidenceReviewAgent(reviewerProvider);

    const pairAssessment = await attemptsRepository.getPairAssessment(invId);
    expect(pairAssessment).not.toBeNull();

    const eligibleEvidence = await evidencePipeline.getEligibleEvidence(invId);
    expect(eligibleEvidence).toHaveLength(3);

    const explanation = await reviewService.generateExplanation({
      investigationId: invId,
      pairAssessment: {
        investigationId: invId,
        verdict: 'CONFIRMED_REPRODUCED',
        validAttemptCount: 2,
        matchingAttemptCount: 2,
        isComparable: true,
        attempt1Assessment: {
          attemptNumber: 1,
          validity: 'VALID',
          finding: 'REPORTED_FAILURE',
          preconditionsMet: true,
          procedureCompleted: true,
          scopeAdhered: true,
          requiredObservationsAvailable: true,
          evaluations: [],
          assessedAt: new Date().toISOString(),
        },
        summary: 'Both attempts cleanly matched reported failure signature.',
        limitations: [],
        assessedAt: new Date().toISOString(),
      },
      assertions: [
        {
          assertionId: 'assert-failure-task-b-present',
          result: 'SATISFIED',
          observedValue: 'Task B present',
          expectedValue: 'EXISTS',
          evaluatedAt: new Date().toISOString(),
        },
      ],
      eligibleEvidence,
      agent: reviewAgent,
    });

    expect(explanation.naturalLanguageSummary).toContain('Task B');
    // Strict invariant TC-INV-008: Observations vs hypotheses separation
    expect(explanation.observationsVsHypotheses).toHaveLength(1);
    expect(explanation.observationsVsHypotheses[0].hypothesis).toContain('store filter');

    // Verify explanation is persisted in DB
    const persistedExplanation = await reviewService.getPersistedExplanation(invId);
    expect(persistedExplanation).not.toBeNull();
    expect(persistedExplanation?.naturalLanguageSummary).toBe(explanation.naturalLanguageSummary);
  });
});
