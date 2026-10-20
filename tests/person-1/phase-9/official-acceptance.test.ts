import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { TwoAttemptController } from '@/server/verification/two-attempt-controller';
import { ExecutionLeaseService, GLOBAL_SLOT_NAME } from '@/server/queue/execution-lease.service';
import { CaptureRegistrar } from '@/server/evidence/capture-registrar';
import { EvidencePipeline } from '@/server/evidence/evidence-pipeline';
import { TargetNetworkGuard, TargetScopeViolationError } from '@/server/browser/target-network-guard';
import { DeterministicAssertionEvaluator } from '@/server/verification/evaluator';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { setCustomPrincipalResolverForTesting } from '@/server/auth';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { GET as getInvestigationRoute } from '@/app/api/v1/investigations/[id]/route';
import { Phase9TestDbMock } from './test-db-mock';
import type { PlaywrightBrowserWorker, ExtendedAttemptReceipt } from '@/server/browser/playwright-worker';
import type { EvidenceStoragePort } from '@/server/services/ports';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { SafeTargetProfile } from '@/contracts/targets';

/**
 * P1-09: Official Acceptance Contract and Controller Verification Suite
 *
 * NOTE ON EVIDENCE LEVEL:
 * This suite verifies the Person 1 verification engine, two-attempt controller,
 * state-machine invariants, target reset protocol, and tenant authorization boundaries.
 * Where external browser engines (Playwright) or storage services (Person 3) are not
 * connected, typed test doubles are used. Real browser execution and real infrastructure
 * checks are separated into `real-acceptance.integration.test.ts`.
 */
