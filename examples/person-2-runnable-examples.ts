/**
 * ============================================================================
 * TRACECASE PERSON 2: RUNNABLE INTEGRATION EXAMPLES
 * ============================================================================
 * 
 * Provides verified, type-checked runnable examples for Person 1 and Person 3:
 * 1. AI Provider Adapters (Local Ollama, OpenAI Luna, Mock Test Double)
 * 2. Report Experiment Planner (AT-ROLE-001)
 * 3. Browser Action Proposer (AT-ROLE-002)
 * 4. Evidence Reviewer (AT-ROLE-003)
 * 5. Controlled Target Client (Reset, Readback, Cleanup)
 * 
 * Invariants Preserved:
 * - Zero paid calls ($0.0000)
 * - Zero browser/Playwright execution (symbolic AXTree proposals only)
 * - Model proposes; trusted server verifies and authorizes
 */

import { z } from 'zod';
import {
  MockTestDoubleModelProvider,
  OllamaLocalModelProvider,
  OpenAiLunaProvider,
  validateMaxTokens,
  MAX_OUTPUT_TOKENS,
  type ModelProviderPort,
} from '../src/server/ai/provider';
import { ReportExperimentAgent } from '../src/server/ai/planner';
import { BrowserInteractionAgent } from '../src/server/ai/browser-actor';
import { EvidenceReviewAgent } from '../src/server/ai/reviewer';
import { DemoTargetClient } from '../demo-target/client';
import type {
  ReportAgentInput,
  BrowserAgentInput,
  EvidenceReviewAgentInput,
} from '../src/server/ai/contracts';

// ============================================================================
// 1. PROVIDER EXAMPLES
// ============================================================================

export async function runProviderExample(): Promise<void> {
  // A. Mock Test Double (Deterministic unit / integration testing)
  const mockProvider = new MockTestDoubleModelProvider('test-double-v1');
  const Schema = z.object({ status: z.string(), count: z.number() });

  mockProvider.queueResponse({ status: 'ready', count: 42 });
  const mockResult = await mockProvider.generateStructuredCompletion(
    {
      roleId: 'AT-ROLE-001',
      systemPrompt: 'You are a test assistant.',
      userPrompt: 'Output status and count.',
      maxTokens: 500,
    },
    Schema
  );

  console.log('[Provider Example] Mock result:', mockResult.data);
  console.log('[Provider Example] Mock usage:', mockResult.usage);

  // B. Local Ollama Provider (Offline local inference on http://localhost:11434)
  const localProvider = new OllamaLocalModelProvider({
    endpointUrl: 'http://localhost:11434',
    modelIdentifier: 'qwen2.5-coder:3b',
    timeoutMs: 45000,
  });
  console.log('[Provider Example] Local Ollama configured:', localProvider.config.modelIdentifier);

  // C. OpenAI Luna Provider (Requires explicit model & secret; cost is 'unavailable' without versioned pricing)
  const cloudProvider = new OpenAiLunaProvider({
    apiKey: 'mock-cloud-key',
    modelIdentifier: 'gpt-4o-2024-08-06',
    pricingConfig: {
      version: '2026-10-01',
      modelIdentifier: 'gpt-4o-2024-08-06',
      promptCostPerMillion: 2.5,
      completionCostPerMillion: 10.0,
    },
  });
  console.log('[Provider Example] OpenAI Luna configured:', cloudProvider.config.modelIdentifier);
}

// ============================================================================
// 2. PLANNER / CLARIFIER EXAMPLE (AT-ROLE-001)
// ============================================================================

