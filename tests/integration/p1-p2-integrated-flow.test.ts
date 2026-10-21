import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  IntegratedReportClarificationAgent,
  IntegratedBrowserInvestigationAgent,
  IntegratedEvidenceReviewAgent,
} from '@/server/ai/integrated-adapters';
import {
  MockTestDoubleModelProvider,
  OpenAiLunaProvider,
  OllamaLocalModelProvider,
  ModelProviderError,
} from '@/server/ai/provider';
import { ServiceUnavailableError } from '@/server/services/ports';
import { createDemoTargetServer } from '../../demo-target/server';
import { TargetResetClient } from '@/server/verification/target-reset-client';
import { z } from 'zod';
import type { SafeTargetProfile, SafeModelTargetContext } from '@/contracts/targets';
import type { DraftReportIntake } from '@/contracts/reports';
import type { SanitizedBrowserObservation, VerificationAssertionResult } from '@/contracts/observations';
import type { FinalizedCaptureReference } from '@/contracts/evidence';

/**
 * ============================================================================
 * PERSON 1 & PERSON 2 END-TO-END INTEGRATED SUBSYSTEM SUITE
 * ============================================================================
 *
 * Verifies the concrete runtime integration between:
 * - Person 1: Trusted Orchestrator, Typed Plans, Reset Coordinator, Ports
 * - Person 2: AI Role Agents, Deterministic Test Doubles, Demo Target Fixture
 *
 * INVARIANTS TESTED:
 * 1. Role 1 produces typed ExperimentProposalSchema from intake report.
 * 2. Role 2 translates sanitized DOM observations to grounded Playwright actions.
 * 3. TargetResetClient coordinates authenticated reset and readback with demo target.
 * 4. Role 3 synthesizes explanation where hypotheses are NEVER verified facts (TC-INV-008).
 * 5. Cost reporting and model constraints remain strictly enforced.
 */
