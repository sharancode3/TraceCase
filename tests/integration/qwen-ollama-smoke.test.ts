import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import { OllamaLocalModelProvider } from '@/server/ai/provider';
import { BrowserActionProposalSchema } from '@/contracts/ai';

/**
 * ============================================================================
 * QWEN LOCAL OLLAMA INFERENCE SMOKE SUITE (SECTION 6 & 7)
 * ============================================================================
 *
 * Verifies that:
 * 1. OllamaLocalModelProvider selects qwen3:4b-instruct-2507-q4_K_M.
 * 2. Inference produces schema-compliant structured output using JSON Schema constraints.
 * 3. Token usage is tracked ($0.0000 USD, provider reported/estimated tokens).
 * 4. Model output conforms to requested Zod schema contracts without truncation.
 */

describe('Qwen Local Model Provider Smoke Suite (Section 6 & 7)', () => {
  let isOllamaReachable = false;
  const endpoint = 'http://127.0.0.1:11434';
  const modelTag = 'qwen3:4b-instruct-2507-q4_K_M';

  beforeAll(async () => {
    try {
      const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const json = (await res.json()) as { models?: Array<{ name?: string }> };
        isOllamaReachable = json.models?.some((m) => m.name === modelTag) ?? false;
      }
    } catch {
      isOllamaReachable = false;
    }
  });

  it('initializes OllamaLocalModelProvider with qwen3:4b-instruct-2507-q4_K_M by default', () => {
    const provider = new OllamaLocalModelProvider();
    expect(provider.config.providerType).toBe('local_ollama');
    expect(provider.config.modelIdentifier).toBe('qwen3:4b-instruct-2507-q4_K_M');
    expect(provider.config.endpointUrl).toContain('11434');
  });

  it('generates structured schema-constrained completion with real local Qwen model', async () => {
    if (!isOllamaReachable) {
      console.warn(`[Skip] Local Ollama with model '${modelTag}' not reachable at ${endpoint}.`);
      return;
    }

    const provider = new OllamaLocalModelProvider({
      modelIdentifier: 'qwen3:4b-instruct-2507-q4_K_M',
      timeoutMs: 30000,
    });

    const SimpleContractSchema = z.object({
      action: z.enum(['NAVIGATE', 'CLICK', 'FILL']),
      targetDescription: z.string().min(1),
      confidenceScore: z.number().min(0).max(1),
    });

    const response = await provider.generateStructuredCompletion(
      {
        roleId: 'AT-ROLE-002',
        systemPrompt: 'You are an autonomous browser agent. Respond with valid JSON adhering strictly to the schema.',
        userPrompt: 'The user wants to click on the "Submit Report" button on the webpage.',
        maxTokens: 256,
      },
      SimpleContractSchema
    );

    expect(response).toBeDefined();
    expect(response.data).toBeDefined();
    expect(['NAVIGATE', 'CLICK', 'FILL']).toContain(response.data.action);
    expect(typeof response.data.targetDescription).toBe('string');
    expect(response.data.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(response.data.confidenceScore).toBeLessThanOrEqual(1);

    // Verify usage accounting invariants (zero cost, local inference)
    expect(response.usage.providerType).toBe('local_ollama');
    expect(response.usage.modelIdentifier).toBe(modelTag);
    expect(response.usage.tokenCostUsd).toBe('0.0000');
    expect(response.usage.isLocalInference).toBe(true);
    expect(response.usage.totalTokens).toBeGreaterThan(0);
  }, 45000);
});
