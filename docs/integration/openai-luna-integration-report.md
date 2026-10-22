# TraceCase OpenAI GPT-6 Luna Integration & Cost Accounting Report

## 1. Executive Summary

This report documents the runtime integration of OpenAI GPT-6 Luna (`gpt-6-luna`) into TraceCase in `C:\SHARAN PROJECTS\TraceCase`. The implementation connects the application's three logical AI roles (Report Planner, Browser Actor, and Evidence Reviewer) to GPT-6 Luna, establishes durable cost accounting with dual budget ceilings ($0.25 per investigation, $10.00 shared global ceiling), modernizes API request parameters, and validates system behavior through automated offline test-double suites and preflight verification probes.

In compliance with the project security invariant, the API credential previously pasted into the chat session was treated as exposed and was neither saved, copied, tested, nor included in application files. Live verification with upstream OpenAI remains cleanly blocked until an uncompromised replacement key is provisioned directly in the ignored `.env.local` file.

---

## 2. Model Specification and API Parameters

### 2.1 Model Identity
- Selected Model: `gpt-6-luna` (strictly enforced by `OPENAI_MODEL_ID=gpt-6-luna` and constructor guards in `OpenAiLunaProvider` and `OpenAiClient`).
- Silent Fallback: Strictly prohibited. Any attempt to request another model identifier (e.g., `gpt-4o`, `gpt-6-mini`) is rejected with `UNAUTHORIZED_MODEL` without fallback.
- Local Alternative: Local Qwen (`qwen3:4b-instruct-2507-q4_K_M` via Ollama) remains preserved as an explicit, separate configuration via `AI_PROVIDER=local_ollama`.

### 2.2 Published Pricing Documentation
- Documented Source: OpenAI GPT-6 Model Family Pricing Reference (Standard processing tier).
- Pricing Date Baseline: April 2026.
- Version Identifier: `2026-04-standard` (`GPT_6_LUNA_STANDARD_PRICING`).
- Standard Input Tokens (uncached): $0.10 per 1,000,000 tokens ($0.000100 per 1k tokens = $0.00000010 per token).
- Cached Input Tokens: $0.01 per 1,000,000 tokens ($0.000010 per 1k tokens = $0.00000001 per token).
- Cache Writes: $0.125 per 1,000,000 tokens ($0.000125 per 1k tokens).
- Output Completion Tokens: $0.50 per 1,000,000 tokens ($0.000500 per 1k tokens = $0.00000050 per token).
- Batch Processing Rates (reference): $0.05 input / $0.25 output per 1M tokens.

### 2.3 API Endpoint and Request Payload Format
- Endpoint: `${OPENAI_BASE_URL}/chat/completions` (default: `https://api.openai.com/v1/chat/completions`).
- Output Token Parameter: `max_completion_tokens: validatedMaxTokens` (replaces legacy `max_tokens`).
- Enforced Output Token Cap: `MAX_OUTPUT_TOKENS = 2048`.
- Reasoning Configuration: `reasoning_effort: 'none'`. This enables low-latency, cost-effective structured output while retaining compatibility with `temperature`.
- Response Format: `response_format: { type: 'json_object' }`.
- Post-Response Authority Sanitization: All responses pass through `stripModelAuthorityFields`, `normalizeLocalModelOutput`, and strict Zod schema parsing.

### 2.4 Error Handling and Retry Limits
- Authentication (HTTP 401): Non-retryable (`AUTHENTICATION`). Zero retries. Redacts credentials.
- Permission (HTTP 403): Non-retryable (`PERMISSION`). Zero retries.
- Invalid Request / Model Not Found (HTTP 404): Non-retryable (`INVALID_REQUEST`). Zero retries.
- Rate Limiting (HTTP 429) & Server Errors (HTTP 500/503): Retryable (`RATE_LIMIT`, `PROVIDER_ERROR`). Capped at at most 1 bounded retry with backoff.
- Budget Exhaustion: Non-retryable. Immediate fail-closed rejection.

---

## 3. Cost Accounting and Budget Guardrails

### 3.1 Spending Ceilings
The application enforces three distinct spending limits:
1. Per-Investigation Ceiling: $0.25 USD (`OPENAI_PER_INVESTIGATION_CEILING`).
2. Global Shared Application Ceiling: $10.00 USD (`OPENAI_TOTAL_BUDGET_CEILING`).
3. Single Verification Session Limit: $1.00 USD (`OPENAI_SESSION_VERIFICATION_CEILING`).

