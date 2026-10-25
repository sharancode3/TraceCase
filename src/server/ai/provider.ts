import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { stripModelAuthorityFields } from './contracts';

/**
 * ============================================================================
 * TRACECASE PERSON 2: AI PROVIDER INTERFACE & LOCAL MODEL ADAPTER (P2-03)
 * ============================================================================
 * 
 * Supports local development models explicitly authorized by user:
 * - phi4-mini:latest
 * - qwen2.5-coder:3b
 * via local Ollama runtime on http://localhost:11434.
 * 
 * STRICT BOUNDARIES & INVARIANTS PRESERVED:
 * 1. Provider independence: Clean interface ready for OpenAI GPT-6 Luna integration.
 * 2. Zero paid calls during local development phase ($0.0000 cost reported).
 * 3. Never silently fallback between models.
 * 4. Models propose; trusted server code authorizes and validates schemas.
 * 5. Response content is treated as untrusted data; never execute returned code.
 */

export type SupportedLocalModel = 'phi4-mini:latest' | 'qwen2.5-coder:3b' | 'qwen3:4b-instruct-2507-q4_K_M';

export interface ModelProviderConfig {
  providerType: 'local_ollama' | 'openai_luna' | 'mock_test_double';
  endpointUrl: string;
  modelIdentifier: string;
  timeoutMs: number;
  temperature: number;
  maxRetries: number;
}

export interface ModelCompletionRequest {
  correlationId?: string;
  roleId: 'AT-ROLE-001' | 'AT-ROLE-002' | 'AT-ROLE-003';
  promptVersion?: string;
  schemaVersion?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface AiUsageReport {
  correlationId: string;
  providerType: 'local_ollama' | 'openai_luna' | 'mock_test_double';
  modelIdentifier: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokenCostUsd: string; // '0.0000' for local models
  durationMs: number;
  retriesAttempted: number;
  isLocalInference: boolean;
  usageSource?: 'provider_reported' | 'estimated' | 'absent' | 'fallback_no_call';
  isFallback?: boolean;
}

export interface ModelCompletionResponse<T> {
  data: T;
  rawText: string;
  parsedJson: unknown;
  usage: AiUsageReport;
}

// ============================================================================
// TYPED ERROR ENVELOPES
// ============================================================================
// TOKEN LIMITS & VALIDATION CAP
// ============================================================================

export const MAX_OUTPUT_TOKENS = 2048;

/**
 * Validates requested maxTokens against the hard cap (2048).
 * Rejects oversized (>2048) or invalid (<=0, non-integer, NaN) requests.
 */
export function validateMaxTokens(maxTokens: number | undefined, correlationId?: string): number {
  if (maxTokens === undefined) {
    return MAX_OUTPUT_TOKENS;
  }
  if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || isNaN(maxTokens) || maxTokens <= 0) {
    throw new ModelProviderError(
      'INVALID_TOKEN_LIMIT',
      `Requested maxTokens (${maxTokens}) must be a positive integer <= ${MAX_OUTPUT_TOKENS}.`,
      false,
      correlationId,
      'INVALID_REQUEST'
    );
  }
  if (maxTokens > MAX_OUTPUT_TOKENS) {
    throw new ModelProviderError(
      'MAX_TOKENS_EXCEEDED',
      `Requested maxTokens (${maxTokens}) exceeds enforced maximum output token cap of ${MAX_OUTPUT_TOKENS}.`,
      false,
      correlationId,
      'INVALID_REQUEST'
    );
  }
  return maxTokens;
}

// ============================================================================
// TYPED SAFE ERROR ENVELOPES & CATEGORIES
// ============================================================================

export type ProviderErrorCategory =
  | 'AUTHENTICATION'
  | 'PERMISSION'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'CONNECTION'
  | 'SCHEMA_VIOLATION'
  | 'INVALID_JSON'
  | 'PROVIDER_ERROR'
  | 'TRUNCATION'
  | 'REFUSAL'
  | 'INVALID_REQUEST'
  | 'CANCELLED'
  | 'UNKNOWN';

export class ModelProviderError extends Error {
  public readonly code: string;
  public readonly isRetryable: boolean;
  public readonly correlationId?: string;
  public readonly category: ProviderErrorCategory;
  public usage?: AiUsageReport;

  constructor(
    code: string,
    message: string,
    isRetryable: boolean = false,
    correlationId?: string,
    category: ProviderErrorCategory = 'UNKNOWN'
  ) {
    const prefix = correlationId
      ? `[TraceCase AI Provider] [correlationId: ${correlationId}] ${code}: ${message}`
      : `[TraceCase AI Provider] ${code}: ${message}`;
    super(prefix);
    this.name = 'ModelProviderError';
    this.code = code;
    this.isRetryable = isRetryable;
    this.correlationId = correlationId;
    this.category = category;
  }
}

export class ModelTimeoutError extends ModelProviderError {
  constructor(timeoutMs: number, correlationId?: string) {
    super(
      'MODEL_TIMEOUT',
      `Inference request exceeded timeout of ${timeoutMs}ms.`,
      true,
      correlationId,
      'TIMEOUT'
    );
  }
}

export class ModelConnectionError extends ModelProviderError {
  constructor(endpoint: string, correlationId?: string) {
    super(
      'MODEL_CONNECTION_FAILED',
      `Failed to connect to model endpoint at ${endpoint}.`,
      true,
      correlationId,
      'CONNECTION'
    );
  }
}

