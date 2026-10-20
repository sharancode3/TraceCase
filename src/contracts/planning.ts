import { z } from 'zod';
import { ActionTierSchema } from './status';

export const SupportedToolKindSchema = z.enum([
  'navigate',
  'click_button',
  'click_link',
  'fill_input',
  'select_option',
  'set_checkbox',
  'press_key',
  'hover_element',
  'scroll_page',
  'inspect_dom',
  'get_text',
  'screenshot',
  'delete_element',
  'clear_storage',
]);
export type SupportedToolKind = z.infer<typeof SupportedToolKindSchema>;

export const PlanStepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  semanticAction: z.string().min(1).max(200),
  toolKind: SupportedToolKindSchema,
  selector: z.string().max(500).optional(),
  value: z.string().max(1000).optional(),
  tier: ActionTierSchema,
  timeoutMs: z.number().int().positive().max(60000).default(15000),
  rationale: z.string().max(500).optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

/**
 * Supported typed assertion vocabulary for deterministic verification.
 * Replaces free-text strings with executable, inspectable checks.
 */
export const TypedAssertionKindSchema = z.enum([
  'ENTITY_PRESENCE',
  'VALUE_COMPARISON',
  'READBACK_STATE',
  'NETWORK_OBSERVATION',
  'CONSOLE_LOG_OBSERVATION',
]);
export type TypedAssertionKind = z.infer<typeof TypedAssertionKindSchema>;

export const TypedAssertionOperatorSchema = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'NOT_CONTAINS',
  'EXISTS',
  'NOT_EXISTS',
  'MATCHES_REGEX',
  'GREATER_THAN',
  'LESS_THAN',
]);
export type TypedAssertionOperator = z.infer<typeof TypedAssertionOperatorSchema>;

export const ObservationSourceSchema = z.enum([
  'DOM_TEXT',
  'DOM_ATTRIBUTE',
  'DOM_ELEMENT',
  'TARGET_READBACK_API',
  'NETWORK_RESPONSE',
  'CONSOLE_LOG',
]);
export type ObservationSource = z.infer<typeof ObservationSourceSchema>;

export const AssertionPurposeSchema = z.enum([
  'PRECONDITION',
  'EXPECTED_CORRECT_BEHAVIOR',
  'REPORTED_FAILURE_SIGNATURE',
]);
export type AssertionPurpose = z.infer<typeof AssertionPurposeSchema>;

export const AssertionEvaluationResultSchema = z.enum([
  'SATISFIED',
  'NOT_SATISFIED',
  'OBSERVATION_UNAVAILABLE',
  'UNSUPPORTED',
  'INVALID_EVALUATION',
]);
export type AssertionEvaluationResult = z.infer<typeof AssertionEvaluationResultSchema>;

export const TypedAssertionSchema = z.object({
  id: z.string().uuid(),
  kind: TypedAssertionKindSchema,
  source: ObservationSourceSchema,
  purpose: AssertionPurposeSchema,
  subjectRef: z.string().min(1).max(500),
  operator: TypedAssertionOperatorSchema,
  expectedValue: z.string().max(2000).optional(),
  settlingPoint: z.enum(['IMMEDIATE', 'AFTER_NETWORK_IDLE', 'AFTER_DOM_STABLE', 'AFTER_RESET']).default('AFTER_NETWORK_IDLE'),
  description: z.string().min(3).max(500),
});
export type TypedAssertion = z.infer<typeof TypedAssertionSchema>;

/**
 * Pure model proposal output (Luna Role 2).
 * Contains ONLY proposed parameters without server-owned authoritative fields.
 */
export const ModelExperimentProposalSchema = z.object({
  preconditions: z.array(z.string().min(1)).min(1),
  steps: z.array(PlanStepSchema).min(1).max(30),
  expectedCorrectBehavior: z.string().min(5),
  reportedFailureSignature: z.string().min(5),
  assertions: z.array(TypedAssertionSchema).min(1),
  requiresResetHook: z.boolean().default(true),
  rationale: z.string().max(1000).optional(),
}).strict(); // Server owns ID, version, targetUrl, planHash, createdAt
export type ModelExperimentProposal = z.infer<typeof ModelExperimentProposalSchema>;

/**
 * Authoritative, server-enriched execution plan.
 * Used for live cryptographic approval binding and execution.
 */
export const AuthoritativeExperimentPlanSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  version: z.number().int().positive(),
  targetId: z.string().uuid(),
  targetUrl: z.string().url(),
  allowedOrigins: z.array(z.string().url()).min(1),
  testAccountRef: z.string().max(100).nullable().optional(),
  preconditions: z.array(z.string()).min(1),
  steps: z.array(PlanStepSchema).min(1).max(30),
  expectedCorrectBehavior: z.string().min(5),
  reportedFailureSignature: z.string().min(5),
  assertions: z.array(TypedAssertionSchema).min(1),
  maxAttempts: z.literal(2).default(2), // Enforcing two-run invariant TC-INV-002
  maxDurationMs: z.number().int().positive().default(120000),
  requiresResetHook: z.boolean().default(true),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be valid SHA-256 hex string'),
  createdAt: z.string().datetime(),
});
export type AuthoritativeExperimentPlan = z.infer<typeof AuthoritativeExperimentPlanSchema>;

