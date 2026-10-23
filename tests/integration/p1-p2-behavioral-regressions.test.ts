import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { TwoAttemptController } from '@/server/verification/two-attempt-controller';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import { TargetResetClient } from '@/server/verification/target-reset-client';
import { PairAssessor } from '@/server/verification/pair-assessor';
import { Phase7TestDbMock } from '../person-1/phase-7/test-db-mock';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { InMemoryQueueAdapter } from '@/server/queue';
import { bootstrapWorker } from '../../worker';
import { unavailableBrowserInvestigationAgent } from '@/server/services/ports';
import type { BrowserInvestigationAgentPort, BrowserWorkerPort } from '@/server/services/ports';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import { createTestBudgetManager } from '@/server/ai/budget-manager';
import { IntegratedEvidenceReviewAgent } from '@/server/ai/integrated-adapters';
import { MockTestDoubleModelProvider } from '@/server/ai/provider';

describe('Person 1 & Person 2 Behavioral Regressions & Invariant Suite', () => {
  let sharedLocalServer: http.Server;
  let sharedPort: number = 0;
  let sharedBaseUrl: string = 'http://127.0.0.1:3000';

  beforeAll(async () => {
    sharedLocalServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><button id="submit-btn">Submit</button><button id="btn">Click me</button><input id="input-box" /></body></html>');
    });
    sharedPort = await new Promise<number>((resolve) => {
      sharedLocalServer.listen(0, '127.0.0.1', () => {
        const addr = sharedLocalServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });
    sharedBaseUrl = `http://127.0.0.1:${sharedPort}`;
  });

  afterAll(async () => {
    if (sharedLocalServer) {
      await new Promise<void>((resolve) => sharedLocalServer.close(() => resolve()));
    }
  });
  let mockDb: Phase7TestDbMock;
  let leaseService: ExecutionLeaseService;
  const ownerId = 'usr-regression-test';
  const targetId = randomUUID();

  beforeEach(() => {
    mockDb = new Phase7TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);

    mockDb.principals.push({ id: ownerId, email: 'tester@regression.local', role: 'ADMIN' });
    mockDb.targets.push({
      id: targetId,
      ownerId,
      name: 'Regression Target',
      baseUrl: sharedBaseUrl,
      allowedOrigins: [sharedBaseUrl],
      isSandbox: true,
      isSandboxVerified: true,
      environment: 'demo',
      createdBy: ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  // --------------------------------------------------------------------------
  // 1. Composition Root Wiring
  // --------------------------------------------------------------------------
  it('1. Composition root: wires browser actor into TwoAttemptController with AI_GROUNDED mode', async () => {
    const queue = new InMemoryQueueAdapter();
    const mockWorker: BrowserWorkerPort = {
      executeAttempt: async () => {
        throw new Error('Not used in bootstrap check');
      },
    };
    const mockAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => {
        throw new Error('Not used in bootstrap check');
      },
    };

    const workerInstance = await bootstrapWorker(queue, mockWorker, mockAgent);
    try {
      expect(workerInstance.controller).toBeDefined();
      expect(workerInstance.controller.getBrowserAgent()).toBe(mockAgent);
      expect(workerInstance.controller.getDefaultExecutionMode()).toBe('AI_GROUNDED');
    } finally {
      await new Promise<void>((resolve) => workerInstance.server.close(() => resolve()));
      await queue.stop();
    }
  });

  // --------------------------------------------------------------------------
  // 2. Fail Closed on Unavailable AI Agent
  // --------------------------------------------------------------------------
  it('2. Controller fail-closed: AI_GROUNDED execution fails closed when browser actor is unavailable', async () => {
    const investigationId = randomUUID();
    const planRevisionId = randomUUID();
    const execReqId = randomUUID();
    const planHash = 'a'.repeat(64);

    mockDb.investigations.push({
      id: investigationId,
      targetId,
      ownerId,
      title: 'Regression Investigation',
      lifecycleStatus: 'EXECUTION_PENDING',
      reviewStatus: 'APPROVED',
      reproductionVerdict: 'UNTESTED',
      claimStatus: 'UNCLAIMED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.planApprovals.push({
      id: randomUUID(),
      investigationId,
      targetId,
      planVersion: 1,
      planHash,
      authorizedActorId: ownerId,
      maxActionTierPermitted: 'TIER_3_MUTATING_INTERACTION',
      isRevoked: false,
      approvedAt: new Date(),
    });

    mockDb.experimentPlanRevisions.push({
      id: planRevisionId,
      investigationId,
      version: 1,
      planHash,
      planPayload: {
        version: 1,
        planHash,
        steps: [
          {
            stepIndex: 1,
            semanticAction: 'Navigate to target',
            toolKind: 'navigate',
            value: sharedBaseUrl,
            tier: 'TIER_1_READ_ONLY',
            timeoutMs: 5000,
          },
        ],
        assertions: [],
      },
      createdAt: new Date(),
    });

    mockDb.executionRequests.push({
      id: execReqId,
      investigationId,
      targetId,
      ownerId,
      planVersion: 1,
      planHash,
      status: 'QUEUED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await leaseService.acquireGlobalLease({
      workerInstanceId: 'test-worker-1',
      executionRequestId: execReqId,
      investigationId,
      leaseTtlMs: 60000,
    });

    const mockBrowserWorker: BrowserWorkerPort = {
      executeAttempt: async () => {
        throw new Error('BrowserWorker must not be invoked when AI agent is unavailable');
      },
    };

    // Controller configured for AI_GROUNDED but with unavailable agent
    const controller = new TwoAttemptController(
      leaseService,
      mockBrowserWorker,
      () => mockDb as any,
      {
        browserAgent: unavailableBrowserInvestigationAgent,
        defaultExecutionMode: 'AI_GROUNDED',
      }
    );

    const outcome = await controller.executeInvestigationPair({
      executionRequestId: execReqId,
      investigationId,
      workerInstanceId: 'test-worker-1',
      epoch: 1,
      executionMode: 'AI_GROUNDED',
    });

    expect(outcome.status).toBe('ATTEMPT_FAILED');
    expect(outcome.verdict).toBe('INCONCLUSIVE');
    expect(outcome.summary).toContain('AI-grounded browser investigation agent is unavailable');

    const attempt1 = mockDb.investigationAttempts.find((a) => a.investigationId === investigationId && a.attemptNumber === 1);
    expect(attempt1).toBeDefined();
    expect(attempt1?.validity).toBe('INVALID');
    expect(attempt1?.invalidityReason).toContain('AI_AGENT_UNAVAILABLE');
  });

  // --------------------------------------------------------------------------
  // 3. Exhaustive Proposal Validation (STOP_NO_PROGRESS & REQUEST_MANUAL_HELP)
  // --------------------------------------------------------------------------
  it('3. Browser worker: STOP_NO_PROGRESS and REQUEST_MANUAL_HELP halt without dispatching', async () => {
    const worker = new PlaywrightBrowserWorker();
    const investigationId = randomUUID();
    const planHash = 'b'.repeat(64);

    const safeTarget: SafeTargetProfile = {
      id: targetId,
      name: 'Safe Target',
      baseUrl: sharedBaseUrl,
      allowedOrigins: [sharedBaseUrl],
      isSandboxVerified: true,
      environment: 'demo',
      hasResetCapability: false,
      hasTestAccountConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan: AuthoritativeExperimentPlan = {
      id: randomUUID(),
      investigationId: randomUUID(),
      version: 1,
      targetId: safeTarget.id,
      targetUrl: safeTarget.baseUrl,
      allowedOrigins: safeTarget.allowedOrigins,
      preconditions: ['Target is online'],
      expectedCorrectBehavior: 'Item updates cleanly',
      reportedFailureSignature: 'Item fails to update',
      planHash,
      steps: [
        {
          stepIndex: 1,
          semanticAction: 'Navigate to target',
          toolKind: 'navigate',
          value: sharedBaseUrl,
          tier: 'TIER_1_READ_ONLY',
          timeoutMs: 5000,
        },
        {
          stepIndex: 2,
          semanticAction: 'Click submit button',
          toolKind: 'click_button',
          selector: '#submit-btn',
          tier: 'TIER_2_SAFE_INTERACTION',
          timeoutMs: 5000,
        },
      ],
      assertions: [],
      maxAttempts: 2,
      maxDurationMs: 15000,
      requiresResetHook: false,
      createdAt: new Date().toISOString(),
    };

    // Agent proposes STOP_NO_PROGRESS for step 2
    const stopAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => ({
        kind: 'STOP_NO_PROGRESS',
        reason: 'Target button obscured by modal overlay',
        consecutiveNoProgressSteps: 1,
      }),
    };

    const receipt = await worker.executeAttempt({
      investigationId,
      attemptNumber: 1,
      plan,
      target: safeTarget,
      browserAgent: stopAgent,
      executionMode: 'AI_GROUNDED',
    });

    expect(receipt.completedCleanly).toBe(false);
    expect(receipt.actionsExecuted.length).toBe(2);
    const step2 = receipt.actionsExecuted[1];
    expect(step2.status).toBe('FAILED');
    expect(step2.errorDetails).toContain('STOP_NO_PROGRESS');
    expect(step2.errorDetails).toContain('Target button obscured by modal overlay');
  }, 30000);

  // --------------------------------------------------------------------------
  // 4. Proposed ToolKind Mismatch Halts Execution
  // --------------------------------------------------------------------------
  it('4. Browser worker: toolKind semantic mismatch halts execution without dispatching', async () => {
    const worker = new PlaywrightBrowserWorker();
    const investigationId = randomUUID();
    const planHash = 'c'.repeat(64);

    const safeTarget: SafeTargetProfile = {
      id: targetId,
      name: 'Safe Target',
      baseUrl: sharedBaseUrl,
      allowedOrigins: [sharedBaseUrl],
      isSandboxVerified: true,
      environment: 'demo',
      hasResetCapability: false,
      hasTestAccountConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan: AuthoritativeExperimentPlan = {
      id: randomUUID(),
      investigationId: randomUUID(),
      version: 1,
      targetId: safeTarget.id,
      targetUrl: safeTarget.baseUrl,
      allowedOrigins: safeTarget.allowedOrigins,
      preconditions: ['Target is online'],
      expectedCorrectBehavior: 'Item updates cleanly',
      reportedFailureSignature: 'Item fails to update',
      planHash,
      steps: [
        {
          stepIndex: 1,
          semanticAction: 'Navigate to target',
          toolKind: 'navigate',
          value: sharedBaseUrl,
          tier: 'TIER_1_READ_ONLY',
          timeoutMs: 5000,
        },
        {
          stepIndex: 2,
          semanticAction: 'Click submit button',
          toolKind: 'click_button',
          selector: '#submit-btn',
          tier: 'TIER_2_SAFE_INTERACTION',
          timeoutMs: 5000,
        },
      ],
      assertions: [],
      maxAttempts: 2,
      maxDurationMs: 15000,
      requiresResetHook: false,
      createdAt: new Date().toISOString(),
    };

    // Agent proposes fill_input for an approved click_button step
    const mismatchAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => ({
        kind: 'EXECUTE_ACTION',
        action: {
          stepIndex: 2,
          semanticAction: 'Fill input instead of click',
          toolKind: 'fill_input',
          selector: '#input-box',
          value: 'malicious input',
          tier: 'TIER_2_SAFE_INTERACTION',
          timeoutMs: 5000,
        },
        rationale: 'Attempting to fill instead of click',
        confidence: 0.9,
      }),
    };

    const receipt = await worker.executeAttempt({
      investigationId,
      attemptNumber: 1,
      plan,
      target: safeTarget,
      browserAgent: mismatchAgent,
      executionMode: 'AI_GROUNDED',
    });

    expect(receipt.completedCleanly).toBe(false);
    expect(receipt.actionsExecuted.length).toBe(2);
    const step2 = receipt.actionsExecuted[1];
    expect(step2.status).toBe('FAILED');
    expect(step2.errorDetails).toContain('Semantic mismatch');
    expect(step2.errorDetails).toContain("Proposed toolKind 'fill_input' conflicts with approved step toolKind 'click_button'");
  }, 30000);

  // --------------------------------------------------------------------------
  // 5. Post-Model Latency Authorization & Lease Revalidation
  // --------------------------------------------------------------------------
  it('5. Post-model check: lease loss during model latency aborts before action dispatch', async () => {
    const worker = new PlaywrightBrowserWorker();
    const investigationId = randomUUID();
    const planHash = 'd'.repeat(64);

    const safeTarget: SafeTargetProfile = {
      id: targetId,
      name: 'Safe Target',
      baseUrl: sharedBaseUrl,
      allowedOrigins: [sharedBaseUrl],
      isSandboxVerified: true,
      environment: 'demo',
      hasResetCapability: false,
      hasTestAccountConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan: AuthoritativeExperimentPlan = {
      id: randomUUID(),
      investigationId: randomUUID(),
      version: 1,
      targetId: safeTarget.id,
      targetUrl: safeTarget.baseUrl,
      allowedOrigins: safeTarget.allowedOrigins,
      preconditions: ['Target is online'],
      expectedCorrectBehavior: 'Item updates cleanly',
      reportedFailureSignature: 'Item fails to update',
      planHash,
      steps: [
        {
          stepIndex: 1,
          semanticAction: 'Navigate to target',
          toolKind: 'navigate',
          value: sharedBaseUrl,
          tier: 'TIER_1_READ_ONLY',
          timeoutMs: 5000,
        },
        {
          stepIndex: 2,
          semanticAction: 'Click button',
          toolKind: 'click_button',
          selector: '#btn',
          tier: 'TIER_2_SAFE_INTERACTION',
          timeoutMs: 5000,
        },
      ],
      assertions: [],
      maxAttempts: 2,
      maxDurationMs: 15000,
      requiresResetHook: false,
      createdAt: new Date().toISOString(),
    };

    let leaseRevokedDuringModelLatency = false;
    const latencyAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => {
        // Model latency: lease is revoked by supervisor while model is thinking
        leaseRevokedDuringModelLatency = true;
        return {
          kind: 'EXECUTE_ACTION',
          action: {
            stepIndex: 2,
            semanticAction: 'Click button',
            toolKind: 'click_button',
            selector: '#btn',
            tier: 'TIER_2_SAFE_INTERACTION',
            timeoutMs: 5000,
          },
          rationale: 'Valid proposed action',
          confidence: 0.95,
        };
      },
    };

    const onHeartbeat = async () => {
      if (leaseRevokedDuringModelLatency) {
        throw new Error('Lease expired or revoked by supervisor.');
      }
    };

    const receipt = await worker.executeAttempt({
      investigationId,
      attemptNumber: 1,
      plan,
      target: safeTarget,
      browserAgent: latencyAgent,
      executionMode: 'AI_GROUNDED',
      onHeartbeat,
    });

    expect(receipt.completedCleanly).toBe(false);
    const step2 = receipt.actionsExecuted.find((a) => a.stepIndex === 2);
    expect(step2).toBeDefined();
    expect(step2?.status).toBe('FAILED');
    expect(step2?.errorDetails).toContain('Post-model authorization / lease check failed');
  }, 30000);

  // --------------------------------------------------------------------------
  // 6. Precondition Check Fails Closed on Dirty Initial Baseline
  // --------------------------------------------------------------------------
  it('6. Controller pre-flight: halts fail-closed when initial pre-flight baseline is dirty', async () => {
    const investigationId = randomUUID();
    const planRevisionId = randomUUID();
    const execReqId = randomUUID();
    const planHash = 'e'.repeat(64);

    mockDb.investigations.push({
      id: investigationId,
      targetId,
      ownerId,
      title: 'Dirty Preflight Investigation',
      lifecycleStatus: 'EXECUTION_PENDING',
      reviewStatus: 'APPROVED',
      reproductionVerdict: 'UNTESTED',
      claimStatus: 'UNCLAIMED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.planApprovals.push({
      id: randomUUID(),
      investigationId,
      targetId,
      planVersion: 1,
      planHash,
      authorizedActorId: ownerId,
      maxActionTierPermitted: 'TIER_3_MUTATING_INTERACTION',
      isRevoked: false,
      approvedAt: new Date(),
    });

    mockDb.experimentPlanRevisions.push({
      id: planRevisionId,
      investigationId,
      version: 1,
      planHash,
      planPayload: {
        version: 1,
        planHash,
        steps: [{ stepIndex: 1, semanticAction: 'Navigate to target', toolKind: 'navigate', value: sharedBaseUrl, tier: 'TIER_1_READ_ONLY', timeoutMs: 5000 }],
        assertions: [],
        expectedBaseline: { taskCount: 2 },
      },
      createdAt: new Date(),
    });

    mockDb.executionRequests.push({
      id: execReqId,
      investigationId,
      targetId,
      ownerId,
      planVersion: 1,
      planHash,
      status: 'QUEUED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await leaseService.acquireGlobalLease({
      workerInstanceId: 'worker-dirty-test',
      executionRequestId: execReqId,
      investigationId,
      leaseTtlMs: 60000,
    });

    // Mock target with reset capability
    mockDb.targets[0].fixtureResetEndpoint = 'http://127.0.0.1:3000/api/test/reset-fixture';
    mockDb.targets[0].fixtureResetAuthSecretRef = 'test-secret';

    // Mock TargetResetClient.verifyBaselineReadback returning a dirty baseline
    const originalVerify = TargetResetClient.verifyBaselineReadback;
    TargetResetClient.verifyBaselineReadback = async () => ({
      isEquivalent: false,
      discrepancies: ['Dirty state detected: taskCount=99'],
      expectedStateHash: 'hash-clean',
      observedStateHash: 'hash-dirty',
      observedBaseline: { isDirty: true, taskCount: 99 },
      targetBuildId: 'v1.0.0-dirty',
    });

    try {
      const mockWorker: BrowserWorkerPort = {
        executeAttempt: async () => {
          throw new Error('Attempt 1 must NOT be executed on dirty baseline');
        },
      };

      const controller = new TwoAttemptController(
        leaseService,
        mockWorker,
        () => mockDb as any
      );

      const outcome = await controller.executeInvestigationPair({
        executionRequestId: execReqId,
        investigationId,
        workerInstanceId: 'worker-dirty-test',
        epoch: 1,
      });

      expect(outcome.status).toBe('PREFLIGHT_BASELINE_FAILED');
      expect(outcome.verdict).toBe('INCONCLUSIVE');

      const attempt1 = mockDb.investigationAttempts.find((a) => a.investigationId === investigationId && a.attemptNumber === 1);
      expect(attempt1?.validity).toBe('INVALID');
      expect(attempt1?.invalidityReason).toContain('PRECONDITION_FAILED');
    } finally {
      TargetResetClient.verifyBaselineReadback = originalVerify;
    }
  });

  // --------------------------------------------------------------------------
  // 7. Attempt 2 Build Comparability
  // --------------------------------------------------------------------------
  it('7. Pair assessor: build comparability fails when build identity changes or is unverified in production', () => {
    const pairResult = PairAssessor.assessPair({
      investigationId: randomUUID(),
      attempt1: {
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
      attempt2: {
        attemptNumber: 2,
        validity: 'VALID',
        finding: 'REPORTED_FAILURE',
        preconditionsMet: true,
        procedureCompleted: true,
        scopeAdhered: true,
        requiredObservationsAvailable: true,
        evaluations: [],
        assessedAt: new Date().toISOString(),
      },
      targetBuildIdAttempt1: 'build-v1.0.0',
      targetBuildIdAttempt2: 'build-v2.0.0',
      allowUnattestedTargetBuild: false,
    });

    expect(pairResult.isComparable).toBe(false);
    expect(pairResult.verdict).toBe('INCONCLUSIVE');
    expect(pairResult.limitations.some((l) => l.includes('Target build identity changed'))).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 8. Streamed Response Body Limit Memory Protection
  // --------------------------------------------------------------------------
  it('8. TargetResetClient: response body exceeding 1MB aborts stream and records failure', async () => {
    // Create an HTTP server that streams over 1MB of data
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Stream 1.2MB of data in chunks
      const chunk = Buffer.alloc(64 * 1024, 'a');
      for (let i = 0; i < 20; i++) {
        res.write(chunk);
      }
      res.end();
    });

    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const safeTarget: SafeTargetProfile = {
      id: randomUUID(),
      name: 'Oversized Stream Target',
      baseUrl: `http://127.0.0.1:${port}`,
      allowedOrigins: [`http://127.0.0.1:${port}`],
      isSandboxVerified: true,
      environment: 'demo',
      hasResetCapability: true,
      hasTestAccountConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const receipt = await TargetResetClient.coordinateReset({
        target: safeTarget,
        investigationId: randomUUID(),
        attemptPairId: randomUUID(),
        expectedBaseline: {},
        resetEndpoint: `http://127.0.0.1:${port}/reset`,
        fixtureScope: 'default',
      });

      expect(receipt.isVerifiedRestored).toBe(false);
      expect(receipt.readback?.discrepancies?.some((d) => d.includes('1000000 byte safety limit'))).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // --------------------------------------------------------------------------
  // 9. Fact Projection into Evidence Reviewer
  // --------------------------------------------------------------------------
  it('9. Reviewer adapter: preserves exact attempt assessment facts and assertion results', async () => {
    const mockProvider = new MockTestDoubleModelProvider('mock-reviewer');
    mockProvider.queueResponse({
      variant: 'REPORT_SYNTHESIZED',
      executiveSummary: 'Defect confirmed reproduced across both bounded attempts.',
      observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
      attempt1Comparison: {
        summary: 'Attempt 1 failed expected assertions.',
        failedAssertions: ['assert-element-missing'],
        matchingFailureObserved: true,
      },
      attempt2Comparison: {
        summary: 'Attempt 2 failed matching expected assertions.',
        failedAssertions: ['assert-element-missing'],
        matchingFailureObserved: true,
      },
      evidenceCitations: [],
      manualReproductionSteps: ['Step 1', 'Step 2'],
      diagnosticHypothesis: {
        isVerifiedFact: false,
        hypothesisText: 'Race condition in DOM re-rendering.',
        supportingEvidenceTokens: ['dom', 'render'],
        suggestedInvestigationDirection: 'Check store.ts',
      },
      limitationsAndCaveats: ['Sandbox target build attested.'],
    });

    const reviewAgent = new IntegratedEvidenceReviewAgent(mockProvider, createTestBudgetManager());
    const investigationId = randomUUID();

    const result = await reviewAgent.synthesizeExplanation({
      investigationId,
      lockedVerdict: 'CONFIRMED_REPRODUCED',
      verifiedAssertions: [],
      eligibleEvidence: [],
      attempt1: {
        attemptNumber: 1,
        status: 'FAILED_ASSERTIONS',
        failureSignatureMatched: true,
        executionDurationMs: 3450,
        isValid: true,
        assertionsEvaluated: [
          {
            predicateId: 'assert-element-missing',
            predicateDescription: 'Element must not disappear',
            passed: false,
            actualValue: 'NOT_FOUND',
            expectedValue: 'PRESENT',
          },
        ],
      },
      attempt2: {
        attemptNumber: 2,
        status: 'FAILED_ASSERTIONS',
        failureSignatureMatched: true,
        executionDurationMs: 3210,
        isValid: true,
        assertionsEvaluated: [
          {
            predicateId: 'assert-element-missing',
            predicateDescription: 'Element must not disappear',
            passed: false,
            actualValue: 'NOT_FOUND',
            expectedValue: 'PRESENT',
          },
        ],
      },
    });

    expect(result.investigationId).toBe(investigationId);
    expect(result.naturalLanguageSummary).toContain('Defect confirmed reproduced');
    expect(result.observationsVsHypotheses[0].hypothesis).toBe('Race condition in DOM re-rendering.');
  });

  // --------------------------------------------------------------------------
  // 10. Bounded Wait Proposal Does Not Trigger Premature Click or Advance Step
  // --------------------------------------------------------------------------
  it('10. Browser worker: wait proposal executes bounded wait without triggering click or fill', async () => {
    // Start local server serving page with button
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><button id="btn">Click me</button></body></html>');
    });

    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const safeTarget: SafeTargetProfile = {
      id: targetId,
      name: 'Safe Target',
      baseUrl: `http://127.0.0.1:${port}`,
      allowedOrigins: [`http://127.0.0.1:${port}`],
      isSandboxVerified: true,
      environment: 'demo',
      hasResetCapability: false,
      hasTestAccountConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan: AuthoritativeExperimentPlan = {
      id: randomUUID(),
      investigationId: randomUUID(),
      version: 1,
      targetId: safeTarget.id,
      targetUrl: safeTarget.baseUrl,
      allowedOrigins: safeTarget.allowedOrigins,
      preconditions: ['Target is online'],
      expectedCorrectBehavior: 'Button clicked',
      reportedFailureSignature: 'Button failed',
      planHash: 'f'.repeat(64),
      steps: [
        {
          stepIndex: 1,
          semanticAction: 'Navigate to target',
          toolKind: 'navigate',
          value: `http://127.0.0.1:${port}`,
          tier: 'TIER_1_READ_ONLY',
          timeoutMs: 5000,
        },
        {
          stepIndex: 2,
          semanticAction: 'Click button',
          toolKind: 'click_button',
          selector: '#btn',
          tier: 'TIER_2_SAFE_INTERACTION',
          timeoutMs: 5000,
        },
      ],
      assertions: [],
      maxAttempts: 2,
      maxDurationMs: 15000,
      requiresResetHook: false,
      createdAt: new Date().toISOString(),
    };

    let waitTurns = 0;
    const worker = new PlaywrightBrowserWorker();
    const waitAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => {
        waitTurns++;
        if (waitTurns === 1) {
          // Turn 1: Propose waiting for button before clicking
          return {
            kind: 'EXECUTE_ACTION',
            action: {
              stepIndex: 2,
              semanticAction: 'Wait for button to settle',
              toolKind: 'wait_for_selector',
              selector: '#btn',
              tier: 'TIER_1_READ_ONLY',
              timeoutMs: 2000,
            },
            rationale: 'Wait for button to settle before clicking',
            confidence: 0.9,
          };
        }
        // Turn 2: Now propose the actual click
        return {
          kind: 'EXECUTE_ACTION',
          action: {
            stepIndex: 2,
            semanticAction: 'Click button',
            toolKind: 'click_button',
            selector: '#btn',
            tier: 'TIER_2_SAFE_INTERACTION',
            timeoutMs: 5000,
          },
          rationale: 'Execute approved click',
          confidence: 0.95,
        };
      },
    };

    try {
      const receipt = await worker.executeAttempt({
        investigationId: randomUUID(),
        attemptNumber: 1,
        plan,
        target: safeTarget,
        browserAgent: waitAgent,
        executionMode: 'AI_GROUNDED',
      });

      expect(receipt.completedCleanly).toBe(true);
      expect(waitTurns).toBe(2);
      expect(receipt.actionsExecuted.length).toBe(2);
      expect(receipt.actionsExecuted[1].status).toBe('SUCCESS');
      expect(receipt.actionsExecuted[1].action.toolKind).toBe('click_button');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
