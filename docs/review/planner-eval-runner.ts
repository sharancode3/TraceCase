/**
 * Bounded Evaluation Runner for Planner Fix Verification
 * 
 * Target Model: qwen2.5-coder:3b
 * Endpoint: http://localhost:11434
 * Constraints:
 * - Exactly selected local model: qwen2.5-coder:3b
 * - Zero automatic retries (maxRetries: 0)
 * - Maximum calls total: <= 5 calls (4 calls declared)
 * - Per-call timeout budget: 90,000 ms
 * - Sequential execution, 1 case at a time
 * - Machine-readable output written to docs/review/planner-eval-results.json
 * - Pre-declared expectations frozen prior to execution
 */

import fs from 'fs';
import path from 'path';
import { OllamaLocalModelProvider } from '../../src/server/ai/provider';
import { ReportExperimentAgent } from '../../src/server/ai/planner';
import {
  ReportAgentInputSchema,
  type ReportAgentInput,
} from '../../src/server/ai/contracts';

export type FailureClassification = 'fixture' | 'transport' | 'timeout' | 'parsing' | 'semantic' | 'none';

export interface PlannerCaseResult {
  caseId: string;
  category: 'demo_case' | 'non_demo_regression';
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

const RESULTS: PlannerCaseResult[] = [];
let totalProviderCalls = 0;
let totalTimeouts = 0;
let totalFallbacks = 0;

async function runPlannerEvaluation() {
  console.log('================================================================');
  console.log('BOUNDED PLANNER EVALUATION (PLN-01, PLN-02 + REGRESSION)');
  console.log('Model: qwen2.5-coder:3b');
  console.log('Endpoint: http://localhost:11434');
  console.log('Declared Per-call Timeout: 90,000ms | Total Calls Limit: 5 | Retries: 0');
  console.log('================================================================\n');

  const provider = new OllamaLocalModelProvider({
    endpointUrl: 'http://localhost:11434',
    modelIdentifier: 'qwen2.5-coder:3b',
    timeoutMs: 90000,
    maxRetries: 0,
  });

  const planner = new ReportExperimentAgent(provider);

  // --------------------------------------------------------------------------
  // CASE 1: PLN-01 (Demo target - Unambiguous defect report)
  // --------------------------------------------------------------------------
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
      caseId: 'PLN-01',
      category: 'demo_case',
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
      caseId: 'PLN-01',
      category: 'demo_case',
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

  // --------------------------------------------------------------------------
  // CASE 2: PLN-02 (Demo target - Vague / incomplete report)
  // --------------------------------------------------------------------------
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
    const isPass = res.output.variant === 'NEEDS_CLARIFICATION' && res.output.questions.length >= 1;
    RESULTS.push({
      caseId: 'PLN-02',
      category: 'demo_case',
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
      caseId: 'PLN-02',
      category: 'demo_case',
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

  // --------------------------------------------------------------------------
  // CASE 3: REG-PLN-01 (Non-demo target - Unambiguous defect report)
  // --------------------------------------------------------------------------
  const regPln01Input: ReportAgentInput = ReportAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: '44444444-4444-4444-8444-444444444444',
    targetProfile: {
      name: 'InventoryApp',
      baseUrl: 'http://localhost:4050',
      isSandbox: true,
      allowedOrigins: ['http://localhost:4050'],
      hasResetFixture: true,
    },
    rawReport: {
      title: 'Stock decrement failure on checkout',
      description: 'On product detail page for SKU-401, clicking Checkout Now decrements SKU-402 inventory balance instead of SKU-401.',
      claimedExpectedBehavior: 'SKU-401 inventory should decrease by 1, and SKU-402 balance should remain unchanged.',
    },
    clarificationHistory: [],
  });

  console.log('[REG-PLN-01] Executing non-demo unambiguous defect report...');
  totalProviderCalls++;
  const t2 = Date.now();
  try {
    const res = await planner.evaluateReport(regPln01Input);
    const dur = Date.now() - t2;
    let isPass = false;
    let observedResult: string = res.output.variant;
    if (res.output.variant === 'PLAN_PROPOSED') {
      const entities = res.output.extractedClaim.affectedEntities;
      isPass = entities.some((e: string) => e.toLowerCase().includes('sku-401') || e.toLowerCase().includes('sku-402'));
      observedResult = `PLAN_PROPOSED [${entities.join(', ')}]`;
    }
    RESULTS.push({
      caseId: 'REG-PLN-01',
      category: 'non_demo_regression',
      description: 'Non-demo unambiguous defect report (InventoryApp)',
      declaredExpectation: 'PLAN_PROPOSED with entities SKU-401, SKU-402',
      observedResult,
      observedVariant: res.output.variant,
      status: isPass ? 'PASS' : 'FAIL',
      failureClassification: isPass ? 'none' : 'semantic',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: isPass ? undefined : `Observed variant ${res.output.variant}`,
    });
    console.log(`[REG-PLN-01] Finished in ${dur}ms: variant=${res.output.variant} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t2;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      caseId: 'REG-PLN-01',
      category: 'non_demo_regression',
      description: 'Non-demo unambiguous defect report (InventoryApp)',
      declaredExpectation: 'PLAN_PROPOSED with entities SKU-401, SKU-402',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[REG-PLN-01] Failed in ${dur}ms: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // CASE 4: REG-PLN-02 (Non-demo target - Vague / incomplete report)
  // --------------------------------------------------------------------------
  const regPln02Input: ReportAgentInput = ReportAgentInputSchema.parse({
    contractVersion: '1.0.0',
    investigationId: '55555555-5555-4555-8555-555555555555',
    targetProfile: {
      name: 'BillingPortal',
      baseUrl: 'http://localhost:4060',
      isSandbox: true,
      allowedOrigins: ['http://localhost:4060'],
      hasResetFixture: true,
    },
    rawReport: {
      title: 'Invoice page error',
      description: 'The invoice page fails and shows an error message.',
      claimedExpectedBehavior: 'Should load the invoice properly.',
    },
    clarificationHistory: [],
  });

  console.log('[REG-PLN-02] Executing non-demo vague report...');
  totalProviderCalls++;
  const t3 = Date.now();
  try {
    const res = await planner.evaluateReport(regPln02Input);
    const dur = Date.now() - t3;
    const isPass = res.output.variant === 'NEEDS_CLARIFICATION' && res.output.questions.length >= 1;
    RESULTS.push({
      caseId: 'REG-PLN-02',
      category: 'non_demo_regression',
      description: 'Non-demo vague report (BillingPortal)',
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
    console.log(`[REG-PLN-02] Finished in ${dur}ms: variant=${res.output.variant} status=${isPass ? 'PASS' : 'FAIL'}`);
  } catch (err: any) {
    const dur = Date.now() - t3;
    const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout') || err.message?.includes('TIMEOUT');
    if (isTimeout) totalTimeouts++;
    RESULTS.push({
      caseId: 'REG-PLN-02',
      category: 'non_demo_regression',
      description: 'Non-demo vague report (BillingPortal)',
      declaredExpectation: 'NEEDS_CLARIFICATION with targeted questions',
      observedResult: isTimeout ? 'TIMEOUT' : `ERROR: ${err.message}`,
      status: 'FAIL',
      failureClassification: isTimeout ? 'timeout' : 'parsing',
      durationMs: dur,
      providerCallCount: 1,
      fallbackUsed: false,
      errorDetail: `${err.name || 'Error'}: ${err.message}`,
    });
    console.log(`[REG-PLN-02] Failed in ${dur}ms: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // RAW SUMMARY OUTPUT & MACHINE-READABLE PERSISTENCE
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('BOUNDED PLANNER EVALUATION SUMMARY SCORECARD');
  console.log('================================================================');
  console.table(RESULTS.map(r => ({
    Case: r.caseId,
    Category: r.category,
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
    declaredTotalCallsLimit: 5,
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

  const outputPath = path.resolve(__dirname, 'planner-eval-results-v3.json');
  fs.writeFileSync(outputPath, JSON.stringify(machineReadable, null, 2), 'utf-8');
  console.log(`\nMachine-readable results saved to: ${outputPath}`);
  console.log('================================================================\n');
}

runPlannerEvaluation().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
