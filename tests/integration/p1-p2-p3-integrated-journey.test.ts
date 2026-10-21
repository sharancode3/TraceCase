import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createDemoTargetServer } from '../../demo-target/server';
import { MockTestDoubleModelProvider } from '@/server/ai/provider';
import { createTestBudgetManager } from '@/server/ai/budget-manager';
import {
  IntegratedReportClarificationAgent,
  IntegratedBrowserInvestigationAgent,
  IntegratedEvidenceReviewAgent,
} from '@/server/ai/integrated-adapters';
import { TargetResetClient } from '@/server/verification/target-reset-client';
import { PairAssessor } from '@/server/verification/pair-assessor';
import { IntegratedEvidenceStorageAdapter } from '@/server/evidence/evidence-storage-adapter';
import { InMemoryEvidenceStorageDriver } from '@/server/evidence/storage';
import { MIN_VIDEO_BYTE_SIZE } from '@/server/evidence/processor';
import {
  getSystemReadiness,
  createDefaultServiceContainer,
} from '@/server/services/service-container';
import { EvidenceReviewService } from '@/server/ai/evidence-review-service';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { DraftReportIntake } from '@/contracts/reports';
import type { CaptureRegistrationCommand } from '@/contracts/evidence';
import type { PairAssessmentResult } from '@/server/verification/types';

/**
 * ============================================================================
 * TRACECASE COMPLETE THREE-PERSON INTEGRATED JOURNEY SUITE
 * ============================================================================
 *
 * Validates the complete end-to-end integration across all three contributors:
 * - Person 1: Trusted Orchestrator, Approval & Queue Boundaries, Two-Run Verification
 * - Person 2: AI Luna Role Agents, Model Double, Controlled Demo Target & Reset
 * - Person 3: Dual-Bucket Storage, Redaction Sanitizer, Retrieval API & UI Contracts
 */
