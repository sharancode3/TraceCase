import { z } from 'zod';
import { ModelExperimentProposalSchema, PlanStepSchema } from './planning';
import { ClarificationQuestionSchema, ProposedClarificationQuestionSchema } from './clarification';

/**
 * AI Role 1: Report Normalization & Experiment Proposal Output
 * Can propose clarification questions, an experiment plan, or an unsupported/blocked explanation.
 */
export const ClarificationProposalSchema = z.object({
  status: z.literal('CLARIFICATION_NEEDED'),
  questions: z.array(ProposedClarificationQuestionSchema.or(ClarificationQuestionSchema)).min(1).max(5),
  preliminaryUnderstanding: z.string().max(1000),
}).strict();

export const ExperimentProposalSchema = z.object({
  status: z.literal('EXPERIMENT_PROPOSED'),
  proposal: ModelExperimentProposalSchema,
}).strict();

export const InabilityToProceedSchema = z.object({
  status: z.literal('UNABLE_TO_PROCEED'),
  reason: z.string().min(5).max(1000),
  missingPrerequisites: z.array(z.string()).min(1),
}).strict();

export const ReportPlannerOutputSchema = z.discriminatedUnion('status', [
  ClarificationProposalSchema,
  ExperimentProposalSchema,
  InabilityToProceedSchema,
]);
export type ReportPlannerOutput = z.infer<typeof ReportPlannerOutputSchema>;

/**
 * AI Role 2: Browser Investigation Agent Output
 * Proposes the next scoped action, requests manual help, stops on no progress,
 * or indicates the procedure reached the settling point for independent verification.
 *
 * CRITICAL SAFETY INVARIANT: The browser agent CANNOT declare the bug reproduced.
 */
export const BrowserActionProposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('EXECUTE_ACTION'),
    action: PlanStepSchema,
    rationale: z.string().max(500),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal('REQUEST_MANUAL_HELP'),
    reason: z.enum(['CAPTCHA_DETECTED', 'OTP_REQUIRED', 'AUTH_EXPIRED', 'BLOCKED_EXTERNAL_HOST']),
    userPrompt: z.string().max(500),
  }),
  z.object({
    kind: z.literal('STOP_NO_PROGRESS'),
    reason: z.string().max(500),
    consecutiveNoProgressSteps: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('READY_FOR_VERIFICATION'),
    rationale: z.string().max(500),
    expectedSettlingPointReached: z.boolean(),
  }),
]);
export type BrowserActionProposal = z.infer<typeof BrowserActionProposalSchema>;

/**
 * AI Role 3: Evidence Review Agent Output
 * Explains locked verification facts and sanitized evidence.
 *
 * CRITICAL SAFETY INVARIANT: The reviewer CANNOT modify verification findings or artifact storage tiers.
 */
export const EvidenceExplanationProposalSchema = z.object({
  investigationId: z.string().uuid(),
  naturalLanguageSummary: z.string().min(10).max(3000),
  verifiedFactsExplanation: z.string().min(10).max(3000),
  observationsVsHypotheses: z.array(
    z.object({
      observation: z.string().max(500),
      hypothesis: z.string().max(500),
    })
  ).max(10),
  evidenceReferences: z.array(
    z.object({
      artifactId: z.string().uuid(),
      description: z.string().max(300),
      timestampOffsetSec: z.number().nonnegative().optional(),
    })
  ).max(20),
  limitationsAndGaps: z.array(z.string().max(500)).max(10),
}).strict();
export type EvidenceExplanationProposal = z.infer<typeof EvidenceExplanationProposalSchema>;
