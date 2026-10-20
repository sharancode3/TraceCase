import { createHash } from 'node:crypto';
import type { ExperimentPlan, PlanStep } from '@/contracts/planning';

/**
 * Deterministically serializes an object by sorting all object keys recursively.
 * Ensures consistent hash generation across environments regardless of property insertion order.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJsonStringify(val);
  });

  return '{' + pairs.join(',') + '}';
}

export interface CanonicalPlanPayload {
  version: number;
  targetUrl: string;
  preconditions: string[];
  steps: Array<{
    stepIndex: number;
    semanticAction: string;
    toolKind: string;
    selector?: string;
    value?: string;
    tier: string;
    timeoutMs: number;
  }>;
  expectedCorrectBehavior: string;
  reportedFailureSignature: string;
  verificationCriteria: string[];
  requiresResetHook: boolean;
}

/**
 * Calculates a SHA-256 fingerprint of the execution plan's material scope (TC-INV-004).
 * Strips volatile metadata (ID, timestamps, prior hash) to ensure deterministic hashing.
 */
export function calculatePlanFingerprint(plan: Partial<ExperimentPlan>): string {
  const canonicalPayload: CanonicalPlanPayload = {
    version: plan.version ?? 1,
    targetUrl: plan.targetUrl ?? '',
    preconditions: (plan.preconditions ?? []).slice().sort(),
    steps: (plan.steps ?? []).map((step: PlanStep) => ({
      stepIndex: step.stepIndex,
      semanticAction: step.semanticAction,
      toolKind: step.toolKind,
      selector: step.selector,
      value: step.value,
      tier: step.tier,
      timeoutMs: step.timeoutMs,
    })),
    expectedCorrectBehavior: plan.expectedCorrectBehavior ?? '',
    reportedFailureSignature: plan.reportedFailureSignature ?? '',
    verificationCriteria: (plan.verificationCriteria ?? []).slice().sort(),
    requiresResetHook: plan.requiresResetHook ?? true,
  };

  const canonicalString = canonicalJsonStringify(canonicalPayload);
  return createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}
