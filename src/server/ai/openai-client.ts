import { z } from 'zod';
import { getServerEnv } from '@/server/config/env';
import { ServiceUnavailableError } from '@/server/services/ports';
import { defaultBudgetManager, BudgetManager, BudgetReservationTicket, TokenUsageReport } from './budget-manager';

export interface OpenAiCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  budgetTicket?: BudgetReservationTicket;
  budgetManager?: BudgetManager;
}

export interface StructuredCompletionResult<T> {
  data: T;
  rawText: string;
  usage: TokenUsageReport;
  costUsd: number;
}

export class OpenAiClient {
  private apiKey?: string;
  private baseUrl: string;
  private allowedModelId: string;

  constructor(options?: { apiKey?: string; baseUrl?: string; modelId?: string }) {
    try {
      const env = getServerEnv();
      this.apiKey = options?.apiKey || env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      this.baseUrl = options?.baseUrl || env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      this.allowedModelId = options?.modelId || env.OPENAI_MODEL_ID || 'gpt-6-luna';
    } catch {
      this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
      this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
      this.allowedModelId = options?.modelId || 'gpt-6-luna';
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Invokes GPT-6 Luna via OpenAI Chat Completions API with structured output validation.
   * Enforces model constraint (strictly 'gpt-6-luna') and budget reservations.
   */
  public async generateStructuredCompletion<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    options?: OpenAiCompletionOptions;
  }): Promise<StructuredCompletionResult<T>> {
    const requestedModel = params.options?.model || this.allowedModelId;
    if (requestedModel !== 'gpt-6-luna') {
      throw new Error(`[OpenAiClient] Unauthorized model requested: '${requestedModel}'. TraceCase strictly enforces 'gpt-6-luna' (TC-INV-001).`);
    }

    if (!this.isConfigured()) {
      if (params.options?.budgetTicket) {
        (params.options.budgetManager || defaultBudgetManager).releaseReservation(
          params.options.budgetTicket.reservationId
        );
      }
      throw new ServiceUnavailableError(
        'OpenAI (gpt-6-luna)',
        'OPENAI_API_KEY environment variable is not configured on this host.'
      );
    }

    const budgetMgr = params.options?.budgetManager || defaultBudgetManager;
    const ticket = params.options?.budgetTicket;

    const requestBody = {
      model: 'gpt-6-luna',
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      temperature: params.options?.temperature ?? 0.1,
      response_format: { type: 'json_object' },
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err: unknown) {
      if (ticket) {
        budgetMgr.releaseReservation(ticket.reservationId);
      }
      throw new Error(`[OpenAiClient] Network failure calling OpenAI API: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
      if (ticket) {
        budgetMgr.releaseReservation(ticket.reservationId);
      }
      const errorText = await response.text().catch(() => '');
      throw new Error(`[OpenAiClient] OpenAI API returned HTTP ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const json = await response.json();
    const rawContent = json?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string') {
      if (ticket) {
        budgetMgr.releaseReservation(ticket.reservationId);
      }
      throw new Error('[OpenAiClient] Empty or malformed choice payload returned from OpenAI.');
    }

    const usage: TokenUsageReport = {
      promptTokens: json?.usage?.prompt_tokens ?? 0,
      completionTokens: json?.usage?.completion_tokens ?? 0,
    };

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch (err: unknown) {
      if (ticket) {
        budgetMgr.releaseReservation(ticket.reservationId);
      }
      throw new Error(`[OpenAiClient] Failed to parse model output as JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    const parseResult = params.schema.safeParse(parsedJson);
    if (!parseResult.success) {
      if (ticket) {
        budgetMgr.releaseReservation(ticket.reservationId);
      }
      throw new Error(
        `[OpenAiClient] Model output violated schema constraints: ${parseResult.error.message}`
      );
    }

    let costUsd = 0;
    if (ticket) {
      costUsd = await budgetMgr.commitUsage(ticket, usage);
    } else {
      costUsd = budgetMgr.calculateCost(usage);
    }

    return {
      data: parseResult.data,
      rawText: rawContent,
      usage,
      costUsd,
    };
  }
}

export const defaultOpenAiClient = new OpenAiClient();
