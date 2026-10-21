import { EvaluationCase } from '../case-schema';
import { TC1_ARRAY_OFFSET_CASE } from './tc1-array-offset';
import { TC2_CLEAN_BUILD_CASE } from './tc2-clean-build';
import { TC3_SANDBOX_GUARDRAIL_CASE } from './tc3-sandbox-guardrail';
import { TC4_SECRET_REDACTION_CASE } from './tc4-secret-redaction';
import { NEGATIVE_AMBIGUOUS_REPORT_CASE } from './negative-ambiguous-report';
import { NEGATIVE_PROMPT_INJECTION_CASE } from './negative-prompt-injection';
import {
  NEGATIVE_REVOKED_APPROVAL_CASE,
  NEGATIVE_FAILED_RESET_CASE,
  NEGATIVE_MUTATION_TIMEOUT_CASE,
  NEGATIVE_UNSUPPORTED_CHECK_CASE,
  NEGATIVE_WRONG_RECORD_CASE,
} from './negative-cases';
import { PROMPT_DEV_FILTER_EXAMPLE } from './dev-examples';

export * from './tc1-array-offset';
export * from './tc2-clean-build';
export * from './tc3-sandbox-guardrail';
export * from './tc4-secret-redaction';
export * from './negative-ambiguous-report';
export * from './negative-prompt-injection';
export * from './negative-cases';
export * from './dev-examples';

export const ALL_EVALUATION_CASES: EvaluationCase[] = [
  TC1_ARRAY_OFFSET_CASE,
  TC2_CLEAN_BUILD_CASE,
  TC3_SANDBOX_GUARDRAIL_CASE,
  TC4_SECRET_REDACTION_CASE,
  NEGATIVE_AMBIGUOUS_REPORT_CASE,
  NEGATIVE_PROMPT_INJECTION_CASE,
  NEGATIVE_REVOKED_APPROVAL_CASE,
  NEGATIVE_FAILED_RESET_CASE,
  NEGATIVE_MUTATION_TIMEOUT_CASE,
  NEGATIVE_UNSUPPORTED_CHECK_CASE,
  NEGATIVE_WRONG_RECORD_CASE,
  PROMPT_DEV_FILTER_EXAMPLE,
];

/**
 * Benchmark holdout set strictly reserved for independent evaluation
 */
export const RESERVED_BENCHMARK_CASES: EvaluationCase[] = ALL_EVALUATION_CASES.filter(
  (c) => c.datasetPartition === 'RESERVED_EVALUATION_HOLDOUT'
);

/**
 * Cases permitted for prompt engineering, tuning, and few-shot examples
 */
export const PROMPT_DEV_EXAMPLES: EvaluationCase[] = ALL_EVALUATION_CASES.filter(
  (c) => c.datasetPartition === 'PROMPT_DEV_TRAINING'
);

export function getEvaluationCaseById(caseId: string): EvaluationCase | undefined {
  return ALL_EVALUATION_CASES.find((c) => c.caseId === caseId);
}