describe('Person 1 & Person 2 Integrated Runtime Flow', () => {
  let demoTargetInstance: ReturnType<typeof createDemoTargetServer>;
  let targetPort: number;
  let targetUrl: string;
  const resetSecret = 'p1-p2-integration-secret-2026';

  beforeAll(async () => {
    demoTargetInstance = createDemoTargetServer({
      port: 0,
      resetSecret,
      bugModeActive: true,
      buildVersion: 'v1.0.0-integrated',
    });
    targetPort = await demoTargetInstance.start(0);
    targetUrl = `http://127.0.0.1:${targetPort}`;
  });

  afterAll(async () => {
    if (demoTargetInstance) {
      await demoTargetInstance.stop();
    }
  });

  it('Role 1: processes intake report and proposes structured experiment plan', async () => {
    const mockProvider = new MockTestDoubleModelProvider('mock-luna');
    mockProvider.queueResponse({
      variant: 'PLAN_PROPOSED',
      extractedClaim: {
        summary: 'Deleting task in active filter deletes wrong task index.',
        reportedProblem: 'Active task deletion removes completed item instead.',
        claimedExpectedBehavior: 'Target active task is deleted.',
        affectedEntities: ['Task B'],
      },
      experimentPlan: {
        planRevision: 1,
        preconditions: ['Demo target accessible', 'Tasks present'],
        requiredRole: 'test_user',
        steps: [
          {
            stepNumber: 1,
            actionType: 'NAVIGATE',
            intentDescription: 'Navigate to task list',
            inputValue: targetUrl,
            isDestructive: false,
          },
          {
            stepNumber: 2,
            actionType: 'CLICK',
            intentDescription: 'Click Active filter button',
            targetAccessibleName: 'Active',
            targetRole: 'button',
            isDestructive: false,
          },
          {
            stepNumber: 3,
            actionType: 'CLICK',
            intentDescription: 'Click delete button for Task B',
            targetAccessibleName: 'Delete Task B',
            targetRole: 'button',
            isDestructive: true,
          },
        ],
        correctBehaviorAssertions: [
          {
            predicateId: 'assert_task_b_deleted',
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
            predicateId: 'assert_task_a_retained',
            assertionType: 'REPORTED_FAILURE_SIGNATURE',
            target: 'DOM_ELEMENT',
            selector: 'li:has-text("Task A")',
            expectedCondition: 'EXISTS',
            expectedValue: true,
            description: 'Task A should still remain in DOM',
          },
        ],
      },
    });

    const clarificationAgent = new IntegratedReportClarificationAgent(mockProvider);

    const report: DraftReportIntake = {
      targetId: randomUUID(),
      title: 'Deleting active task deletes completed item',
      rawDescription: 'When filtering by Active, clicking delete on Task B deletes Task A instead.',
      expectedBehavior: 'Task B should be deleted.',
      observedBehavior: 'Task A was deleted.',
    };

    const target: SafeModelTargetContext = {
      targetId: randomUUID(),
      name: 'TraceCase-Demo-Tasks',
      baseUrl: targetUrl,
      allowedOrigins: [targetUrl],
      isSandboxVerified: true,
      environment: 'demo',
    };

    const result = await clarificationAgent.generateProposal({ report, target });

    expect(result.status).toBe('EXPERIMENT_PROPOSED');
    if (result.status === 'EXPERIMENT_PROPOSED') {
      expect(result.proposal.steps).toHaveLength(3);
      expect(result.proposal.steps[0].toolKind).toBe('navigate');
      expect(result.proposal.steps[1].toolKind).toBe('click_button');
      expect(result.proposal.steps[2].toolKind).toBe('click_button');
      expect(result.proposal.steps[2].tier).toBe('TIER_4_DESTRUCTIVE');
      expect(result.proposal.assertions).toHaveLength(2);
      expect(result.proposal.assertions[0].operator).toBe('NOT_EXISTS');
      expect(result.proposal.assertions[1].operator).toBe('EXISTS');
      expect(result.proposal.expectedCorrectBehavior).toMatch(/task/i);
    }
  });

  it('Role 2: proposes next grounded browser action from sanitized observation', async () => {
    const obsId = randomUUID();
    const mockProvider = new MockTestDoubleModelProvider('mock-luna');
    mockProvider.queueResponse({
      variant: 'PROPOSE_ACTION',
      echoedStepNumber: 1,
      echoedObservationId: obsId,
      action: {
        actionType: 'CLICK',
        targetNodeId: 'node_1',
        primarySelector: 'button#btn-active-filter',
      },
      expectedPostcondition: 'Active filter tab activated',
      rationale: 'Filter tasks to active subset',
    });

    const browserAgent = new IntegratedBrowserInvestigationAgent(mockProvider);

    const observation: SanitizedBrowserObservation = {
      attemptNumber: 1,
      stepIndex: 0,
      currentUrl: targetUrl,
      pageTitle: 'TraceCase Demo Tasks',
      visibleDomElements: [
        {
          elementRef: '#heading-main',
          tagName: 'h1',
          textSnippet: 'TraceCase Demo Tasks',
          isInteractive: false,
        },
        {
          elementRef: '#btn-active-filter',
          tagName: 'button',
          textSnippet: 'Active',
          ariaRole: 'button',
          isInteractive: true,
        },
      ],
      recentConsoleEntries: [],
      recentNetworkFailures: [],
      freshnessTimestamp: new Date().toISOString(),
    };
    (observation as unknown as Record<string, unknown>).observationId = obsId;

    const actionProposal = await browserAgent.proposeNextAction({
      investigationId: randomUUID(),
      approvedIntent: 'Click Active filter button',
      currentObservation: observation,
      remainingAllowedTiers: ['TIER_1_READ_ONLY', 'TIER_2_SAFE_INTERACTION'],
    });

    expect(actionProposal.kind).toBe('EXECUTE_ACTION');
    if (actionProposal.kind === 'EXECUTE_ACTION') {
      expect(actionProposal.action.selector).toBe('#btn-active-filter');
      expect(actionProposal.action.toolKind).toBe('click_button');
      expect(actionProposal.confidence).toBeGreaterThan(0.5);
    }
  });

  it('Target Reset Client: executes authenticated reset and independent readback against demo target', async () => {
    const safeTarget: SafeTargetProfile = {
      id: randomUUID(),
      name: 'TraceCase Demo Target',
      baseUrl: targetUrl,
      allowedOrigins: [targetUrl],
      isSandboxVerified: true,
      environment: 'demo',
      hasResetCapability: true,
      hasTestAccountConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const expectedBaseline = {
      fixtureScope: 'default',
      buildVersion: 'v1.0.0-integrated',
      itemCount: 2,
      items: demoTargetInstance.store.getTasks('default'),
    };

    const receipt = await TargetResetClient.coordinateReset({
      target: safeTarget,
      investigationId: randomUUID(),
      attemptPairId: randomUUID(),
      expectedBaseline,
      resetAuthSecret: resetSecret,
      resetEndpoint: `${targetUrl}/api/test/reset-fixture`,
      readbackEndpoint: `${targetUrl}/api/test/readback`,
    });

    expect(receipt.transportSuccess).toBe(true);
    expect(receipt.baselineEquivalent).toBe(true);
    expect(receipt.isVerifiedRestored).toBe(true);
    expect(receipt.readback.isEquivalent).toBe(true);
    expect(receipt.readback.discrepancies).toHaveLength(0);
    expect(receipt.targetBuildId).toBe('v1.0.0-integrated');
  });

  it('Role 3: synthesizes evidence review with strict hypothesis non-fact invariant', async () => {
    const mockProvider = new MockTestDoubleModelProvider('mock-luna');
    mockProvider.queueResponse({
      variant: 'REPORT_SYNTHESIZED',
      executiveSummary: 'Defect confirmed reproduced across both bounded attempts.',
      observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
      attempt1Comparison: {
        summary: 'Attempt 1 failed expected assertions: Task B remained.',
        failedAssertions: ['assert_task_b_deleted'],
        matchingFailureObserved: true,
      },
      attempt2Comparison: {
        summary: 'Attempt 2 failed matching expected assertions after verified reset.',
        failedAssertions: ['assert_task_b_deleted'],
        matchingFailureObserved: true,
      },
      evidenceCitations: [
        {
          artifactType: 'VIDEO',
          safeUrl: 'http://localhost:3005/artifacts/run1_video.webm',
          relevanceExplanation: 'Shows click event and task remaining in list',
        },
      ],
      manualReproductionSteps: ['Open app', 'Select Active filter', 'Click Delete Task B'],
      diagnosticHypothesis: {
        isVerifiedFact: false,
        hypothesisText: 'Row index calculation offsets in filtered state.',
        supportingEvidenceTokens: ['index', 'active', 'splice'],
        suggestedInvestigationDirection: 'Inspect list item removal handler in store.ts.',
      },
      limitationsAndCaveats: ['Testing conducted against local demo target.'],
    });

    const reviewAgent = new IntegratedEvidenceReviewAgent(mockProvider);
    const investigationId = randomUUID();

    const verifiedAssertions: VerificationAssertionResult[] = [
      {
        assertionId: randomUUID(),
        result: 'NOT_SATISFIED',
        observedValue: 'TASK_B_PRESENT',
        evaluatedAt: new Date().toISOString(),
      },
    ];

    const eligibleEvidence: FinalizedCaptureReference[] = [
      {
        captureId: randomUUID(),
        investigationId,
        attemptNumber: 1,
        kind: 'VIDEO_RECORDING',
        storageRef: 's3://tracecase-public-safe/run1_video.webm',
        sizeBytes: 1048576,
        sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        capturedAt: new Date().toISOString(),
      },
    ];

    const result = await reviewAgent.synthesizeExplanation({
      investigationId,
      lockedVerdict: 'CONFIRMED_REPRODUCED',
      verifiedAssertions,
      eligibleEvidence,
    });

    expect(result.investigationId).toBe(investigationId);
    expect(result.naturalLanguageSummary).toContain('reproduced');
    expect(result.verifiedFactsExplanation).toContain('Attempt 1');
    expect(result.observationsVsHypotheses).toHaveLength(1);
    expect(result.observationsVsHypotheses[0].hypothesis).toContain('Row index calculation');
    expect(result.evidenceReferences).toHaveLength(1);
  });

  it('Provider Fail-Closed Invariants: offline host without API key fails gracefully with ServiceUnavailableError', async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      const unconfiguredAgent = new IntegratedReportClarificationAgent();

      await expect(
        unconfiguredAgent.generateProposal({
          report: {
            targetId: randomUUID(),
            title: 'Bug',
            rawDescription: 'Desc',
            expectedBehavior: 'Exp',
            observedBehavior: 'Obs',
          },
          target: {
            targetId: randomUUID(),
            name: 'Target',
            baseUrl: 'http://localhost:3000',
            allowedOrigins: ['http://localhost:3000'],
            isSandboxVerified: true,
            environment: 'demo',
          },
        })
      ).rejects.toThrow(ServiceUnavailableError);
    } finally {
      if (originalKey !== undefined) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it('Provider Fail-Closed Invariants: strictly rejects unauthorized models and local models in production', async () => {
    // 1. Live OpenAI provider rejects any model other than gpt-6-luna (TC-INV-001)
    const unauthorizedProvider = new OpenAiLunaProvider({
      apiKey: 'test-key-sk-dummy-12345',
      modelIdentifier: 'unauthorized-model-xyz',
    });

    await expect(
      unauthorizedProvider.generateStructuredCompletion(
        {
          correlationId: randomUUID(),
          roleId: 'AT-ROLE-001',
          promptVersion: '1.0.0',
          systemPrompt: 'System',
          userPrompt: 'User',
        },
        z.object({ ok: z.boolean() })
      )
    ).rejects.toThrowError(/Unauthorized model 'unauthorized-model-xyz'/);

    // 2. Local Ollama provider is strictly forbidden in production
    const envObj = process.env as Record<string, string | undefined>;
    const originalEnv = envObj.NODE_ENV;
    try {
      envObj.NODE_ENV = 'production';
      const localProvider = new OllamaLocalModelProvider({
        modelIdentifier: 'phi4-mini:latest',
      });

      await expect(
        localProvider.generateStructuredCompletion(
          {
            correlationId: randomUUID(),
            roleId: 'AT-ROLE-001',
            promptVersion: '1.0.0',
            systemPrompt: 'System',
            userPrompt: 'User',
          },
          z.object({ ok: z.boolean() })
        )
      ).rejects.toThrow(ModelProviderError);
    } finally {
      envObj.NODE_ENV = originalEnv;
    }
  });
});