export class ModelSchemaValidationError extends ModelProviderError {
  public readonly zodErrors: z.ZodError;
  public readonly usage?: AiUsageReport;
  constructor(zodErrors: z.ZodError, correlationId?: string, usage?: AiUsageReport) {
    super(
      'MODEL_SCHEMA_VIOLATION',
      `Model completion failed schema validation: ${zodErrors.message}`,
      false,
      correlationId,
      'SCHEMA_VIOLATION'
    );
    this.zodErrors = zodErrors;
    this.usage = usage;
  }
}

export class ModelRefusalError extends ModelProviderError {
  constructor(reason?: string, correlationId?: string) {
    super(
      'MODEL_REFUSAL',
      'Model refused to complete the structured output request.',
      false,
      correlationId,
      'REFUSAL'
    );
  }
}

export class ModelTruncationError extends ModelProviderError {
  constructor(length?: number, correlationId?: string) {
    super(
      'MODEL_TRUNCATED',
      'Model output was truncated before completion by token length limit.',
      true,
      correlationId,
      'TRUNCATION'
    );
  }
}

/**
 * Maps HTTP status codes to safe error envelopes without echoing raw upstream body text.
 */
export function getSafeHttpError(
  status: number

): { code: string; message: string; isRetryable: boolean; category: ProviderErrorCategory } {
  if (status === 401) {
    return {
      code: 'HTTP_401',
      message: 'Provider authentication failed. Check credentials in server environment.',
      isRetryable: false,
      category: 'AUTHENTICATION',
    };
  }
  if (status === 403) {
    return {
      code: 'HTTP_403',
      message: 'Provider permission denied for requested resource or model.',
      isRetryable: false,
      category: 'PERMISSION',
    };
  }
  if (status === 404) {
    return {
      code: 'HTTP_404',
      message: 'Requested model or endpoint not found on provider.',
      isRetryable: false,
      category: 'INVALID_REQUEST',
    };
  }
  if (status === 429) {
    return {
      code: 'HTTP_429',
      message: 'Provider rate limit or quota exceeded.',
      isRetryable: true,
      category: 'RATE_LIMIT',
    };
  }
  if (status >= 500 && status < 600) {
    return {
      code: `HTTP_${status}`,
      message: `Provider service returned internal server error HTTP ${status}.`,
      isRetryable: true,
      category: 'PROVIDER_ERROR',
    };
  }
  return {
    code: `HTTP_${status}`,
    message: `Provider request failed with HTTP ${status}.`,
    isRetryable: false,
    category: 'PROVIDER_ERROR',
  };
}

// ============================================================================
// RESPONSE SANITIZATION & MARKDOWN CODE FENCE STRIPPER
// ============================================================================

/**
 * Safely extracts raw JSON string from model response, stripping any surrounding
 * markdown code blocks (```json ... ```) while preserving JSON integrity.
 */
export function extractJsonFromResponse(rawText: string, correlationId?: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new ModelProviderError(
      'EMPTY_RESPONSE',
      'Model returned an empty response.',
      false,
      correlationId,
      'INVALID_REQUEST'
    );
  }

  // Check for explicit refusal indicators - zero raw model snippet leakage
  if (
    trimmed.startsWith('I cannot') ||
    trimmed.startsWith('I am unable to') ||
    trimmed.startsWith("I'm sorry, but I cannot")
  ) {
    throw new ModelRefusalError(undefined, correlationId);
  }

  // Strip code fences: ```json ... ``` or ``` ... ```
  let clean = trimmed;
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  // Find first { or [ if model emitted leading conversational prose
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let startIndex = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIndex = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
  }

  if (startIndex > 0) {
    clean = clean.slice(startIndex).trim();
  }

  return clean;
}

/**
 * Normalizes minor model formatting variances (casing, trimming, string-to-number coercion,
 * and structural key aliases) strictly without fabricating missing semantic content.
 * Missing semantic facts, steps, claims, or assertions must fail schema validation.
 */
