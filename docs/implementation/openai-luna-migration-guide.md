# TraceCase — OpenAI GPT-6 Luna Provider Migration & Local Provider Guide

**Document ID:** `AI-MIG-001`  
**Author:** Person 2 (AI, Controlled Target, and Evaluation Lead)  
**Status:** Architecture Specification, Non-Browser Verified, Live Paid Inference Pending  
**Implementation Source:** [`src/server/ai/provider.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/provider.ts)  
**Test Suite:** [`tests/ai-provider.test.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/tests/ai-provider.test.ts) (27/27 passed)  

---

## 1. Overview & Provider Interface Boundary

TraceCase implements a decoupled provider architecture via `ModelProviderPort` in [`src/server/ai/provider.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/src/server/ai/provider.ts). All three AI roles (`ReportExperimentAgent`, `BrowserInteractionAgent`, `EvidenceReviewAgent`) consume structured completions strictly through this common boundary:

```typescript
export interface ModelProviderPort {
  readonly config: ModelProviderConfig;
  generateStructuredCompletion<T>(
    request: ModelCompletionRequest,
    outputSchema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<ModelCompletionResponse<T>>;
}
```

### Invariants Maintained:
1. **Advisory Non-Authority (`TC-INV-001`, `TC-INV-004`):** Output schemas strip model-injected authority fields (`isApproved`, `planHash`, `investigationId`, `attemptId`) before Zod validation.
2. **Zero Paid Cost During Development:** Local development and CI testing run at strictly **$0.0000 API cost**.
3. **No Silent Fallback:** The provider never switches models or silently degrades to another backend. If an endpoint errors, it throws a typed `ModelProviderError`.
4. **Transport Isolation:** OpenAI provider uses standard native `fetch` over HTTP, eliminating extra SDK dependencies and package conflicts.
5. **No Cross-Role Transfer:** Provider implementation and maintenance remain strictly under Person 2 ownership.

---

## 2. Local Ollama Provider (`OllamaLocalModelProvider`)

### 2.1 Configuration & Model Support
The local provider communicates with the local Ollama daemon (`http://localhost:11434`):
- Supported models:
  - `phi4-mini:latest` (3.8B, Microsoft Phi-3/4 family)
  - `qwen2.5-coder:3b` (3.1B, Alibaba Qwen2.5 Coder family)
- Format: Native JSON mode (`format: 'json'`).
- Bounded sampling: Temperature = `0.1` (configurable down to `0.0`), `num_predict` capped at 2,048 tokens.

### 2.2 Normalization & Parsing Policy
- **Minor Formatting Normalization:** Casing trimming, string-to-number coercion, and key aliases (`steps` $\leftrightarrow$ `actions`, `predicate_id` $\leftrightarrow$ `predicateId`).
- **Semantic Integrity:** Normalization never fabricates missing semantic steps, assertions, or claims. Missing data causes Zod validation failure.
- **Conflicting Alias Rejection:** Providing conflicting values for canonical and alias fields throws `ModelProviderError: CONFLICTING_ALIASES`.

### 2.3 Real Local Model Smoke Test Results
Executed against active running Ollama instance:

| Parameter | Run 1 (`qwen2.5-coder:3b`) | Run 2 (`phi4-mini:latest`) |
|---|---|---|
| **Endpoint** | `http://localhost:11434/api/chat` | `http://localhost:11434/api/chat` |
| **Model** | `qwen2.5-coder:3b` | `phi4-mini:latest` |
| **Status Output** | `"verified_local"` | `"verified_phi4"` |
| **Duration** | **1,059 ms** | **10,354 ms** |
| **Token Cost** | **$0.0000 USD** | **$0.0000 USD** |
| **Usage Source** | `provider_reported` | `provider_reported` |
| **Fallback Used** | **`false`** (Real inference) | **`false`** (Real inference) |
| **Schema Validation** | **PASS** | **PASS** |

---

## 3. OpenAI GPT-6 Luna Provider (`OpenAiLunaProvider`)

### 3.1 Implementation Architecture
`OpenAiLunaProvider` conforms strictly to `ModelProviderPort` without importing external SDKs. It connects directly to OpenAI's REST API:
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Authentication: `Authorization: Bearer <OPENAI_API_KEY>` (redacted from all error strings)
- Response Format: `{ type: 'json_object' }`
- Token Counting: Tracks `prompt_tokens`, `completion_tokens`, and calculates estimated cost ($2.50 / 1M prompt, $10.00 / 1M completion).

### 3.2 Injected Transport Tests
All OpenAI behaviors are deterministically verified in [`tests/ai-provider.test.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/tests/ai-provider.test.ts):
- **Request Construction:** Verifies exact HTTP method, headers, endpoint URL, model ID, messages array, and parameters.
- **Valid Structured Response:** Parses clean JSON and markdown-fenced responses.
- **Refusal Detection:** Detects explicit model refusal strings and throws `ModelRefusalError`.
- **Truncation:** Checks `finish_reason === 'length'` and throws `ModelTruncationError`.
- **Authentication Denial (HTTP 401):** Throws `HTTP_401` with API key completely redacted.
- **Rate Limit & Server Error (HTTP 429/500):** Retries boundedly up to `maxRetries` (2) and succeeds on transient recovery.
- **Cancellation & Timeout:** Respects caller `AbortSignal` and cleans up event listeners in `finally` blocks.
- **Usage Tracking:** Uses provider-reported token counts or safely falls back to string-length estimations.

### 3.3 Live Production Activation Checklist (Pending)

Live OpenAI API access and smoke testing remain **pending** until an authorized API key and budget are provided:

1. [ ] **Budget Cap Configured:** Ensure Person 1's budget manager enforces a strict hard limit ($\le \$20.00$).
2. [ ] **API Key Injected:** Set `OPENAI_API_KEY` in server-only `.env.local`.
3. [ ] **Model Probing:** Probe available model identifiers (`curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`).
4. [ ] **Live Smoke Test:** Execute single harmless test call via `OpenAiLunaProvider` with cost tracking.
5. [ ] **Evaluation Baseline:** Run evaluation suite against OpenAI model and compare metrics against local Ollama baseline.
