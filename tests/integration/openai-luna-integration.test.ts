import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  OpenAiLunaProvider,
  GPT_6_LUNA_STANDARD_PRICING,
  ModelProviderError,
  ModelSchemaValidationError,
} from '@/server/ai/provider';
import {
  BudgetManager,
  BudgetExhaustedError,
  GlobalBudgetExhaustedError,
  InMemoryBudgetLedger,
  createTestBudgetManager,
} from '@/server/ai/budget-manager';
import {
  IntegratedReportClarificationAgent,
  IntegratedBrowserInvestigationAgent,
  IntegratedEvidenceReviewAgent,
} from '@/server/ai/integrated-adapters';
import { getSystemReadiness, resetOpenAiProbeCacheForTesting } from '@/server/services/service-container';
import { _resetCachedEnvForTesting } from '@/server/config/env';

describe('OpenAI GPT-6 Luna Integration & Cost Accounting', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetCachedEnvForTesting();
    resetOpenAiProbeCacheForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetCachedEnvForTesting();
    resetOpenAiProbeCacheForTesting();
  });

  // ==========================================================================
  // 1. Model Identity and Parameters Enforcement
  // ==========================================================================
  describe('1. Model Identity and Request Format Enforcement', () => {
    it('strictly enforces gpt-6-luna and rejects unauthorized models without fallback', async () => {
      expect(() => {
        new OpenAiLunaProvider({
          apiKey: 'test-fake-key',
          modelIdentifier: 'gpt-4o',
        });
      }).not.toThrow();

      // Dispatching with unauthorized model must fail closed
      const provider = new OpenAiLunaProvider({
        apiKey: 'test-fake-key',
        modelIdentifier: 'gpt-4o',
      });

      await expect(
        provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
          z.object({ ok: z.boolean() })
        )
      ).rejects.toThrow(/Unauthorized model 'gpt-4o'/);
    });

    it('constructs request with modern max_completion_tokens and reasoning_effort none', async () => {
      let capturedBody: any = null;
      let capturedHeaders: any = null;

      const mockFetch: typeof fetch = async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body));
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: JSON.stringify({ result: 'verified' }) },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 250,
              completion_tokens: 50,
              total_tokens: 300,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key-safe',
        modelIdentifier: 'gpt-6-luna',
        fetchFn: mockFetch,
      });

      const res = await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'System instructions',
          userPrompt: 'User request',
          maxTokens: 1024,
          temperature: 0.1,
        },
        z.object({ result: z.string() })
      );

      expect(res.data.result).toBe('verified');
      expect(capturedBody.model).toBe('gpt-6-luna');
      expect(capturedBody.max_completion_tokens).toBe(1024);
      expect(capturedBody.reasoning_effort).toBe('none');
      expect(capturedBody.response_format).toEqual({ type: 'json_object' });
      expect(capturedBody.max_tokens).toBeUndefined();
      expect(capturedHeaders.Authorization).toBe('Bearer test-key-safe');
    });
  });

  // ==========================================================================
  // 2. Calibrated Pricing Arithmetic & Sub-Cent Precision
  // ==========================================================================
  describe('2. Calibrated Pricing Arithmetic & High Precision', () => {
    it('uses standard published GPT-6 Luna pricing ($0.10/M input, $0.50/M output)', () => {
      expect(GPT_6_LUNA_STANDARD_PRICING.promptCostPerMillion).toBe(0.10);
      expect(GPT_6_LUNA_STANDARD_PRICING.completionCostPerMillion).toBe(0.50);
      expect(GPT_6_LUNA_STANDARD_PRICING.cachedPromptCostPerMillion).toBe(0.01);
    });

    it('calculates cost accurately and preserves small sub-cent usage without rounding to zero', () => {
      const budgetManager = new BudgetManager(undefined, {
        promptPricePer1kTokens: 0.000100, // $0.10 / 1M
        completionPricePer1kTokens: 0.000500, // $0.50 / 1M
        customLedger: new InMemoryBudgetLedger(),
      });

      // Very small request: 100 prompt tokens, 50 completion tokens
      // Prompt: (100 / 1000) * 0.000100 = 0.000010 USD
      // Completion: (50 / 1000) * 0.000500 = 0.000025 USD
      // Total: 0.000035 USD
      const tinyCost = budgetManager.calculateCost({
        promptTokens: 100,
        completionTokens: 50,
      });

      expect(tinyCost).toBeGreaterThan(0);
      expect(tinyCost).toBeCloseTo(0.000035, 6);

      // Typical experiment request: 2000 prompt tokens, 500 completion tokens
      // Prompt: 2 * 0.000100 = 0.000200
      // Completion: 0.5 * 0.000500 = 0.000250
      // Total: 0.000450 USD (< half a cent)
      const typicalCost = budgetManager.calculateCost({
        promptTokens: 2000,
        completionTokens: 500,
      });
      expect(typicalCost).toBeCloseTo(0.000450, 6);
    });
  });

  // ==========================================================================
  // 3. Global and Per-Investigation Budget Ceilings
  // ==========================================================================
  describe('3. Durable Global ($10.00) and Per-Investigation ($0.25) Ceilings', () => {
    it('enforces per-investigation ceiling ($0.25) when single investigation requests exceed limit', async () => {
      const sharedLedger = new InMemoryBudgetLedger();
      const budgetManager = new BudgetManager(undefined, {
        maxBudgetPerInvestigationUsd: 0.25,
        globalBudgetCeilingUsd: 10.00,
        promptPricePer1kTokens: 0.05,
        completionPricePer1kTokens: 0.10,
        defaultEstimatedTokens: 2000, // ~ $0.13 per reservation
        customLedger: sharedLedger,
      });

      const invId = randomUUID();

      // Reservation 1: ~$0.13 (allowed, total: $0.13 <= $0.25)
      const ticket1 = await budgetManager.reserveBudget({ investigationId: invId });
      expect(ticket1.reservationId).toBeDefined();

      // Reservation 2: ~$0.13 (rejected: $0.13 + $0.13 = $0.26 > $0.25)
      await expect(
        budgetManager.reserveBudget({ investigationId: invId })
      ).rejects.toThrow(BudgetExhaustedError);
    });

    it('enforces shared global ceiling ($10.00) across distinct investigations', async () => {
      const sharedLedger = new InMemoryBudgetLedger();
      const budgetManager = new BudgetManager(undefined, {
        maxBudgetPerInvestigationUsd: 5.00,
        globalBudgetCeilingUsd: 1.00, // Tight test ceiling of $1.00
        promptPricePer1kTokens: 0.10,
        completionPricePer1kTokens: 0.20,
        defaultEstimatedTokens: 3000, // ~ $0.39 per reservation
        customLedger: sharedLedger,
      });

      const inv1 = randomUUID();
      const inv2 = randomUUID();
      const inv3 = randomUUID();

      // Inv 1: reserves $0.39 (global total: $0.39 <= $1.00)
      await budgetManager.reserveBudget({ investigationId: inv1 });

      // Inv 2: reserves $0.39 (global total: $0.78 <= $1.00)
      await budgetManager.reserveBudget({ investigationId: inv2 });

      // Inv 3: requests $0.39 (global total would be $1.17 > $1.00 ceiling) -> must throw GlobalBudgetExhaustedError
      await expect(
        budgetManager.reserveBudget({ investigationId: inv3 })
      ).rejects.toThrow(GlobalBudgetExhaustedError);
    });

    it('idempotently settles usage without double-charging', async () => {
      const sharedLedger = new InMemoryBudgetLedger();
      const budgetManager = new BudgetManager(undefined, {
        maxBudgetPerInvestigationUsd: 0.50,
        customLedger: sharedLedger,
      });

      const invId = randomUUID();
      const ticket = await budgetManager.reserveBudget({ investigationId: invId });

      const cost1 = await budgetManager.commitUsage(ticket, { promptTokens: 1000, completionTokens: 500 });
      expect(cost1).toBeGreaterThan(0);

      const committed = await budgetManager.getCommittedCost(invId);

      // Re-settling or releasing already settled ticket must not increase committed cost
      await budgetManager.releaseReservation(ticket.reservationId);
      const committedAfter = await budgetManager.getCommittedCost(invId);
      expect(committedAfter).toBe(committed);
    });
  });

  // ==========================================================================
  // 4. Schema Failure Accounting (Spent Tokens Are Not Free)
  // ==========================================================================
  describe('4. Token Accounting on Schema Failure', () => {
    it('commits provider-reported tokens when model output violates schema constraints', async () => {
      const sharedLedger = new InMemoryBudgetLedger();
      const budgetManager = new BudgetManager(undefined, {
        customLedger: sharedLedger,
      });

      const invId = randomUUID();
      const ticket = await budgetManager.reserveBudget({ investigationId: invId });

      // Simulate model returning valid JSON that fails domain schema
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: JSON.stringify({ unexpectedField: 'invalid' }) },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 80,
              total_tokens: 580,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'gpt-6-luna',
        fetchFn: mockFetch,
      });

      const StrictSchema = z.object({
        requiredResult: z.string(),
      });

      let caughtErr: any = null;
      try {
        await provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
          StrictSchema
        );
      } catch (err) {
        caughtErr = err;
      }

      expect(caughtErr).toBeInstanceOf(ModelSchemaValidationError);
      expect(caughtErr.usage).toBeDefined();
      expect(caughtErr.usage.totalTokens).toBe(580);

      // Commit usage truthfully
      const cost = await budgetManager.commitUsage(ticket, {
        promptTokens: caughtErr.usage.promptTokens,
        completionTokens: caughtErr.usage.completionTokens,
      });

      expect(cost).toBeGreaterThan(0);
      const committed = await budgetManager.getCommittedCost(invId);
      expect(committed).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 5. Safe Error Handling & Non-Retryable Failure Isolation
  // ==========================================================================
  describe('5. Error Handling & Non-Retryable Categories', () => {
    it('treats HTTP 401 as non-retryable and never echoes authorization headers', async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async () => {
        callCount++;
        return new Response('Unauthorized', { status: 401 });
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'sk-compromised-never-logged-xyz',
        modelIdentifier: 'gpt-6-luna',
        fetchFn: mockFetch,
      });

      let thrownError: any = null;
      try {
        await provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
          z.object({ ok: z.boolean() })
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(ModelProviderError);
      expect(thrownError.category).toBe('AUTHENTICATION');
      expect(thrownError.isRetryable).toBe(false);
      expect(callCount).toBe(1); // Zero retries on auth failure
      expect(thrownError.message).not.toContain('sk-compromised');
    });

    it('treats HTTP 403 as non-retryable permission error with zero retries', async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async () => {
        callCount++;
        return new Response('Forbidden', { status: 403 });
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'gpt-6-luna',
        fetchFn: mockFetch,
      });

      let thrownError: any = null;
      try {
        await provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
          z.object({ ok: z.boolean() })
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError.category).toBe('PERMISSION');
      expect(thrownError.isRetryable).toBe(false);
      expect(callCount).toBe(1);
    });

    it('permits at most 1 bounded retry for transient HTTP 429 rate limit', async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('Too Many Requests', { status: 429 });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'gpt-6-luna',
        fetchFn: mockFetch,
        maxRetries: 1,
      });

      const res = await provider.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
        z.object({ ok: z.boolean() })
      );

      expect(res.data.ok).toBe(true);
      expect(callCount).toBe(2); // Exactly 1 retry
      expect(res.usage.retriesAttempted).toBe(1);
    });
  });

  // ==========================================================================
  // 6. System Readiness Non-Generating Access Probe
  // ==========================================================================
  describe('6. Truthful System Readiness Probe', () => {
    it('reports UNAVAILABLE when OPENAI_API_KEY is not configured', async () => {
      delete process.env.OPENAI_API_KEY;
      _resetCachedEnvForTesting();
      resetOpenAiProbeCacheForTesting();

      const report = await getSystemReadiness();
      expect(report.components.openai.status).toBe('UNAVAILABLE');
      expect(report.components.openai.details).toContain('OPENAI_API_KEY environment variable is not configured');
    });

    it('probes non-generating models endpoint when key is configured', async () => {
      process.env.OPENAI_API_KEY = 'test-operator-key-probe';
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9999/v1';
      _resetCachedEnvForTesting();
      resetOpenAiProbeCacheForTesting();

      // When mock endpoint is unreachable, reports UNAVAILABLE truthfully rather than pretending active
      const report = await getSystemReadiness();
      expect(report.components.openai.status).toBe('UNAVAILABLE');
    });
  });

  // ==========================================================================
  // 7. Evidence Review Input Assembly & Duration Preservation
  // ==========================================================================
  describe('7. Evidence Review Input Assembly & Duration Preservation', () => {
    it('preserves exact execution durations and maps assertions in review agent input', async () => {
      let capturedUserPrompt: string = '';

      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        capturedUserPrompt = body.messages[1].content;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    contractVersion: '1.0.0',
                    variant: 'REPORT_SYNTHESIZED',
                    executiveSummary: 'Defect confirmed reproduced across both attempts.',
                    observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
                    attempt1Comparison: {
                      summary: 'Attempt 1 failed assertions as expected',
                      matchingFailureObserved: true,
                    },
                    attempt2Comparison: {
                      summary: 'Attempt 2 confirmed identical failure signature',
                      matchingFailureObserved: true,
                    },
                    manualReproductionSteps: [
                      'Navigate to tasks',
                      'Click Active filter',
                      'Click Delete on Task B',
                    ],
                    diagnosticHypothesis: {
                      isVerifiedFact: false,
                      hypothesisText: 'Array indexing mismatch on active list filter deletion',
                      supportingEvidenceTokens: ['index', 'active filter'],
                      suggestedInvestigationDirection: 'Review filter handler',
                    },
                    limitationsAndCaveats: [],
                  }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'gpt-6-luna',
        fetchFn: mockFetch,
      });

      const adapter = new IntegratedEvidenceReviewAgent(provider, createTestBudgetManager());

      const result = await adapter.synthesizeExplanation({
        investigationId: 'test-inv-001',
        lockedVerdict: 'CONFIRMED_REPRODUCED',
        verifiedAssertions: [
          {
            assertionId: 'assert-01',
            result: 'NOT_SATISFIED',
            expectedValue: 'true',
            observedValue: '0 elements',
            details: 'Task A should still exist after deleting Task B',
            evaluatedAt: new Date().toISOString(),
          },
        ],
        eligibleEvidence: [
          {
            captureId: 'art-01',
            investigationId: 'test-inv-001',
            attemptNumber: 1,
            kind: 'CONSOLE_LOG',
            storageRef: 'investigations/test/console.log',
            sizeBytes: 100,
            sha256Checksum: 'abc123',
            capturedAt: new Date().toISOString(),
          },
        ],
        attempt1: {
          attemptNumber: 1,
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          executionDurationMs: 7226,
          isValid: true,
          assertionsEvaluated: [
            {
              predicateId: 'assert-01',
              predicateDescription: 'Task A should still exist after deleting Task B',
              passed: false,
              actualValue: '0 elements',
              expectedValue: 'true',
              result: 'NOT_SATISFIED',
            },
          ],
        },
        attempt2: {
          attemptNumber: 2,
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          executionDurationMs: 6847,
          isValid: true,
          assertionsEvaluated: [
            {
              predicateId: 'assert-01',
              predicateDescription: 'Task A should still exist after deleting Task B',
              passed: false,
              actualValue: '0 elements',
              expectedValue: 'true',
              result: 'NOT_SATISFIED',
            },
          ],
        },
      });

      expect(capturedUserPrompt).toContain('Duration: 7226ms');
      expect(capturedUserPrompt).toContain('Duration: 6847ms');
      expect(capturedUserPrompt).toContain('Task A should still exist after deleting Task B');
      expect(result.naturalLanguageSummary).toContain('Defect confirmed reproduced');
    });
  });
});
