import { OllamaLocalModelProvider } from '../src/server/ai/provider';
import { ALL_EVALUATION_CASES } from './cases';
import { EvaluationHarness } from './harness';
import { ExecutionReceiptSchema } from './case-schema';
import { ReportExperimentAgent } from '../src/server/ai/planner';
import { BrowserInteractionAgent } from '../src/server/ai/browser-actor';
import { EvidenceReviewAgent } from '../src/server/ai/reviewer';
import type { BrowserAgentInput, EvidenceReviewAgentInput, ReportAgentInput } from '../src/server/ai/contracts';
import fs from 'fs';

/**
 * ============================================================================
 * TRACECASE PERSON 2: STANDALONE EVALUATION CAMPAIGN & ROLE CLI (P2-08)
 * ============================================================================
 * 
 * Strict command-line runner providing simple supported commands for:
 * 1. Planner example:            npx tsx evaluation/run-eval.ts --example planner
 * 2. Action-proposal example:    npx tsx evaluation/run-eval.ts --example actor
 * 3. Reviewer example:           npx tsx evaluation/run-eval.ts --example reviewer
 * 4. Mock campaign:              npx tsx evaluation/run-eval.ts --mock
 * 5. Real local-model campaign:  npx tsx evaluation/run-eval.ts --provider local --model qwen2.5-coder:3b
 * 6. Receipt validation:         npx tsx evaluation/run-eval.ts --receipts <file> --mode integrated
 * 
 * Enforces strict argument validation, zero arbitrary network fetching from
 * receipt URLs, clear visual banners, and nonzero exits on incomplete or failed runs.
 */

function printUsage(): void {
  console.log(`
================================================================================
TRACECASE EVALUATION & ROLE CLI RUNNER
================================================================================
Usage:
  npx tsx evaluation/run-eval.ts [options]

Supported Commands:
  1. Planner Example:
     npx tsx evaluation/run-eval.ts --example planner [--provider mock|local]

  2. Action-Proposal Example:
     npx tsx evaluation/run-eval.ts --example actor [--provider mock|local]

  3. Reviewer Example:
     npx tsx evaluation/run-eval.ts --example reviewer [--provider mock|local]

  4. Mock Campaign:
     npx tsx evaluation/run-eval.ts --mock

  5. Real Local-Model Campaign:
     npx tsx evaluation/run-eval.ts --provider local --model qwen2.5-coder:3b

  6. Receipt Validation (Integrated Mode):
     npx tsx evaluation/run-eval.ts --receipts <path-to-receipts.json> --mode integrated

Options:
  --provider local|mock|openai    AI model provider adapter (default: local)
  --model <identifier>            Model name (default: qwen2.5-coder:3b)
  --mode synthetic|integrated     Execution tier (default: synthetic)
  --receipts <file>               Path to authoritative receipts JSON file
  --example planner|actor|reviewer Run a single role example and exit
  --mock                          Shorthand for --provider mock
  --help, -h                      Print this help message and exit

Exit Codes:
  0: Success (all criteria passed, or example executed cleanly)
  1: Error, validation failure, release blocker, or incomplete acceptance
================================================================================
`);
}