### 3.2 Pre-Call Atomic Headroom Reservation
Before any billable generation call is dispatched:
1. The budget manager calculates estimated cost: `promptTokens * $0.000100/1k + 2048 * $0.000500/1k` (~$0.0013 USD).
2. Global Ceiling Check: The durable ledger sums committed costs across all investigations plus unexpired in-flight reservations across all investigations. If `totalCommitted + totalInFlight + estimatedCost > globalCeiling`, dispatch is aborted with `GlobalBudgetExhaustedError`.
3. Investigation Ceiling Check: The ledger locks the investigation row (`SELECT ... FOR UPDATE`), sums committed investigation cost plus unexpired active reservations. If `committed + inFlight + estimatedCost > maxBudget`, dispatch is aborted with `BudgetExhaustedError`.
4. Reservation Persistence: An active reservation ticket is written to `budget_reservations` with a 10-minute expiry.

### 3.3 Settlement Invariants
- Spent Tokens Are Never Free: If an OpenAI response completes and consumes tokens, but subsequently fails JSON parsing or Zod schema validation, actual token usage is committed to the investigation ledger rather than released for free.
- Idempotency: Committing or releasing a settled reservation ticket is idempotent; repeated calls do not double-charge or alter ledger state.
- Numeric Precision: `calculateCost` maintains 6 decimal places (`$0.000001`) to prevent fractional cent requests (e.g., 100 prompt tokens = $0.000010) from rounding away to zero.

---

## 4. Configuration Names and Environment Settings

| Variable | Type | Default | Description |
|---|---|---|---|
| `AI_PROVIDER` | enum (`openai_luna`, `local_ollama`) | `local_ollama` (dev) / `openai_luna` (prod) | Active AI inference provider |
| `OPENAI_MODEL_ID` | literal (`gpt-6-luna`) | `gpt-6-luna` | Enforced OpenAI model identifier |
| `OPENAI_BASE_URL` | url | `https://api.openai.com/v1` | OpenAI API endpoint root |
| `OPENAI_API_KEY` | string (secret) | (empty) | Server-only API secret; loaded only from `.env.local` |
| `OPENAI_TOTAL_BUDGET_CEILING` | number (USD) | `10.00` | Global spending cap across all investigations |
| `OPENAI_PER_INVESTIGATION_CEILING` | number (USD) | `0.25` | Per-investigation spending limit |
| `OPENAI_SESSION_VERIFICATION_CEILING` | number (USD) | `1.00` | Maximum spend allowed per verification session |
| `OPENAI_MAX_OUTPUT_TOKENS` | number (int) | `2048` | Maximum output token cap per completion |

All configuration variables are declared and validated in `src/server/config/env.ts` and documented in `.env.example`.

---

## 5. Architectural Wiring of All Three AI Roles

| AI Role | Role Code | Implementation Class | Adapter Class | Provider & Budget Wiring |
|---|---|---|---|---|
| Role 1: Report Planner & Clarifier | `AT-ROLE-001` | `ReportExperimentAgent` | `IntegratedReportClarificationAgent` | Uses `resolveProvider()`, passes `GPT_6_LUNA_STANDARD_PRICING`, reserves 2,000 tokens via `BudgetManager`. |
| Role 2: Browser Actor | `AT-ROLE-002` | `BrowserInteractionAgent` | `IntegratedBrowserInvestigationAgent` | Uses `resolveProvider()`, grounded in live observation DOM, reserves 1,500 tokens. Wired into `TwoAttemptController` in worker. |
| Role 3: Evidence Reviewer | `AT-ROLE-003` | `EvidenceReviewAgent` | `IntegratedEvidenceReviewAgent` | Uses `resolveProvider()`, synthesizes facts from verified attempts, reserves 3,000 tokens. Provides deterministic fallback on failure. |
| Utility Client | - | `OpenAiClient` | - | Harmonized to `max_completion_tokens`, `reasoning_effort: 'none'`, and standard pricing. |

---

## 6. Verification and Test Results

### 6.1 Test Execution Summary
- Test Command: `pnpm test`
- Outcome: 81 test files passed, 0 failed, 692 tests passed, 6 skipped.
- Integration Suite: `tests/integration/openai-luna-integration.test.ts` (13/13 passed).
- Unit Suite: `tests/ai-provider.test.ts` (30/30 passed, 2 skipped).
- Budget Manager Suites: `tests/person-1/phase-7/budget-manager.test.ts` (6/6 passed), `tests/integration/budget-manager-concurrency.test.ts` (5/5 passed).
- TypeScript Typecheck: `pnpm typecheck` exited with code 0 (0 errors).
- ESLint: `pnpm lint` exited with code 0 (0 errors, 0 warnings).

