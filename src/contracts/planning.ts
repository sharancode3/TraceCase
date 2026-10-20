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
  maxAttempts: z.literal(2).default(2), // Enforcing two-run invariant TC-INV-002
  requiresResetHook: z.boolean().default(true),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be valid SHA-256 hex string'),
  createdAt: z.string().datetime(),
});
export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;

/**
 * Command schema for human operator plan approval (TC-INV-003, TC-INV-004)
 */
export const ApprovePlanCommandSchema = z.object({
  investigationId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  approvedPlanHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must match plan SHA-256 hash'),
  operatorNotes: z.string().max(500).optional(),
}).strict(); // Server owns approvedBy, approvedAt, and status transition
export type ApprovePlanCommand = z.infer<typeof ApprovePlanCommandSchema>;

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
