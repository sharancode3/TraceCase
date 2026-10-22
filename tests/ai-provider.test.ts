import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  OllamaLocalModelProvider,
  MockTestDoubleModelProvider,
  OpenAiLunaProvider,
  extractJsonFromResponse,
  ModelTimeoutError,
  ModelSchemaValidationError,
  ModelRefusalError,
  ModelTruncationError,
  ModelProviderError,
  MAX_OUTPUT_TOKENS,
  validateMaxTokens,
} from '../src/server/ai/provider';

describe('Person 2: AI Provider Adapter & Bounded Request Handling (P2-03)', () => {
  describe('extractJsonFromResponse helper', () => {
    it('extracts raw clean JSON string unchanged', () => {
      const input = '{"status":"ok","count":42}';
      expect(extractJsonFromResponse(input)).toBe(input);
    });

    it('strips markdown code fences (```json ... ```)', () => {
      const input = '```json\n{"status":"ok","count":42}\n```';
      expect(extractJsonFromResponse(input)).toBe('{"status":"ok","count":42}');
    });

    it('strips generic code fences (``` ... ```)', () => {
      const input = '```\n{"status":"ok"}\n```';
      expect(extractJsonFromResponse(input)).toBe('{"status":"ok"}');
    });

    it('strips leading conversational text before JSON object', () => {
      const input = 'Here is your structured plan:\n\n{"variant":"PLAN_PROPOSED"}';
      expect(extractJsonFromResponse(input)).toBe('{"variant":"PLAN_PROPOSED"}');
    });

    it('detects model refusal patterns', () => {
      expect(() =>
        extractJsonFromResponse('I cannot fulfill this request because it violates safety guidelines.')
      ).toThrow(ModelRefusalError);

      expect(() =>
        extractJsonFromResponse('I am unable to execute external actions.')
      ).toThrow(ModelRefusalError);
    });

    it('throws on empty response', () => {
      expect(() => extractJsonFromResponse('   \n  ')).toThrow(/EMPTY_RESPONSE/);
    });
  });

  describe('Deterministic Injected Transport Tests', () => {
    const SimpleSchema = z.object({
      status: z.string(),
      count: z.number().int(),
    });

    it('parses valid JSON response and reports zero USD local cost', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            message: { content: '{"status":"success","count":10}' },
            prompt_eval_count: 25,
            eval_count: 15,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OllamaLocalModelProvider({
        fetchFn: mockFetch,
        timeoutMs: 1000,
      });

      const res = await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'Sys',
          userPrompt: 'User',
        },
        SimpleSchema
      );

      expect(res.data).toEqual({ status: 'success', count: 10 });
      expect(res.usage.promptTokens).toBe(25);
      expect(res.usage.completionTokens).toBe(15);
      expect(res.usage.totalTokens).toBe(40);
      expect(res.usage.tokenCostUsd).toBe('0.0000');
      expect(res.usage.isLocalInference).toBe(true);
      expect(res.usage.retriesAttempted).toBe(0);
    });

    it('strips markdown code blocks in provider response', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            message: { content: '```json\n{"status":"fenced","count":99}\n```' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OllamaLocalModelProvider({ fetchFn: mockFetch });
      const res = await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'Sys',
          userPrompt: 'User',
        },
        SimpleSchema
      );

      expect(res.data).toEqual({ status: 'fenced', count: 99 });
    });

    it('throws ModelSchemaValidationError when JSON fails Zod schema', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            message: { content: '{"status":"success","count":"NOT_A_NUMBER"}' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OllamaLocalModelProvider({ fetchFn: mockFetch });
      await expect(
        provider.generateStructuredCompletion(
          {
            roleId: 'AT-ROLE-001',
            systemPrompt: 'Sys',
            userPrompt: 'User',
          },
          SimpleSchema
        )
      ).rejects.toThrow(ModelSchemaValidationError);
    });

    it('strips model-injected authority fields from completion', async () => {
      const AuthoritySchema = z.object({
        status: z.string(),
      });

      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                status: 'ok',
                isApproved: true, // injected authority field
                planHash: 'tampered-hash',
              }),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OllamaLocalModelProvider({ fetchFn: mockFetch });
      const res = await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'Sys',
          userPrompt: 'User',
        },
        AuthoritySchema
      );

      expect(res.parsedJson).not.toHaveProperty('isApproved');
      expect(res.parsedJson).not.toHaveProperty('planHash');
      expect(res.parsedJson).toHaveProperty('status', 'ok');
    });

    it('detects model truncation when done_reason is length', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            message: { content: '{"status":"truncated' },
            done_reason: 'length',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OllamaLocalModelProvider({ fetchFn: mockFetch, maxRetries: 0 });
      await expect(
        provider.generateStructuredCompletion(
          {
            roleId: 'AT-ROLE-001',
            systemPrompt: 'Sys',
            userPrompt: 'User',
          },
          SimpleSchema
        )
      ).rejects.toThrow(ModelTruncationError);
    });

    it('honors caller cancellation via AbortSignal', async () => {
      const abortController = new AbortController();

      const mockFetch: typeof fetch = async (_url, init) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const provider = new OllamaLocalModelProvider({ fetchFn: mockFetch, maxRetries: 0 });
      setTimeout(() => abortController.abort(), 20);

      await expect(
        provider.generateStructuredCompletion(
          {
            roleId: 'AT-ROLE-001',
            systemPrompt: 'Sys',
            userPrompt: 'User',
            abortSignal: abortController.signal,
          },
          SimpleSchema
        )
      ).rejects.toThrow(/CANCELLED/);
    });

    it('retries boundedly on retryable 500 error and exhausts retries', async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async () => {
        callCount++;
        return new Response('Internal Server Error', { status: 500 });
      };

      const provider = new OllamaLocalModelProvider({
        fetchFn: mockFetch,
        maxRetries: 2, // 1 initial + 2 retries = 3 calls
      });

      await expect(
        provider.generateStructuredCompletion(
          {
            roleId: 'AT-ROLE-001',
            systemPrompt: 'Sys',
            userPrompt: 'User',
          },
          SimpleSchema
        )
      ).rejects.toThrow(/HTTP_500/);

      expect(callCount).toBe(3);
    });

    it('succeeds after transient retry on HTTP 503', async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('Service Unavailable', { status: 503 });
        }
        return new Response(
          JSON.stringify({
            message: { content: '{"status":"recovered","count":1}' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new OllamaLocalModelProvider({
        fetchFn: mockFetch,
        maxRetries: 2,
      });

      const res = await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'Sys',
          userPrompt: 'User',
        },
        SimpleSchema
      );

      expect(callCount).toBe(2);
      expect(res.data.status).toBe('recovered');
      expect(res.usage.retriesAttempted).toBe(1);
    });

    it('enforces validated maximum output-token limit (2048 hard cap)', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            message: { content: '{"status":"ok","count":1}' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OllamaLocalModelProvider({ fetchFn: mockFetch });

      // Oversized requests (> 2048) rejected
      await expect(
        provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User', maxTokens: 2049 },
          SimpleSchema
        )
      ).rejects.toThrow(/MAX_TOKENS_EXCEEDED/);

      await expect(
        provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User', maxTokens: 5000 },
          SimpleSchema
        )
      ).rejects.toThrow(/MAX_TOKENS_EXCEEDED/);

      // Invalid requests (<= 0, non-integer, NaN) rejected
      await expect(
        provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User', maxTokens: 0 },
          SimpleSchema
        )
      ).rejects.toThrow(/INVALID_TOKEN_LIMIT/);

      await expect(
        provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User', maxTokens: -10 },
          SimpleSchema
        )
      ).rejects.toThrow(/INVALID_TOKEN_LIMIT/);

      await expect(
        provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User', maxTokens: 100.5 },
          SimpleSchema
        )
      ).rejects.toThrow(/INVALID_TOKEN_LIMIT/);

      // Exactly 2048 is accepted
      const resAtCap = await provider.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User', maxTokens: 2048 },
        SimpleSchema
      );
      expect(resAtCap.data.status).toBe('ok');
    });

    it('enforces safe error envelopes without echoing raw upstream body text or tokens', async () => {
      const sensitiveLeak = 'Bearer super-secret-internal-key-999-raw-dump';
      const mockFetch: typeof fetch = async () => {
        return new Response(`Internal Server Crash: ${sensitiveLeak}`, { status: 500 });
      };

      const provider = new OllamaLocalModelProvider({
        fetchFn: mockFetch,
        maxRetries: 0,
      });

      try {
        await provider.generateStructuredCompletion(
          {
            correlationId: 'req-corr-trace-12345',
            roleId: 'AT-ROLE-001',
            systemPrompt: 'Sys',
            userPrompt: 'User',
          },
          SimpleSchema
        );
        expect.unreachable('Should have thrown HTTP_500');
      } catch (err) {
        expect(err).toBeInstanceOf(ModelProviderError);
        const providerErr = err as ModelProviderError;
        expect(providerErr.code).toBe('HTTP_500');
        expect(providerErr.category).toBe('PROVIDER_ERROR');
        expect(providerErr.correlationId).toBe('req-corr-trace-12345');
        // Invariant: zero raw provider response snippet leakage
        expect(providerErr.message).not.toContain(sensitiveLeak);
        expect(providerErr.message).toContain('req-corr-trace-12345');
      }
    });

    it('ensures INVALID_JSON errors contain zero model output snippets and include correlation IDs', async () => {
      const corruptedModelText = 'CORRUPTED_RAW_MODEL_PAYLOAD_UNSANITIZED_DATA';
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            message: { content: `{ invalid_json: ${corruptedModelText} ` },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OllamaLocalModelProvider({ fetchFn: mockFetch, maxRetries: 0 });

      try {
        await provider.generateStructuredCompletion(
          {
            correlationId: 'req-corr-json-parse-99',
            roleId: 'AT-ROLE-001',
            systemPrompt: 'Sys',
            userPrompt: 'User',
          },
          SimpleSchema
        );
        expect.unreachable('Should have thrown INVALID_JSON');
      } catch (err) {
        expect(err).toBeInstanceOf(ModelProviderError);
        const providerErr = err as ModelProviderError;
        expect(providerErr.code).toBe('INVALID_JSON');
        expect(providerErr.category).toBe('INVALID_JSON');
        expect(providerErr.correlationId).toBe('req-corr-json-parse-99');
        // Invariant: zero raw model output snippet leakage
        expect(providerErr.message).not.toContain(corruptedModelText);
        expect(providerErr.message).toContain('req-corr-json-parse-99');
      }
    });
  });

  describe('OpenAiLunaProvider - Injected Transport & Safety Tests (P2-03)', () => {
    const SimpleSchema = z.object({
      status: z.string(),
      count: z.number().int(),
    });

    it('throws ModelProviderError MISSING_API_KEY when no key and no customFetch is provided', async () => {
      const prevKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        const provider = new OpenAiLunaProvider({ apiKey: '', modelIdentifier: 'mock-model' });
        await expect(
          provider.generateStructuredCompletion(
            { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
            SimpleSchema
          )
        ).rejects.toThrow(/MISSING_API_KEY/);
      } finally {
        if (prevKey) process.env.OPENAI_API_KEY = prevKey;
      }
    });

    it('parses valid OpenAI structured response and reports cost as unavailable unless versioned pricing is supplied', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-test-123',
            choices: [
              {
                message: { content: '{"status":"openai_ok","count":42}' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      // Default without pricing configuration must report 'unavailable'
      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
      });

      const res = await provider.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
        SimpleSchema
      );

      expect(res.data).toEqual({ status: 'openai_ok', count: 42 });
      expect(res.usage.providerType).toBe('openai_luna');
      expect(res.usage.promptTokens).toBe(100);
      expect(res.usage.completionTokens).toBe(50);
      expect(res.usage.totalTokens).toBe(150);
      expect(res.usage.isLocalInference).toBe(false);
      expect(res.usage.usageSource).toBe('provider_reported');
      // Invariant: Universal hardcoded pricing removed; cost is unavailable without pricing config
      expect(res.usage.tokenCostUsd).toBe('unavailable');

      // With model-specific versioned pricing config supplied
      const providerWithPricing = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
        pricingConfig: {
          version: '2026-10-01',
          modelIdentifier: 'mock-model',
          promptCostPerMillion: 2.50,
          completionCostPerMillion: 10.00,
        },
      });

      const resPricing = await providerWithPricing.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
        SimpleSchema
      );
      // Preserve sub-cent precision rather than rounding tiny calls to zero.
      expect(resPricing.usage.tokenCostUsd).toBe('0.00075000');

      // With mismatched modelIdentifier in pricing config, cost remains 'unavailable'
      const providerMismatched = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
        pricingConfig: {
          version: '2026-10-01',
          modelIdentifier: 'different-model-xyz',
          promptCostPerMillion: 2.50,
          completionCostPerMillion: 10.00,
        },
      });
      const resMismatched = await providerMismatched.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
        SimpleSchema
      );
      expect(resMismatched.usage.tokenCostUsd).toBe('unavailable');
    });

    it('strips markdown code fences from OpenAI response content', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: '```json\n{"status":"fenced_openai","count":7}\n```' },
                finish_reason: 'stop',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
      });
      const res = await provider.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
        SimpleSchema
      );

      expect(res.data).toEqual({ status: 'fenced_openai', count: 7 });
    });

    it('strips model-injected authority fields from OpenAI completion', async () => {
      const AuthoritySchema = z.object({
        status: z.string(),
      });

      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    status: 'sanitized',
                    isApproved: true,
                    planHash: 'attacker-forged-hash',
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
      });
      const res = await provider.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
        AuthoritySchema
      );

      expect(res.parsedJson).not.toHaveProperty('isApproved');
      expect(res.parsedJson).not.toHaveProperty('planHash');
      expect(res.parsedJson).toHaveProperty('status', 'sanitized');
    });

    it('handles HTTP 401 unauthorized safely redacting key from error message', async () => {
      const secretKey = 'sk-proj-super-secret-key-12345';
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({ error: { message: `Incorrect API key provided: Bearer ${secretKey}` } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OpenAiLunaProvider({
        apiKey: secretKey,
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
        maxRetries: 0,
      });
      try {
        await provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
          SimpleSchema
        );
        expect.unreachable('Should have thrown HTTP_401');
      } catch (err) {
        expect(err).toBeInstanceOf(ModelProviderError);
        const providerErr = err as ModelProviderError;
        expect(providerErr.code).toBe('HTTP_401');
        expect(providerErr.message).not.toContain(secretKey);
        expect(providerErr.isRetryable).toBe(false);
      }
    });

    it('handles HTTP 429 rate limit as a retryable error and succeeds on retry', async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"status":"recovered_429","count":1}' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
        maxRetries: 2,
      });
      const res = await provider.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
        SimpleSchema
      );

      expect(callCount).toBe(2);
      expect(res.data.status).toBe('recovered_429');
      expect(res.usage.retriesAttempted).toBe(1);
    });

    it('detects model truncation when finish_reason is length', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"status":"cut_off' }, finish_reason: 'length' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
        maxRetries: 0,
      });
      await expect(
        provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
          SimpleSchema
        )
      ).rejects.toThrow(ModelTruncationError);
    });

    it('honors caller cancellation via AbortSignal', async () => {
      const abortController = new AbortController();
      const mockFetch: typeof fetch = async (_url, init) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
      });
      const completionPromise = provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'Sys',
          userPrompt: 'User',
          abortSignal: abortController.signal,
        },
        SimpleSchema
      );

      setTimeout(() => abortController.abort(), 20);

      await expect(completionPromise).rejects.toThrow(ModelProviderError);
    });

    it('verifies exact HTTP request construction for OpenAI completions', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      const mockFetch: typeof fetch = async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"status":"verified_req","count":1}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-secret-key-xyz',
        endpointUrl: 'https://api.openai.com/v1',
        modelIdentifier: 'gpt-4o-2024-08-06',
        temperature: 0.2,
        fetchFn: mockFetch,
      });

      await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'System instructions here',
          userPrompt: 'User prompt here',
          maxTokens: 500,
        },
        SimpleSchema
      );

      expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
      expect(capturedInit?.method).toBe('POST');
      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-secret-key-xyz');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(String(capturedInit?.body));
      expect(body.model).toBe('gpt-4o-2024-08-06');
      expect(body.messages).toEqual([
        { role: 'system', content: 'System instructions here' },
        { role: 'user', content: 'User prompt here' },
      ]);
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.temperature).toBe(0.2);
      expect(body.max_completion_tokens).toBe(500);
      expect(body.reasoning_effort).toBe('none');
    });

    it('detects explicit refusal from OpenAI provider and throws ModelRefusalError', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "I'm sorry, but I cannot fulfill this request due to safety policies.",
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
      });
      await expect(
        provider.generateStructuredCompletion(
          { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
          SimpleSchema
        )
      ).rejects.toThrow(ModelRefusalError);
    });

    it('throws ModelProviderError when explicit model configuration is missing', () => {
      // Clear env vars temporarily to verify missing configuration rejection
      const origModelId = process.env.OPENAI_MODEL_ID;
      const origModelIdentifier = process.env.OPENAI_MODEL_IDENTIFIER;
      delete process.env.OPENAI_MODEL_ID;
      delete process.env.OPENAI_MODEL_IDENTIFIER;

      try {
        expect(() => new OpenAiLunaProvider({ apiKey: 'test-key' })).toThrowError(
          /OpenAI modelIdentifier is required/
        );
      } finally {
        if (origModelId) process.env.OPENAI_MODEL_ID = origModelId;
        if (origModelIdentifier) process.env.OPENAI_MODEL_IDENTIFIER = origModelIdentifier;
      }
    });

    it('ensures missing OpenAI configuration does not prevent local Ollama provider from working', () => {
      const origApiKey = process.env.OPENAI_API_KEY;
      const origModelId = process.env.OPENAI_MODEL_ID;
      const origModelIdentifier = process.env.OPENAI_MODEL_IDENTIFIER;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_MODEL_ID;
      delete process.env.OPENAI_MODEL_IDENTIFIER;

      try {
        // OllamaLocalModelProvider initializes and operates cleanly without any OpenAI config
        const localProvider = new OllamaLocalModelProvider({
          endpointUrl: 'http://localhost:11434',
          modelIdentifier: 'qwen2.5-coder:3b',
        });
        expect(localProvider.config.providerType).toBe('local_ollama');
        expect(localProvider.config.modelIdentifier).toBe('qwen2.5-coder:3b');
        expect(localProvider.config.endpointUrl).toBe('http://localhost:11434');

        // Meanwhile, OpenAiLunaProvider strictly requires model configuration and fails closed
        expect(() => new OpenAiLunaProvider()).toThrowError(/OpenAI modelIdentifier is required/);
      } finally {
        if (origApiKey) process.env.OPENAI_API_KEY = origApiKey;
        if (origModelId) process.env.OPENAI_MODEL_ID = origModelId;
        if (origModelIdentifier) process.env.OPENAI_MODEL_IDENTIFIER = origModelIdentifier;
      }
    });

    it('falls back to estimated usage when provider omits usage counts', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"status":"no_usage","count":0}' } }],
            // No usage field in response
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const provider = new OpenAiLunaProvider({
        apiKey: 'test-key',
        modelIdentifier: 'mock-model',
        fetchFn: mockFetch,
      });
      const res = await provider.generateStructuredCompletion(
        { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User' },
        SimpleSchema
      );

      expect(res.usage.usageSource).toBe('estimated');
      expect(res.usage.promptTokens).toBeGreaterThan(0);
      expect(res.usage.completionTokens).toBeGreaterThan(0);
      expect(res.usage.totalTokens).toBe(res.usage.promptTokens + res.usage.completionTokens);
    });
  });

  describe.runIf(process.env.RUN_LOCAL_MODELS === 'true')('Real Local Model Smoke Test (Harmless Query to Active Ollama)', () => {
    it('executes real inference against local qwen2.5-coder:3b', async () => {
      const StatusSchema = z.object({
        status: z.string(),
      });

      const provider = new OllamaLocalModelProvider({
        endpointUrl: 'http://localhost:11434',
        modelIdentifier: 'qwen2.5-coder:3b',
        timeoutMs: 120000,
      });

      const res = await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'You are a test assistant. Always output JSON matching the schema.',
          userPrompt: 'Output a JSON object with status set to "verified_local".',
        },
        StatusSchema
      );

      // Verify that real local inference was executed
      expect(res.data.status).toBe('verified_local');
      expect(res.usage.modelIdentifier).toBe('qwen2.5-coder:3b');
      expect(res.usage.isLocalInference).toBe(true);
      expect(res.usage.tokenCostUsd).toBe('0.0000');
      expect(res.usage.durationMs).toBeGreaterThan(0);
      expect(res.usage.totalTokens).toBeGreaterThan(0);
    }, 120000);

    it('executes real inference against local phi4-mini:latest', async () => {
      const StatusSchema = z.object({
        status: z.string(),
      });

      const provider = new OllamaLocalModelProvider({
        endpointUrl: 'http://localhost:11434',
        modelIdentifier: 'phi4-mini:latest',
        timeoutMs: 120000,
      });

      const res = await provider.generateStructuredCompletion(
        {
          roleId: 'AT-ROLE-001',
          systemPrompt: 'You are a test assistant. Always output JSON matching the schema.',
          userPrompt: 'Output a JSON object with status set to "verified_phi4".',
        },
        StatusSchema
      );

      expect(res.data.status).toBe('verified_phi4');
      expect(res.usage.modelIdentifier).toBe('phi4-mini:latest');
      expect(res.usage.isLocalInference).toBe(true);
      expect(res.usage.tokenCostUsd).toBe('0.0000');
      expect(res.usage.durationMs).toBeGreaterThan(0);
    }, 120000);
  });
});
