import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExperimentPlan, PlanStep } from '@/contracts/planning';
import { PlanStepSchema, TypedAssertionSchema } from '@/contracts/planning';

/**
 * Deterministically serializes an object by sorting all object keys recursively.
 * Ensures consistent hash generation across environments regardless of property insertion order.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null) return 'null';
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      throw new Error(`[TraceCase Fingerprint] Invalid non-finite number: ${obj}`);
    }
    return JSON.stringify(obj);
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys
    .filter((key) => (obj as Record<string, unknown>)[key] !== undefined)
    .map((key) => {
      const val = (obj as Record<string, unknown>)[key];
      return JSON.stringify(key) + ':' + canonicalJsonStringify(val);
    });

  return '{' + pairs.join(',') + '}';
}

/**
 * Strict schema for authoritative plan scope fingerprinting.
 * Covers all material execution scope agreed for the experiment (TC-INV-004).
 * Volatile metadata (id, investigationId, planHash, createdAt) is stripped.
 */
export const AuthoritativePlanFingerprintPayloadSchema = z.object({
  // Volatile metadata allowed on incoming plan objects but stripped from hash calculation
  id: z.string().optional(),
  investigationId: z.string().optional(),
  planHash: z.string().optional(),
  createdAt: z.string().optional(),

  // Material execution scope
  version: z.number().int().positive(),
  targetId: z.string().uuid(),
  targetUrl: z.string().url(),
  allowedOrigins: z.array(z.string().url()).min(1),
  testAccountRef: z.string().nullable().optional(),
  preconditions: z.array(z.string().trim().min(1)).min(1),
  steps: z.array(PlanStepSchema).min(1).max(30),
  expectedCorrectBehavior: z.string().trim().min(5),
  reportedFailureSignature: z.string().trim().min(5),
  assertions: z.array(TypedAssertionSchema).min(1),
  maxAttempts: z.literal(2),
  maxDurationMs: z.number().int().positive(),
  requiresResetHook: z.boolean(),
  fixtureScope: z.string().optional(),
  expectedBaseline: z.record(z.unknown()).optional(),
});
export type AuthoritativePlanFingerprintPayload = z.infer<typeof AuthoritativePlanFingerprintPayloadSchema>;

/**
 * Calculates SHA-256 fingerprint for live authoritative experiment plans.
 *
 * Rules:
 * 1. Semantic step order is STRICTLY PRESERVED (changing step order changes hash).
 * 2. Preconditions are sorted as a set.
 * 3. Object keys are canonicalized recursively.
 * 4. Incomplete or invalid payloads fail closed (throw ZodError).
 */
export function calculateAuthoritativePlanFingerprint(rawPlan: unknown): string {
  const validated = AuthoritativePlanFingerprintPayloadSchema.parse(rawPlan);

  const canonicalPayload = {
    version: validated.version,
    targetId: validated.targetId,
    targetUrl: validated.targetUrl,
    allowedOrigins: validated.allowedOrigins.slice().sort(),
    testAccountRef: validated.testAccountRef ?? null,
    preconditions: validated.preconditions.slice().sort(),
    // Steps preserve explicit sequence order - do not sort steps!
    steps: validated.steps.map((step) => ({
      stepIndex: step.stepIndex,
      semanticAction: step.semanticAction,
      toolKind: step.toolKind,
      selector: step.selector ?? null,
      value: step.value ?? null,
      tier: step.tier,
      timeoutMs: step.timeoutMs,
      rationale: step.rationale ?? null,
    })),
    expectedCorrectBehavior: validated.expectedCorrectBehavior,
    reportedFailureSignature: validated.reportedFailureSignature,
    assertions: validated.assertions
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        source: a.source,
        purpose: a.purpose,
        subjectRef: a.subjectRef,
        operator: a.operator,
        expectedValue: a.expectedValue ?? null,
        settlingPoint: a.settlingPoint,
        description: a.description,
      })),
    maxAttempts: validated.maxAttempts,
    maxDurationMs: validated.maxDurationMs,
    requiresResetHook: validated.requiresResetHook,
    fixtureScope: validated.fixtureScope ?? null,
    expectedBaseline: validated.expectedBaseline ?? null,
  };

  const canonicalString = canonicalJsonStringify(canonicalPayload);
  return createHash('sha256').update(canonicalString, 'utf8').digest('hex');
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
 * Calculates a SHA-256 fingerprint of the execution plan's material scope for legacy previews.
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