### 6.2 System Readiness Probing
- Non-Generating Model Probe: When `OPENAI_API_KEY` is present, `getSystemReadiness()` performs a lightweight `GET /models/gpt-6-luna` request (cached for 60 seconds). This incurs zero generation token cost and distinguishes "configured" from "verified reachable".
- Offline / Unconfigured Handling: When `OPENAI_API_KEY` is empty, readiness accurately reports `status: UNAVAILABLE` with reason `OPENAI_API_KEY environment variable is not configured`.

---

## 7. User Workflow Guide

1. Operator Sign-In:
   Open `http://localhost:3000`. Use the top navigation bar to sign in via the development session bootstrap (`/api/dev/session`), which authenticates the session as `operator@tracecase.local`.
2. Register Controlled Target:
   Navigate to `/targets`. The local controlled target is running at `http://localhost:3005`. Verify it is registered with sandbox isolation enabled.
3. Submit Bug Report:
   Navigate to `/investigations/new`. Select the registered target environment, enter the reported symptoms, and submit. The system persists the bug report in PostgreSQL before initiating AI planning.
4. Review and Approve Experiment Plan:
   If the report is ambiguous, answer required clarification questions at `/investigations/[id]/clarify`. Once the bounded experiment plan is generated, review the exact steps, action tiers, and assertions at `/investigations/[id]/approve`. The operator explicitly approves the specific plan version and sha256 fingerprint hash.
5. Trigger Execution:
   Plan approval does not automatically launch browser execution. The operator initiates execution through a distinct start command, which queues an execution job.
6. Worker Execution and Two-Attempt Verification:
   The background worker claims the job under a global concurrency-1 lease, executes Attempt 1 in headless Chromium, performs an authenticated fixture reset with state readback, executes Attempt 2 under verified equivalent starting conditions, and evaluates assertions.
7. Inspect Results and Evidence Triad:
   Open `/investigations/[id]` to review the verified verdict (CONFIRMED_DEFECT, NOT_REPRODUCED, or BLOCKED_ERROR), attempt timeline, assertion diffs, and evidence triad (WebM video recordings, console logs, network traces).

---

## 8. Current Limitations and Genuine Blockers

1. Upstream OpenAI Credential Availability:
   The API key supplied in chat was exposed and was not stored or used. `.env.local` currently has `OPENAI_API_KEY=` unconfigured. Live paid requests to `api.openai.com` are blocked until the operator generates a new secret key and saves it to `.env.local`.
2. Object Storage Dual-Bucket Delivery:
   In offline local development mode without MinIO running on port 9000, evidence artifacts are stored locally in the temporary file tree and projected via authenticated streaming endpoints.
3. Attachment Persistence:
   File attachment uploads during bug report intake currently store metadata; full multi-part binary attachment object storage depends on active S3 storage.

---

## 9. Acceptance Matrix

| Requirement | Implementation State | Verification Evidence |
|---|---|---|
| GPT-6 Luna model constraint | Complete | `UNAUTHORIZED_MODEL` enforced; tests in `openai-luna-integration.test.ts` pass |
| Modernized `max_completion_tokens` | Complete | Payload format verified in `tests/ai-provider.test.ts` and `openai-luna-integration.test.ts` |
| `reasoning_effort: 'none'` parameter | Complete | Payload verified via mock transport inspection |
| Standard pricing calibration | Complete | `GPT_6_LUNA_STANDARD_PRICING` ($0.10/M input, $0.50/M output) calibrated in provider & budget manager |
| Sub-cent numeric precision | Complete | Precision tests in `openai-luna-integration.test.ts` pass |
| Dual budget ceilings ($0.25 inv, $10.00 global) | Complete | Atomic checks in `PostgresBudgetLedger` & `InMemoryBudgetLedger`; concurrency tests pass |
| Idempotent settlement | Complete | Verified in `budget-manager-concurrency.test.ts` and `openai-luna-integration.test.ts` |
| Token commitment on schema failure | Complete | Verified in `openai-luna-integration.test.ts` |
| Role 1 (Planner) integration | Complete | Wired via `IntegratedReportClarificationAgent` using `resolveProvider()` |
| Role 2 (Browser Actor) integration | Complete | Wired via `IntegratedBrowserInvestigationAgent` into `TwoAttemptController` |
| Role 3 (Reviewer) integration | Complete | Wired via `IntegratedEvidenceReviewAgent` with deterministic fallback |
| Truthful readiness probing | Complete | Cached non-generating access probe verified in `service-container.ts` |
| Zero credential leakage | Complete | All tests pass without exposed key; `.env.local` ignored |
| Zero emojis in codebase & docs | Complete | Full repository adheres to strict text formatting |