export async function runPlannerExample(provider?: ModelProviderPort): Promise<void> {
  const modelProvider = provider || new MockTestDoubleModelProvider('mock-planner');

  // If using mock provider, queue a valid bounded experiment plan response
  if (modelProvider instanceof MockTestDoubleModelProvider) {
    modelProvider.queueResponse({
      variant: 'PLAN_PROPOSED',
      extractedClaim: {
        summary: 'Under Active filter, deleting Task B removes Task A instead',
        reportedProblem: 'Task A deleted erroneously',
        claimedExpectedBehavior: 'Task B should be removed, Task A remains',
        affectedEntities: ['Task A', 'Task B'],
      },
      experimentPlan: {
        planRevision: 1,
        preconditions: ['Target is reset to two_tasks_one_completed fixture'],
        requiredRole: 'test_user',
        steps: [
          {
            stepNumber: 1,
            actionType: 'NAVIGATE',
            intentDescription: 'Open demo app at /',
            isDestructive: false,
          },
          {
            stepNumber: 2,
            actionType: 'CLICK',
            intentDescription: 'Click Active filter tab',
            isDestructive: false,
          },
          {
            stepNumber: 3,
            actionType: 'CLICK',
            intentDescription: 'Click Delete button on Task B',
            isDestructive: true,
          },
        ],
        reportedFailureAssertions: [
          {
            predicateId: 'assert_task_b_persists',
            assertionType: 'REPORTED_FAILURE_SIGNATURE',
            target: 'DOM_ELEMENT',
            expectedCondition: 'EXISTS',
            expectedValue: true,
            description: 'Task B remains visible after deletion',
          },
        ],
        correctBehaviorAssertions: [
          {
            predicateId: 'assert_task_b_deleted',
            assertionType: 'CORRECT_BEHAVIOR',
            target: 'DOM_ELEMENT',
            expectedCondition: 'NOT_EXISTS',
            expectedValue: false,
            description: 'Task B is removed from the list',
          },
        ],
      },
    });
  }

  const agent = new ReportExperimentAgent(modelProvider);
  const input: ReportAgentInput = {
    contractVersion: '1.0.0',
    investigationId: '123e4567-e89b-12d3-a456-426614174000',
    targetProfile: {
      name: 'TraceCase-Demo-Tasks',
      baseUrl: 'http://localhost:3005',
      isSandbox: true,
      allowedOrigins: ['http://localhost:3005'],
      hasResetFixture: true,
    },
    rawReport: {
      title: 'Filter delete issue',
      description: 'Under Active filter, deleting Task B removes Task A instead.',
      claimedExpectedBehavior: 'Task B is removed, Task A remains.',
    },
    clarificationHistory: [],
  };

  const { output, usage } = await agent.evaluateReport(input);
  console.log('[Planner Example] Output variant:', output.variant);
  console.log('[Planner Example] Model used:', usage.modelIdentifier);
}

// ============================================================================
// 3. ACTION PROPOSER EXAMPLE (AT-ROLE-002)
// ============================================================================

export async function runActionProposerExample(provider?: ModelProviderPort): Promise<void> {
  const modelProvider = provider || new MockTestDoubleModelProvider('mock-actor');
  const obsId = '123e4567-e89b-12d3-a456-426614174001';

  if (modelProvider instanceof MockTestDoubleModelProvider) {
    modelProvider.queueResponse({
      variant: 'PROPOSE_ACTION',
      echoedStepNumber: 1,
      echoedObservationId: obsId,
      action: {
        actionType: 'CLICK',
        targetNodeId: 'node_103',
        primarySelector: 'button[data-task-id="task-b"]',
      },
      expectedPostcondition: 'Task B row is removed from DOM',
      rationale: 'Step 1 requires clicking Delete on Task B; node_103 matches the intent.',
    });
  }

  const actor = new BrowserInteractionAgent(modelProvider);
  const input: BrowserAgentInput = {
    contractVersion: '1.0.0',
    investigationId: '123e4567-e89b-12d3-a456-426614174000',
    attemptIndex: 1,
    approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    allowedOrigins: ['http://localhost:3005'],
    currentStep: {
      stepNumber: 1,
      actionType: 'CLICK',
      intentDescription: 'Click Delete on Task B',
      targetDescription: 'Delete Task B',
      isDestructive: true,
    },
    observation: {
      observationId: obsId,
      pageUrl: 'http://localhost:3005/',
      pageTitle: 'Task Management Demo',
      axTree: [
        {
          nodeId: 'node_103',
          role: 'button',
          name: 'Delete Task B',
          description: 'Delete button for Task B',
          disabled: false,
        },
      ],
    },
    priorActionHistory: [],
  };

  const { output } = await actor.proposeNextAction(input);
  console.log('[Action Proposer Example] Output variant:', output.variant);
  if (output.variant === 'PROPOSE_ACTION') {
    console.log('[Action Proposer Example] Proposed action:', output.action.actionType, output.action.targetNodeId);
  }
}

// ============================================================================
// 4. REVIEWER EXAMPLE (AT-ROLE-003)
// ============================================================================

