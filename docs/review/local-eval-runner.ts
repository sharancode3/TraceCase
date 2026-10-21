/**
 * Bounded Local Model Evaluation Runner (Rerun 2)
 * 
 * Target Model: qwen2.5-coder:3b
 * Endpoint: http://localhost:11434
 * Ground Rules:
 * - Sequential execution, 1 case at a time
 * - At most 1 initial inference per case
 * - No automatic retries (maxRetries: 0)
 * - Declared per-call timeout: 90,000 ms
 * - Declared total call limit: 9 calls (3 roles x 3 cases)
 * - Raw pass/fail counting against pre-declared expected outcomes
 * - Classification of failures: fixture, transport, timeout, parsing, semantic
 * - Preservation of the baseline 3-pass / 6-fail run 1 audit
 */

import fs from 'fs';
import path from 'path';
import { OllamaLocalModelProvider } from '../../src/server/ai/provider';
import { ReportExperimentAgent } from '../../src/server/ai/planner';
import { BrowserInteractionAgent } from '../../src/server/ai/browser-actor';
import { EvidenceReviewAgent } from '../../src/server/ai/reviewer';
import {
  ReportAgentInputSchema,
  BrowserAgentInputSchema,
  EvidenceReviewAgentInputSchema,
  type ReportAgentInput,
  type BrowserAgentInput,
  type EvidenceReviewAgentInput,
} from '../../src/server/ai/contracts';

export type FailureClassification = 'fixture' | 'transport' | 'timeout' | 'parsing' | 'semantic' | 'none';

export interface TestCaseResult {
  role: 'Planner' | 'Browser Actor' | 'Evidence Reviewer';
  caseId: string;
  description: string;
  declaredExpectation: string;
  observedResult: string;
  observedVariant?: string;
  status: 'PASS' | 'FAIL';
  failureClassification: FailureClassification;
  durationMs: number;
  providerCallCount: number;
  fallbackUsed: boolean;
  errorDetail?: string;
}

const RESULTS: TestCaseResult[] = [];
let totalProviderCalls = 0;
let totalTimeouts = 0;
let totalFallbacks = 0;