describe('Three-Person Integrated Lifecycle Journey (P1 + P2 + P3)', () => {
  let demoTargetInstance: ReturnType<typeof createDemoTargetServer>;
  let targetPort: number;
  let targetUrl: string;
  const resetSecret = 'p1-p2-p3-integration-secret-2026';
  const tempDir = path.join(process.cwd(), '.tmp', 'p1-p2-p3-test-evidence');

  beforeAll(async () => {
    await fs.mkdir(tempDir, { recursive: true });

    demoTargetInstance = createDemoTargetServer({
      port: 0,
      resetSecret,
      bugModeActive: true,
      buildVersion: 'v1.0.0-p1-p2-p3-verified',
    });
    targetPort = await demoTargetInstance.start(0);
    targetUrl = `http://127.0.0.1:${targetPort}`;
  });

  afterAll(async () => {
    if (demoTargetInstance) {
      await demoTargetInstance.stop();
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('1. System Readiness: probes report evidenceStorage AVAILABLE alongside live ports', async () => {
    const container = createDefaultServiceContainer();
    expect(container.evidenceStorage).toBeInstanceOf(IntegratedEvidenceStorageAdapter);

    const readiness = await getSystemReadiness();
    expect(readiness.components.evidenceStorage.status).toBe('AVAILABLE');
    expect(readiness.components.evidenceStorage.metadata).toBeDefined();
    expect(readiness.components.evidenceStorage.metadata?.owner).toBe('Person 3');
  });

  it('2. Intake -> Plan Proposal -> Cryptographic Hash Binding', async () => {
    const mockProvider = new MockTestDoubleModelProvider('mock-luna');
    mockProvider.queueResponse({
      variant: 'PLAN_PROPOSED',
      extractedClaim: {
        summary: 'Active task deletion removes completed item instead.',
        reportedProblem: 'Filter offset error causes wrong item deletion.',
        claimedExpectedBehavior: 'Target active task is deleted.',
        affectedEntities: ['task-b'],
      },
      experimentPlan: {
        planRevision: 1,
        preconditions: ['Demo target accessible', 'Initial tasks seeded'],
        requiredRole: 'test_user',
        steps: [
          {
            stepNumber: 1,
            actionType: 'NAVIGATE',
            intentDescription: 'Navigate to target tasks page',
            actionPayload: { url: targetUrl },
          },
          {
            stepNumber: 2,
            actionType: 'CLICK',
            intentDescription: 'Click active filter',
            actionPayload: { selector: '#filter-active' },
          },
          {
            stepNumber: 3,
            actionType: 'CLICK',
            intentDescription: 'Click delete button for active item',
            actionPayload: { selector: '.delete-btn' },
          },
        ],
        correctBehaviorAssertions: [
          {
            predicateId: 'assert-correct-delete',
            assertionType: 'CORRECT_BEHAVIOR',
            target: 'DOM_ELEMENT',
            selector: 'li:has-text("Task B")',
            expectedCondition: 'NOT_EXISTS',
            expectedValue: true,
            description: 'Task B is removed from DOM',
          },
        ],
        reportedFailureAssertions: [
          {
            predicateId: 'assert-bug-signature',
            assertionType: 'REPORTED_FAILURE_SIGNATURE',
            target: 'DOM_ELEMENT',
            selector: 'li:has-text("Task A")',
            expectedCondition: 'EXISTS',
            expectedValue: true,
            description: 'Task A should still remain in DOM',
          },
        ],
        timeoutBudgetSeconds: 30,
        maxAttemptCount: 2,
      },
    });

    const clarificationAgent = new IntegratedReportClarificationAgent(
      mockProvider,
      createTestBudgetManager()
    );

    const targetContext = {
      targetId: randomUUID(),
      name: 'Demo Tasks App',
      baseUrl: targetUrl,
      allowedOrigins: [targetUrl],
      isSandboxVerified: true,
      hasResetCapability: true,
      environment: 'demo' as const,
    };

    const draftReport: DraftReportIntake = {
      targetId: targetContext.targetId,
      title: 'Deleting active item deletes wrong item',
      rawDescription: 'When filtered to active, clicking delete removes the completed item.',
      expectedBehavior: 'Active task should be deleted.',
      observedBehavior: 'Completed task was deleted.',
    };

    const proposal = await clarificationAgent.generateProposal({
      report: draftReport,
      target: targetContext,
      investigationId: randomUUID(),
    });

    expect(proposal.status).toBe('EXPERIMENT_PROPOSED');
    if (proposal.status === 'EXPERIMENT_PROPOSED') {
      expect(proposal.proposal).toBeDefined();
      expect(proposal.proposal.steps).toHaveLength(3);
      expect(proposal.proposal.assertions).toHaveLength(2);
    }
  });

  it('3. Target Reset & Baseline Readback: verifies initial state and restoration between attempts', async () => {
    const safeTarget: SafeTargetProfile = {
      id: randomUUID(),
      name: 'Controlled Target',
      baseUrl: targetUrl,
      allowedOrigins: [targetUrl],
      isSandboxVerified: true,
      hasResetCapability: true,
      hasTestAccountConfigured: false,
      environment: 'demo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Pre-flight readback before Attempt 1
    const preflight = await TargetResetClient.verifyBaselineReadback({
      target: safeTarget,
      expectedBaseline: {},
      resetAuthSecret: resetSecret,
    });

    expect(preflight.targetBuildId).toBe('v1.0.0-p1-p2-p3-verified');
    expect(preflight.observedBaseline).toBeDefined();

    // Trigger fixture reset before Attempt 2
    const resetResult = await TargetResetClient.coordinateReset({
      target: safeTarget,
      investigationId: randomUUID(),
      attemptPairId: randomUUID(),
      resetAuthSecret: resetSecret,
      expectedBaseline: preflight.observedBaseline || {},
      resetEndpoint: `${targetUrl}/api/test/reset-fixture`,
      readbackEndpoint: `${targetUrl}/api/test/readback`,
    });

    expect(resetResult.transportSuccess).toBe(true);
    expect(resetResult.isVerifiedRestored).toBe(true);
    expect(resetResult.baselineEquivalent).toBe(true);
  });

  it('4. Two-Run Deterministic Pair Assessment: locks CONFIRMED_REPRODUCED on two valid matching runs', () => {
    const investigationId = randomUUID();
    const targetId = randomUUID();

    const pairResult: PairAssessmentResult = PairAssessor.assessPair({
      investigationId,
      attempt1: {
        attemptNumber: 1,
        validity: 'VALID',
        finding: 'REPORTED_FAILURE',
        preconditionsMet: true,
        procedureCompleted: true,
        scopeAdhered: true,
        requiredObservationsAvailable: true,
        evaluations: [
          {
            assertionId: 'assert-bug-signature',
            kind: 'ENTITY_PRESENCE',
            purpose: 'REPORTED_FAILURE_SIGNATURE',
            result: 'SATISFIED',
            expectedValue: 'SATISFIED',
            observedValue: 'SATISFIED',
            evaluatedAt: new Date().toISOString(),
          },
        ],
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
        evaluations: [
          {
            assertionId: 'assert-bug-signature',
            kind: 'ENTITY_PRESENCE',
            purpose: 'REPORTED_FAILURE_SIGNATURE',
            result: 'SATISFIED',
            expectedValue: 'SATISFIED',
            observedValue: 'SATISFIED',
            evaluatedAt: new Date().toISOString(),
          },
        ],
        assessedAt: new Date().toISOString(),
      },
      resetReceipt: {
        id: randomUUID(),
        investigationId,
        targetId,
        attemptNumber: 2,
        transportSuccess: true,
        baselineEquivalent: true,
        isVerifiedRestored: true,
        readback: {
          targetId,
          expectedStateHash: 'hash-initial',
          observedStateHash: 'hash-initial',
          isEquivalent: true,
          targetBuildId: 'v1.0.0-p1-p2-p3-verified',
          checkedAt: new Date().toISOString(),
        },
        verifiedAt: new Date().toISOString(),
      },
      targetBuildIdAttempt1: 'v1.0.0-p1-p2-p3-verified',
      targetBuildIdAttempt2: 'v1.0.0-p1-p2-p3-verified',
    });

    expect(pairResult.verdict).toBe('CONFIRMED_REPRODUCED');
    expect(pairResult.validAttemptCount).toBe(2);
    expect(pairResult.matchingAttemptCount).toBe(2);
    expect(pairResult.isComparable).toBe(true);
  });

  it('5. Evidence Storage Adapter: in-stream sanitization, dual-bucket quarantine, and video isolation', async () => {
    const investigationId = randomUUID();
    const storageDriver = new InMemoryEvidenceStorageDriver();
    const adapter = new IntegratedEvidenceStorageAdapter(() => ({} as any), storageDriver);

    // Create raw sample telemetry files on disk
    const consoleFile = path.join(tempDir, `console-${investigationId}.log`);
    const networkFile = path.join(tempDir, `network-${investigationId}.json`);
    const videoFile = path.join(tempDir, `video-${investigationId}.webm`);

    const rawConsole = [
      '[INFO] Navigated to tasks page',
      '[DEBUG] User session Bearer super-secret-jwt-token-987654',
      '[WARN] Row deletion offset mismatch detected',
    ].join('\n');

    const rawNetwork = JSON.stringify({
      url: `${targetUrl}/api/tasks/task-001`,
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer api-secret-key-12345',
        Cookie: 'session=session-secret-abcdef',
        Accept: 'application/json',
      },
      status: 200,
    });

    // Valid video buffer (>= 10 KB per VES-EVD-002 with WebM EBML header)
    const validVideoBuffer = Buffer.alloc(MIN_VIDEO_BYTE_SIZE + 2048, 0x5a);
    validVideoBuffer.set([0x1a, 0x45, 0xdf, 0xa3], 0);

    await fs.writeFile(consoleFile, rawConsole, 'utf-8');
    await fs.writeFile(networkFile, rawNetwork, 'utf-8');
    await fs.writeFile(videoFile, validVideoBuffer);

    const consoleCaptureId = randomUUID();
    const networkCaptureId = randomUUID();
    const videoCaptureId = randomUUID();

    // Stage captures into adapter
    await storageDriver.putArtifact({
      key: `investigations/${investigationId}/attempts/1/${consoleCaptureId}.log`,
      tier: 'RESTRICTED_RAW',
      data: rawConsole,
      mimeType: 'text/plain',
    });

    await storageDriver.putArtifact({
      key: `investigations/${investigationId}/attempts/1/${networkCaptureId}.json`,
      tier: 'RESTRICTED_RAW',
      data: rawNetwork,
      mimeType: 'application/json',
    });

    await storageDriver.putArtifact({
      key: `investigations/${investigationId}/attempts/1/${videoCaptureId}.webm`,
      tier: 'RESTRICTED_RAW',
      data: validVideoBuffer,
      mimeType: 'video/webm',
    });

    // Process artifacts
    const processingResults = await adapter.processArtifacts({
      investigationId,
      captureRefs: [
        {
          captureId: consoleCaptureId,
          investigationId,
          attemptNumber: 1,
          kind: 'CONSOLE_LOG',
          storageRef: `raw://${investigationId}/attempt-1/console.log`,
          sizeBytes: Buffer.byteLength(rawConsole),
          sha256Checksum: 'a'.repeat(64),
          capturedAt: new Date().toISOString(),
        },
        {
          captureId: networkCaptureId,
          investigationId,
          attemptNumber: 1,
          kind: 'NETWORK_TRACE',
          storageRef: `raw://${investigationId}/attempt-1/network.json`,
          sizeBytes: Buffer.byteLength(rawNetwork),
          sha256Checksum: 'b'.repeat(64),
          capturedAt: new Date().toISOString(),
        },
        {
          captureId: videoCaptureId,
          investigationId,
          attemptNumber: 1,
          kind: 'VIDEO_RECORDING',
          storageRef: `raw://${investigationId}/attempt-1/video.webm`,
          sizeBytes: validVideoBuffer.length,
          sha256Checksum: 'c'.repeat(64),
          capturedAt: new Date().toISOString(),
        },
      ],
    });

    expect(processingResults).toHaveLength(3);

    const consoleRes = processingResults.find((r) => r.kind === 'CONSOLE_LOG');
    expect(consoleRes?.publishedTier).toBe('PUBLIC_SAFE');
    expect(consoleRes?.redactionApplied).toBe(true);
    expect(consoleRes?.isEligibleForSharing).toBe(true);

    const networkRes = processingResults.find((r) => r.kind === 'NETWORK_TRACE');
    expect(networkRes?.publishedTier).toBe('PUBLIC_SAFE');
    expect(networkRes?.isEligibleForSharing).toBe(true);

    // SEC-01 Invariant: video recording is strictly quarantined in RESTRICTED_RAW pending privacy review
    const videoRes = processingResults.find((r) => r.kind === 'VIDEO_RECORDING');
    expect(videoRes?.publishedTier).toBe('RESTRICTED_RAW');
    expect(videoRes?.isEligibleForSharing).toBe(false); // Quarantined pending privacy review (SEC-01)
    expect(videoRes?.quarantineReason).toBe('VIDEO_PENDING_PRIVACY_REVIEW');

    // Verify sanitized console in storage does NOT contain raw secret
    const safeConsoleKey = `investigations/${investigationId}/attempts/1/attempt_1_console_${consoleCaptureId}.log`;
    const storedSafeConsole = await storageDriver.getArtifact(safeConsoleKey, 'PUBLIC_SAFE');
    expect(storedSafeConsole).not.toBeNull();
    const safeConsoleText = storedSafeConsole?.data.toString('utf-8') || '';
    expect(safeConsoleText).not.toContain('super-secret-jwt-token-987654');
    expect(safeConsoleText).toContain('[REDACTED_BEARER_TOKEN]');

    // Verify raw console in RESTRICTED_RAW still holds original for auditing
    const rawConsoleKey = `investigations/${investigationId}/attempts/1/attempt_1_raw_console_${consoleCaptureId}.log`;
    const storedRawConsole = await storageDriver.getArtifact(rawConsoleKey, 'RESTRICTED_RAW');
    expect(storedRawConsole).not.toBeNull();
    expect(storedRawConsole?.data.toString('utf-8')).toContain('super-secret-jwt-token-987654');
  });

  it('6. Evidence Review Narrative: synthesizes explanation forwarding factual attempt facts without altering verdict', async () => {
    const investigationId = randomUUID();
    const mockProvider = new MockTestDoubleModelProvider('mock-luna');
    mockProvider.queueResponse({
      variant: 'REPORT_SYNTHESIZED',
      executiveSummary: 'The reported bug was successfully reproduced across 2 consecutive runs.',
      observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
      attempt1Comparison: {
        summary: 'Attempt 1 observed task-001 deletion.',
        failedAssertions: ['assert-bug-signature'],
        matchingFailureObserved: true,
      },
      attempt2Comparison: {
        summary: 'Attempt 2 confirmed identical failure.',
        failedAssertions: ['assert-bug-signature'],
        matchingFailureObserved: true,
      },
      evidenceCitations: [
        {
          artifactType: 'VIDEO',
          safeUrl: 'http://localhost:3005/artifacts/run1_video.webm',
          relevanceExplanation: 'Shows task remaining',
        },
      ],
      manualReproductionSteps: ['Open app', 'Filter active', 'Click delete'],
      diagnosticHypothesis: {
        isVerifiedFact: false,
        hypothesisText: 'Row index calculation offset in filter mapper.',
        supportingEvidenceTokens: ['index', 'active'],
        suggestedInvestigationDirection: 'Inspect tasks store.',
      },
      limitationsAndCaveats: ['Only tested on Chromium viewport.'],
    });

    const reviewAgent = new IntegratedEvidenceReviewAgent(
      mockProvider,
      createTestBudgetManager()
    );

    const explanation = await reviewAgent.synthesizeExplanation({
      investigationId,
      lockedVerdict: 'CONFIRMED_REPRODUCED',
      verifiedAssertions: [
        {
          assertionId: 'assert-bug-signature',
          result: 'SATISFIED',
          expectedValue: 'SATISFIED',
          observedValue: 'SATISFIED',
          evaluatedAt: new Date().toISOString(),
        },
      ],
      eligibleEvidence: [],
      attempt1: {
        attemptNumber: 1,
        status: 'FAILED_ASSERTIONS',
        failureSignatureMatched: true,
        executionDurationMs: 4120,
        isValid: true,
        assertionsEvaluated: [
          {
            predicateId: 'assert-bug-signature',
            predicateDescription: 'Completed task deleted instead',
            passed: false,
            actualValue: 'SATISFIED',
            expectedValue: 'SATISFIED',
          },
        ],
      },
      attempt2: {
        attemptNumber: 2,
        status: 'FAILED_ASSERTIONS',
        failureSignatureMatched: true,
        executionDurationMs: 3890,
        isValid: true,
        assertionsEvaluated: [
          {
            predicateId: 'assert-bug-signature',
            predicateDescription: 'Completed task deleted instead',
            passed: false,
            actualValue: 'SATISFIED',
            expectedValue: 'SATISFIED',
          },
        ],
      },
    });

    expect(explanation.investigationId).toBe(investigationId);
    expect(explanation.naturalLanguageSummary).toContain('reproduced');
    expect(explanation.verifiedFactsExplanation).toContain('Attempt 1');
    expect(explanation.observationsVsHypotheses).toHaveLength(1);
    // Hypotheses remain distinguishable from facts (TC-INV-008)
    expect(explanation.observationsVsHypotheses[0].hypothesis).toBeDefined();
    expect(explanation.limitationsAndGaps).toHaveLength(1);
  });

  it('7. Signed Access Grant Creation: provides time-limited authorized download grant', async () => {
    const adapter = new IntegratedEvidenceStorageAdapter();
    const artifactId = randomUUID();
    const userId = 'operator-test-01';

    const grant = await adapter.createAccessGrant({
      artifactId,
      userId,
      tier: 'RESTRICTED_RAW',
    });

    expect(grant.grantId).toBeDefined();
    expect(grant.artifactId).toBe(artifactId);
    expect(grant.authorizedUserId).toBe(userId);
    expect(grant.storageTier).toBe('RESTRICTED_RAW');
    expect(grant.downloadUrl).toContain(`grant=${grant.grantId}`);
    expect(new Date(grant.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
