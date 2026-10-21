import { describe, it, expect } from 'vitest';
import { EvidenceReviewAgent } from '../src/server/ai/reviewer';
import { MockTestDoubleModelProvider, OllamaLocalModelProvider } from '../src/server/ai/provider';
import type { EvidenceReviewAgentInput } from '../src/server/ai/contracts';

describe('Person 2: Evidence-Grounded Explanations and Qualified Guidance (P2-06)', () => {
  const createBaseInput = (
    overrides?: Partial<EvidenceReviewAgentInput>
  ): EvidenceReviewAgentInput => ({
    contractVersion: '1.0.0',
    investigationId: 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    reproductionVerdict: 'CONFIRMED_REPRODUCED',
    rawReport: {
      title: 'Deleting active task deletes completed task instead',
      description: 'Under Active filter, deleting Task B removes Task A.',
      claimedExpectedBehavior: 'Task B is removed, Task A is preserved.',
    },
    testedEnvironment: 'Chrome 122 on Windows (Synthetic Staging Port 3005)',
    resetStatus: {
      executed: true,
      success: true,
      details: 'POST /api/test/reset-fixture restored Task A and Task B baseline',
    },
    knownGaps: [],
    attempt1: {
      status: 'FAILED_ASSERTIONS',
      failureSignatureMatched: true,
      executionDurationMs: 4200,
      isValid: true,
      assertionsEvaluated: [
        {
          predicateId: 'assert_task_b_deleted',
          predicateDescription: 'Task B should be removed',
          passed: false,
          actualValue: 'EXISTS',
          expectedValue: 'NOT_EXISTS',
        },
        {
          predicateId: 'assert_task_a_preserved',
          predicateDescription: 'Task A should be preserved',
          passed: false,
          actualValue: 'NOT_EXISTS',
          expectedValue: 'EXISTS',
        },
      ],
      safeArtifacts: {
        videoUrl: 'http://localhost:3005/artifacts/run1_video.webm',
        consoleLogUrl: 'http://localhost:3005/artifacts/run1_console.log',
        networkLogUrl: 'http://localhost:3005/artifacts/run1_network.json',
      },
      sanitizedConsoleExcerpts: [
        '[INFO] Filter changed to active',
        '[INFO] Delete requested for task-b',
      ],
    },
    attempt2: {
      status: 'FAILED_ASSERTIONS',
      failureSignatureMatched: true,
      executionDurationMs: 3950,
      isValid: true,
      assertionsEvaluated: [
        {
          predicateId: 'assert_task_b_deleted',
          predicateDescription: 'Task B should be removed',
          passed: false,
          actualValue: 'EXISTS',
          expectedValue: 'NOT_EXISTS',
        },
        {
          predicateId: 'assert_task_a_preserved',
          predicateDescription: 'Task A should be preserved',
          passed: false,
          actualValue: 'NOT_EXISTS',
          expectedValue: 'EXISTS',
        },
      ],
      safeArtifacts: {
        videoUrl: 'http://localhost:3005/artifacts/run2_video.webm',
        consoleLogUrl: 'http://localhost:3005/artifacts/run2_console.log',
        networkLogUrl: 'http://localhost:3005/artifacts/run2_network.json',
      },
      sanitizedConsoleExcerpts: [
        '[INFO] Filter changed to active',
        '[INFO] Delete requested for task-b',
      ],
    },
    ...overrides,
  });

  describe('Deterministic Explanatory Review Tests (Test Doubles)', () => {
    it('synthesizes report for two valid matches with complete evidence (CONFIRMED_REPRODUCED)', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary:
          'Automated execution confirmed the reported defect across two consecutive clean runs. Deleting an active task under the Active filter erroneously deleted the completed task instead.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 matched defect signature: Task A disappeared while Task B remained.',
          failedAssertions: ['assert_task_b_deleted', 'assert_task_a_preserved'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Attempt 2 confirmed identical failure signature following baseline fixture reset.',
          failedAssertions: ['assert_task_b_deleted', 'assert_task_a_preserved'],
          matchingFailureObserved: true,
        },
        evidenceCitations: [
          {
            artifactType: 'CONSOLE_LOG',
            safeUrl: 'http://localhost:3005/artifacts/run1_console.log',
            relevanceExplanation: 'Shows clean filter transition before delete action.',
          },
        ],
        manualReproductionSteps: [
          'Navigate to tasks app',
          'Click Active filter tab',
          'Click Delete on Task B',
          'Observe Task A is removed instead of Task B',
        ],
        diagnosticHypothesis: {
          isVerifiedFact: false,
          hypothesisText:
            'The delete button handler references row position rather than stable task ID when filtered.',
          supportingEvidenceTokens: ['Active filter', 'row position'],
          suggestedInvestigationDirection: 'Check task deletion onClick handler in task list component.',
        },
        limitationsAndCaveats: ['Tested on Chrome desktop staging environment.'],
      });

      const input = createBaseInput();
      const { output } = await agent.reviewEvidence(input);

      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(output.observedReproductionVerdict).toBe('CONFIRMED_REPRODUCED');
        expect(output.diagnosticHypothesis?.isVerifiedFact).toBe(false); // Invariant strictly false!
        expect(output.evidenceCitations).toHaveLength(1);
        expect(output.evidenceCitations[0].safeUrl).toBe(
          'http://localhost:3005/artifacts/run1_console.log'
        );
      }
    });

    it('synthesizes report for two valid nonmatches (NOT_REPRODUCED)', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const nonmatchInput = createBaseInput({
        reproductionVerdict: 'NOT_REPRODUCED',
        attempt1: {
          ...createBaseInput().attempt1,
          status: 'PASSED_ASSERTIONS',
          failureSignatureMatched: false,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B should be removed',
              passed: true,
              actualValue: 'NOT_EXISTS',
              expectedValue: 'NOT_EXISTS',
            },
            {
              predicateId: 'assert_task_a_preserved',
              predicateDescription: 'Task A should be preserved',
              passed: true,
              actualValue: 'EXISTS',
              expectedValue: 'EXISTS',
            },
          ],
        },
        attempt2: {
          ...createBaseInput().attempt2!,
          status: 'PASSED_ASSERTIONS',
          failureSignatureMatched: false,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B should be removed',
              passed: true,
              actualValue: 'NOT_EXISTS',
              expectedValue: 'NOT_EXISTS',
            },
            {
              predicateId: 'assert_task_a_preserved',
              predicateDescription: 'Task A should be preserved',
              passed: true,
              actualValue: 'EXISTS',
              expectedValue: 'EXISTS',
            },
          ],
        },
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary:
          'Defect could not be reproduced. Both attempts correctly deleted Task B and preserved Task A.',
        observedReproductionVerdict: 'NOT_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 passed all correct behavior assertions.',
          failedAssertions: [],
          matchingFailureObserved: false,
        },
        attempt2Comparison: {
          summary: 'Attempt 2 passed all correct behavior assertions.',
          failedAssertions: [],
          matchingFailureObserved: false,
        },
        evidenceCitations: [],
        manualReproductionSteps: ['Click Active filter', 'Click Delete on Task B'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: ['Bug did not occur in tested staging environment.'],
      });

      const { output } = await agent.reviewEvidence(nonmatchInput);
      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(output.observedReproductionVerdict).toBe('NOT_REPRODUCED');
        expect(output.attempt1Comparison.matchingFailureObserved).toBe(false);
      }
    });

    it('enforces verdict immutability when model attempts to overturn locked verdict', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const input = createBaseInput({ reproductionVerdict: 'NOT_REPRODUCED' });

      // Model maliciously or erroneously attempts to declare CONFIRMED_REPRODUCED
      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Overridden verdict report',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED', // CONTRADICTION!
        attempt1Comparison: {
          summary: 'Attempt 1',
          failedAssertions: [],
          matchingFailureObserved: false,
        },
        attempt2Comparison: null,
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const { output } = await agent.reviewEvidence(input);

      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        // Deterministic guard strictly restored locked verdict!
        expect(output.observedReproductionVerdict).toBe('NOT_REPRODUCED');
      }
    });

    it('rejects/strips unknown or fabricated evidence URLs', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const input = createBaseInput();

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Report with fabricated citations',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1',
          failedAssertions: [],
          matchingFailureObserved: true,
        },
        attempt2Comparison: null,
        evidenceCitations: [
          {
            artifactType: 'VIDEO',
            safeUrl: 'http://localhost:3005/artifacts/run1_video.webm', // ELIGIBLE!
            relevanceExplanation: 'Valid video artifact',
          },
          {
            artifactType: 'CONSOLE_LOG',
            safeUrl: 'https://fabricated-external-server.com/fake_log.txt', // FABRICATED!
            relevanceExplanation: 'Fake citation',
          },
        ],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const { output } = await agent.reviewEvidence(input);

      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        // Fabricated URL must be stripped, leaving only the eligible one!
        expect(output.evidenceCitations).toHaveLength(1);
        expect(output.evidenceCitations[0].safeUrl).toBe(
          'http://localhost:3005/artifacts/run1_video.webm'
        );
      }
    });

    it('qualifies limitations when fixture reset between attempts failed', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const failedResetInput = createBaseInput({
        resetStatus: {
          executed: true,
          success: false, // FAILED RESET!
          details: 'Target reset webhook returned HTTP 500: Database lock timeout',
        },
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Report with reset warning',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1',
          failedAssertions: [],
          matchingFailureObserved: true,
        },
        attempt2Comparison: null,
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const { output } = await agent.reviewEvidence(failedResetInput);

      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(
          output.limitationsAndCaveats.some((l) => l.includes('reset qualification warning'))
        ).toBe(true);
      }
    });

    it('handles missing video without claiming video inspection', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const missingVideoInput = createBaseInput({
        attempt1: {
          ...createBaseInput().attempt1,
          safeArtifacts: {
            videoUrl: undefined, // MISSING VIDEO
            consoleLogUrl: 'http://localhost:3005/artifacts/run1_console.log',
            networkLogUrl: 'http://localhost:3005/artifacts/run1_network.json',
          },
        },
        knownGaps: ['Video recording was not captured due to worker video buffer timeout'],
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Report with missing video gap',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 confirmed defect from assertions and console logs',
          failedAssertions: [],
          matchingFailureObserved: true,
        },
        attempt2Comparison: null,
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: ['Visual media uninspected'],
      });

      const { output } = await agent.reviewEvidence(missingVideoInput);

      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(output.limitationsAndCaveats.some((l) => l.includes('Video recording was not captured'))).toBe(true);
      }
    });

    it('respects restricted quarantined media and does not inspect it', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const restrictedInput = createBaseInput({
        attempt1: {
          ...createBaseInput().attempt1,
          restrictedArtifactTypes: ['VIDEO'], // QUARANTINED
          safeArtifacts: {
            videoUrl: undefined,
            consoleLogUrl: 'http://localhost:3005/artifacts/run1_console.log',
            networkLogUrl: 'http://localhost:3005/artifacts/run1_network.json',
          },
        },
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Report respecting restricted media',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1',
          failedAssertions: [],
          matchingFailureObserved: true,
        },
        attempt2Comparison: null,
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: ['Video artifact is quarantined as restricted evidence.'],
      });

      const { output } = await agent.reviewEvidence(restrictedInput);
      expect(output.variant).toBe('REPORT_SYNTHESIZED');
    });

    it('falls back to deterministic facts-only result when model times out or errors', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      // Model provider queues an error
      mockProvider.queueError(new Error('Model timeout after 40000ms'));

      const input = createBaseInput();
      const { output } = await agent.reviewEvidence(input);

      expect(output.variant).toBe('EXPLANATION_UNAVAILABLE_FALLBACK');
      if (output.variant === 'EXPLANATION_UNAVAILABLE_FALLBACK') {
        expect(output.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
        expect(output.fallbackReason).toContain('timeout');
        expect(output.deterministicFacts.evaluatedAssertionsCount).toBe(4);
        expect(output.deterministicFacts.failedAssertionsCount).toBe(4);
        expect(output.deterministicFacts.availableArtifacts.length).toBeGreaterThan(0);
      }
    });

    it('handles unrelated console errors without treating them as the defect root cause', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const inputWithUnrelatedError = createBaseInput({
        attempt1: {
          ...createBaseInput().attempt1,
          sanitizedConsoleExcerpts: [
            '[ERROR] Failed to load resource: net::ERR_NAME_NOT_RESOLVED favicon.ico',
            '[WARN] Analytics tracking beacon blocked',
          ],
        },
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Console shows unrelated 404 for favicon, but defect is DOM filter deletion.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 matched failure signature despite unrelated console errors.',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: null,
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: ['Favicon 404 is unrelated to task deletion defect.'],
      });

      const { output } = await agent.reviewEvidence(inputWithUnrelatedError);
      expect(output.variant).toBe('REPORT_SYNTHESIZED');
    });

    it('handles single attempt execution cleanly when attempt2 is null', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const singleAttemptInput = createBaseInput({
        attempt2: null,
        reproductionVerdict: 'INCONSISTENT_OBSERVATIONS',
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Single attempt completed; second attempt was not executed.',
        observedReproductionVerdict: 'INCONSISTENT_OBSERVATIONS',
        attempt1Comparison: {
          summary: 'Attempt 1 observed defect.',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: null,
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: ['Only single attempt was recorded.'],
      });

      const { output } = await agent.reviewEvidence(singleAttemptInput);
      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(output.attempt2Comparison).toBeNull();
      }
    });

    it('handles invalid second attempt with INCONCLUSIVE_EXECUTION_FAILURE', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const invalidAttempt2Input = createBaseInput({
        reproductionVerdict: 'INCONCLUSIVE_EXECUTION_FAILURE',
        attempt2: {
          ...createBaseInput().attempt2!,
          status: 'ERROR_HALTED',
          isValid: false, // INVALID RUN
          failureSignatureMatched: false,
          assertionsEvaluated: [],
        },
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Execution inconclusive because Attempt 2 halted due to environment crash.',
        observedReproductionVerdict: 'INCONCLUSIVE_EXECUTION_FAILURE',
        attempt1Comparison: {
          summary: 'Attempt 1 completed.',
          failedAssertions: [],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Attempt 2 halted before evaluation.',
          failedAssertions: [],
          matchingFailureObserved: false,
        },
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: ['Attempt 2 is invalid.'],
      });

      const { output } = await agent.reviewEvidence(invalidAttempt2Input);
      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(output.observedReproductionVerdict).toBe('INCONCLUSIVE_EXECUTION_FAILURE');
      }
    });

    it('synthesizes report for NOT_REPRODUCED when both attempts pass without failure signature', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const notReproducedInput = createBaseInput({
        reproductionVerdict: 'NOT_REPRODUCED',
        attempt1: {
          ...createBaseInput().attempt1,
          status: 'PASSED_ASSERTIONS',
          failureSignatureMatched: false,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B was removed',
              passed: true,
              actualValue: 'NOT_EXISTS',
              expectedValue: 'NOT_EXISTS',
            },
          ],
        },
        attempt2: {
          ...createBaseInput().attempt2!,
          status: 'PASSED_ASSERTIONS',
          failureSignatureMatched: false,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B was removed',
              passed: true,
              actualValue: 'NOT_EXISTS',
              expectedValue: 'NOT_EXISTS',
            },
          ],
        },
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary:
          'Defect could not be reproduced on clean target build. Deleting Task B succeeded without deleting Task A.',
        observedReproductionVerdict: 'NOT_REPRODUCED',
        attempt1Comparison: {
          summary: 'Task B was successfully deleted; Task A remained intact.',
          failedAssertions: [],
          matchingFailureObserved: false,
        },
        attempt2Comparison: {
          summary: 'Following verified reset, Task B was deleted as expected.',
          failedAssertions: [],
          matchingFailureObserved: false,
        },
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: ['Verified on fixed build v1.0.1-fixed.'],
      });

      const { output } = await agent.reviewEvidence(notReproducedInput);
      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(output.observedReproductionVerdict).toBe('NOT_REPRODUCED');
        expect(output.attempt1Comparison?.matchingFailureObserved).toBe(false);
      }
    });

    it('flags compromised run integrity when reset status reports failure', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      const failedResetInput = createBaseInput({
        resetStatus: {
          executed: true,
          success: false,
          details: 'Target reset webhook returned HTTP 500: Database lock timeout',
        },
        reproductionVerdict: 'INCONCLUSIVE_EXECUTION_FAILURE',
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary:
          'Baseline fixture reset failed prior to Attempt 2. Reproduction cannot be confirmed due to dirty state.',
        observedReproductionVerdict: 'INCONCLUSIVE_EXECUTION_FAILURE',
        attempt1Comparison: {
          summary: 'Attempt 1 completed.',
          failedAssertions: [],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Attempt 2 ran with unverified/corrupted baseline.',
          failedAssertions: [],
          matchingFailureObserved: false,
        },
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: ['Compromised run integrity: reset failed with HTTP 500.'],
      });

      const { output } = await agent.reviewEvidence(failedResetInput);
      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(output.observedReproductionVerdict).toBe('INCONCLUSIVE_EXECUTION_FAILURE');
        expect(output.limitationsAndCaveats.some((c) => c.includes('reset failed'))).toBe(true);
      }
    });

    it('guarantees diagnostic hypotheses strictly enforce isVerifiedFact === false (TC-INV-008)', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Defect confirmed reproduced.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 matched.',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: null,
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        // Provider erroneously claims hypothesis is a verified fact
        diagnosticHypothesis: {
          isVerifiedFact: true, // Should be normalized to false!
          hypothesisText: 'State store deletes by array index instead of ID.',
          supportingEvidenceTokens: ['splice', 'filteredIndex'],
          suggestedInvestigationDirection: 'Inspect deleteTask handler.',
        },
        limitationsAndCaveats: [],
      });

      const { output } = await agent.reviewEvidence(createBaseInput());
      expect(output.variant).toBe('REPORT_SYNTHESIZED');
      if (output.variant === 'REPORT_SYNTHESIZED') {
        expect(output.diagnosticHypothesis?.isVerifiedFact).toBe(false);
      }
    });
  });

  describe('Negative & Safe Failure Handling', () => {
    it('safely triggers fallback when model generates invalid schema (negative case)', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      mockProvider.queueResponse({ invalid_review: true });
      const agent = new EvidenceReviewAgent(mockProvider);
      const { output, usage } = await agent.reviewEvidence(createBaseInput());
      expect(output.variant).toBe('EXPLANATION_UNAVAILABLE_FALLBACK');
      expect(usage.isFallback).toBe(true);
    });

    it('safely triggers fallback when model inference times out (negative case)', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new EvidenceReviewAgent(mockProvider);
      const controller = new AbortController();
      controller.abort();
      const { output, usage } = await agent.reviewEvidence(createBaseInput(), {
        abortSignal: controller.signal,
      });
      expect(output.variant).toBe('EXPLANATION_UNAVAILABLE_FALLBACK');
      expect(usage.isFallback).toBe(true);
    });
  });

  describe.runIf(process.env.RUN_LOCAL_MODELS === 'true')('Real Local Model Quality Test (qwen2.5-coder:3b)', () => {
    it(
      'synthesizes evidence review report using active local Ollama model',
      async () => {
        const localProvider = new OllamaLocalModelProvider({
          endpointUrl: 'http://localhost:11434',
          modelIdentifier: 'qwen2.5-coder:3b',
          timeoutMs: 180000,
        });

        const agent = new EvidenceReviewAgent(localProvider);
        const input = createBaseInput();

        const { output, usage } = await agent.reviewEvidence(input);

        // Require exact expected variant without fallback
        expect(output.variant).toBe('REPORT_SYNTHESIZED');
        if (output.variant === 'REPORT_SYNTHESIZED') {
          expect(output.observedReproductionVerdict).toBe('CONFIRMED_REPRODUCED');
        }
        expect(usage.isFallback).toBe(false);
        expect(usage.modelIdentifier).toBe('qwen2.5-coder:3b');
        expect(usage.isLocalInference).toBe(true);
        expect(usage.tokenCostUsd).toBe('0.0000');
        expect(usage.durationMs).toBeGreaterThan(0);
      },
      180000
    );
  });
});