/**
 * Legacy experiment plan schema.
 * Preserved for existing preview fixtures and tests.
 */
export const ExperimentPlanSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  version: z.number().int().positive(),
  targetUrl: z.string().url(),
  preconditions: z.array(z.string()).min(1),
  steps: z.array(PlanStepSchema).min(1).max(30),
  expectedCorrectBehavior: z.string().min(5),
  reportedFailureSignature: z.string().min(5),
  verificationCriteria: z.array(z.string()).min(1),
  maxAttempts: z.literal(2).default(2),
  requiresResetHook: z.boolean().default(true),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be valid SHA-256 hex string'),
  createdAt: z.string().datetime(),
});
export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;

/**
 * Command schema for requesting experiment planning / replanning.
 */
export const RequestPlanningCommandSchema = z.object({
  investigationId: z.string().uuid('Valid investigation ID is required'),
  userGuidance: z.string().trim().max(1000).optional(),
  expectedWorkflowRevision: z.number().int().positive().optional(),
}).strict();
export type RequestPlanningCommand = z.infer<typeof RequestPlanningCommandSchema>;

/**
 * Command schema for human operator plan approval (TC-INV-003, TC-INV-004)
 */
export const ApprovePlanCommandSchema = z.object({
  investigationId: z.string().uuid('Valid investigation ID is required'),
  planVersion: z.number().int().positive('Plan version must be positive integer'),
  approvedPlanHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must match plan SHA-256 hash'),
  operatorNotes: z.string().max(500).optional(),
  expectedWorkflowRevision: z.number().int().positive().optional(),
}).strict(); // Server owns approvedBy, approvedAt, and status transition
export type ApprovePlanCommand = z.infer<typeof ApprovePlanCommandSchema>;

/**
 * Command schema for human operator plan rejection.
 */
export const RejectPlanCommandSchema = z.object({
  investigationId: z.string().uuid('Valid investigation ID is required'),
  planVersion: z.number().int().positive('Plan version must be positive integer'),
  rejectionReason: z.string().trim().min(3, 'Rejection reason must be at least 3 characters').max(1000),
  expectedWorkflowRevision: z.number().int().positive().optional(),
}).strict();
export type RejectPlanCommand = z.infer<typeof RejectPlanCommandSchema>;

/**
 * Command schema for revoking a previously granted plan approval.
 */
export const RevokeApprovalCommandSchema = z.object({
  investigationId: z.string().uuid('Valid investigation ID is required'),
  planVersion: z.number().int().positive('Plan version must be positive integer'),
  revocationReason: z.string().trim().min(3, 'Revocation reason must be at least 3 characters').max(1000),
  expectedWorkflowRevision: z.number().int().positive().optional(),
}).strict();
export type RevokeApprovalCommand = z.infer<typeof RevokeApprovalCommandSchema>;

/**
 * Command schema for initiating execution of an approved investigation.
 */
export const StartInvestigationCommandSchema = z.object({
  investigationId: z.string().uuid('Valid investigation ID is required'),
  planVersion: z.number().int().positive('Plan version must be positive integer'),
  approvedPlanHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must match plan SHA-256 hash'),
  expectedWorkflowRevision: z.number().int().positive().optional(),
}).strict();
export type StartInvestigationCommand = z.infer<typeof StartInvestigationCommandSchema>;

/**
 * Command schema for cancelling an investigation pre-execution.
 */
export const CancelInvestigationCommandSchema = z.object({
  investigationId: z.string().uuid('Valid investigation ID is required'),
  cancellationReason: z.string().trim().min(3, 'Cancellation reason must be at least 3 characters').max(1000),
  expectedWorkflowRevision: z.number().int().positive().optional(),
}).strict();
export type CancelInvestigationCommand = z.infer<typeof CancelInvestigationCommandSchema>;

/**
 * Authoritative plan approval record with complete scope binding.
 */
export const AuthoritativeApprovalRecordSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
  targetId: z.string().uuid(),
  authorizedActorId: z.string().min(1),
  maxActionTierPermitted: ActionTierSchema.default('TIER_3_MUTATING_INTERACTION'),
  operatorNotes: z.string().nullable().optional(),
  approvedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type AuthoritativeApprovalRecord = z.infer<typeof AuthoritativeApprovalRecordSchema>;

/**
 * Legacy plan approval record schema for preview fixtures.
 */
export const PlanApprovalRecordSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  planHash: z.string(),
  approvedBy: z.string(),
  operatorNotes: z.string().nullable(),
  approvedAt: z.string().datetime(),
});
export type PlanApprovalRecord = z.infer<typeof PlanApprovalRecordSchema>;
