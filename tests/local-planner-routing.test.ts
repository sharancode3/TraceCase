import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ReportExperimentAgent } from '@/server/ai/planner';
import { zodToJsonSchemaObject, type ModelProviderPort } from '@/server/ai/provider';
import type { ReportAgentInput } from '@/server/ai/contracts';

const input: ReportAgentInput = {
  contractVersion: '1.0.0', investigationId: '81b96e8a-12eb-4afb-8e66-9428e38e0deb',
  targetProfile: { name: 'Local test', baseUrl: 'http://localhost:3005', allowedOrigins: ['http://localhost:3005'], isSandbox: true, hasResetFixture: true },
  rawReport: { title: 'Unclear task issue', description: 'Something goes wrong in the task list.' }, clarificationHistory: [],
};

describe('Local planner branch routing', () => {
  it('keeps local clarification selection, constrains generation, and accounts for both calls', async () => {
    const usage = { correlationId: input.investigationId, providerType: 'local_ollama' as const, modelIdentifier: 'qwen3:4b-instruct-2507-q4_K_M', promptTokens: 10, completionTokens: 5, totalTokens: 15, tokenCostUsd: '0.0000', durationMs: 20, retriesAttempted: 0, isLocalInference: true };
    const output = { variant: 'NEEDS_CLARIFICATION', extractedClaim: { summary: 'Unclear task issue', affectedFeature: 'Task list', missingFacts: ['Expected behavior'] }, questions: [{ questionId: 'q_expected', questionText: 'What should happen?', whyItMatters: 'Define the expected behavior', options: ['Task remains', 'Task is removed'], blocksExecution: true }] };
    const generate = vi.fn().mockResolvedValueOnce({ data: { variant: 'NEEDS_CLARIFICATION', reason: 'Expected behavior is missing' }, usage }).mockResolvedValueOnce({ data: output, usage });
    const provider = { config: { ...usage, endpointUrl: 'http://localhost:11434', timeoutMs: 45000, temperature: 0, maxRetries: 0 }, generateStructuredCompletion: generate } as unknown as ModelProviderPort;
    const result = await new ReportExperimentAgent(provider).evaluateReport(input);
    expect(result.output.variant).toBe('NEEDS_CLARIFICATION');
    expect(result.usage.totalTokens).toBe(30);
    expect(generate).toHaveBeenCalledTimes(2);
    const generationSchema = generate.mock.calls[1][1];
    expect(generationSchema.safeParse(output).success).toBe(true);
    expect(generationSchema.safeParse({ variant: 'SCOPE_CONFLICT' }).success).toBe(false);
  });

  it('preserves defaulted and refined fields in the local JSON output grammar', () => {
    const converted = zodToJsonSchemaObject(z.object({
      revision: z.number().int().positive().default(1),
      role: z.string().default('test_user'),
      code: z.string().refine((s) => s.length > 0),
    }));
    expect(converted).toMatchObject({ properties: { revision: { type: 'number' }, role: { type: 'string' }, code: { type: 'string' } } });
  });
});