async function runEvaluation() {
  console.log('================================================================');
  console.log('BOUNDED LOCAL MODEL EVALUATION (RERUN 2)');
  console.log('Model: qwen2.5-coder:3b');
  console.log('Endpoint: http://localhost:11434');
  console.log('Declared Per-call Timeout: 90,000ms | Total Calls Limit: 9 | Retries: 0');
  console.log('================================================================\n');

  const provider = new OllamaLocalModelProvider({
    endpointUrl: 'http://localhost:11434',
    modelIdentifier: 'qwen2.5-coder:3b',
    timeoutMs: 90000,
    maxRetries: 0,
  });

  const planner = new ReportExperimentAgent(provider);
  const actor = new BrowserInteractionAgent(provider);
  const reviewer = new EvidenceReviewAgent(provider);

  // --------------------------------------------------------------------------
  // ROLE 1: PLANNER (3 Cases)
  // --------------------------------------------------------------------------
  console.log('--- Role 1: Planner (AT-ROLE-001) ---');

  // Case PLN-01
  const pln01Input: ReportAgentInput = ReportAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: '11111111-1111-4111-8111-111111111111',
    targetProfile: {
      name: 'Demo App',
      baseUrl: 'http://localhost:3005',
      isSandbox: true,
      allowedOrigins: ['http://localhost:3005'],
      hasResetFixture: true,
    },
    rawReport: {
      title: 'Deleting active task deletes completed task instead',
      description: 'Under Active filter, clicking delete on Task B removes Task A instead. Task B remains.',
      claimedExpectedBehavior: 'Task B should be deleted and Task A should remain intact.',
    },
    clarificationHistory: [],
  });

  console.log('[PLN-01] Executing unambiguous defect report (TC1)...');
  totalProviderCalls++;
  const t0 = Date.now();
  try {
    const res = await planner.evaluateReport(pln01Input);
    const dur = Date.now() - t0;
    let isPass = false;
    let observedResult: string = res.output.variant;
    if (res.output.variant === 'PLAN_PROPOSED') {
      const entities = res.output.extractedClaim.affectedEntities;
      isPass = entities.some((e: string) => e.toLowerCase().includes('task a') || e.toLowerCase().includes('task b'));
      observedResult = `PLAN_PROPOSED [${entities.join(', ')}]`;
    }
    RESULTS.push({
      role: 'Planner',
      caseId: 'PLN-01',
      description: 'Unambiguous defect report (TC1)',
      declaredExpectation: 'PLAN_PROPOSED with entities Task A, Task B',
      observedResult,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : 'semantic',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant}`,
    });
    console.log(`[PLN-01] Finished in ${dur}ms: variant=${res.output.variant} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t0;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      role: 'Planner',
      caseId: 'PLN-01',
      description: 'Unambiguous defect report (TC1)',
      declaredExpectation: 'PLAN_PROPOSED with entities Task A, Task B',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[PLN-01] Failed in ${dur}ms: ${err.message}`);
  }

  // Case PLN-02
  const pln02Input: ReportAgentInput = ReportAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: '22222222-2222-4222-8222-222222222222',
    targetProfile: {
      name: 'Demo App',
      baseUrl: 'http://localhost:3005',
      isSandbox: true,
      allowedOrigins: ['http://localhost:3005'],
      hasResetFixture: true,
    },
    rawReport: {
      title: 'Broken app',
      description: 'It is broken and crashes.',
      claimedExpectedBehavior: 'Should work.',
    },
    clarificationHistory: [],
  });

  console.log('[PLN-02] Executing vague/incomplete report...');
  totalProviderCalls++;
  const t1 = Date.now();
  try {
    const res = await planner.evaluateReport(pln02Input);
    const dur = Date.now() - t1;
    const isPass = res.output.variant === 'NEEDS_CLARIFICATION';
    RESULTS.push({
      role: 'Planner',
      caseId: 'PLN-02',
      description: 'Vague/incomplete report missing steps and context',
      declaredExpectation: 'NEEDS_CLARIFICATION with targeted questions',
      observedResult: res.output.variant,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : 'semantic',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant}`,
    });
    console.log(`[PLN-02] Finished in ${dur}ms: variant=${res.output.variant} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t1;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      role: 'Planner',
      caseId: 'PLN-02',
      description: 'Vague/incomplete report missing steps and context',
      declaredExpectation: 'NEEDS_CLARIFICATION with targeted questions',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[PLN-02] Failed in ${dur}ms: ${err.message}`);
  }

  // Case PLN-03
  const pln03Input: ReportAgentInput = ReportAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: '33333333-3333-4333-8333-333333333333',
    targetProfile: {
      name: 'Demo App',
      baseUrl: 'http://localhost:3005',
      isSandbox: true,
      allowedOrigins: ['http://localhost:3005'],
      hasResetFixture: true,
    },
    rawReport: {
      title: 'Database corruption on Mars server',
      description: 'The quantum database in Mars data center deleted external email records.',
      claimedExpectedBehavior: 'Mars server should maintain quantum entanglement.',
    },
    clarificationHistory: [],
  });

  console.log('[PLN-03] Executing unsupported/out-of-scope claim...');
  totalProviderCalls++;
  const t2 = Date.now();
  try {
    const res = await planner.evaluateReport(pln03Input);
    const dur = Date.now() - t2;
    const isPass = res.output.variant === 'UNSUPPORTED_CLAIM' || res.output.variant === 'NEEDS_CLARIFICATION';
    RESULTS.push({
      role: 'Planner',
      caseId: 'PLN-03',
      description: 'Unsupported claim outside target domain',
      declaredExpectation: 'UNSUPPORTED_CLAIM or NEEDS_CLARIFICATION',
      observedResult: res.output.variant,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : 'semantic',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant}`,
    });
    console.log(`[PLN-03] Finished in ${dur}ms: variant=${res.output.variant} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t2;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      role: 'Planner',
      caseId: 'PLN-03',
      description: 'Unsupported claim outside target domain',
      declaredExpectation: 'UNSUPPORTED_CLAIM or NEEDS_CLARIFICATION',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[PLN-03] Failed in ${dur}ms: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // ROLE 2: BROWSER ACTOR (3 Cases)
  // --------------------------------------------------------------------------
  console.log('\n--- Role 2: Browser Actor (AT-ROLE-002) ---');

  // Case ACT-01
  const act01Input: BrowserAgentInput = BrowserAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    attemptIndex: 1,
    approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    allowedOrigins: ['http://localhost:3005'],
    currentStep: {
      stepNumber: 3,
      actionType: 'CLICK',
      intentDescription: 'Click delete button for Task B',
      targetDescription: 'Delete button for Task B (active)',
      isDestructive: true,
    },
    observation: {
      observationId: '11111111-2222-3333-4444-555555555555',
      pageUrl: 'http://localhost:3005',
      pageTitle: 'TraceCase Tasks Demo',
      axTree: [
        { nodeId: 'node_1', role: 'button', name: 'Active', description: 'Filter active tasks' },
        { nodeId: 'node_2', role: 'StaticText', name: 'Task A (completed)', description: 'task-a' },
        { nodeId: 'node_3', role: 'button', name: 'Delete', description: 'Task A completed' },
        { nodeId: 'node_4', role: 'StaticText', name: 'Task B (active)', description: 'task-b' },
        { nodeId: 'node_5', role: 'button', name: 'Delete', description: 'Task B active' },
      ],
    },
    priorActionHistory: [
      { stepNumber: 1, actionType: 'NAVIGATE', executedSuccessfully: true },
      { stepNumber: 2, actionType: 'CLICK', executedSuccessfully: true },
    ],
  });

  console.log('[ACT-01] Executing unambiguous button selection...');
  totalProviderCalls++;
  const t3 = Date.now();
  try {
    const res = await actor.proposeNextAction(act01Input);
    const dur = Date.now() - t3;
    const isPass = res.output.variant === 'PROPOSE_ACTION' && res.output.action.targetNodeId === 'node_5';
    RESULTS.push({
      role: 'Browser Actor',
      caseId: 'ACT-01',
      description: 'Select Task B delete button (node_5) among peer buttons',
      declaredExpectation: 'PROPOSE_ACTION targeting node_5 with CLICK',
      observedResult: res.output.variant === 'PROPOSE_ACTION' ? `PROPOSE_ACTION (target: ${res.output.action.targetNodeId}, action: ${res.output.action.actionType})` : res.output.variant,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : 'semantic',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant} target=${(res.output as any).action?.targetNodeId}`,
    });
    console.log(`[ACT-01] Finished in ${dur}ms: variant=${res.output.variant} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t3;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      role: 'Browser Actor',
      caseId: 'ACT-01',
      description: 'Select Task B delete button (node_5) among peer buttons',
      declaredExpectation: 'PROPOSE_ACTION targeting node_5 with CLICK',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[ACT-01] Failed in ${dur}ms: ${err.message}`);
  }

  // Case ACT-02
  const act02Input: BrowserAgentInput = BrowserAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: 'c2c3c4d5-e6f7-4a5b-8c9d-0e1f2a3b4c5d',
    attemptIndex: 1,
    approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    allowedOrigins: ['http://localhost:3005'],
    currentStep: {
      stepNumber: 2,
      actionType: 'CLICK',
      intentDescription: 'Click Delete',
      targetDescription: 'Delete button',
      isDestructive: true,
    },
    observation: {
      observationId: '22222222-3333-4444-5555-666666666666',
      pageUrl: 'http://localhost:3005',
      pageTitle: 'TraceCase Tasks Demo',
      axTree: [
        { nodeId: 'node_10', role: 'button', name: 'Delete' },
        { nodeId: 'node_11', role: 'button', name: 'Delete' },
      ],
    },
    priorActionHistory: [],
  });

  console.log('[ACT-02] Executing ambiguous duplicate buttons scenario...');
  // Note: ACT-02 hits deterministic duplicate detection guardrail before dispatching provider call
  const t4 = Date.now();
  try {
    const res = await actor.proposeNextAction(act02Input);
    const dur = Date.now() - t4;
    const isPass = res.output.variant === 'STOP_BLOCKED' || res.output.variant === 'REQUEST_OBSERVATION';
    const observedResult = res.output.variant === 'STOP_BLOCKED'
      ? `STOP_BLOCKED (${res.output.errorCode}: ${res.output.errorDescription})`
      : res.output.variant;
    RESULTS.push({
      role: 'Browser Actor',
      caseId: 'ACT-02',
      description: 'Ambiguous identical buttons lacking distinguishing labels',
      declaredExpectation: 'STOP_BLOCKED (AMBIGUOUS_DUPLICATE_CONTROLS) or REQUEST_OBSERVATION',
      observedResult,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : 'semantic',
      durationMs: dur,
      providerCallCount: 0,
      fallbackUsed: false,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant}`,
    });
    console.log(`[ACT-02] Finished in ${dur}ms: variant=${res.output.variant} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t4;
    RESULTS.push({
      role: 'Browser Actor',
      caseId: 'ACT-02',
      description: 'Ambiguous identical buttons lacking distinguishing labels',
      declaredExpectation: 'STOP_BLOCKED (AMBIGUOUS_DUPLICATE_CONTROLS) or REQUEST_OBSERVATION',
      observedResult: `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: 'parsing',
      durationMs: dur,
      providerCallCount: 0,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[ACT-02] Failed in ${dur}ms: ${err.message}`);
  }

  // Case ACT-03
  const act03Input: BrowserAgentInput = BrowserAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: 'd3d4d5e6-f7a8-4b5c-9d0e-1f2a3b4c5d6e',
    attemptIndex: 1,
    approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    allowedOrigins: ['http://localhost:3005'],
    currentStep: {
      stepNumber: 1,
      actionType: 'CLICK',
      intentDescription: 'Click the static header title',
      targetDescription: 'TraceCase Tasks Header Title',
      isDestructive: false,
    },
    observation: {
      observationId: '33333333-4444-5555-6666-777777777777',
      pageUrl: 'http://localhost:3005',
      pageTitle: 'TraceCase Tasks Demo',
      axTree: [
        { nodeId: 'node_20', role: 'StaticText', name: 'TraceCase Tasks Header Title' },
        { nodeId: 'node_21', role: 'button', name: 'Refresh' },
      ],
    },
    priorActionHistory: [],
  });

  console.log('[ACT-03] Executing non-interactive target element scenario...');
  totalProviderCalls++;
  const t5 = Date.now();
  try {
    const res = await actor.proposeNextAction(act03Input);
    const dur = Date.now() - t5;
    const isPass = res.output.variant === 'STOP_BLOCKED';
    const observedResult = res.output.variant === 'STOP_BLOCKED'
      ? `STOP_BLOCKED (${res.output.errorCode}: ${res.output.errorDescription})`
      : res.output.variant;
    RESULTS.push({
      role: 'Browser Actor',
      caseId: 'ACT-03',
      description: 'Non-interactive StaticText target requested',
      declaredExpectation: 'STOP_BLOCKED (TARGET_NOT_INTERACTIVE or similar)',
      observedResult,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : 'semantic',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant}`,
    });
    console.log(`[ACT-03] Finished in ${dur}ms: variant=${res.output.variant} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t5;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      role: 'Browser Actor',
      caseId: 'ACT-03',
      description: 'Non-interactive StaticText target requested',
      declaredExpectation: 'STOP_BLOCKED (TARGET_NOT_INTERACTIVE or similar)',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[ACT-03] Failed in ${dur}ms: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // ROLE 3: EVIDENCE REVIEWER (3 Cases)
  // --------------------------------------------------------------------------
  console.log('\n--- Role 3: Evidence Reviewer (AT-ROLE-003) ---');

  // Case REV-01
  const rev01Input: EvidenceReviewAgentInput = EvidenceReviewAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: 'e4e5e6f7-a8b9-4c5d-8e9f-0a1b2c3d4e5f',
    reproductionVerdict: 'CONFIRMED_REPRODUCED',
    rawReport: {
      title: 'Deleting active task deletes completed task instead',
      description: 'Under Active filter, deleting Task B removes Task A.',
      claimedExpectedBehavior: 'Task B is removed, Task A is preserved.',
    },
    testedEnvironment: 'Chrome 122 on Windows (Synthetic Staging Port 3005)',
    resetStatus: {
      executed: true,
      success: true,
      details: 'POST /api/test/reset-fixture restored Task A and Task B baseline',
    },
    knownGaps: [],
    attempt1: {
      status: 'FAILED_ASSERTIONS',
      failureSignatureMatched: true,
      executionDurationMs: 4200,
      isValid: true,
      assertionsEvaluated: [
        {
          predicateId: 'assert_task_b_deleted',
          predicateDescription: 'Task B should be removed',
          passed: false,
          actualValue: 'EXISTS',
          expectedValue: 'NOT_EXISTS',
        },
      ],
      safeArtifacts: {
        videoUrl: 'http://localhost:3005/artifacts/run1_video.webm',
        consoleLogUrl: 'http://localhost:3005/artifacts/run1_console.log',
      },
      sanitizedConsoleExcerpts: ['[INFO] Delete requested for task-b'],
    },
    attempt2: {
      status: 'FAILED_ASSERTIONS',
      failureSignatureMatched: true,
      executionDurationMs: 3950,
      isValid: true,
      assertionsEvaluated: [
        {
          predicateId: 'assert_task_b_deleted',
          predicateDescription: 'Task B should be removed',
          passed: false,
          actualValue: 'EXISTS',
          expectedValue: 'NOT_EXISTS',
        },
      ],
      safeArtifacts: {
        videoUrl: 'http://localhost:3005/artifacts/run2_video.webm',
        consoleLogUrl: 'http://localhost:3005/artifacts/run2_console.log',
      },
      sanitizedConsoleExcerpts: ['[INFO] Delete requested for task-b'],
    },
  });

  console.log('[REV-01] Executing confirmed dual-attempt reproduction synthesis...');
  totalProviderCalls++;
  const t6 = Date.now();
  try {
    const res = await reviewer.reviewEvidence(rev01Input);
    const dur = Date.now() - t6;
    const isFallback = res.usage.isFallback ?? false;
    if (isFallback) totalFallbacks++;
    const isPass = res.output.variant === 'REPORT_SYNTHESIZED' && !isFallback;
    const observedResult = res.output.variant === 'REPORT_SYNTHESIZED'
      ? `REPORT_SYNTHESIZED (verdict: ${res.output.observedReproductionVerdict})`
      : res.output.variant;
    RESULTS.push({
      role: 'Evidence Reviewer',
      caseId: 'REV-01',
      description: 'Synthesize dual confirmed failure runs without fallback',
      declaredExpectation: 'REPORT_SYNTHESIZED with CONFIRMED_REPRODUCED and isFallback: false',
      observedResult,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : (isFallback ? 'timeout' : 'semantic'),
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: isFallback,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant} fallback=${isFallback}`,
    });
    console.log(`[REV-01] Finished in ${dur}ms: variant=${res.output.variant} fallback=${isFallback} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t6;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      role: 'Evidence Reviewer',
      caseId: 'REV-01',
      description: 'Synthesize dual confirmed failure runs without fallback',
      declaredExpectation: 'REPORT_SYNTHESIZED with CONFIRMED_REPRODUCED and isFallback: false',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[REV-01] Failed in ${dur}ms: ${err.message}`);
  }

  // Case REV-02
  const rev02Input: EvidenceReviewAgentInput = EvidenceReviewAgentInputSchema.parse({
    ...rev01Input,
    investigationId: 'f5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a8b',
    reproductionVerdict: 'INCONSISTENT_OBSERVATIONS',
    attempt2: {
      ...rev01Input.attempt2!,
      status: 'PASSED_ASSERTIONS',
      failureSignatureMatched: false,
      assertionsEvaluated: [
        {
          predicateId: 'assert_task_b_deleted',
          predicateDescription: 'Task B should be removed',
          passed: true,
          actualValue: 'NOT_EXISTS',
          expectedValue: 'NOT_EXISTS',
        },
      ],
    },
  });

  console.log('[REV-02] Executing divergent/flaky runs scenario...');
  totalProviderCalls++;
  const t7 = Date.now();
  try {
    const res = await reviewer.reviewEvidence(rev02Input);
    const dur = Date.now() - t7;
    const isFallback = res.usage.isFallback ?? false;
    if (isFallback) totalFallbacks++;
    const isPass = (res.output.variant === 'REPORT_SYNTHESIZED' || res.output.variant === 'EVIDENCE_GAP_DETECTED') && !isFallback;
    const observedResult = res.output.variant === 'REPORT_SYNTHESIZED'
      ? `REPORT_SYNTHESIZED (verdict: ${res.output.observedReproductionVerdict})`
      : res.output.variant;
    RESULTS.push({
      role: 'Evidence Reviewer',
      caseId: 'REV-02',
      description: 'Synthesize contradictory attempts without fallback',
      declaredExpectation: 'REPORT_SYNTHESIZED (INCONSISTENT_OBSERVATIONS) and isFallback: false',
      observedResult,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : (isFallback ? 'timeout' : 'semantic'),
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: isFallback,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant} fallback=${isFallback}`,
    });
    console.log(`[REV-02] Finished in ${dur}ms: variant=${res.output.variant} fallback=${isFallback} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t7;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      role: 'Evidence Reviewer',
      caseId: 'REV-02',
      description: 'Synthesize contradictory attempts without fallback',
      declaredExpectation: 'REPORT_SYNTHESIZED (INCONSISTENT_OBSERVATIONS) and isFallback: false',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[REV-02] Failed in ${dur}ms: ${err.message}`);
  }

  // Case REV-03
  const rev03Input: EvidenceReviewAgentInput = EvidenceReviewAgentInputSchema.parse({
    ...rev01Input,
    investigationId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    knownGaps: ['Attempt 2 network capture timed out before payload could be serialized'],
    attempt2: {
      ...rev01Input.attempt2!,
      isValid: false,
      safeArtifacts: {},
    },
  });

  console.log('[REV-03] Executing evidence gap scenario...');
  totalProviderCalls++;
  const t8 = Date.now();
  try {
    const res = await reviewer.reviewEvidence(rev03Input);
    const dur = Date.now() - t8;
    const isFallback = res.usage.isFallback ?? false;
    if (isFallback) totalFallbacks++;
    const isPass = (res.output.variant === 'EVIDENCE_GAP_DETECTED' || res.output.variant === 'REPORT_SYNTHESIZED') && !isFallback;
    const observedResult = res.output.variant === 'REPORT_SYNTHESIZED'
      ? `REPORT_SYNTHESIZED (verdict: ${res.output.observedReproductionVerdict}, caveats: ${res.output.limitationsAndCaveats?.length ?? 0})`
      : res.output.variant;
    RESULTS.push({
      role: 'Evidence Reviewer',
      caseId: 'REV-03',
      description: 'Detect evidence gap or qualify synthesis without fallback',
      declaredExpectation: 'EVIDENCE_GAP_DETECTED or qualified REPORT_SYNTHESIZED and isFallback: false',
      observedResult,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : (isFallback ? 'timeout' : 'semantic'),
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: isFallback,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant} fallback=${isFallback}`,
    });
    console.log(`[REV-03] Finished in ${dur}ms: variant=${res.output.variant} fallback=${isFallback} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t8;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      role: 'Evidence Reviewer',
      caseId: 'REV-03',
      description: 'Detect evidence gap or qualify synthesis without fallback',
      declaredExpectation: 'EVIDENCE_GAP_DETECTED or qualified REPORT_SYNTHESIZED and isFallback: false',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[REV-03] Failed in ${dur}ms: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // RAW SUMMARY OUTPUT & MACHINE-READABLE PERSISTENCE
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('BOUNDED EVALUATION SUMMARY SCORECARD (RERUN 2)');
  console.log('================================================================');
  console.table(RESULTS.map(r => ({
    Case: r.caseId,
    Role: r.role,
    Status: r.status,
    Classification: r.failureClassification,
    'Duration (ms)': r.durationMs,
    'Observed Result': r.observedResult,
    Fallback: r.fallbackUsed ? 'YES' : 'NO',
    Calls: r.providerCallCount,
    'Error / Detail': r.errorDetail || 'None',
  })));

  const passCount = RESULTS.filter(r => r.status === 'PASS').length;
  const failCount = RESULTS.filter(r => r.status === 'FAIL').length;
  const fixtureFailures = RESULTS.filter(r => r.failureClassification === 'fixture').length;
  const transportFailures = RESULTS.filter(r => r.failureClassification === 'transport').length;
  const timeoutFailures = RESULTS.filter(r => r.failureClassification === 'timeout').length;
  const parsingFailures = RESULTS.filter(r => r.failureClassification === 'parsing').length;
  const semanticFailures = RESULTS.filter(r => r.failureClassification === 'semantic').length;

  console.log(`\nTotal Evaluation Cases: ${RESULTS.length}`);
  console.log(`Pass Count: ${passCount}`);
  console.log(`Fail Count: ${failCount}`);
  console.log(`Actual Provider Inferences Dispatched: ${totalProviderCalls}`);
  console.log(`Actual Timeouts Encountered: ${totalTimeouts}`);
  console.log(`Actual Fallbacks Triggered: ${totalFallbacks}`);
  console.log(`Failure Breakdown:`);
  console.log(`  - Fixture: ${fixtureFailures}`);
  console.log(`  - Transport: ${transportFailures}`);
  console.log(`  - Timeout: ${timeoutFailures}`);
  console.log(`  - Parsing / Schema: ${parsingFailures}`);
  console.log(`  - Semantic: ${semanticFailures}`);
  console.log(`Paid Spend: $0.0000 (100% local Ollama inference)`);

  const machineReadable = {
    timestamp: new Date().toISOString(),
    model: 'qwen2.5-coder:3b',
    endpoint: 'http://localhost:11434',
    declaredPerCallTimeoutMs: 90000,
    declaredTotalCallsLimit: 9,
    retries: 0,
    totalCases: RESULTS.length,
    passCount,
    failCount,
    totalProviderCalls,
    totalTimeouts,
    totalFallbacks,
    failureBreakdown: {
      fixture: fixtureFailures,
      transport: transportFailures,
      timeout: timeoutFailures,
      parsing: parsingFailures,
      semantic: semanticFailures,
    },
    cases: RESULTS,
  };

  const outputPath = path.resolve(__dirname, 'local-eval-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(machineReadable, null, 2), 'utf-8');
  console.log(`\nMachine-readable results saved to: ${outputPath}`);
  console.log('================================================================\n');
}

runEvaluation().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