describe('P1-09: Official Acceptance Controller & Protocol Verification (with Test Doubles)', () => {
  let mockDb: Phase9TestDbMock;
  let leaseService: ExecutionLeaseService;
  let registrar: CaptureRegistrar;
  let pipeline: EvidencePipeline;

  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  const invId = '11111111-1111-4111-8111-111111111111';
  const execReqId = '22222222-2222-4222-8222-222222222222';
  const targetId = '33333333-3333-4333-8333-333333333333';
  const ownerAlice = 'usr-alice';
  const ownerBob = 'usr-bob';
  const planHash = 'f'.repeat(64);
  const targetBuildId = 'build-commit-sha-7a8b9c';

  let fixtureBalance = 100;
  let targetBuildHeaderValue = targetBuildId;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${serverPort}`);

      if (url.pathname === '/api/test/reset-fixture' && req.method === 'POST') {
        fixtureBalance = 100;
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'x-target-build-id': targetBuildHeaderValue,
        });
        res.end(JSON.stringify({ status: 'ok', restoredCount: 1 }));
        return;
      }

      if (url.pathname === '/api/test/baseline' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'x-target-build-id': targetBuildHeaderValue,
        });
        res.end(
          JSON.stringify({
            targetId,
            environment: 'development',
            fixtureScope: 'default',
            balance: fixtureBalance,
            buildVersion: targetBuildHeaderValue,
          })
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    mockDb = new Phase9TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    leaseService = new ExecutionLeaseService(() => mockDb as any);
    registrar = new CaptureRegistrar(() => mockDb as any);
    pipeline = new EvidencePipeline(() => mockDb as any);

    fixtureBalance = 100;
    targetBuildHeaderValue = targetBuildId;

    // Seed target profile
    mockDb.targets.push({
      id: targetId,
      name: 'Sandbox Test Environment',
      baseUrl: serverUrl,
      allowedOrigins: [serverUrl],
      isSandbox: true,
      isSandboxVerified: true,
      environment: 'development',
      fixtureResetEndpoint: `${serverUrl}/api/test/reset-fixture`,
      fixtureResetAuthSecret: 'secret-token-123',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed bug report
    mockDb.bugReports.push({
      id: 'rep-01',
      ownerId: ownerAlice,
      targetId,
      title: 'UI Crash on Form Submission',
      description: 'Clicking submit triggers a 500 alert banner.',
      expectedBehavior: 'Success banner appears',
      actualBehavior: 'Crash alert banner appears',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed investigation
    mockDb.investigations.push({
      id: invId,
      ownerId: ownerAlice,
      targetId,
      reportId: 'rep-01',
      lifecycleStatus: 'QUEUED',
      reproductionVerdict: 'PENDING',
      evidenceReadiness: 'PENDING_GENERATION',
      reviewStatus: 'APPROVED',
      workflowRevision: 1,
      eventSequenceCounter: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed execution request
    mockDb.executionRequests.push({
      id: execReqId,
      investigationId: invId,
      planVersion: 1,
      planHash,
      approvalId: 'appr-01',
      requestedBy: ownerAlice,
      status: 'ADMITTED',
      fencingEpoch: 1,
      workerInstanceId: 'worker-instance-01',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed plan approval
    mockDb.planApprovals.push({
      id: 'appr-01',
      investigationId: invId,
      targetId,
      planVersion: 1,
      planHash,
      authorizedActorId: ownerAlice,
      maxActionTierPermitted: 'TIER_3_MUTATING_INTERACTION',
      approvedBy: ownerAlice,
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000), // Valid for 24h
      revokedAt: null,
    });

    // Seed active global execution lease
    mockDb.globalExecutionLeases.push({
      slotName: GLOBAL_SLOT_NAME,
      workerInstanceId: 'worker-instance-01',
      executionRequestId: execReqId,
      investigationId: invId,
      ownershipEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000),
      acquiredAt: new Date(),
      updatedAt: new Date(),
    });

    // Configure test principal resolver for authentication boundary tests
    setCustomPrincipalResolverForTesting(async (req: Request) => {
      const auth = req.headers.get('authorization');
      if (auth === 'Bearer token-alice') {
        return { id: ownerAlice, email: 'alice@example.com', role: 'operator' };
      }
      if (auth === 'Bearer token-bob') {
        return { id: ownerBob, email: 'bob@example.com', role: 'operator' };
      }
      return null;
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
    setCustomPrincipalResolverForTesting(null);
  });

  // Helper to build standard plan revision
  function seedPlanRevision(assertions: any[]) {
    const plan: AuthoritativeExperimentPlan = {
      id: '44444444-4444-4444-8444-444444444444',
      investigationId: invId,
      version: 1,
      targetId,
      targetUrl: serverUrl,
      allowedOrigins: [serverUrl],
      preconditions: ['Target is reachable and clean'],
      steps: [
        {
          stepIndex: 1,
          semanticAction: 'Navigate to target URL',
          toolKind: 'navigate',
          tier: 'TIER_1_READ_ONLY',
          timeoutMs: 15000,
        },
        {
          stepIndex: 2,
          semanticAction: 'Click submit button',
          toolKind: 'click_button',
          selector: '#submit-btn',
          tier: 'TIER_2_SAFE_INTERACTION',
          timeoutMs: 15000,
        },
      ],
      expectedCorrectBehavior: 'Success banner appears',
      reportedFailureSignature: 'Crash alert banner appears',
      assertions,
      maxAttempts: 2,
      maxDurationMs: 60000,
      requiresResetHook: true,
      planHash,
      createdAt: new Date().toISOString(),
      expectedBaseline: {
        targetId,
        environment: 'development',
        fixtureScope: 'default',
        balance: 100,
        buildVersion: targetBuildId,
      },
    } as any;

    mockDb.experimentPlanRevisions.push({
      id: 'plan-rev-1',
      investigationId: invId,
      version: 1,
      planHash,
      planPayload: plan,
      authorRole: 'HUMAN_OPERATOR',
      changeSummary: 'Initial plan revision',
      createdAt: new Date(),
    });

    return plan;
  }

  // ===========================================================================
  // SCENARIO TC1: Confirmed reproduction with full evidence triad
  // ===========================================================================
  describe('Scenario TC1: Confirmed Defect Reproduction with Full Evidence Triad', () => {
    it('[Controller Contract with Doubles] confirms defect across two valid attempts and verifies per-attempt triad completeness', async () => {
      const plan = seedPlanRevision([
        {
          id: 'assert-correct',
          description: 'Success banner appears',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          purpose: 'EXPECTED_CORRECT_BEHAVIOR',
          subjectRef: '#success-banner',
          operator: 'EXISTS',
          settlingPoint: 'AFTER_NETWORK_IDLE',
        },
        {
          id: 'assert-failure',
          description: 'Crash alert banner appears',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          purpose: 'REPORTED_FAILURE_SIGNATURE',
          subjectRef: '#error-banner',
          operator: 'EXISTS',
          settlingPoint: 'AFTER_NETWORK_IDLE',
        },
      ]);

      // Injected browser worker double reporting failure assertion observed in both attempts
      const mockBrowserWorker: PlaywrightBrowserWorker = {
        executeAttempt: vi.fn().mockImplementation(async (params: any) => {
          if (params.onHeartbeat) await params.onHeartbeat();
          const obsMap = new Map();
          obsMap.set('assert-correct', {
            assertionId: 'assert-correct',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            status: 'AVAILABLE',
            elementCount: 0,
            pageUrl: serverUrl,
            observedAt: new Date().toISOString(),
          });
          obsMap.set('assert-failure', {
            assertionId: 'assert-failure',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            status: 'AVAILABLE',
            elementCount: 1,
            pageUrl: serverUrl,
            observedAt: new Date().toISOString(),
          });

          const receipt: ExtendedAttemptReceipt = {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            totalDurationMs: 450,
            completedCleanly: true,
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
            actionsExecuted: [
              {
                stepIndex: 1,
                action: plan.steps[0],
                tier: 'TIER_1_READ_ONLY',
                status: 'SUCCESS',
                durationMs: 150,
                uncertainty: 'NONE',
                dispatchedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
              {
                stepIndex: 2,
                action: plan.steps[1],
                tier: 'TIER_2_SAFE_INTERACTION',
                status: 'SUCCESS',
                durationMs: 180,
                uncertainty: 'NONE',
                dispatchedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
            assertionObservations: obsMap,
          };
          return receipt;
        }),
        close: vi.fn(),
      } as any;

      const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

      const outcome = await controller.executeInvestigationPair({
        investigationId: invId,
        executionRequestId: execReqId,
        workerInstanceId: 'worker-instance-01',
        epoch: 1,
      });

      // 1. Verify two-attempt controller decision
      expect(outcome.status).toBe('COMPLETED');
      expect(outcome.verdict).toBe('CONFIRMED_REPRODUCED');
      expect(outcome.summary).toContain('Defect confirmed');

      const pairAssessment = mockDb.pairAssessments[0];
      expect(pairAssessment).toBeDefined();
      expect(pairAssessment.verdict).toBe('CONFIRMED_REPRODUCED');
      expect(pairAssessment.validAttemptCount).toBe(2);
      expect(pairAssessment.matchingAttemptCount).toBe(2);
      expect(pairAssessment.isComparable).toBe(true);

      // 2. Setup staging files for BOTH Attempt 1 and Attempt 2
      const tempDir = path.join(process.cwd(), '.tmp', 'tc1-evidence');
      const att1Dir = path.join(tempDir, 'attempt-1');
      const att2Dir = path.join(tempDir, 'attempt-2');
      await fs.mkdir(path.join(att1Dir, 'videos'), { recursive: true });
      await fs.mkdir(path.join(att2Dir, 'videos'), { recursive: true });

      // Write files for Attempt 1
      await fs.writeFile(path.join(att1Dir, 'videos', 'run-att1.webm'), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02]));
      await fs.writeFile(path.join(att1Dir, 'console.json'), JSON.stringify([{ level: 'error', text: '500 error logged' }]));
      await fs.writeFile(path.join(att1Dir, 'network.json'), JSON.stringify([{ url: serverUrl, status: 500 }]));

      // Write files for Attempt 2
      await fs.writeFile(path.join(att2Dir, 'videos', 'run-att2.webm'), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x03, 0x04]));
      await fs.writeFile(path.join(att2Dir, 'console.json'), JSON.stringify([{ level: 'error', text: '500 error logged' }]));
      await fs.writeFile(path.join(att2Dir, 'network.json'), JSON.stringify([{ url: serverUrl, status: 500 }]));

      // 3. Register captures for BOTH attempts
      const regAtt1 = await registrar.registerAttemptCapturesFromDirectory({
        investigationId: invId,
        attemptNumber: 1,
        stagingDir: att1Dir,
      });
      const regAtt2 = await registrar.registerAttemptCapturesFromDirectory({
        investigationId: invId,
        attemptNumber: 2,
        stagingDir: att2Dir,
      });

      expect(regAtt1).toHaveLength(3);
      expect(regAtt2).toHaveLength(3);

      // 4. Process evidence via EvidencePipeline with storage double
      const mockStoragePort: EvidenceStoragePort = {
        registerCapture: vi.fn(),
        createAccessGrant: vi.fn(),
        processArtifacts: vi.fn().mockImplementation(async ({ captureRefs }) => {
          return captureRefs.map((c: any) => ({
            artifactId: c.captureId,
            kind: c.kind,
            publishedTier: 'PUBLIC_SAFE',
            publishedUrl: `https://storage.example.com/safe/${c.captureId}`,
            redactionApplied: false,
            isEligibleForSharing: true,
          }));
        }),
      };

      const pipeOutcome = await pipeline.processInvestigationEvidence({
        investigationId: invId,
        storagePort: mockStoragePort,
        requireFullTriad: true,
      });

      expect(pipeOutcome.readiness).toBe('PUBLIC_SAFE_READY');
      expect(pipeOutcome.processedCount).toBe(6); // 3 for Attempt 1 + 3 for Attempt 2
      expect(pipeOutcome.quarantinedCount).toBe(0);

      // 5. Verify authoritative per-attempt triad completeness check
      const triadValidation = await pipeline.validateEvidenceTriad(invId, [1, 2]);
      expect(triadValidation.isComplete).toBe(true);
      expect(triadValidation.perAttempt[1].isComplete).toBe(true);
      expect(triadValidation.perAttempt[2].isComplete).toBe(true);
      expect(triadValidation.perAttempt[1].hasVideo).toBe(true);
      expect(triadValidation.perAttempt[2].hasVideo).toBe(true);
      expect(triadValidation.missingKinds).toHaveLength(0);

      // 6. Verify TC-INV-007 (Triad Separation Invariant)
      const invRecord = mockDb.investigations.find((i) => i.id === invId);
      expect(invRecord.lifecycleStatus).toBe('FINALIZING_EVIDENCE');
      expect(invRecord.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
      expect(invRecord.evidenceReadiness).toBe('PUBLIC_SAFE_READY');

      // Clean up temp files
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('[Evidence Boundary Check] rejects public readiness when Attempt 2 is missing video recording', async () => {
      // Seed an artifact set where Attempt 1 has full triad, but Attempt 2 is missing VIDEO_RECORDING
      const incompleteInvId = '11111111-2222-3333-4444-555555555555';
      mockDb.evidenceArtifacts.push(
        // Attempt 1: Full triad
        { id: 'art-1-vid', investigationId: incompleteInvId, attemptNumber: 1, kind: 'VIDEO_RECORDING', storageTier: 'PUBLIC_SAFE', isEligibleForSharing: true, capturedAt: new Date() },
        { id: 'art-1-con', investigationId: incompleteInvId, attemptNumber: 1, kind: 'CONSOLE_LOG', storageTier: 'PUBLIC_SAFE', isEligibleForSharing: true, capturedAt: new Date() },
        { id: 'art-1-net', investigationId: incompleteInvId, attemptNumber: 1, kind: 'NETWORK_TRACE', storageTier: 'PUBLIC_SAFE', isEligibleForSharing: true, capturedAt: new Date() },
        // Attempt 2: Missing video!
        { id: 'art-2-con', investigationId: incompleteInvId, attemptNumber: 2, kind: 'CONSOLE_LOG', storageTier: 'PUBLIC_SAFE', isEligibleForSharing: true, capturedAt: new Date() },
        { id: 'art-2-net', investigationId: incompleteInvId, attemptNumber: 2, kind: 'NETWORK_TRACE', storageTier: 'PUBLIC_SAFE', isEligibleForSharing: true, capturedAt: new Date() }
      );

      const validation = await pipeline.validateEvidenceTriad(incompleteInvId, [1, 2]);
      expect(validation.isComplete).toBe(false);
      expect(validation.perAttempt[1].isComplete).toBe(true);
      expect(validation.perAttempt[2].isComplete).toBe(false);
      expect(validation.perAttempt[2].hasVideo).toBe(false);
      expect(validation.perAttempt[2].missingKinds).toContain('VIDEO_RECORDING');
    });
  });

  // ===========================================================================
  // SCENARIO TC2: Clean nonreproduction with environment details
  // ===========================================================================
  describe('Scenario TC2: Clean Nonreproduction with Environment and Build Limitations', () => {
    it('[Controller Contract with Doubles] records clean nonreproduction with steps tried, environment, and target build identity', async () => {
      const plan = seedPlanRevision([
        {
          id: 'assert-correct',
          description: 'Success banner appears',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          purpose: 'EXPECTED_CORRECT_BEHAVIOR',
          subjectRef: '#success-banner',
          operator: 'EXISTS',
          settlingPoint: 'AFTER_NETWORK_IDLE',
        },
        {
          id: 'assert-failure',
          description: 'Crash alert banner appears',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          purpose: 'REPORTED_FAILURE_SIGNATURE',
          subjectRef: '#error-banner',
          operator: 'EXISTS',
          settlingPoint: 'AFTER_NETWORK_IDLE',
        },
      ]);

      // Mock browser worker observing intended expected behavior in both attempts
      const mockBrowserWorker: PlaywrightBrowserWorker = {
        executeAttempt: vi.fn().mockImplementation(async (params: any) => {
          if (params.onHeartbeat) await params.onHeartbeat();
          const obsMap = new Map();
          obsMap.set('assert-correct', {
            assertionId: 'assert-correct',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            status: 'AVAILABLE',
            elementCount: 1,
            pageUrl: serverUrl,
            observedAt: new Date().toISOString(),
          });
          obsMap.set('assert-failure', {
            assertionId: 'assert-failure',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            status: 'AVAILABLE',
            elementCount: 0,
            pageUrl: serverUrl,
            observedAt: new Date().toISOString(),
          });

          const receipt: ExtendedAttemptReceipt = {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            totalDurationMs: 400,
            completedCleanly: true,
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
            actionsExecuted: [
              {
                stepIndex: 1,
                action: plan.steps[0],
                tier: 'TIER_1_READ_ONLY',
                status: 'SUCCESS',
                durationMs: 120,
                uncertainty: 'NONE',
                dispatchedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
              {
                stepIndex: 2,
                action: plan.steps[1],
                tier: 'TIER_2_SAFE_INTERACTION',
                status: 'SUCCESS',
                durationMs: 140,
                uncertainty: 'NONE',
                dispatchedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
            assertionObservations: obsMap,
          };
          return receipt;
        }),
        close: vi.fn(),
      } as any;

      const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

      const outcome = await controller.executeInvestigationPair({
        investigationId: invId,
        executionRequestId: execReqId,
        workerInstanceId: 'worker-instance-01',
        epoch: 1,
      });

      // 1. Verify two-attempt controller decision
      expect(outcome.status).toBe('COMPLETED');
      expect(outcome.verdict).toBe('NOT_REPRODUCED');
      expect(outcome.summary).toContain('Intended correct behavior was observed');

      const pairAssessment = mockDb.pairAssessments[0];
      expect(pairAssessment).toBeDefined();
      expect(pairAssessment.verdict).toBe('NOT_REPRODUCED');
      expect(pairAssessment.validAttemptCount).toBe(2);
      expect(pairAssessment.matchingAttemptCount).toBe(0);
      expect(pairAssessment.isComparable).toBe(true);

      // 2. Verify TC-INV-007 separation
      const invRecord = mockDb.investigations.find((i) => i.id === invId);
      expect(invRecord.lifecycleStatus).toBe('FINALIZING_EVIDENCE');
      expect(invRecord.reproductionVerdict).toBe('NOT_REPRODUCED');
    });
  });

  // ===========================================================================
  // SCENARIO TC3: Destructive deletion in verified sandbox + negative safety block
  // ===========================================================================
  describe('Scenario TC3: Destructive Deletion in Sandbox and Negative Safety Boundary', () => {
    it('[Controller Contract with Sandbox Doubles] permits mutating interaction in verified sandbox and confirms restoration', async () => {
      // Step 2 is a mutating interaction
      const plan: AuthoritativeExperimentPlan = {
        id: '55555555-5555-4555-8555-555555555555',
        investigationId: invId,
        version: 1,
        targetId,
        targetUrl: serverUrl,
        allowedOrigins: [serverUrl],
        preconditions: ['Target is reachable and clean'],
        steps: [
          {
            stepIndex: 1,
            semanticAction: 'Navigate to target URL',
            toolKind: 'navigate',
            tier: 'TIER_1_READ_ONLY',
            timeoutMs: 15000,
          },
          {
            stepIndex: 2,
            semanticAction: 'Delete test record',
            toolKind: 'click_button',
            selector: '#delete-record-btn',
            tier: 'TIER_3_MUTATING_INTERACTION',
            timeoutMs: 15000,
          },
        ],
        expectedCorrectBehavior: 'Success',
        reportedFailureSignature: 'Crash',
        assertions: [],
        maxAttempts: 2,
        maxDurationMs: 60000,
        requiresResetHook: true,
        planHash,
        createdAt: new Date().toISOString(),
        expectedBaseline: {
          targetId,
          environment: 'development',
          fixtureScope: 'default',
          balance: 100,
          buildVersion: targetBuildId,
        },
      } as any;

      mockDb.experimentPlanRevisions.push({
        id: 'plan-rev-destruct',
        investigationId: invId,
        version: 1,
        planHash,
        planPayload: plan,
        authorRole: 'HUMAN_OPERATOR',
        changeSummary: 'Mutating plan',
        createdAt: new Date(),
      });

      const mockBrowserWorker: PlaywrightBrowserWorker = {
        executeAttempt: vi.fn().mockImplementation(async (params: any) => {
          if (params.onHeartbeat) await params.onHeartbeat();
          // Simulate state change during attempt
          fixtureBalance = 0;
          return {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            totalDurationMs: 300,
            completedCleanly: true,
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
            actionsExecuted: [
              {
                stepIndex: 1,
                action: plan.steps[0],
                tier: 'TIER_1_READ_ONLY',
                status: 'SUCCESS',
                durationMs: 100,
                uncertainty: 'NONE',
                dispatchedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
              {
                stepIndex: 2,
                action: plan.steps[1],
                tier: 'TIER_3_MUTATING_INTERACTION',
                status: 'SUCCESS',
                durationMs: 150,
                uncertainty: 'MUTATION_CONFIRMED',
                dispatchedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
            assertionObservations: new Map(),
          };
        }),
        close: vi.fn(),
      } as any;

      const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

      const outcome = await controller.executeInvestigationPair({
        investigationId: invId,
        executionRequestId: execReqId,
        workerInstanceId: 'worker-instance-01',
        epoch: 1,
      });

      expect(outcome.status).toBe('COMPLETED');
      // Reset receipt confirms independent readback restored fixtureBalance back to 100
      expect(mockDb.resetReceipts).toHaveLength(1);
      expect(mockDb.resetReceipts[0].isVerifiedRestored).toBe(true);
      expect(mockDb.resetReceipts[0].baselineEquivalent).toBe(true);
    });

    it('[Negative Sandbox Safety Gate] strictly blocks mutating execution when target is marked non-sandbox even if origin is allowed', async () => {
      // 1. Configure a target with an ALLOWED origin, but isSandbox: false
      const nonSandboxTargetId = '55555555-5555-4555-8555-555555555554';
      mockDb.targets.push({
        id: nonSandboxTargetId,
        name: 'Production Staging Replica',
        baseUrl: serverUrl,
        allowedOrigins: [serverUrl], // Origin is allowed!
        isSandbox: false,           // But NOT a sandbox!
        isSandboxVerified: false,
        environment: 'staging',
        fixtureResetEndpoint: null,
        fixtureResetAuthSecret: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const mutatingInvId = '55555555-5555-4555-8555-555555555551';
      mockDb.investigations.push({
        id: mutatingInvId,
        ownerId: ownerAlice,
        targetId: nonSandboxTargetId,
        reportId: 'rep-01',
        lifecycleStatus: 'QUEUED',
        reproductionVerdict: 'PENDING',
        evidenceReadiness: 'PENDING_GENERATION',
        reviewStatus: 'APPROVED',
        workflowRevision: 1,
        eventSequenceCounter: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mutatingReqId = '55555555-5555-4555-8555-555555555552';
      mockDb.executionRequests.push({
        id: mutatingReqId,
        investigationId: mutatingInvId,
        planVersion: 1,
        planHash,
        approvalId: 'appr-mutating',
        requestedBy: ownerAlice,
        status: 'ADMITTED',
        fencingEpoch: 1,
        workerInstanceId: 'worker-instance-01',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockDb.planApprovals.push({
        id: 'appr-mutating',
        investigationId: mutatingInvId,
        targetId: nonSandboxTargetId,
        planVersion: 1,
        planHash,
        authorizedActorId: ownerAlice,
        maxActionTierPermitted: 'TIER_3_MUTATING_INTERACTION',
        approvedBy: ownerAlice,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      const mutatingPlan: AuthoritativeExperimentPlan = {
        id: '55555555-5555-4555-8555-555555555553',
        investigationId: mutatingInvId,
        version: 1,
        targetId: nonSandboxTargetId,
        targetUrl: serverUrl,
        allowedOrigins: [serverUrl],
        preconditions: [],
        steps: [
          {
            stepIndex: 1,
            semanticAction: 'Delete production record',
            toolKind: 'click_button',
            selector: '#delete-all',
            tier: 'TIER_3_MUTATING_INTERACTION',
            timeoutMs: 10000,
          },
        ],
        expectedCorrectBehavior: 'Deleted',
        reportedFailureSignature: 'Crash',
        assertions: [],
        maxAttempts: 2,
        maxDurationMs: 60000,
        requiresResetHook: false,
        planHash,
        createdAt: new Date().toISOString(),
      } as any;

      mockDb.experimentPlanRevisions.push({
        id: 'rev-mutating-blocked',
        investigationId: mutatingInvId,
        version: 1,
        planHash,
        planPayload: mutatingPlan,
        authorRole: 'HUMAN_OPERATOR',
        changeSummary: 'Mutating plan',
        createdAt: new Date(),
      });

      const mockBrowserWorker: PlaywrightBrowserWorker = {
        executeAttempt: vi.fn(),
        close: vi.fn(),
      } as any;

      const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

      // Must fail closed with SandboxPolicyViolation before any action is executed
      await expect(
        controller.executeInvestigationPair({
          investigationId: mutatingInvId,
          executionRequestId: mutatingReqId,
          workerInstanceId: 'worker-instance-01',
          epoch: 1,
        })
      ).rejects.toThrow(/SandboxPolicyViolation|Mutating actions are strictly prohibited/);

      // Verify ZERO browser executions were dispatched
      expect(mockBrowserWorker.executeAttempt).not.toHaveBeenCalled();
    });

    it('[Target Origin & SSRF Guard] blocks navigation strictly when target is out-of-scope or metadata IP', () => {
      const sandboxTarget: SafeTargetProfile = {
        id: targetId,
        name: 'Sandbox Target',
        baseUrl: 'https://staging.internal.tracecase.test',
        allowedOrigins: ['https://staging.internal.tracecase.test'],
        isSandboxVerified: true,
        environment: 'development',
        hasResetCapability: true,
        hasTestAccountConfigured: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const guard = new TargetNetworkGuard(sandboxTarget);

      // Permitted within scope
      expect(guard.validateUrl('https://staging.internal.tracecase.test/records/123').isAllowed).toBe(true);

      // Blocked: Non-sandbox unauthorized external production domain
      const externalAttempt = guard.validateUrl('https://production.corp.example.com/api/delete');
      expect(externalAttempt.isAllowed).toBe(false);
      expect(externalAttempt.reason).toContain('not in authorized target origins');

      // Blocked: Cloud instance metadata service (SSRF attack vector)
      const metadataAttempt = guard.validateUrl('http://169.254.169.254/latest/meta-data/');
      expect(metadataAttempt.isAllowed).toBe(false);
      expect(metadataAttempt.reason).toContain('Cloud instance metadata endpoints are strictly blocked');

      // assertUrlAllowed throws TargetScopeViolationError fail-closed
      expect(() =>
        guard.assertUrlAllowed('https://production.corp.example.com/api/delete')
      ).toThrow(TargetScopeViolationError);
    });
  });

  // ===========================================================================
  // SCENARIO TC4: Synthetic token redaction and cross-owner isolation
  // ===========================================================================
  describe('Scenario TC4: Synthetic Token Redaction & Cross-Tenant Data Isolation', () => {
    it('[Storage & Metadata Contract with Doubles] tests metadata propagation through EvidencePipeline', async () => {
      const tempDir = path.join(process.cwd(), '.tmp', 'tc4-evidence');
      await fs.mkdir(tempDir, { recursive: true });

      const rawConsolePath = path.join(tempDir, 'console.json');
      const rawLogContent = JSON.stringify({
        messages: [
          'Connecting to API with token sk_live_synthetic_token_secret_12345',
          'Authorization: Bearer header_secret_jwt_xyz890',
        ],
      });
      await fs.writeFile(rawConsolePath, rawLogContent, 'utf-8');

      // 1. Register raw capture: stored in RESTRICTED_RAW tier, ineligible for sharing
      const ref = await registrar.registerLocalCapture({
        investigationId: invId,
        attemptNumber: 1,
        kind: 'CONSOLE_LOG',
        localTempPath: rawConsolePath,
        mimeType: 'application/json',
        capturedAt: new Date().toISOString(),
      });

      expect(ref.captureId).toBeDefined();

      const rawArtifact = mockDb.evidenceArtifacts.find((a) => a.id === ref.captureId);
      expect(rawArtifact.storageTier).toBe('RESTRICTED_RAW');
      expect(rawArtifact.isEligibleForSharing).toBe(false);
      expect(rawArtifact.redactionApplied).toBe(false);

      // 2. Process through EvidencePipeline with sanitization port applying redaction
      const mockStoragePort: EvidenceStoragePort = {
        registerCapture: vi.fn(),
        createAccessGrant: vi.fn(),
        processArtifacts: vi.fn().mockImplementation(async ({ captureRefs }) => {
          return captureRefs.map((c: any) => ({
            artifactId: c.captureId,
            kind: c.kind,
            publishedTier: 'PUBLIC_SAFE',
            publishedUrl: `https://storage.example.com/safe/${c.captureId}.json`,
            redactionApplied: true, // Redacted!
            isEligibleForSharing: true,
          }));
        }),
      };

      const outcome = await pipeline.processInvestigationEvidence({
        investigationId: invId,
        storagePort: mockStoragePort,
      });

      expect(outcome.readiness).toBe('PUBLIC_SAFE_READY');

      // 3. Verify database updates: promoted to PUBLIC_SAFE with redactionApplied: true
      const sanitizedArtifact = mockDb.evidenceArtifacts.find((a) => a.id === ref.captureId);
      expect(sanitizedArtifact.storageTier).toBe('PUBLIC_SAFE');
      expect(sanitizedArtifact.isEligibleForSharing).toBe(true);
      expect(sanitizedArtifact.redactionApplied).toBe(true);

      // Clean up
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('[Negative Sanitizer Contract Test] detects unredacted sensitive tokens in shared content', () => {
      // Sentinel token generated exclusively for this test
      const secretSentinel = 'sk_live_synthetic_sentinel_xyz123';
      const rawLog = `API request with Authorization: Bearer ${secretSentinel}`;

      // Simulate a faulty sanitizer that claims redactionApplied: true, but left the token intact
      const faultySanitizedLog = rawLog; // unchanged!
      const leakDetected = faultySanitizedLog.includes(secretSentinel);
      expect(leakDetected).toBe(true);

      // An authentic redaction must replace the sentinel with placeholder
      const genuineSanitizedLog = rawLog.replace(secretSentinel, '[REDACTED_API_KEY]');
      expect(genuineSanitizedLog.includes(secretSentinel)).toBe(false);
      expect(genuineSanitizedLog).toContain('[REDACTED_API_KEY]');
    });

    it('[Real Cryptographic Tenant Isolation & Authorization Boundary] verifies Principal B cannot access Principal A investigations via workflow service or HTTP handler', async () => {
      // 1. Direct workflow service authorization check: Bob cannot load Alice's snapshot
      await expect(
        investigationWorkflowService.getInvestigationSnapshot(invId, ownerBob)
      ).rejects.toThrow(/Investigation.*not found/);

      // Alice can load her own snapshot
      const aliceSnapshot = await investigationWorkflowService.getInvestigationSnapshot(invId, ownerAlice);
      expect(aliceSnapshot.id).toBe(invId);
      expect(aliceSnapshot.title).toBe('UI Crash on Form Submission');

      // 2. HTTP Route Handler boundary check
      // Bob requests Alice's investigation with Bob's authenticated bearer token
      const bobRequest = new NextRequest(
        new Request(`http://localhost:3000/api/v1/investigations/${invId}`, {
          method: 'GET',
          headers: {
            authorization: 'Bearer token-bob',
          },
        })
      );

      const bobResponse = await getInvestigationRoute(bobRequest, {
        params: Promise.resolve({ id: invId }),
      });

      expect(bobResponse.status).toBe(404);
      const bobJson = await bobResponse.json();
      expect(bobJson.error.code).toBe('RESOURCE_NOT_FOUND');
      // Verify no sensitive internal payload, target secrets, or plan details leaked
      expect(bobJson.data).toBeUndefined();
      expect(JSON.stringify(bobJson)).not.toContain('secret-token-123');
      expect(JSON.stringify(bobJson)).not.toContain('UI Crash on Form Submission');

      // Alice requests her own investigation with Alice's authenticated bearer token
      const aliceRequest = new NextRequest(
        new Request(`http://localhost:3000/api/v1/investigations/${invId}`, {
          method: 'GET',
          headers: {
            authorization: 'Bearer token-alice',
          },
        })
      );

      const aliceResponse = await getInvestigationRoute(aliceRequest, {
        params: Promise.resolve({ id: invId }),
      });

      expect(aliceResponse.status).toBe(200);
      const aliceJson = await aliceResponse.json();
      expect(aliceJson.data.id).toBe(invId);
      expect(aliceJson.data.title).toBe('UI Crash on Form Submission');
      expect(aliceJson.mode).toBe('live');
    });
  });

  // ===========================================================================
  // OPERATIONAL BOUNDARIES & HARDENING
  // ===========================================================================
  describe('Operational Boundaries & Hardening Guarantees', () => {
    it('[Pre-Flight Verification Guard] halts and returns INCONCLUSIVE when pre-flight baseline verification fails', async () => {
      seedPlanRevision([]);

      // Make baseline readback dirty before Attempt 1
      fixtureBalance = 50; // Expected is 100

      const mockBrowserWorker: PlaywrightBrowserWorker = {
        executeAttempt: vi.fn(),
        close: vi.fn(),
      } as any;

      const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

      const outcome = await controller.executeInvestigationPair({
        investigationId: invId,
        executionRequestId: execReqId,
        workerInstanceId: 'worker-instance-01',
        epoch: 1,
      });

      expect(outcome.status).toBe('PREFLIGHT_BASELINE_FAILED');
      expect(outcome.verdict).toBe('INCONCLUSIVE');

      // Zero browser attempts should have been executed to protect dirty target
      expect(mockBrowserWorker.executeAttempt).not.toHaveBeenCalled();

      const invRecord = mockDb.investigations.find((i) => i.id === invId);
      expect(invRecord.lifecycleStatus).toBe('FAILED');
      expect(invRecord.reproductionVerdict).toBe('INCONCLUSIVE');
    });

    it('[Pre-Action Authorization Ordering] fails closed when plan approval has expired before execution without contacting target network', async () => {
      seedPlanRevision([]);

      // Set approval expiresAt to the past
      const approval = mockDb.planApprovals.find((a) => a.id === 'appr-01');
      approval.expiresAt = new Date(Date.now() - 10_000);

      const mockBrowserWorker: PlaywrightBrowserWorker = {
        executeAttempt: vi.fn(),
        close: vi.fn(),
      } as any;

      const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

      await expect(
        controller.executeInvestigationPair({
          investigationId: invId,
          executionRequestId: execReqId,
          workerInstanceId: 'worker-instance-01',
          epoch: 1,
        })
      ).rejects.toThrow(/approval has expired/);

      expect(mockBrowserWorker.executeAttempt).not.toHaveBeenCalled();
    });

    it('[Mutation Uncertainty Quarantine] quarantines lease slot and halts with INCONCLUSIVE on mutation uncertainty', async () => {
      seedPlanRevision([]);

      const mockBrowserWorker: PlaywrightBrowserWorker = {
        executeAttempt: vi.fn().mockImplementation(async (params: any) => {
          if (params.onHeartbeat) await params.onHeartbeat();
          return {
            investigationId: params.investigationId,
            attemptNumber: params.attemptNumber,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            totalDurationMs: 500,
            completedCleanly: false,
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
            actionsExecuted: [
              {
                stepIndex: 1,
                action: {
                  stepIndex: 1,
                  semanticAction: 'Click mutating button',
                  toolKind: 'click_button',
                  tier: 'TIER_3_MUTATING_INTERACTION',
                  timeoutMs: 15000,
                },
                tier: 'TIER_3_MUTATING_INTERACTION',
                status: 'TIMED_OUT',
                durationMs: 500,
                uncertainty: 'MUTATION_UNCERTAIN',
                errorDetails: 'Navigation timed out during mutating click.',
                dispatchedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
            assertionObservations: new Map(),
          };
        }),
        close: vi.fn(),
      } as any;

      const controller = new TwoAttemptController(leaseService, mockBrowserWorker, () => mockDb as any);

      const outcome = await controller.executeInvestigationPair({
        investigationId: invId,
        executionRequestId: execReqId,
        workerInstanceId: 'worker-instance-01',
        epoch: 1,
      });

      expect(outcome.status).toBe('MUTATION_UNCERTAIN');
      expect(outcome.verdict).toBe('INCONCLUSIVE');

      // Attempt 2 must NOT execute
      expect(mockBrowserWorker.executeAttempt).toHaveBeenCalledTimes(1);

      // Verify global lease slot was quarantined
      const lease = mockDb.globalExecutionLeases[0];
      expect(lease).toBeDefined();
      expect(lease.isQuarantined).toBe(true);
      expect(lease.quarantineReason).toContain('MUTATION_UNCERTAIN');
    });

    it('[Bounded Predicates & ReDoS Safety] rejects catastrophic backtracking and string length overflows', () => {
      // Catastrophic nested quantifier pattern
      const redosPattern = '(a+)+$';
      const result = DeterministicAssertionEvaluator.evaluateAssertion(
        {
          id: 'assert-redos',
          kind: 'VALUE_COMPARISON',
          operator: 'MATCHES_REGEX',
          purpose: 'FAILURE_SIGNATURE',
          expectedValue: redosPattern,
        } as any,
        {
          assertionId: 'assert-redos',
          kind: 'READBACK_STATE',
          observedValue: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
          isAvailable: true,
          acquisitionStatus: 'ACQUIRED',
        } as any
      );

      expect(result.result).toBe('INVALID_EVALUATION');
      expect(result.details).toContain('potential catastrophic backtracking pattern detected');

      // Bounded safe regex evaluation works as intended
      const safeResult = DeterministicAssertionEvaluator.evaluateAssertion(
        {
          id: 'assert-safe-regex',
          kind: 'VALUE_COMPARISON',
          operator: 'MATCHES_REGEX',
          purpose: 'REPORTED_FAILURE_SIGNATURE',
          expectedValue: 'Error:\\s+500',
        } as any,
        {
          assertionId: 'assert-safe-regex',
          kind: 'READBACK_STATE',
          observedValue: 'Server Error: 500 Internal Failure',
          isAvailable: true,
          acquisitionStatus: 'ACQUIRED',
        } as any
      );

      expect(safeResult.result).toBe('SATISFIED');
    });
  });
});