export async function runReviewerExample(provider?: ModelProviderPort): Promise<void> {
  const modelProvider = provider || new MockTestDoubleModelProvider('mock-reviewer');

  if (modelProvider instanceof MockTestDoubleModelProvider) {
    modelProvider.queueResponse({
      variant: 'REPORT_SYNTHESIZED',
      executiveSummary: 'Defect successfully confirmed. Attempt 1 and Attempt 2 reproduced identical failure.',
      observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
      attempt1Comparison: {
        summary: 'Attempt 1 deleted Task A instead of Task B under Active filter.',
        failedAssertions: ['assert_task_b_persists'],
        matchingFailureObserved: true,
      },
      attempt2Comparison: {
        summary: 'Attempt 2 deleted Task A instead of Task B under Active filter.',
        failedAssertions: ['assert_task_b_persists'],
        matchingFailureObserved: true,
      },
      evidenceCitations: [
        {
          artifactId: 'art-vid-1',
          artifactType: 'VIDEO',
          safeUrl: 'http://localhost:3005/artifacts/run1.webm',
          relevanceExplanation: 'Shows Task A disappearing when Task B delete button was clicked.',
        },
      ],
      manualReproductionSteps: [
        'Open target application at /',
        'Click on the Active filter button',
        'Click Delete on Task B',
        'Observe Task A deleted instead',
      ],
      diagnosticHypothesis: {
        isVerifiedFact: false, // Invariant: Hypotheses are NEVER verified facts
        hypothesisText: 'Delete handler may be using array index of filtered list instead of stable task ID.',
        supportingEvidenceTokens: ['array index', 'filter mismatch'],
        suggestedInvestigationDirection: 'Check store.deleteTask index offset logic.',
      },
      limitationsAndCaveats: ['Verified on v1.0.0-buggy in sandbox only.'],
    });
  }

  const reviewer = new EvidenceReviewAgent(modelProvider);
  const input: EvidenceReviewAgentInput = {
    contractVersion: '1.0.0',
    investigationId: '123e4567-e89b-12d3-a456-426614174000',
    reproductionVerdict: 'CONFIRMED_REPRODUCED',
    rawReport: {
      title: 'Filter delete issue',
      description: 'Deleting Task B removes Task A.',
      claimedExpectedBehavior: 'Task B is removed, Task A remains.',
    },
    testedEnvironment: 'TraceCase-Demo-Tasks v1.0.0-buggy',
    resetStatus: {
      executed: true,
      success: true,
      details: 'Restored two_tasks_one_completed fixture.',
    },
    attempt1: {
      status: 'FAILED_ASSERTIONS',
      failureSignatureMatched: true,
      executionDurationMs: 2500,
      isValid: true,
      assertionsEvaluated: [
        {
          predicateId: 'assert_task_b_persists',
          predicateDescription: 'Task B should be deleted',
          passed: false,
          actualValue: 'PRESENT',
          expectedValue: 'ABSENT',
        },
      ],
      safeArtifacts: {
        videoId: 'art-vid-1',
        videoUrl: 'http://localhost:3005/artifacts/run1.webm',
      },
      sanitizedConsoleExcerpts: ['[INFO] Clicked Delete'],
    },
    attempt2: {
      status: 'FAILED_ASSERTIONS',
      failureSignatureMatched: true,
      executionDurationMs: 2400,
      isValid: true,
      assertionsEvaluated: [
        {
          predicateId: 'assert_task_b_persists',
          predicateDescription: 'Task B should be deleted',
          passed: false,
          actualValue: 'PRESENT',
          expectedValue: 'ABSENT',
        },
      ],
      safeArtifacts: {
        videoId: 'art-vid-2',
        videoUrl: 'http://localhost:3005/artifacts/run2.webm',
      },
      sanitizedConsoleExcerpts: ['[INFO] Clicked Delete'],
    },
  };

  const { output } = await reviewer.reviewEvidence(input);
  console.log('[Reviewer Example] Output variant:', output.variant);
  if (output.variant === 'REPORT_SYNTHESIZED') {
    console.log('[Reviewer Example] Preserved verdict:', output.observedReproductionVerdict);
  }
}

// ============================================================================
// 5. TARGET RESET & READBACK EXAMPLE
// ============================================================================

export async function runTargetResetAndReadbackExample(baseUrl: string = 'http://localhost:3005', resetSecret: string = 'tc-disposable-secret-2026'): Promise<void> {
  const client = new DemoTargetClient({
    baseUrl,
    resetSecret,
    timeoutMs: 5000,
  });

  // 1. Query build info (clean runtime validation without leaking bugModeActive)
  const buildInfo = await client.getBuildInfo();
  console.log('[Target Example] Build info:', buildInfo.applicationName, buildInfo.buildVersion);

  // 2. Execute authenticated fixture reset
  const resetReceipt = await client.resetFixture('two_tasks_one_completed');
  console.log('[Target Example] Reset receipt:', resetReceipt.receiptId, 'Restored items:', resetReceipt.itemsRestored);

  // 3. Read back restored baseline items to independently verify state
  const readback = await client.readbackFixture('two_tasks_one_completed');
  console.log('[Target Example] Readback item count:', readback.itemCount);
  console.log('[Target Example] Tasks:', readback.items.map((t) => `${t.id}: ${t.title} (completed: ${t.completed})`));

  // 4. Clean up fixture when finished
  const cleanup = await client.cleanupFixture('two_tasks_one_completed');
  console.log('[Target Example] Cleanup status:', cleanup.success);
}