async function main() {
  const rawArgs = process.argv.slice(2);

  // Check for help first
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Strict Argument Validation: check for unrecognized options
  let providerType = 'local';
  let executionMode: 'SYNTHETIC_ROLE_TEST' | 'INTEGRATED_DEPLOYED' = 'SYNTHETIC_ROLE_TEST';
  let modelIdentifier: string | undefined;
  let receiptsFilePath: string | undefined;
  let exampleRole: 'planner' | 'actor' | 'reviewer' | undefined;

  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];

    if (arg === '--mock') {
      providerType = 'mock';
      i++;
    } else if (arg === '--provider') {
      const val = rawArgs[i + 1];
      if (!val || val.startsWith('--')) {
        console.error('ERROR: Missing value for --provider argument.');
        process.exit(1);
      }
      if (!['local', 'mock', 'openai'].includes(val.toLowerCase())) {
        console.error(`ERROR: Unsupported --provider '${val}'. Supported values: 'local', 'mock', 'openai'.`);
        process.exit(1);
      }
      providerType = val.toLowerCase();
      i += 2;
    } else if (arg.startsWith('--provider=')) {
      const val = arg.split('=')[1];
      if (!['local', 'mock', 'openai'].includes(val.toLowerCase())) {
        console.error(`ERROR: Unsupported --provider '${val}'. Supported values: 'local', 'mock', 'openai'.`);
        process.exit(1);
      }
      providerType = val.toLowerCase();
      i++;
    } else if (arg === '--mode') {
      const val = rawArgs[i + 1];
      if (!val || val.startsWith('--')) {
        console.error('ERROR: Missing value for --mode argument.');
        process.exit(1);
      }
      if (val.toLowerCase() === 'integrated') {
        executionMode = 'INTEGRATED_DEPLOYED';
      } else if (val.toLowerCase() === 'synthetic') {
        executionMode = 'SYNTHETIC_ROLE_TEST';
      } else {
        console.error(`ERROR: Unsupported --mode '${val}'. Supported values: 'synthetic', 'integrated'.`);
        process.exit(1);
      }
      i += 2;
    } else if (arg === '--model') {
      const val = rawArgs[i + 1];
      if (!val || val.startsWith('--')) {
        console.error('ERROR: Missing value for --model argument.');
        process.exit(1);
      }
      modelIdentifier = val;
      i += 2;
    } else if (arg === '--receipts') {
      const val = rawArgs[i + 1];
      if (!val || val.startsWith('--')) {
        console.error('ERROR: Missing file path for --receipts argument.');
        process.exit(1);
      }
      receiptsFilePath = val;
      i += 2;
    } else if (arg === '--example') {
      const val = rawArgs[i + 1];
      if (!val || val.startsWith('--')) {
        console.error('ERROR: Missing value for --example argument.');
        process.exit(1);
      }
      const normalized = val.toLowerCase();
      if (normalized === 'planner' || normalized === 'clarifier') {
        exampleRole = 'planner';
      } else if (normalized === 'actor' || normalized === 'action') {
        exampleRole = 'actor';
      } else if (normalized === 'reviewer' || normalized === 'synth') {
        exampleRole = 'reviewer';
      } else {
        console.error(`ERROR: Unsupported --example '${val}'. Supported values: 'planner', 'actor', 'reviewer'.`);
        process.exit(1);
      }
      i += 2;
    } else {
      console.error(`ERROR: Unrecognized argument '${arg}'. Run with --help for supported commands.`);
      process.exit(1);
    }
  }

  // Provider instantiation
  let provider;
  if (providerType === 'mock') {
    const { MockTestDoubleModelProvider } = await import('../src/server/ai/provider');
    const mockDouble = new MockTestDoubleModelProvider();

    if (exampleRole === 'planner') {
      mockDouble.queueResponse({
        variant: 'PLAN_PROPOSED',
        extractedClaim: {
          summary: 'Deleting Task B removes Task A',
          reportedProblem: 'Active filter delete removes wrong task',
          claimedExpectedBehavior: 'Task B is removed, Task A remains',
          affectedEntities: ['Task A', 'Task B'],
        },
        experimentPlan: {
          planRevision: 1,
          preconditions: ['Reset baseline'],
          requiredRole: 'test_user',
          steps: [
            {
              stepNumber: 1,
              actionType: 'CLICK',
              intentDescription: 'Click Delete on Task B',
              targetDescription: 'Delete Task B',
              isDestructive: true,
            },
          ],
          correctBehaviorAssertions: [
            {
              predicateId: 'assert_task_b_deleted',
              assertionType: 'CORRECT_BEHAVIOR',
              target: 'DOM_ELEMENT',
              selector: 'button[data-task-id="task-b"]',
              expectedCondition: 'NOT_EXISTS',
              expectedValue: true,
            },
          ],
          reportedFailureAssertions: [
            {
              predicateId: 'assert_task_a_wrongly_removed',
              assertionType: 'REPORTED_FAILURE_SIGNATURE',
              target: 'DOM_ELEMENT',
              selector: 'button[data-task-id="task-a"]',
              expectedCondition: 'NOT_EXISTS',
              expectedValue: true,
            },
          ],
        },
      });
    } else if (exampleRole === 'actor') {
      mockDouble.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '11111111-2222-3333-4444-555555555555',
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_5',
          primarySelector: 'button[data-task-id="task-b"]',
        },
        expectedPostcondition: 'Task B deleted',
        rationale: 'Delete Task B',
      });
    } else if (exampleRole === 'reviewer') {
      mockDouble.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Two-run reproduction confirmed failure signature.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 matched failure signature',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Attempt 2 matched failure signature',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        evidenceCitations: [
          {
            artifactType: 'VIDEO',
            safeUrl: 'http://localhost:3005/artifacts/run1_video.webm',
            relevanceExplanation: 'Shows Task B deleted instead of Task A',
          },
        ],
        manualReproductionSteps: ['Step 1: Click Active filter', 'Step 2: Click Delete on Task B'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });
    } else {
      // Full campaign queue across all cases
      for (const testCase of ALL_EVALUATION_CASES) {
        if (!testCase.targetProfile.isSandbox) {
          // Preflight halts before Planner
          continue;
        }

        if (testCase.expectedRoleBehaviors?.planner?.expectedVariant === 'NEEDS_CLARIFICATION' || testCase.expectedClassification.requiresClarificationFirst) {
          mockDouble.queueResponse({
            variant: 'NEEDS_CLARIFICATION',
            extractedClaim: { summary: 'Vague defect', affectedFeature: 'Tasks', missingFacts: ['target element'] },
            questions: [
              {
                questionId: 'q_target',
                questionText: 'Which element was clicked?',
                whyItMatters: 'To find target control',
                options: ['Task B', 'Task A'],
                blocksExecution: true,
              },
            ],
          });
          continue;
        }

        if (testCase.expectedRoleBehaviors?.planner?.expectedVariant === 'UNABLE_TO_INTERPRET') {
          mockDouble.queueResponse({
            variant: 'UNABLE_TO_INTERPRET',
            explanation: 'Prompt injection text cannot be parsed as valid defect report.',
          });
          continue;
        }

        if (testCase.expectedRoleBehaviors?.planner?.expectedVariant === 'UNSUPPORTED_CLAIM') {
          mockDouble.queueResponse({
            variant: 'UNSUPPORTED_CLAIM',
            reason: 'Visual kerning and frame rate benchmarks are not supported.',
            unsupportedFeatures: ['Subpixel kerning', 'GPU FPS benchmark'],
            recommendation: 'Manual visual inspection',
          });
          continue;
        }

        // Standard role pipeline for executable cases
        mockDouble.queueResponse({
          variant: 'PLAN_PROPOSED',
          extractedClaim: {
            summary: testCase.title,
            reportedProblem: testCase.rawReport.description,
            claimedExpectedBehavior: testCase.rawReport.claimedExpectedBehavior || 'Expected correct operation',
            affectedEntities: ['Task A', 'Task B'],
          },
          experimentPlan: {
            planRevision: 1,
            preconditions: ['Reset baseline'],
            requiredRole: 'test_user',
            steps: [
              {
                stepNumber: 1,
                actionType: 'CLICK',
                intentDescription: 'Click Delete on Task B',
                targetDescription: 'Delete Task B',
                isDestructive: true,
              },
            ],
            correctBehaviorAssertions: [
              {
                predicateId: 'assert_task_b_deleted',
                assertionType: 'CORRECT_BEHAVIOR',
                target: 'DOM_ELEMENT',
                selector: 'button[data-task-id="task-b"]',
                expectedCondition: 'NOT_EXISTS',
                expectedValue: true,
              },
            ],
            reportedFailureAssertions: [
              {
                predicateId: 'assert_task_a_wrongly_removed',
                assertionType: 'REPORTED_FAILURE_SIGNATURE',
                target: 'DOM_ELEMENT',
                selector: 'button[data-task-id="task-a"]',
                expectedCondition: 'NOT_EXISTS',
                expectedValue: true,
              },
            ],
          },
        });

        const targetNode = testCase.expectedRoleBehaviors?.browserActor?.expectedTargetNodeId || 'node_5';
        mockDouble.queueResponse({
          variant: 'PROPOSE_ACTION',
          echoedStepNumber: 1,
          echoedObservationId: '11111111-2222-3333-4444-555555555555',
          action: {
            actionType: 'CLICK',
            targetNodeId: targetNode,
            primarySelector: 'button[data-task-id="task-b"]',
          },
          expectedPostcondition: 'Task B deleted',
          rationale: 'Delete Task B',
        });

        mockDouble.queueResponse({
          variant: 'REPORT_SYNTHESIZED',
          executiveSummary: `Synthetic role evaluation for ${testCase.caseId}.`,
          observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
          attempt1Comparison: {
            summary: 'Attempt 1 matched failure signature',
            failedAssertions: ['assert_task_b_deleted'],
            matchingFailureObserved: true,
          },
          attempt2Comparison: {
            summary: 'Attempt 2 matched failure signature',
            failedAssertions: ['assert_task_b_deleted'],
            matchingFailureObserved: true,
          },
          evidenceCitations: [],
          manualReproductionSteps: ['Step 1'],
          diagnosticHypothesis: null,
          limitationsAndCaveats: [],
        });
      }
    }
    provider = mockDouble;
  } else if (providerType === 'openai') {
    const explicitOpenAiModel =
      modelIdentifier ||
      process.env.OPENAI_MODEL_ID ||
      process.env.OPENAI_MODEL_IDENTIFIER;
    if (!explicitOpenAiModel || explicitOpenAiModel.trim().length === 0) {
      console.error('ERROR: Explicit model identifier required when --provider openai is selected.');
      console.error('Specify --model <model-id> or configure OPENAI_MODEL_ID / OPENAI_MODEL_IDENTIFIER in your environment.');
      process.exit(1);
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('ERROR: Missing OPENAI_API_KEY environment variable for OpenAI Luna provider.');
      console.error('To run with OpenAI Luna, configure OPENAI_API_KEY in your server environment.');
      console.error('For zero-cost offline runs, use --provider local (Ollama) or --provider mock.');
      process.exit(1);
    }
    const { OpenAiLunaProvider } = await import('../src/server/ai/provider');
    modelIdentifier = explicitOpenAiModel.trim();
    provider = new OpenAiLunaProvider({
      apiKey,
      modelIdentifier,
      timeoutMs: 30000,
    });
  } else {
    // Local Ollama provider: strictly offline, zero paid calls.
    // Missing OpenAI configuration must not prevent local mode from working.
    modelIdentifier = modelIdentifier || 'qwen2.5-coder:3b';
    provider = new OllamaLocalModelProvider({
      endpointUrl: 'http://localhost:11434',
      modelIdentifier: modelIdentifier as 'qwen2.5-coder:3b' | 'phi4-mini:latest',
      timeoutMs: 60000,
    });
  }

  // ==========================================================================
  // SINGLE ROLE EXAMPLES (--example planner|actor|reviewer)
  // ==========================================================================
  if (exampleRole) {
    if (exampleRole === 'planner') {
      console.log('================================================================');
      console.log('TRACECASE AI ROLE DEMONSTRATION: PLANNER / CLARIFIER (ROLE 1)');
      console.log(`Provider: ${providerType.toUpperCase()} | Model: ${modelIdentifier}`);
      console.log('Mode: SINGLE_ROLE_EXAMPLE (Non-browser, safe report context)');
      console.log('================================================================\n');

      const planner = new ReportExperimentAgent(provider);
      const input: ReportAgentInput = {
        contractVersion: '1.0.0',
        investigationId: 'example-investigation-001',
        targetProfile: {
          name: 'TraceCase-Demo-Tasks',
          baseUrl: 'http://localhost:3005',
          isSandbox: true,
          allowedOrigins: ['http://localhost:3005'],
          hasResetFixture: true,
        },
        rawReport: {
          title: 'Delete deletes wrong task when filter is applied',
          description: 'I click delete on Task B under Active filter, but Task A is deleted instead.',
          claimedExpectedBehavior: 'Deleting Task B should delete Task B.',
        },
        clarificationHistory: [],
      };

      try {
        const result = await planner.evaluateReport(input);
        console.log(`[PLANNER RESULT] Variant: ${result.output.variant} (${result.usage.modelIdentifier}, ${result.usage.durationMs}ms)`);
        console.log(JSON.stringify(result.output, null, 2));
        console.log('\nSUCCESS: Planner example executed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error(`FAILED: Planner example failed: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    if (exampleRole === 'actor') {
      console.log('================================================================');
      console.log('TRACECASE AI ROLE DEMONSTRATION: ACTION PROPOSER (ROLE 2)');
      console.log(`Provider: ${providerType.toUpperCase()} | Model: ${modelIdentifier}`);
      console.log('Mode: SINGLE_ROLE_EXAMPLE (Synthetic AXTree observation)');
      console.log('================================================================\n');

      const actor = new BrowserInteractionAgent(provider);
      const input: BrowserAgentInput = {
        contractVersion: '1.0.0',
        investigationId: 'example-investigation-002',
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
          observationId: '11111111-2222-3333-4444-555555555555',
          pageUrl: 'http://localhost:3005',
          pageTitle: 'TraceCase Demo Tasks',
          axTree: [
            { nodeId: 'node_1', role: 'button', name: 'Active', description: 'Filter' },
            { nodeId: 'node_2', role: 'StaticText', name: 'Task A (completed)', description: 'task-a' },
            { nodeId: 'node_3', role: 'button', name: 'Delete', description: 'Task A' },
            { nodeId: 'node_4', role: 'StaticText', name: 'Task B (active)', description: 'task-b' },
            { nodeId: 'node_5', role: 'button', name: 'Delete Task B', description: 'task-b' },
          ],
        },
        priorActionHistory: [],
      };

      try {
        const result = await actor.proposeNextAction(input);
        console.log(`[ACTOR RESULT] Variant: ${result.output.variant} (${result.usage.modelIdentifier}, ${result.usage.durationMs}ms)`);
        console.log(JSON.stringify(result.output, null, 2));
        console.log('\nSUCCESS: Action-proposal example executed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error(`FAILED: Action-proposal example failed: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    if (exampleRole === 'reviewer') {
      console.log('================================================================');
      console.log('TRACECASE AI ROLE DEMONSTRATION: EVIDENCE REVIEWER (ROLE 3)');
      console.log(`Provider: ${providerType.toUpperCase()} | Model: ${modelIdentifier}`);
      console.log('Mode: SINGLE_ROLE_EXAMPLE (Locked verification facts)');
      console.log('================================================================\n');

      const reviewer = new EvidenceReviewAgent(provider);
      const input: EvidenceReviewAgentInput = {
        contractVersion: '1.0.0',
        investigationId: '11111111-2222-3333-4444-555555555555',
        reproductionVerdict: 'CONFIRMED_REPRODUCED',
        rawReport: {
          title: 'Deleting Task B removes Task A',
          description: 'Task A is erroneously deleted when filter is applied.',
        },
        testedEnvironment: 'TraceCase-Demo-Tasks v1.0.0-buggy (http://localhost:3005)',
        resetStatus: {
          executed: true,
          success: true,
          details: 'Baseline restored via POST /api/test/reset-fixture',
        },
        attempt1: {
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          executionDurationMs: 3100,
          isValid: true,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B should be deleted',
              passed: false,
              actualValue: 'PRESENT',
              expectedValue: 'NOT_PRESENT',
            },
          ],
          safeArtifacts: {
            videoId: 'art-vid-1',
            videoUrl: 'http://localhost:3005/artifacts/run1_video.webm',
            consoleLogId: 'art-con-1',
            consoleLogUrl: 'http://localhost:3005/artifacts/run1_console.log',
            networkLogId: 'art-net-1',
            networkLogUrl: 'http://localhost:3005/artifacts/run1_network.json',
          },
          sanitizedConsoleExcerpts: ['[INFO] Target loaded'],
          restrictedArtifactTypes: [],
        },
        attempt2: {
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          executionDurationMs: 3050,
          isValid: true,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B should be deleted',
              passed: false,
              actualValue: 'PRESENT',
              expectedValue: 'NOT_PRESENT',
            },
          ],
          safeArtifacts: {
            videoId: 'art-vid-2',
            videoUrl: 'http://localhost:3005/artifacts/run2_video.webm',
            consoleLogId: 'art-con-2',
            consoleLogUrl: 'http://localhost:3005/artifacts/run2_console.log',
            networkLogId: 'art-net-2',
            networkLogUrl: 'http://localhost:3005/artifacts/run2_network.json',
          },
          sanitizedConsoleExcerpts: ['[INFO] Target reloaded after reset'],
          restrictedArtifactTypes: [],
        },
      };

      try {
        const result = await reviewer.reviewEvidence(input);
        console.log(`[REVIEWER RESULT] Variant: ${result.output.variant} (${result.usage.modelIdentifier}, ${result.usage.durationMs}ms)`);
        console.log(JSON.stringify(result.output, null, 2));
        console.log('\nSUCCESS: Reviewer example executed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error(`FAILED: Reviewer example failed: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  }

  // ==========================================================================
  // FULL CAMPAIGN EXECUTION (Synthetic or Integrated)
  // ==========================================================================

  // Validate receipts file if provided
  let loadedReceiptsMap: Record<string, unknown> | undefined;
  if (receiptsFilePath) {
    if (!fs.existsSync(receiptsFilePath)) {
      console.error(`ERROR: Receipts file not found at path: ${receiptsFilePath}`);
      process.exit(1);
    }
    try {
      loadedReceiptsMap = JSON.parse(fs.readFileSync(receiptsFilePath, 'utf-8'));
    } catch (err) {
      console.error(`ERROR: Failed to parse receipts JSON: ${(err as Error).message}`);
      process.exit(1);
    }

    // Runtime validation of each receipt entry without arbitrary network fetching
    console.log(`[RECEIPTS] Runtime validating receipts from ${receiptsFilePath}...`);
    for (const [caseKey, receiptPayload] of Object.entries(loadedReceiptsMap!)) {
      const parseResult = ExecutionReceiptSchema.safeParse(receiptPayload);
      if (!parseResult.success) {
        console.error(`ERROR: Receipt entry for case '${caseKey}' failed runtime schema validation:`);
        console.error(`       ${parseResult.error.message}`);
        console.error('Arbitrary or malformed receipt objects are strictly rejected.');
        process.exit(1);
      }
    }
    console.log(`[RECEIPTS] Successfully validated ${Object.keys(loadedReceiptsMap!).length} receipt entries. Zero network URLs fetched.`);
  }

  // Clear banner describing execution tier
  console.log('================================================================');
  if (executionMode === 'INTEGRATED_DEPLOYED') {
    console.log('[INTEGRATED ACCEPTANCE - AUTHORITATIVE RECEIPT-ONLY]');
    console.log('Consuming verified P1 execution receipts and P3 artifact manifests.');
    console.log('Zero arbitrary network fetching from receipt URLs.');
  } else if (providerType === 'mock') {
    console.log('[SYNTHETIC ROLE TEST - MOCK TEST DOUBLE]');
    console.log('Exercising Planner, Actor, and Reviewer against seeded deterministic fixtures.');
    console.log('NOTICE: Actual browser capture, worker execution, and deployed acceptance remain DEFERRED.');
  } else {
    console.log('[SYNTHETIC ROLE TEST - REAL LOCAL OLLAMA (NON-BROWSER)]');
    console.log(`Exercising live local inference against '${modelIdentifier}' at $0.0000 API cost.`);
    console.log('NOTICE: Actual browser capture, worker execution, and deployed acceptance remain DEFERRED.');
  }
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Target Model: ${modelIdentifier} | Provider: ${providerType.toUpperCase()}`);
  console.log('================================================================\n');

  const harness = new EvaluationHarness(provider);
  const records = [];

  for (const testCase of ALL_EVALUATION_CASES) {
    console.log(`[EVAL] Executing case: ${testCase.caseId} (${testCase.title})...`);
    const caseReceipt = loadedReceiptsMap ? loadedReceiptsMap[testCase.caseId] : undefined;
    const record = await harness.evaluateCase(testCase, { mode: executionMode, receipts: caseReceipt });
    records.push(record);

    let statusBadge = '✗ FAIL';
    if (record.evaluationStatus === 'PASS') {
      statusBadge = '✓ PASS';
    } else if (record.evaluationStatus === 'BLOCKED') {
      statusBadge = '⊘ BLOCKED';
    }

    console.log(`       Status: [${statusBadge}] | Verdict: ${record.reproductionVerdict} | Lifecycle: ${record.lifecycleStatus} (${record.durationMs}ms)`);
    if (record.notes.length > 0) {
      for (const note of record.notes) {
        console.log(`         • ${note}`);
      }
    }
    if (record.isFalseConfirmation) {
      console.error(`       [CRITICAL ERROR] FALSE CONFIRMATION ON CASE ${testCase.caseId}`);
    }
    if (record.exposedTokens && record.exposedTokens.length > 0) {
      // Safe logs: Output opaque leak references only
      console.error(`       [CRITICAL ERROR] SYNTHETIC SECRETS LEAKED (Opaque Refs): ${record.exposedTokens.join(', ')}`);
    } else if (record.unverifiedSurfaces && record.unverifiedSurfaces.length > 0) {
      console.log(`       [COVERAGE UNVERIFIED] Required secret redaction surfaces unavailable: ${record.unverifiedSurfaces.join(', ')}.`);
    }
  }

  console.log('\n================================================================');
  console.log('EVALUATION CAMPAIGN METRICS SUMMARY (10 DIMENSIONS)');
  console.log('================================================================');

  const summary = harness.compileSummary(records);
  for (const m of summary.metrics) {
    const pctStr = m.percentage !== null ? `${m.percentage.toFixed(1)}%` : 'N/A';
    console.log(`- ${m.name.padEnd(42)}: ${pctStr.padStart(6)} (${m.numerator}/${m.denominator}) — ${m.description}`);
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`Total Cases Evaluated  : ${summary.totalCasesEvaluated}`);
  console.log(`Passed Cases           : ${summary.passedCount}`);
  console.log(`Failed Cases           : ${summary.failedCount}`);
  console.log(`Blocked Cases          : ${summary.blockedCount}`);
  console.log(`False Confirmations    : ${summary.falseConfirmationCount} (Must be 0)`);
  console.log(`Critical Leaks Detected: ${summary.criticalSecretLeaksDetected} (Must be 0)`);
  console.log(`Quarantined Evidence   : ${summary.quarantinedEvidenceCount} (Must be 0)`);
  console.log(`Total Measured Cost    : $${summary.totalMeasuredCostUsd.toFixed(4)} USD`);
  console.log('----------------------------------------------------------------\n');

  if (summary.hasReleaseBlocker || summary.failedCount > 0) {
    console.error(`FAILED: Campaign did not pass cleanly (${summary.failedCount} failed, release blockers: ${summary.hasReleaseBlocker}). Exit code 1.`);
    process.exit(1);
  } else if (summary.blockedCount > 0) {
    console.warn(`CAMPAIGN INCOMPLETE: ${summary.blockedCount} cases were BLOCKED due to pending Person 1 / Person 3 integration. Exit code 1.`);
    process.exit(1);
  } else {
    if (executionMode === 'SYNTHETIC_ROLE_TEST') {
      console.log('ROLE TEST CAMPAIGN COMPLETE: All evaluated synthetic role tests passed.');
      console.log('NOTICE: Real browser capture, worker execution, and deployed acceptance remain DEFERRED BY USER.');
    } else {
      console.log('INTEGRATED ACCEPTANCE COMPLETE: All criteria satisfied with 0 release blockers.');
    }
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal evaluation runner error:', err);
  process.exit(1);
});