export function normalizeLocalModelOutput(parsedRaw: unknown): unknown {
  if (typeof parsedRaw !== 'object' || parsedRaw === null) {
    return parsedRaw;
  }

  const rawObj = { ...(parsedRaw as Record<string, unknown>) };

  // 1. Casing normalization for variant discriminant if present as string
  if (typeof rawObj.variant === 'string') {
    rawObj.variant = rawObj.variant.trim().toUpperCase();
  }

  // 2. Formatting normalization for PLAN_PROPOSED
  if (rawObj.variant === 'PLAN_PROPOSED' && rawObj.experimentPlan && typeof rawObj.experimentPlan === 'object') {
    const plan = { ...(rawObj.experimentPlan as Record<string, unknown>) };

    // Support alias: actions -> steps if steps not provided
    if (plan.steps !== undefined && plan.actions !== undefined) {
      if (JSON.stringify(plan.steps) !== JSON.stringify(plan.actions)) {
        throw new ModelProviderError(
          'CONFLICTING_ALIASES',
          "Conflicting canonical 'steps' and alias 'actions' both provided with different values."
        );
      }
    } else if (plan.steps === undefined && Array.isArray(plan.actions)) {
      plan.steps = plan.actions;
      delete plan.actions;
    }

    if (Array.isArray(plan.steps)) {
      plan.steps = (plan.steps as unknown[]).map((step) => {
        if (!step || typeof step !== 'object') return step;
        const normStep = { ...(step as Record<string, unknown>) };
        if (typeof normStep.stepNumber === 'string') {
          const trimmed = normStep.stepNumber.trim();
          if (/^\d+$/.test(trimmed)) {
            normStep.stepNumber = Number(trimmed);
          }
        }
        if (typeof normStep.actionType === 'string') {
          const act = normStep.actionType.trim().toUpperCase();
          if (act === 'SET_INPUT' || act === 'TYPE' || act === 'INPUT' || act === 'FILL_INPUT' || act === 'PRESS_KEY' || act === 'KEY_PRESS') {
            normStep.actionType = 'FILL';
          } else if (act === 'CLICK_BUTTON' || act === 'CLICK_LINK' || act === 'PRESS') {
            normStep.actionType = 'CLICK';
          } else if (act === 'GOTO' || act === 'OPEN') {
            normStep.actionType = 'NAVIGATE';
          } else if (act === 'SELECT_OPTION') {
            normStep.actionType = 'SELECT';
          } else if (act === 'WAIT' || act === 'WAIT_FOR') {
            normStep.actionType = 'WAIT_FOR_SELECTOR';
          } else {
            normStep.actionType = act;
          }
        }
        return normStep;
      });
    }

    // Support aliases: failureAssertions / failure_assertions / reported_failure_assertions -> reportedFailureAssertions
    const failureAliases = [
      { key: 'failureAssertions', val: plan.failureAssertions },
      { key: 'failure_assertions', val: plan.failure_assertions },
      { key: 'reported_failure_assertions', val: plan.reported_failure_assertions },
    ];
    for (const alias of failureAliases) {
      if (alias.val !== undefined) {
        if (plan.reportedFailureAssertions !== undefined) {
          if (JSON.stringify(plan.reportedFailureAssertions) !== JSON.stringify(alias.val)) {
            throw new ModelProviderError(
              'CONFLICTING_ALIASES',
              `Conflicting canonical 'reportedFailureAssertions' and alias '${alias.key}' both provided with different values.`
            );
          }
        } else {
          plan.reportedFailureAssertions = alias.val;
        }
        delete plan[alias.key];
      }
    }

    // Support aliases: correct_behavior_assertions / correctAssertions -> correctBehaviorAssertions
    const correctAliases = [
      { key: 'correct_behavior_assertions', val: plan.correct_behavior_assertions },
      { key: 'correctAssertions', val: plan.correctAssertions },
    ];
    for (const alias of correctAliases) {
      if (alias.val !== undefined) {
        if (plan.correctBehaviorAssertions !== undefined) {
          if (JSON.stringify(plan.correctBehaviorAssertions) !== JSON.stringify(alias.val)) {
            throw new ModelProviderError(
              'CONFLICTING_ALIASES',
              `Conflicting canonical 'correctBehaviorAssertions' and alias '${alias.key}' both provided with different values.`
            );
          }
        } else {
          plan.correctBehaviorAssertions = alias.val;
        }
        delete plan[alias.key];
      }
    }

    const formatAssertion = (a: unknown) => {
      if (!a || typeof a !== 'object') return a;
      const rec = { ...(a as Record<string, unknown>) };
      if (rec.expected_condition !== undefined && rec.expectedCondition !== undefined) {
        if (String(rec.expected_condition).trim().toUpperCase() !== String(rec.expectedCondition).trim().toUpperCase()) {
          throw new ModelProviderError(
            'CONFLICTING_ALIASES',
            'Conflicting canonical expectedCondition and expected_condition values.'
          );
        }
      } else if (rec.expected_condition && !rec.expectedCondition) {
        rec.expectedCondition = rec.expected_condition;
        delete rec.expected_condition;
      }

      if (rec.expected_value !== undefined && rec.expectedValue !== undefined) {
        if (rec.expected_value !== rec.expectedValue) {
          throw new ModelProviderError(
            'CONFLICTING_ALIASES',
            'Conflicting canonical expectedValue and expected_value values.'
          );
        }
      } else if (rec.expected_value !== undefined && rec.expectedValue === undefined) {
        rec.expectedValue = rec.expected_value;
        delete rec.expected_value;
      }

      if (rec.predicate_id !== undefined && rec.predicateId !== undefined) {
        if (String(rec.predicate_id).trim() !== String(rec.predicateId).trim()) {
          throw new ModelProviderError(
            'CONFLICTING_ALIASES',
            'Conflicting canonical predicateId and predicate_id values.'
          );
        }
      } else if (rec.predicate_id && !rec.predicateId) {
        rec.predicateId = rec.predicate_id;
        delete rec.predicate_id;
      }

      if (rec.assertion_type !== undefined && rec.assertionType !== undefined) {
        if (String(rec.assertion_type).trim().toUpperCase() !== String(rec.assertionType).trim().toUpperCase()) {
          throw new ModelProviderError(
            'CONFLICTING_ALIASES',
            'Conflicting canonical assertionType and assertion_type values.'
          );
        }
      } else if (rec.assertion_type && !rec.assertionType) {
        rec.assertionType = rec.assertion_type;
        delete rec.assertion_type;
      }

      if (typeof rec.expectedCondition === 'string') {
        rec.expectedCondition = rec.expectedCondition.trim().toUpperCase();
      }
      if (typeof rec.target === 'string') {
        rec.target = rec.target.trim().toUpperCase();
      }
      if (typeof rec.predicateId === 'string') {
        let pid = rec.predicateId.trim().toLowerCase();
        if (!pid.startsWith('assert_')) {
          pid = `assert_${pid.replace(/[^a-z0-9_]/g, '_')}`;
        }
        rec.predicateId = pid;
      }
      return rec;
    };

    if (Array.isArray(plan.correctBehaviorAssertions)) {
      plan.correctBehaviorAssertions = plan.correctBehaviorAssertions.map(formatAssertion);
    }
    if (Array.isArray(plan.reportedFailureAssertions)) {
      plan.reportedFailureAssertions = plan.reportedFailureAssertions.map(formatAssertion);
    }

    rawObj.experimentPlan = plan;
  }

  // 3. Formatting normalization for NEEDS_CLARIFICATION
  if (rawObj.variant === 'NEEDS_CLARIFICATION' && Array.isArray(rawObj.questions)) {
    rawObj.questions = (rawObj.questions as unknown[]).map((q) => {
      if (!q || typeof q !== 'object') return q;
      const nq = { ...(q as Record<string, unknown>) };
      if (typeof nq.questionId === 'string' && !nq.questionId.startsWith('q_')) {
        nq.questionId = `q_${nq.questionId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      }
      return nq;
    });
  }

  // 4. Formatting normalization for PROPOSE_ACTION
  if (rawObj.variant === 'PROPOSE_ACTION') {
    if (typeof rawObj.echoedStepNumber === 'string') {
      const trimmed = rawObj.echoedStepNumber.trim();
      if (/^\d+$/.test(trimmed)) {
        rawObj.echoedStepNumber = Number(trimmed);
      }
    }
    if (rawObj.action && typeof rawObj.action === 'object') {
      const act = { ...(rawObj.action as Record<string, unknown>) };
      if (typeof act.actionType === 'string') {
        const a = act.actionType.trim().toUpperCase();
        if (a === 'SET_INPUT' || a === 'TYPE' || a === 'INPUT' || a === 'FILL_INPUT' || a === 'PRESS_KEY' || a === 'KEY_PRESS') {
          act.actionType = 'FILL';
        } else if (a === 'CLICK_BUTTON' || a === 'CLICK_LINK' || a === 'PRESS') {
          act.actionType = 'CLICK';
        } else if (a === 'GOTO' || a === 'OPEN') {
          act.actionType = 'NAVIGATE';
        } else if (a === 'SELECT_OPTION') {
          act.actionType = 'SELECT';
        } else if (a === 'WAIT' || a === 'WAIT_FOR') {
          act.actionType = 'WAIT_FOR_SELECTOR';
        } else {
          act.actionType = a;
        }
      }
      rawObj.action = act;
    }
  }

  // 5. Formatting normalization for REPORT_SYNTHESIZED
  if (rawObj.variant === 'REPORT_SYNTHESIZED') {
    if (typeof rawObj.observedReproductionVerdict === 'string') {
      rawObj.observedReproductionVerdict = rawObj.observedReproductionVerdict.trim().toUpperCase();
    }
    if (rawObj.diagnosticHypothesis && typeof rawObj.diagnosticHypothesis === 'object') {
      // Invariant TC-INV-008: Model hypotheses are NEVER verified facts
      (rawObj.diagnosticHypothesis as Record<string, unknown>).isVerifiedFact = false;
    }
    if (Array.isArray(rawObj.evidenceCitations)) {
      rawObj.evidenceCitations = (rawObj.evidenceCitations as unknown[]).filter((c) => {
        if (!c || typeof c !== 'object') return false;
        const rec = c as Record<string, unknown>;
        const allowedTypes = ['VIDEO', 'CONSOLE_LOG', 'NETWORK_LOG'];
        if (!allowedTypes.includes(String(rec.artifactType))) return false;
        if (typeof rec.safeUrl !== 'string' || !rec.safeUrl.trim()) return false;
        try {
          new URL(rec.safeUrl);
          return true;
        } catch {
          return false;
        }
      });
    }
  }

  return rawObj;
}

// ============================================================================
// PROVIDER PORT INTERFACE
// ============================================================================

export interface ModelProviderPort {
  readonly config: ModelProviderConfig;
  generateStructuredCompletion<T>(
    request: ModelCompletionRequest,
    outputSchema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<ModelCompletionResponse<T>>;
}

// ============================================================================
// LOCAL OLLAMA MODEL PROVIDER
// ============================================================================


/**
 * Lightweight Zod-to-JSON-Schema converter for schema-constrained local inference.
 * Converts standard Zod objects, primitives, enums, literals, and unions to a JSON schema object
 * compatible with Ollama's format parameter.
 */
export function zodToJsonSchemaObject(schema: z.ZodTypeAny): Record<string, unknown> | null {
  try {
    const def = schema._def;
    if (def.typeName === 'ZodObject') {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, propSchema] of Object.entries(shape)) {
        const propJson = zodToJsonSchemaObject(propSchema as z.ZodTypeAny);
        if (propJson) {
          properties[key] = propJson;
        }
        if ((propSchema as z.ZodTypeAny)._def.typeName !== 'ZodOptional') {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }

    if (def.typeName === 'ZodString') {
      return { type: 'string' };
    }

    if (def.typeName === 'ZodNumber') {
      return { type: 'number' };
    }

    if (def.typeName === 'ZodBoolean') {
      return { type: 'boolean' };
    }

    if (def.typeName === 'ZodEnum') {
      return { type: 'string', enum: def.values };
    }

    if (def.typeName === 'ZodLiteral') {
      return { type: typeof def.value, enum: [def.value] };
    }

    if (def.typeName === 'ZodArray') {
      const itemSchema = zodToJsonSchemaObject(def.type);
      return {
        type: 'array',
        ...(itemSchema ? { items: itemSchema } : {}),
      };
    }

    if (def.typeName === 'ZodOptional') {
      return zodToJsonSchemaObject(def.innerType);
    }

    if (def.typeName === 'ZodDefault') {
      return zodToJsonSchemaObject(def.innerType);
    }

    if (def.typeName === 'ZodEffects') {
      return zodToJsonSchemaObject(def.schema);
    }

    if (def.typeName === 'ZodNullable') {
      return zodToJsonSchemaObject(def.innerType);
    }

    if (def.typeName === 'ZodDiscriminatedUnion' || def.typeName === 'ZodUnion') {
      const options = (def.options || def.optionsMap ? Array.from((def.options || def.optionsMap).values()) : []) as z.ZodTypeAny[];
      const anyOf = options.map((opt) => zodToJsonSchemaObject(opt)).filter(Boolean);
      if (anyOf.length > 0) {
        return { anyOf };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export class OllamaLocalModelProvider implements ModelProviderPort {
  public readonly config: ModelProviderConfig;
  private readonly customFetch?: typeof fetch;

  constructor(options?: {
    endpointUrl?: string;
    modelIdentifier?: SupportedLocalModel;
    timeoutMs?: number;
    temperature?: number;
    maxRetries?: number;
    fetchFn?: typeof fetch;
  }) {
    this.customFetch = options?.fetchFn;
    this.config = {
      providerType: 'local_ollama',
      endpointUrl: options?.endpointUrl || process.env.LOCAL_AI_ENDPOINT || 'http://localhost:11434',
      modelIdentifier:
        options?.modelIdentifier ||
        (process.env.LOCAL_AI_MODEL as SupportedLocalModel) ||
        'qwen3:4b-instruct-2507-q4_K_M',
      timeoutMs: options?.timeoutMs || 45000,
      temperature: options?.temperature ?? 0.1,
      maxRetries: options?.maxRetries ?? 1,
    };
  }

  public async generateStructuredCompletion<T>(
    request: ModelCompletionRequest,
    outputSchema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<ModelCompletionResponse<T>> {
    const correlationId = request.correlationId || randomUUID();
    const validatedMaxTokens = validateMaxTokens(request.maxTokens, correlationId);

    if (process.env.NODE_ENV === 'production') {
      throw new ModelProviderError(
        'LOCAL_MODEL_FORBIDDEN',
        'Local models (Ollama) are strictly forbidden in production. Production requires OpenAI gpt-6-luna (TC-INV-001).',
        false,
        correlationId,
        'PERMISSION'
      );
    }
    if (request.abortSignal?.aborted) {
      throw new ModelProviderError(
        'CANCELLED',
        'Inference cancelled by caller AbortSignal before dispatch.',
        false,
        correlationId,
        'CANCELLED'
      );
    }

    const startTime = Date.now();
    let retriesAttempted = 0;
    const fetchToUse = this.customFetch || fetch;

    while (true) {
      const abortController = new AbortController();
      const abortListener = () => abortController.abort();

      // Coordinate cancellation from caller abortSignal or local timeout
      if (request.abortSignal) {
        request.abortSignal.addEventListener('abort', abortListener, { once: true });
      }

      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, this.config.timeoutMs);

      try {
        const endpoint = `${this.config.endpointUrl.replace(/\/$/, '')}/api/chat`;

        const response = await fetchToUse(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            model: this.config.modelIdentifier,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            format: zodToJsonSchemaObject(outputSchema) || 'json',
            stream: false,
            options: {
              temperature: request.temperature ?? this.config.temperature,
              num_predict: validatedMaxTokens,
            },
          }),
        });

        if (!response.ok) {
          await response.text().catch(() => ''); // Consume stream safely without echoing raw snippets
          const safeErr = getSafeHttpError(response.status);
          throw new ModelProviderError(
            safeErr.code,
            safeErr.message,
            safeErr.isRetryable,
            correlationId,
            safeErr.category
          );
        }

        const body = (await response.json()) as {
          message?: { content?: string };
          response?: string;
          prompt_eval_count?: number;
          eval_count?: number;
          done_reason?: string;
        };

        const rawText = body.message?.content ?? body.response ?? '';
        if (body.done_reason === 'length') {
          throw new ModelTruncationError(rawText.length, correlationId);
        }

        const cleanJsonStr = extractJsonFromResponse(rawText, correlationId);

        let parsedRaw: unknown;
        try {
          parsedRaw = JSON.parse(cleanJsonStr);
        } catch {
          throw new ModelProviderError(
            'INVALID_JSON',
            'Model output could not be parsed as valid JSON.',
            false,
            correlationId,
            'INVALID_JSON'
          );
        }

        // Strip any model-injected authority fields
        if (typeof parsedRaw === 'object' && parsedRaw !== null) {
          parsedRaw = stripModelAuthorityFields(parsedRaw as Record<string, unknown>);
          parsedRaw = normalizeLocalModelOutput(parsedRaw);
        }

        // Strictly validate against requested Zod schema with bounded schema-feedback retry
        let parseResult = outputSchema.safeParse(parsedRaw);
        if (!parseResult.success && retriesAttempted < 1) {
          retriesAttempted++;
          const repairErrors = parseResult.error.errors
            .map((e) => `${e.path.join('.') || 'root'}: ${e.message}`)
            .join('; ');

          try {
            const repairRes = await fetchToUse(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: abortController.signal,
              body: JSON.stringify({
                model: this.config.modelIdentifier,
                messages: [
                  { role: 'system', content: request.systemPrompt },
                  { role: 'user', content: request.userPrompt },
                  { role: 'assistant', content: rawText },
                  {
                    role: 'user',
                    content: `Your previous response failed validation: ${repairErrors}. Output corrected JSON adhering strictly to the schema.`,
                  },
                ],
                format: zodToJsonSchemaObject(outputSchema) || 'json',
                stream: false,
                options: {
                  temperature: 0.1,
                  num_predict: validatedMaxTokens,
                },
              }),
            });

            if (repairRes.ok) {
              const repairBody = (await repairRes.json()) as { message?: { content?: string }; response?: string };
              const repairText = repairBody.message?.content ?? repairBody.response ?? '';
              const repairJsonStr = extractJsonFromResponse(repairText, correlationId);
              let repairParsed = JSON.parse(repairJsonStr);
              if (typeof repairParsed === 'object' && repairParsed !== null) {
                repairParsed = stripModelAuthorityFields(repairParsed as Record<string, unknown>);
                repairParsed = normalizeLocalModelOutput(repairParsed);
              }
              const secondParse = outputSchema.safeParse(repairParsed);
              if (secondParse.success) {
                parsedRaw = repairParsed;
                parseResult = secondParse;
              }
            }
          } catch {
            // Fall through to initial validation failure
          }
        }

        if (!parseResult.success) {
          throw new ModelSchemaValidationError(parseResult.error, correlationId);
        }

        const durationMs = Date.now() - startTime;
        const hasProviderCounts = body.prompt_eval_count !== undefined && body.eval_count !== undefined;
        const promptTokens = body.prompt_eval_count ?? Math.ceil((request.systemPrompt.length + request.userPrompt.length) / 4);
        const completionTokens = body.eval_count ?? Math.ceil(cleanJsonStr.length / 4);

        const usage: AiUsageReport = {
          correlationId,
          providerType: 'local_ollama',
          modelIdentifier: this.config.modelIdentifier,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          tokenCostUsd: '0.0000', // Local inference incurs zero paid API billing
          durationMs,
          retriesAttempted,
          isLocalInference: true,
          usageSource: hasProviderCounts ? 'provider_reported' : 'estimated',
          isFallback: false,
        };

        return {
          data: parseResult.data,
          rawText,
          parsedJson: parsedRaw,
          usage,
        };
      } catch (err: unknown) {
        if (request.abortSignal?.aborted) {
          throw new ModelProviderError(
            'CANCELLED',
            'Inference cancelled by caller AbortSignal.',
            false,
            correlationId,
            'CANCELLED'
          );
        }

        let providerError: ModelProviderError;
        if (err instanceof ModelProviderError) {
          providerError = err;
        } else if (err instanceof Error && err.name === 'AbortError') {
          providerError = new ModelTimeoutError(this.config.timeoutMs, correlationId);
        } else {
          providerError = new ModelConnectionError(this.config.endpointUrl, correlationId);
        }

        // Determine if bounded retry is permitted
        if (providerError.isRetryable && retriesAttempted < this.config.maxRetries) {
          retriesAttempted++;
          continue;
        }

        throw providerError;
      } finally {
        if (request.abortSignal) {
          request.abortSignal.removeEventListener('abort', abortListener);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }
  }
}

// ============================================================================
// DETERMINISTIC TEST DOUBLE PROVIDER
// ============================================================================

export class MockTestDoubleModelProvider implements ModelProviderPort {
  public readonly config: ModelProviderConfig;
  private queuedResponses: unknown[] = [];
  private queuedErrors: Error[] = [];

  constructor(modelIdentifier: string = 'test-double-luna-v1') {
    this.config = {
      providerType: 'mock_test_double',
      endpointUrl: 'mock://local-double',
      modelIdentifier,
      timeoutMs: 5000,
      temperature: 0.0,
      maxRetries: 1,
    };
  }

  public queueResponse(response: unknown): void {
    this.queuedResponses.push(response);
  }

  public queueError(error: Error): void {
    this.queuedErrors.push(error);
  }

  public readonly recordedRequests: ModelCompletionRequest[] = [];

  public getCallCount(): number {
    return this.recordedRequests.length;
  }

  public async generateStructuredCompletion<T>(
    request: ModelCompletionRequest,
    outputSchema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<ModelCompletionResponse<T>> {
    this.recordedRequests.push(request);
    const correlationId = request.correlationId || randomUUID();
    validateMaxTokens(request.maxTokens, correlationId);

    if (request.abortSignal?.aborted) {
      throw new ModelProviderError(
        'CANCELLED',
        'Inference cancelled by caller AbortSignal.',
        false,
        correlationId,
        'CANCELLED'
      );
    }

    if (this.queuedErrors.length > 0) {
      throw this.queuedErrors.shift()!;
    }

    if (this.queuedResponses.length === 0) {
      throw new ModelProviderError(
        'MOCK_EXHAUSTED',
        'No queued mock responses remaining in test double.',
        false,
        correlationId,
        'PROVIDER_ERROR'
      );
    }

    const nextResponse = this.queuedResponses.shift();

    let processedResponse = nextResponse;
    if (typeof processedResponse === 'string') {
      const cleanJson = extractJsonFromResponse(processedResponse, correlationId);
      processedResponse = JSON.parse(cleanJson);
    }

    if (typeof processedResponse === 'object' && processedResponse !== null) {
      processedResponse = stripModelAuthorityFields(processedResponse as Record<string, unknown>);
      processedResponse = normalizeLocalModelOutput(processedResponse);
    }

    const parseResult = outputSchema.safeParse(processedResponse);
    if (!parseResult.success) {
      throw new ModelSchemaValidationError(parseResult.error, correlationId);
    }

    return {
      data: parseResult.data,
      rawText: JSON.stringify(nextResponse),
      parsedJson: processedResponse,
      usage: {
        correlationId,
        providerType: 'mock_test_double',
        modelIdentifier: this.config.modelIdentifier,
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
        tokenCostUsd: '0.0000',
        durationMs: 5,
        retriesAttempted: 0,
        isLocalInference: true,
        usageSource: 'estimated',
        isFallback: false,
      },
    };
  }
}

// ============================================================================
// OPENAI GPT-6 LUNA / STRUCTURED OUTPUT PROVIDER (P2-03)
// ============================================================================

export interface ModelPricingConfig {
  version: string;
  modelIdentifier: string;
  promptCostPerMillion: number;
  completionCostPerMillion: number;
  cachedPromptCostPerMillion?: number;
}

export const GPT_6_LUNA_STANDARD_PRICING: ModelPricingConfig = {
  version: '2026-04-standard',
  modelIdentifier: 'gpt-6-luna',
  promptCostPerMillion: 0.10,
  completionCostPerMillion: 0.50,
  cachedPromptCostPerMillion: 0.01,
};

export interface OpenAiProviderOptions {
  apiKey?: string;
  endpointUrl?: string;
  modelIdentifier?: string;
  timeoutMs?: number;
  temperature?: number;
  maxRetries?: number;
  fetchFn?: typeof fetch;
  pricingConfig?: ModelPricingConfig;
}

export class OpenAiLunaProvider implements ModelProviderPort {
  public readonly config: ModelProviderConfig;
  private readonly apiKey: string;
  private readonly customFetch?: typeof fetch;
  private readonly pricingConfig?: ModelPricingConfig;

  constructor(options?: OpenAiProviderOptions) {
    this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
    this.customFetch = options?.fetchFn;
    this.pricingConfig = options?.pricingConfig ?? GPT_6_LUNA_STANDARD_PRICING;

    const model =
      options?.modelIdentifier ||
      process.env.OPENAI_MODEL_ID ||
      process.env.OPENAI_MODEL_IDENTIFIER;

    if (!model || model.trim().length === 0) {
      throw new ModelProviderError(
        'MISSING_MODEL_CONFIGURATION',
        'OpenAI modelIdentifier is required. Explicit model configuration must be provided via constructor options or OPENAI_MODEL_ID/OPENAI_MODEL_IDENTIFIER. Default model fallback is prohibited.',
        false,
        undefined,
        'INVALID_REQUEST'
      );
    }

    this.config = {
      providerType: 'openai_luna',
      endpointUrl: options?.endpointUrl || process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1',
      modelIdentifier: model.trim(),
      timeoutMs: options?.timeoutMs || 45000,
      temperature: options?.temperature ?? 0.1,
      maxRetries: options?.maxRetries ?? 2,
    };
  }

  public async generateStructuredCompletion<T>(
    request: ModelCompletionRequest,
    outputSchema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<ModelCompletionResponse<T>> {
    const correlationId = request.correlationId || randomUUID();
    const validatedMaxTokens = validateMaxTokens(request.maxTokens, correlationId);

    if (request.abortSignal?.aborted) {
      throw new ModelProviderError(
        'CANCELLED',
        'Inference cancelled by caller AbortSignal before dispatch.',
        false,
        correlationId,
        'CANCELLED'
      );
    }

    if (Buffer.byteLength(request.systemPrompt + request.userPrompt, 'utf8') > 32000) {
      throw new ModelProviderError('PROMPT_TOO_LARGE', 'Paid model input exceeds the 32KB verification bound.', false, correlationId, 'INVALID_REQUEST');
    }

    if (!this.apiKey && !this.customFetch) {
      throw new ModelProviderError(
        'MISSING_API_KEY',
        'OpenAI API key is missing. Set OPENAI_API_KEY in environment or pass apiKey in constructor.',
        false,
        correlationId,
        'AUTHENTICATION'
      );
    }

    if (!this.customFetch && this.config.modelIdentifier !== 'gpt-6-luna') {
      throw new ModelProviderError(
        'UNAUTHORIZED_MODEL',
        `Unauthorized model '${this.config.modelIdentifier}'. TraceCase strictly enforces 'gpt-6-luna' (TC-INV-001).`,
        false,
        correlationId,
        'INVALID_REQUEST'
      );
    }

    const startTime = Date.now();
    let retriesAttempted = 0;
    const fetchToUse = this.customFetch || fetch;

    while (true) {
      const abortController = new AbortController();
      const abortListener = () => abortController.abort();

      if (request.abortSignal) {
        request.abortSignal.addEventListener('abort', abortListener, { once: true });
      }

      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, this.config.timeoutMs);

      try {
        const endpoint = `${this.config.endpointUrl.replace(/\/$/, '')}/chat/completions`;

        const response = await fetchToUse(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: abortController.signal,
          body: JSON.stringify({
            model: this.config.modelIdentifier,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: request.temperature ?? this.config.temperature,
            max_completion_tokens: validatedMaxTokens,
            reasoning_effort: 'none',
          }),
        });

        if (!response.ok) {
          await response.text().catch(() => ''); // Consume stream safely without echoing raw snippets
          const safeErr = getSafeHttpError(response.status);
          throw new ModelProviderError(
            safeErr.code,
            safeErr.message,
            safeErr.isRetryable,
            correlationId,
            safeErr.category
          );
        }

        const body = (await response.json()) as {
          choices?: Array<{
            message?: { content?: string };
            finish_reason?: string;
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            prompt_tokens_details?: {
              cached_tokens?: number;
            };
          };
        };

        const choice = body.choices?.[0];
        const rawText = choice?.message?.content ?? '';
        if (choice?.finish_reason === 'length') {
          throw new ModelTruncationError(rawText.length, correlationId);
        }

        const cleanJsonStr = extractJsonFromResponse(rawText, correlationId);

        const durationMs = Date.now() - startTime;
        const promptTokens = body.usage?.prompt_tokens ?? Math.ceil((request.systemPrompt.length + request.userPrompt.length) / 4);
        const completionTokens = body.usage?.completion_tokens ?? Math.ceil(cleanJsonStr.length / 4);
        const totalTokens = body.usage?.total_tokens ?? (promptTokens + completionTokens);

        // Report cost using model-specific, versioned pricing configuration
        const cachedTokens = body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
        const uncachedPromptTokens = Math.max(0, promptTokens - cachedTokens);

        let tokenCostUsd = 'unavailable';
        if (
          this.pricingConfig &&
          this.pricingConfig.modelIdentifier === this.config.modelIdentifier &&
          typeof this.pricingConfig.promptCostPerMillion === 'number' &&
          typeof this.pricingConfig.completionCostPerMillion === 'number'
        ) {
          const cachedRate = this.pricingConfig.cachedPromptCostPerMillion ?? 0.01;
          const promptCost = (uncachedPromptTokens / 1_000_000) * this.pricingConfig.promptCostPerMillion +
            (cachedTokens / 1_000_000) * cachedRate;
          const completionCost = (completionTokens / 1_000_000) * this.pricingConfig.completionCostPerMillion;
          tokenCostUsd = (promptCost + completionCost).toFixed(8);
        }

        const usage: AiUsageReport = {
          correlationId,
          providerType: 'openai_luna',
          modelIdentifier: this.config.modelIdentifier,
          promptTokens,
          completionTokens,
          totalTokens,
          tokenCostUsd,
          durationMs,
          retriesAttempted,
          isLocalInference: false,
          usageSource: body.usage ? 'provider_reported' : 'estimated',
          isFallback: false,
        };

        let parsedRaw: unknown;
        try {
          parsedRaw = JSON.parse(cleanJsonStr);
        } catch {
          const jsonErr = new ModelProviderError(
            'INVALID_JSON',
            'Model output could not be parsed as valid JSON.',
            false,
            correlationId,
            'INVALID_JSON'
          );
          jsonErr.usage = usage;
          throw jsonErr;
        }

        // Strip any model-injected authority fields
        if (typeof parsedRaw === 'object' && parsedRaw !== null) {
          parsedRaw = stripModelAuthorityFields(parsedRaw as Record<string, unknown>);
          parsedRaw = normalizeLocalModelOutput(parsedRaw);
        }

        // Strictly validate against requested Zod schema
        const parseResult = outputSchema.safeParse(parsedRaw);
        if (!parseResult.success) {
          throw new ModelSchemaValidationError(parseResult.error, correlationId, usage);
        }

        return {
          data: parseResult.data,
          rawText,
          parsedJson: parsedRaw,
          usage,
        };
      } catch (err: unknown) {
        if (request.abortSignal?.aborted) {
          throw new ModelProviderError(
            'CANCELLED',
            'Inference cancelled by caller AbortSignal.',
            false,
            correlationId,
            'CANCELLED'
          );
        }

        let providerError: ModelProviderError;
        if (err instanceof ModelProviderError) {
          providerError = err;
        } else if (err instanceof Error && err.name === 'AbortError') {
          providerError = new ModelTimeoutError(this.config.timeoutMs, correlationId);
        } else {
          providerError = new ModelConnectionError(this.config.endpointUrl, correlationId);
        }

        // Determine if bounded retry is permitted
        if (providerError.isRetryable && retriesAttempted < this.config.maxRetries) {
          retriesAttempted++;
          continue;
        }

        throw providerError;
      } finally {
        if (request.abortSignal) {
          request.abortSignal.removeEventListener('abort', abortListener);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }
  }
}

