# TraceCase — Person 2 Integration README

**Role:** Person 2 (AI Roles, Model Providers, Controlled Demo Target, Evaluation Harness)  
**Target Audiences:** Person 1 (Orchestration Engine, Persistence, Worker) & Person 3 (Sanitization & UI Frontend)  
**Status:** Implemented and Verified (Non-Browser Verified; Live Browser & Cloud Deployment Acceptance Pending)  
**Runnable Examples Reference:** [`examples/person-2-runnable-examples.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/examples/person-2-runnable-examples.ts) (Verified by [`tests/person-2-runnable-examples.test.ts`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/tests/person-2-runnable-examples.test.ts))

---

## 1. Actual Working Exports & Import Paths

All Person 2 modules are fully implemented, strictly typed, and directly importable:

```typescript
// AI Roles
import { ReportExperimentAgent } from '../src/server/ai/planner';
import { BrowserInteractionAgent } from '../src/server/ai/browser-actor';
import { EvidenceReviewAgent } from '../src/server/ai/reviewer';

// Provider Adapters & Invariant Utilities
import {
  OllamaLocalModelProvider,
  OpenAiLunaProvider,
  MockTestDoubleModelProvider,
  validateMaxTokens,
  MAX_OUTPUT_TOKENS,
  type ModelProviderPort,
  type ModelCompletionRequest,
  type ModelCompletionResponse,
  type ModelPricingConfig,
} from '../src/server/ai/provider';

// Canonical Contracts & Schemas
import {
  ReportAgentInputSchema,
  ReportAgentOutputSchema,
  BrowserAgentInputSchema,
  BrowserDecisionOutputSchema,
  EvidenceReviewAgentInputSchema,
  EvidenceReviewOutputSchema,
  PlanAssertionSchema,
  type ReportAgentInput,
  type ReportAgentOutput,
  type BrowserAgentInput,
  type BrowserDecisionOutput,
  type EvidenceReviewAgentInput,
  type EvidenceReviewOutput,
  type PlanAssertion,
} from '../src/server/ai/contracts';

// Controlled Demo Target & HTTP Client
import { DemoTargetClient } from '../demo-target/client';
import { createDemoTargetServer } from '../demo-target/server';
import { DemoTargetStore } from '../demo-target/store';
import type { SupportedFixtureScope, FixtureResetReceipt, FixtureReadbackResult } from '../demo-target/types';

// Evaluation Harness
import { EvaluationHarness } from '../evaluation/harness';
import { ExecutionReceiptSchema, type ExecutionReceipt } from '../evaluation/case-schema';
```

---

## 2. Core Role Contracts & Authority Boundaries

### Authority Invariants (Do-Not-Cross Rules)
1. **AI Models Propose; Trusted Server Verifies**: The models emit proposed actions, plans, or hypotheses. They have zero direct execution authority, cannot approve plans, cannot modify verifier outcomes, and cannot call Playwright or shell commands.
2. **Deterministic Oracles**: Verification outcomes are computed strictly by trusted server oracles. An explanation or LLM completion cannot alter an authoritative verdict.
3. **Hypotheses Are Not Facts**: Invariant `TC-INV-008`: Any diagnostic hypothesis emitted by Role 3 strictly enforces `isVerifiedFact: false`.
4. **Token & Budget Caps**: All requests enforce a 2048 maximum output token cap (`MAX_OUTPUT_TOKENS = 2048`). Oversized requests are rejected.
5. **Safe Error Envelopes**: Provider errors carry correlation IDs and safe categories (`AUTHENTICATION`, `RATE_LIMIT`, `PROVIDER_ERROR`, `INVALID_JSON`, `REFUSAL`, etc.) without leaking raw upstream body text or sensitive tokens.

---

## 3. Five Runnable Integration Examples

All examples below are executable, fully typed, and verified by `tests/person-2-runnable-examples.test.ts`.

### Example 1: Model Providers (Mock, Local Ollama, OpenAI Luna)
```typescript
import { z } from 'zod';
import { MockTestDoubleModelProvider, OllamaLocalModelProvider, OpenAiLunaProvider } from '../src/server/ai/provider';

// A. Mock Test Double (Deterministic tests)
const mockProvider = new MockTestDoubleModelProvider('test-double-v1');
mockProvider.queueResponse({ status: 'ready', count: 42 });
const result = await mockProvider.generateStructuredCompletion(
  { roleId: 'AT-ROLE-001', systemPrompt: 'Sys', userPrompt: 'User', maxTokens: 500 },
  z.object({ status: z.string(), count: z.number() })
);
// result.usage.tokenCostUsd === '0.0000'

// B. Local Ollama Provider (Offline, zero cost on http://localhost:11434)
const localProvider = new OllamaLocalModelProvider({
  endpointUrl: 'http://localhost:11434',
  modelIdentifier: 'qwen2.5-coder:3b',
});

// C. OpenAI Luna Provider (Requires explicit model; cost is 'unavailable' without versioned pricing config)
const cloudProvider = new OpenAiLunaProvider({
  apiKey: process.env.OPENAI_API_KEY,
  modelIdentifier: 'gpt-4o-2024-08-06',
  pricingConfig: {
    version: '2026-10-01',
    modelIdentifier: 'gpt-4o-2024-08-06',
    promptCostPerMillion: 2.50,
    completionCostPerMillion: 10.00,
  },
});
```

### Example 2: Report & Experiment Planner (AT-ROLE-001)
```typescript
import { ReportExperimentAgent } from '../src/server/ai/planner';
import type { ReportAgentInput } from '../src/server/ai/contracts';

const planner = new ReportExperimentAgent(provider);
const input: ReportAgentInput = {
  contractVersion: '1.0.0',
  investigationId: '123e4567-e89b-12d3-a456-426614174000',
  targetProfile: {
    name: 'TraceCase-Demo-Tasks',
    baseUrl: 'http://localhost:3005',
    isSandbox: true,
    allowedOrigins: ['http://localhost:3005'],
    hasResetFixture: true,
  },
  rawReport: {
    title: 'Filter delete issue',
    description: 'Under Active filter, deleting Task B removes Task A instead.',
    claimedExpectedBehavior: 'Task B is removed, Task A remains.',
  },
  clarificationHistory: [],
};

const { output, usage } = await planner.evaluateReport(input);
// output.variant is either 'PLAN_PROPOSED' or 'NEEDS_CLARIFICATION'
```

### Example 3: Browser Action Proposer (AT-ROLE-002)
```typescript
import { BrowserInteractionAgent } from '../src/server/ai/browser-actor';
import type { BrowserAgentInput } from '../src/server/ai/contracts';

const actor = new BrowserInteractionAgent(provider);
const input: BrowserAgentInput = {
  contractVersion: '1.0.0',
  investigationId: '123e4567-e89b-12d3-a456-426614174000',
  attemptIndex: 1,
  approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  allowedOrigins: ['http://localhost:3005'],
  currentStep: {
    stepNumber: 1,
    actionType: 'CLICK',
    intentDescription: 'Click Delete on Task B',
    targetDescription: 'Delete Task B',
    isDestructive: true,
  },
  observation: {
    observationId: '123e4567-e89b-12d3-a456-426614174001',
    pageUrl: 'http://localhost:3005/',
    pageTitle: 'Task Management Demo',
    axTree: [
      {
        nodeId: 'node_103',
        role: 'button',
        name: 'Delete Task B',
        description: 'Delete button for Task B',
        disabled: false,
      },
    ],
  },
  priorActionHistory: [],
};

const { output } = await actor.proposeNextAction(input);
// If grounded: output.variant === 'PROPOSE_ACTION', action.targetNodeId === 'node_103'
// If ambiguous or missing: output.variant === 'STOP_BLOCKED'
```

### Example 4: Evidence Reviewer (AT-ROLE-003)
```typescript
import { EvidenceReviewAgent } from '../src/server/ai/reviewer';
import type { EvidenceReviewAgentInput } from '../src/server/ai/contracts';

const reviewer = new EvidenceReviewAgent(provider);
const input: EvidenceReviewAgentInput = {
  contractVersion: '1.0.0',
  investigationId: '123e4567-e89b-12d3-a456-426614174000',
  reproductionVerdict: 'CONFIRMED_REPRODUCED',
  rawReport: {
    title: 'Filter delete issue',
    description: 'Deleting Task B removes Task A.',
  },
  testedEnvironment: 'TraceCase-Demo-Tasks v1.0.0-buggy',
  resetStatus: {
    executed: true,
    success: true,
    details: 'Restored two_tasks_one_completed fixture.',
  },
  attempt1: {
    status: 'FAILED_ASSERTIONS',
    failureSignatureMatched: true,
    executionDurationMs: 2500,
    isValid: true,
    assertionsEvaluated: [
      {
        predicateId: 'assert_task_b_persists',
        predicateDescription: 'Task B should be deleted',
        passed: false,
        actualValue: 'PRESENT',
        expectedValue: 'ABSENT',
      },
    ],
    safeArtifacts: {
      videoId: 'art-vid-1',
      videoUrl: 'http://localhost:3005/artifacts/run1.webm',
    },
    sanitizedConsoleExcerpts: ['[INFO] Clicked Delete'],
  },
  attempt2: {
    status: 'FAILED_ASSERTIONS',
    failureSignatureMatched: true,
    executionDurationMs: 2400,
    isValid: true,
    assertionsEvaluated: [
      {
        predicateId: 'assert_task_b_persists',
        predicateDescription: 'Task B should be deleted',
        passed: false,
        actualValue: 'PRESENT',
        expectedValue: 'ABSENT',
      },
    ],
    safeArtifacts: {
      videoId: 'art-vid-2',
      videoUrl: 'http://localhost:3005/artifacts/run2.webm',
    },
    sanitizedConsoleExcerpts: ['[INFO] Clicked Delete'],
  },
};

const { output } = await reviewer.reviewEvidence(input);
// output.variant === 'REPORT_SYNTHESIZED'
// output.observedReproductionVerdict === 'CONFIRMED_REPRODUCED' (strictly matches input)
// output.diagnosticHypothesis.isVerifiedFact === false (strict invariant)
```

### Example 5: Controlled Target Client (Reset, Readback & Cleanup)
```typescript
import { DemoTargetClient } from '../demo-target/client';

const client = new DemoTargetClient({
  baseUrl: 'http://localhost:3005',
  resetSecret: process.env.TARGET_RESET_SECRET || 'tc-disposable-secret-2026',
});

// 1. Get build metadata (omits bugModeActive)
const buildInfo = await client.getBuildInfo();

// 2. Reset to disposable isolated fixture scope
const resetReceipt = await client.resetFixture('two_tasks_one_completed');
// resetReceipt.itemsRestored === 2

// 3. Read back actual state to independently verify restored baseline
const readback = await client.readbackFixture('two_tasks_one_completed');
// readback.items contains Task A (completed) and Task B (active)

// 4. Cleanup when attempt concludes
const cleanup = await client.cleanupFixture('two_tasks_one_completed');
```

---

## 4. Concrete Interface Decisions to Agree On

Before final integration, the following 5 decisions must be agreed upon between Person 1, Person 2, and Person 3 (detailed in [`docs/implementation/person-2-requirement-proposals.md`](file:///c:/Users/gjaya/OneDrive/Desktop/PROJECTS/TraceCase/docs/implementation/person-2-requirement-proposals.md)):

| Decision ID | Subsystem | Counterpart | Proposed Decision | Current Person 2 Implementation |
| :--- | :--- | :--- | :--- | :--- |
| **`DEC-001`** | `src/contracts/planning.ts` | Person 1 | Adopt structured assertion predicates (`PlanAssertionSchema`) with subject, relation, observation point, and expected condition instead of opaque strings. | Implemented in `contracts.ts` and `compatibility-adapter.ts`. |
| **`DEC-002`** | `src/server/services/ports.ts` | Person 1 | Decompose monolithic `AiPlannerPort` into three distinct role ports: `ReportPlannerPort`, `BrowserActorPort`, and `EvidenceReviewerPort`. | Person 2 exposes standalone agent classes; compatibility shim bridges to legacy port. |
| **`DEC-003`** | `src/contracts/targets.ts` | Person 1, Person 3 | Purge privileged reset authorization secrets from client-facing `TargetProfileSchema`. Pass secrets server-side via `TARGET_RESET_SECRET`. | Target server and client fail closed if secret is unset or empty; metadata endpoint omits secrets. |
| **`DEC-004`** | `src/contracts/evidence.ts` | Person 3 | Decouple immutable `artifactId` (UUID/hash) from transient, short-lived signed URLs. | Reviewer agent cites stable `artifactId`; UI generates fresh signed URLs on demand. |
| **`DEC-005`** | `evaluation/case-schema.ts` | Person 1 | Standardize `ExecutionReceiptSchema` with strict ISO 8601 UTC timestamps and direct binding to approved plan `predicateId`s. | Evaluation harness validates receipts at runtime, rejecting unbound assertions. |

---

## 5. Integration Status & Deferred Work

- **Implemented & Independently Verified**:
  - All 3 AI role agents (`ReportExperimentAgent`, `BrowserInteractionAgent`, `EvidenceReviewAgent`).
  - All 3 provider adapters (`MockTestDoubleModelProvider`, `OllamaLocalModelProvider`, `OpenAiLunaProvider`).
  - Controlled demo target application (`demo-target/`) with buggy/fixed modes and authenticated reset/readback.
  - Evaluation harness (`evaluation/harness.ts`) covering TC1–TC4 regression cases and negative scenarios.
- **Pending / Deferred (Per Project Constraints)**:
  - **Live Browser Automation**: Playwright worker execution is owned by Person 1 and remains pending joint integration.
  - **Cloud Deployed Acceptance**: Multi-attempt reproduction against deployed cloud web/worker services remains deferred.
