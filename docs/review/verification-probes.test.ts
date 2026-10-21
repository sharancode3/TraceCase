import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  EvidenceReviewAgent,
  getEligibleArtifacts,
} from '../../src/server/ai/reviewer';
import { BrowserInteractionAgent } from '../../src/server/ai/browser-actor';
import { ReportExperimentAgent } from '../../src/server/ai/planner';
import {
  MockTestDoubleModelProvider,
  OllamaLocalModelProvider,
  OpenAiLunaProvider,
  validateMaxTokens,
  MAX_OUTPUT_TOKENS,
  ModelProviderError,
} from '../../src/server/ai/provider';
import {
  EvidenceReviewAgentInput,
  BrowserAgentInput,
  ReportAgentInput,
} from '../../src/server/ai/contracts';
import { createDemoTargetServer } from '../../demo-target/server';
import { DemoTargetClient } from '../../demo-target/client';
import http from 'node:http';

/**
 * ============================================================================
 * TRACECASE PERSON 2: CROSS-BOUNDARY ADVERSARIAL PROBES (READ-ONLY REVIEW)
 * ============================================================================
 * 
 * Specifically exercises cross-boundary contracts documented by Person 1 and Person 3:
 * 1. P3-03: Restricted artifact manifest entries are NEVER cited in reviewer output.
 * 2. P1-05: Non-interactive node / ungrounded element actions are rejected.
 * 3. P1-06: Target reset/readback fails closed when resetSecret is empty or whitespace.
 * 4. P1-07: Model provider rejects oversized tokens (>2048) and reports cost 'unavailable'
 *           when unconfigured, preventing unauthorized billing assumptions.
 * 5. Bounded Real Local Model (Ollama) execution logging actual behavior.
 */

describe('Cross-Boundary Verification Probes for Person 2', () => {
  // --------------------------------------------------------------------------
  // PROBE 1: P3-03 Restricted Artifact Manifest Ingestion
  // --------------------------------------------------------------------------
  describe('Probe 1: P3-03 Manifest Restriction Enforcement', () => {
    it('never cites restricted artifacts in evidenceCitations even if model hallucinates a citation to them', async () => {
      const mockProvider = new MockTestDoubleModelProvider('test-double-v1');
      const reviewer = new EvidenceReviewAgent(mockProvider);

      const restrictedVideoUrl = 'http://localhost:3005/artifacts/run1_video_quarantined.webm';
      const safeConsoleUrl = 'http://localhost:3005/artifacts/run1_console_scrubbed.log';

      // Model attempts to cite the restricted video
      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Defect confirmed reproduced.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 failed assertions',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Attempt 2 failed assertions',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        evidenceCitations: [
          {
            artifactType: 'VIDEO',
            safeUrl: restrictedVideoUrl, // Model hallucinates citation to restricted video!
            relevanceExplanation: 'Shows task disappearing',
          },
          {
            artifactType: 'CONSOLE_LOG',
            safeUrl: safeConsoleUrl,
            relevanceExplanation: 'Shows click event',
          },
        ],
        manualReproductionSteps: ['Open app', 'Click delete'],
        diagnosticHypothesis: {
          isVerifiedFact: false,
          hypothesisText: 'Row index mismatch',
          supportingEvidenceTokens: ['index'],
          suggestedInvestigationDirection: 'Check handler',
        },
        limitationsAndCaveats: [],
      });

      const input: EvidenceReviewAgentInput = {
        contractVersion: '1.0.0',
        investigationId: '123e4567-e89b-12d3-a456-426614174000',
        reproductionVerdict: 'CONFIRMED_REPRODUCED',
        testedEnvironment: 'TraceCase-Demo-Tasks v1.0.0-buggy',
        attempt1: {
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          executionDurationMs: 2000,
          isValid: true,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B should be deleted',
              passed: false,
              actualValue: 'PRESENT',
              expectedValue: 'ABSENT',
            },
          ],
          safeArtifacts: {
            videoUrl: restrictedVideoUrl,
            consoleLogUrl: safeConsoleUrl,
          },
          // P3-03 manifest specifies VIDEO is RESTRICTED (e.g. unredacted token or sensitive pixel data)
          restrictedArtifactTypes: ['VIDEO'],
          sanitizedConsoleExcerpts: ['[INFO] Clicked Delete'],
        },
        attempt2: null,
      };

      const result = await reviewer.reviewEvidence(input);

      expect(result.output.variant).toBe('REPORT_SYNTHESIZED');
      if (result.output.variant === 'REPORT_SYNTHESIZED') {
        // Strict invariant: The citation to restrictedVideoUrl MUST be purged!
        const citedUrls = result.output.evidenceCitations.map((c) => c.safeUrl);
        expect(citedUrls).not.toContain(restrictedVideoUrl);
        expect(citedUrls).toContain(safeConsoleUrl);
      }
    });

    it('getEligibleArtifacts marks restricted entries and masks URLs in user prompt', () => {
      const projection = getEligibleArtifacts({
        safeArtifacts: {
          videoUrl: 'http://localhost/video.webm',
          consoleLogUrl: 'http://localhost/console.log',
        },
        restrictedArtifactTypes: ['VIDEO'],
      });

      expect(projection.isVideoRestricted).toBe(true);
      expect(projection.isConsoleRestricted).toBe(false);
      expect(projection.eligibleUrls).not.toContain('http://localhost/video.webm');
      expect(projection.eligibleUrls).toContain('http://localhost/console.log');
      expect(projection.restrictedList).toContain('VIDEO (Restricted/Quarantined)');
    });
  });

  // --------------------------------------------------------------------------
  // PROBE 2: P1-05 Dispatch Validation & Ungrounded Action Rejection
  // --------------------------------------------------------------------------
  describe('Probe 2: P1-05 Action Grounding and Dispatch Guards', () => {
    it('rejects action on non-interactive node (StaticText) with STOP_BLOCKED TARGET_NOT_INTERACTIVE', async () => {
      const mockProvider = new MockTestDoubleModelProvider('test-double-v1');
      const actor = new BrowserInteractionAgent(mockProvider);

      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '123e4567-e89b-12d3-a456-426614174001',
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_99', // StaticText node
          primarySelector: 'span.text-label',
        },
        expectedPostcondition: 'Clicked text',
        rationale: 'Testing click on text',
      });

      const input: BrowserAgentInput = {
        contractVersion: '1.0.0',
        investigationId: '123e4567-e89b-12d3-a456-426614174000',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3005'],
        currentStep: {
          stepNumber: 1,
          actionType: 'CLICK',
          intentDescription: 'Click label text',
          targetDescription: 'Label text',
          isDestructive: false,
        },
        observation: {
          observationId: '123e4567-e89b-12d3-a456-426614174001',
          pageUrl: 'http://localhost:3005/',
          pageTitle: 'Test Page',
          axTree: [
            {
              nodeId: 'node_99',
              role: 'StaticText',
              name: 'Label text',
            },
          ],
        },
        priorActionHistory: [],
      };

      const result = await actor.proposeNextAction(input);

      expect(result.output.variant).toBe('STOP_BLOCKED');
      if (result.output.variant === 'STOP_BLOCKED') {
        expect(result.output.errorCode).toBe('TARGET_NOT_INTERACTIVE');
      }
    });

    it('rejects stale observation ID and requests fresh observation instead of executing', async () => {
      const mockProvider = new MockTestDoubleModelProvider('test-double-v1');
      const actor = new BrowserInteractionAgent(mockProvider);

      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '99999999-9999-9999-9999-999999999999', // Mismatched observationId!
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_10',
          primarySelector: 'button#submit',
        },
        expectedPostcondition: 'Clicked submit',
        rationale: 'Submit action',
      });

      const input: BrowserAgentInput = {
        contractVersion: '1.0.0',
        investigationId: '123e4567-e89b-12d3-a456-426614174000',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3005'],
        currentStep: {
          stepNumber: 1,
          actionType: 'CLICK',
          intentDescription: 'Click submit',
          targetDescription: 'Submit button',
          isDestructive: false,
        },
        observation: {
          observationId: '123e4567-e89b-12d3-a456-426614174001', // Real observationId
          pageUrl: 'http://localhost:3005/',
          pageTitle: 'Test Page',
          axTree: [
            {
              nodeId: 'node_10',
              role: 'button',
              name: 'Submit',
            },
          ],
        },
        priorActionHistory: [],
      };

      const result = await actor.proposeNextAction(input);

      expect(result.output.variant).toBe('REQUEST_OBSERVATION');
      if (result.output.variant === 'REQUEST_OBSERVATION') {
        expect(result.output.reason).toContain('Stale correlation rejected');
      }
    });
  });

  // --------------------------------------------------------------------------
  // PROBE 3: P1-06 Target Secret Authorization Fail-Closed
  // --------------------------------------------------------------------------
  describe('Probe 3: P1-06 Reset & Readback Fail-Closed Security', () => {
    let probe3Instance: ReturnType<typeof createDemoTargetServer>;
    let targetUrl: string;

    beforeAll(async () => {
      probe3Instance = createDemoTargetServer({ resetSecret: 'correct-secret-123' });
      const port = await probe3Instance.start(0);
      targetUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
      if (probe3Instance) {
        await probe3Instance.stop();
      }
    });
    it('target client fails closed with 401 when reset secret is empty string or whitespace', async () => {
      // Connect to the running demo target on port 3005 with whitespace secret
      const unauthClient = new DemoTargetClient({
        baseUrl: targetUrl,
        resetSecret: '   ',
      });

      await expect(unauthClient.resetFixture('two_tasks_one_completed')).rejects.toThrow(
        /UNAUTHORIZED_RESET/
      );
      await expect(unauthClient.readbackFixture('two_tasks_one_completed')).rejects.toThrow(
        /UNAUTHORIZED_READBACK/
      );
    });
  });

  // --------------------------------------------------------------------------
  // PROBE 4: P1-07 Provider Boundary & Output Limits
  // --------------------------------------------------------------------------
  describe('Probe 4: P1-07 Provider Output Limits & Pricing Decoupling', () => {
    it('enforces MAX_OUTPUT_TOKENS (2048) and rejects oversized and invalid requests', () => {
      expect(validateMaxTokens(1024)).toBe(1024);
      expect(validateMaxTokens(2048)).toBe(2048);
      expect(() => validateMaxTokens(2049)).toThrow(ModelProviderError);
      expect(() => validateMaxTokens(5000)).toThrow(/exceeds enforced maximum output token cap of 2048/);
      expect(() => validateMaxTokens(-10)).toThrow(ModelProviderError);
      expect(() => validateMaxTokens(NaN)).toThrow(ModelProviderError);
    });

    it('OpenAiLunaProvider marks cost as unavailable when pricingConfig is omitted', async () => {
      // Injected transport to verify cost reporting without cloud calls
      const customFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ variant: 'UNABLE_TO_INTERPRET', explanation: 'Test' }) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'gpt-4o-2024-08-06',
        fetchFn: customFetch,
        // Notice: pricingConfig is omitted!
      });

      const res = await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'Sys',
          userPrompt: 'User',
          maxTokens: 500,
        },
        ReportExperimentAgent.prototype['provider'] ? ({} as any) : (await import('../../src/server/ai/contracts')).ReportAgentOutputSchema
      );

      expect(res.usage.tokenCostUsd).toBe('unavailable');
    });
  });

  // --------------------------------------------------------------------------
  // PROBE 5: Bounded Real Local Model (Ollama) Call
  // --------------------------------------------------------------------------
  describe('Probe 5: Real Local Model Execution (Ollama @ http://localhost:11434)', () => {
    it('executes a real bounded local call with qwen2.5-coder:3b and records behavior', async () => {
      const localProvider = new OllamaLocalModelProvider({
        endpointUrl: 'http://localhost:11434',
        modelIdentifier: 'qwen2.5-coder:3b',
        timeoutMs: 90000,
        temperature: 0.1,
      });

      const planner = new ReportExperimentAgent(localProvider);
      const startTime = Date.now();

      const input: ReportAgentInput = {
        contractVersion: '1.0.0',
        investigationId: '123e4567-e89b-12d3-a456-426614174099',
        targetProfile: {
          name: 'TraceCase-Demo-Tasks',
          baseUrl: 'http://localhost:3005',
          isSandbox: true,
          allowedOrigins: ['http://localhost:3005'],
          hasResetFixture: true,
        },
        rawReport: {
          title: 'Deleting active task deletes completed item',
          description: 'Under Active filter, clicking delete on Task B removes Task A instead.',
          claimedExpectedBehavior: 'Task B is removed, Task A remains.',
        },
        clarificationHistory: [],
      };

      let caughtError: any = null;
      try {
        const { output, usage } = await planner.evaluateReport(input);
        const elapsedMs = Date.now() - startTime;

        // Structured logging for review audit
        // eslint-disable-next-line no-console
        console.log('[PROBE 5 REAL OLLAMA AUDIT LOG]:', {
          model: 'qwen2.5-coder:3b',
          role: 'AT-ROLE-001',
          elapsedMs,
          retries: usage.retriesAttempted,
          outputVariant: output.variant,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          costUsd: usage.tokenCostUsd,
        });

        expect(output.variant).toBeDefined();
        expect(['PLAN_PROPOSED', 'NEEDS_CLARIFICATION', 'UNABLE_TO_INTERPRET']).toContain(output.variant);
        expect(usage.tokenCostUsd).toBe('0.0000');
      } catch (err: any) {
        caughtError = err;
        const elapsedMs = Date.now() - startTime;
        // eslint-disable-next-line no-console
        console.log('[PROBE 5 REAL OLLAMA FAILURE AUDIT]:', {
          model: 'qwen2.5-coder:3b',
          elapsedMs,
          errorCategory: err.category,
          errorCode: err.code,
          message: err.message,
        });
      }

      // Invariant: The system either succeeds with valid schema or fails with typed ModelProviderError.
      // It never swallows errors or emits unvalidated objects.
      if (caughtError) {
        expect(caughtError).toBeInstanceOf(ModelProviderError);
        expect(['SCHEMA_VIOLATION', 'INVALID_JSON', 'TIMEOUT', 'CONNECTION']).toContain(caughtError.category);
      }
    }, 120000);
  });
});
