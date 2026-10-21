import type { ZodSchema } from 'zod';
import type {
  ReportAgentInput,
  ReportAgentOutput,
  BrowserAgentInput,
  BrowserDecisionOutput,
  EvidenceReviewAgentInput,
  EvidenceReviewOutput,
  PlanAssertion,
  PrunedAXTreeNode,
  ServerAuthoritativeContext,
  AttemptEvaluationData,
} from './contracts';
import {
  ReportAgentInputSchema,
  ReportAgentOutputSchema,
  BrowserAgentInputSchema,
  BrowserDecisionOutputSchema,
  EvidenceReviewAgentInputSchema,
  EvidenceReviewOutputSchema,
  PlanAssertionSchema,
  PrunedAXTreeNodeSchema,
  ServerAuthoritativeContextSchema,
  AttemptEvaluationDataSchema,
  stripModelAuthorityFields,
} from './contracts';
import type { ModelProviderPort, AiUsageReport, ModelCompletionRequest, ModelCompletionResponse } from './provider';
import { ReportExperimentAgent, type PlannerExecutionResult } from './planner';
import { BrowserInteractionAgent, type BrowserExecutionResult } from './browser-actor';
import { EvidenceReviewAgent, type ReviewerExecutionResult } from './reviewer';
import { DemoTargetClient } from '../../../demo-target/client';
import type {
  SupportedFixtureScope,
  TargetBuildInfo,
  FixtureResetReceipt,
  FixtureReadbackResult,
} from '../../../demo-target/types';
import type {
  ExecutionReceipt,
  AttemptReceipt,
  ResetReceipt,
  EvaluationCase,
} from '../../../evaluation/case-schema';
import {
  ExecutionReceiptSchema,
  AttemptReceiptSchema,
  ResetReceiptSchema,
  EvaluationCaseSchema,
} from '../../../evaluation/case-schema';
import type { ReproductionVerdict, InvestigationLifecycleStatus } from '@/contracts/status';

/**
 * ============================================================================
 * TRACECASE PERSON 2: INTEGRATION CONTRACTS & COMPATIBILITY ADAPTERS (H-01)
 * ============================================================================
 * 
 * Provides an explicit, typed boundary layer connecting:
 * - Person 1 (Lead backend / orchestrator / Playwright worker)
 * - Person 2 (AI roles, controlled target, evaluation harness)
 * - Person 3 (Product UI & evidence pipeline)
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. Model proposals are strictly separated from server-owned authority
 * 2. Stable artifact identifiers (e.g. videoId, consoleLogId) are preserved
 *    independently from transient access URLs
 * 3. Secrets and evaluator ground-truth are strictly excluded from AI role inputs
 * 4. P3 can render all AI outputs directly as typed objects without prose parsing
 * 5. Target resets produce correlated receipts and require independent readback
 */

// ============================================================================
// 1. RECORD OF UNAGREED SHARED CONTRACT DECISIONS
// Explicitly identifies fields and design choices requiring teammate alignment.
// ============================================================================

export interface UnagreedDecisionRecord {
  id: string;
  subsystem: string;
  proposedBy: 'Person 2';
  counterpart: 'Person 1' | 'Person 3' | 'Team';
  description: string;
  person2ProposedSolution: string;
  status: 'PROPOSED_PENDING_AGREEMENT';
  agreementClaimed: false;
}

export const UNAGREED_SHARED_CONTRACT_DECISIONS: readonly UnagreedDecisionRecord[] = [
  {
    id: 'DEC-001',
    subsystem: 'src/contracts/planning.ts',
    proposedBy: 'Person 2',
    counterpart: 'Person 1',
    description: 'Upgrade ExperimentPlan.verificationCriteria from opaque string[] to typed PlanAssertion[].',
    person2ProposedSolution: 'PlanAssertionSchema with predicateId, target, condition, and expectedValue (TC-INV-014).',
    status: 'PROPOSED_PENDING_AGREEMENT',
    agreementClaimed: false,
  },
  {
    id: 'DEC-002',
    subsystem: 'src/server/services/ports.ts',
    proposedBy: 'Person 2',
    counterpart: 'Person 1',
    description: 'Decompose monolithic AiPlannerPort into three discrete role ports matching AT-ROLE-001..003.',
    person2ProposedSolution: 'ReportExperimentAgentPort, BrowserActorPort, EvidenceReviewAgentPort.',
    status: 'PROPOSED_PENDING_AGREEMENT',
    agreementClaimed: false,
  },
  {
    id: 'DEC-003',
    subsystem: 'src/contracts/targets.ts',
    proposedBy: 'Person 2',
    counterpart: 'Person 1',
    description: 'Purge fixtureResetAuthSecret from client-facing TargetProfileSchema.',
    person2ProposedSolution: 'Server-only credential reference injected by trusted backend only.',
    status: 'PROPOSED_PENDING_AGREEMENT',
    agreementClaimed: false,
  },
  {
    id: 'DEC-004',
    subsystem: 'src/contracts/evidence.ts',
    proposedBy: 'Person 2',
    counterpart: 'Person 3',
    description: 'Separate immutable artifact identifiers from transient signed/proxied access URLs.',
    person2ProposedSolution: 'EvidenceArtifactMetadata carries stable artifactId; URLs are ephemeral access tokens.',
    status: 'PROPOSED_PENDING_AGREEMENT',
    agreementClaimed: false,
  },
  {
    id: 'DEC-005',
    subsystem: 'evaluation/case-schema.ts',
    proposedBy: 'Person 2',
    counterpart: 'Person 1',
    description: 'Standardize ExecutionReceiptSchema with ISO-8601 UTC timestamps, attemptPair, and approvedPlanId.',
    person2ProposedSolution: 'Strict deterministic and relational correlation preventing unverified acceptance passes.',
    status: 'PROPOSED_PENDING_AGREEMENT',
    agreementClaimed: false,
  },
] as const;

// ============================================================================
// 2. FORBIDDEN AUTHORITY ENFORCEMENT
// ============================================================================

export const FORBIDDEN_MODEL_AUTHORITY_FIELDS = [
  'isApproved',
  'approvedBy',
  'approvedAt',
  'planHash',
  'investigationId',
  'reproductionVerdict',
  'evidenceReadiness',
  'lifecycleStatus',
  'workerLeaseId',
] as const;

/**
 * Sanitizes any raw object returned by model inference or third-party input.
 * Strips all forbidden authority fields and returns a clean copy.
 */
export function sanitizeModelPayload<T extends Record<string, unknown>>(payload: T): Omit<T, (typeof FORBIDDEN_MODEL_AUTHORITY_FIELDS)[number]> {
  return stripModelAuthorityFields(payload) as Omit<T, (typeof FORBIDDEN_MODEL_AUTHORITY_FIELDS)[number]>;
}

/**
 * Validates that untrusted input does not attempt to assert forbidden authority fields.
 * Throws an explicit error if tampering is detected.
 */
export function assertNoForbiddenAuthority(payload: Record<string, unknown>): void {
  for (const field of FORBIDDEN_MODEL_AUTHORITY_FIELDS) {
    if (field in payload && payload[field] !== undefined) {
      throw new Error(`[TraceCase Security] Forbidden authority field '${field}' detected in model proposal.`);
    }
  }
}

// ============================================================================
// 3. ROLE 1: PLANNER COMPATIBILITY ADAPTER (P1 -> P2 -> P3)
// ============================================================================

export interface PlannerAdapterInput {
  investigationId: string;
  rawReport: {
    title: string;
    description: string;
    environmentClues?: string;
    claimedExpectedBehavior?: string;
  };
  targetProfile: {
    name: string;
    baseUrl: string;
    isSandbox: boolean;
    allowedOrigins: string[];
    hasResetFixture: boolean;
    defaultCredentialsRole?: string;
  };
  clarificationHistory?: Array<{
    questionId: string;
    questionText: string;
    selectedOption: string;
    customText?: string;
  }>;
}

export function createPlannerCompatibilityAdapter(provider: ModelProviderPort) {
  const agent = new ReportExperimentAgent(provider);

  return {
    async evaluateReport(
      input: PlannerAdapterInput,
      options?: { abortSignal?: AbortSignal }
    ): Promise<PlannerExecutionResult> {
      // 1. Strip any accidentally leaked credentials or evaluation-only keys
      const safeInput: ReportAgentInput = ReportAgentInputSchema.parse({
        contractVersion: '1.0.0',
        investigationId: input.investigationId,
        rawReport: {
          title: input.rawReport.title,
          description: input.rawReport.description,
          environmentClues: input.rawReport.environmentClues,
          claimedExpectedBehavior: input.rawReport.claimedExpectedBehavior,
        },
        targetProfile: {
          name: input.targetProfile.name,
          baseUrl: input.targetProfile.baseUrl,
          isSandbox: input.targetProfile.isSandbox,
          allowedOrigins: input.targetProfile.allowedOrigins,
          hasResetFixture: input.targetProfile.hasResetFixture,
          defaultCredentialsRole: input.targetProfile.defaultCredentialsRole,
        },
        clarificationHistory: input.clarificationHistory ?? [],
      });

      // 2. Execute agent
      const result = await agent.evaluateReport(safeInput, options);

      // 3. Guarantee that model output did not sneak in forbidden authority
      assertNoForbiddenAuthority(result.output as unknown as Record<string, unknown>);

      return result;
    },
  };
}

// ============================================================================
// 4. ROLE 2: BROWSER PROPOSER COMPATIBILITY ADAPTER (P1 -> P2)
// ============================================================================

export interface BrowserProposerAdapterInput {
  investigationId: string;
  attemptIndex: 1 | 2;
  approvedPlanHash: string;
  allowedOrigins?: string[];
  isRevokedOrCancelled?: boolean;
  remainingStepBudget?: number;
  lastActionMutationUncertain?: boolean;
  currentStep: {
    stepNumber: number;
    actionType: 'NAVIGATE' | 'CLICK' | 'FILL' | 'SELECT' | 'WAIT_FOR_SELECTOR';
    intentDescription: string;
    targetDescription: string;
    approvedValue?: string;
    isDestructive: boolean;
    affectedDataScope?: string;
  };
  observation: {
    observationId: string;
    pageUrl: string;
    pageTitle: string;
    axTree: PrunedAXTreeNode[];
  };
  priorActionHistory?: Array<{
    stepNumber: number;
    actionType: string;
    executedSuccessfully: boolean;
    errorSummary?: string;
  }>;
}

export function createBrowserProposerCompatibilityAdapter(provider: ModelProviderPort) {
  const agent = new BrowserInteractionAgent(provider);

  return {
    async proposeNextAction(
      input: BrowserProposerAdapterInput,
      options?: { abortSignal?: AbortSignal }
    ): Promise<BrowserExecutionResult> {
      const validatedInput: BrowserAgentInput = BrowserAgentInputSchema.parse({
        contractVersion: '1.0.0',
        investigationId: input.investigationId,
        attemptIndex: input.attemptIndex,
        approvedPlanHash: input.approvedPlanHash,
        allowedOrigins: input.allowedOrigins,
        isRevokedOrCancelled: input.isRevokedOrCancelled,
        remainingStepBudget: input.remainingStepBudget,
        lastActionMutationUncertain: input.lastActionMutationUncertain,
        currentStep: input.currentStep,
        observation: input.observation,
        priorActionHistory: input.priorActionHistory ?? [],
      });

      const result = await agent.proposeNextAction(validatedInput, options);

      // Verify that action output does not contain server authority
      assertNoForbiddenAuthority(result.output as unknown as Record<string, unknown>);

      return result;
    },
  };
}

// ============================================================================
// 5. ROLE 3: REVIEWER COMPATIBILITY ADAPTER (P1 -> P2 -> P3)
// ============================================================================

export interface ReviewerAdapterInput {
  investigationId: string;
  reproductionVerdict:
    | 'CONFIRMED_REPRODUCED'
    | 'NOT_REPRODUCED'
    | 'INCONSISTENT_OBSERVATIONS'
    | 'INCONCLUSIVE_EXECUTION_FAILURE';
  rawReport?: {
    title: string;
    description: string;
    claimedExpectedBehavior?: string;
  };
  testedEnvironment?: string;
  resetStatus?: {
    executed: boolean;
    success: boolean;
    details?: string;
  };
  knownGaps?: string[];
  attempt1: AttemptEvaluationData;
  attempt2: AttemptEvaluationData | null;
}

export function createReviewerCompatibilityAdapter(provider: ModelProviderPort) {
  const agent = new EvidenceReviewAgent(provider);

  return {
    async reviewEvidence(
      input: ReviewerAdapterInput,
      options?: { abortSignal?: AbortSignal }
    ): Promise<ReviewerExecutionResult> {
      const validatedInput: EvidenceReviewAgentInput = EvidenceReviewAgentInputSchema.parse({
        contractVersion: '1.0.0',
        investigationId: input.investigationId,
        reproductionVerdict: input.reproductionVerdict,
        rawReport: input.rawReport,
        testedEnvironment: input.testedEnvironment,
        resetStatus: input.resetStatus,
        knownGaps: input.knownGaps,
        attempt1: input.attempt1,
        attempt2: input.attempt2,
      });

      const result = await agent.reviewEvidence(validatedInput, options);

      // Verify that reviewer output does not contain forged server authority
      assertNoForbiddenAuthority(result.output as unknown as Record<string, unknown>);

      return result;
    },
  };
}

// ============================================================================
// 6. PERSON 3 PRODUCT UI PROJECTION HELPERS (NO PROSE PARSING)
// ============================================================================

export interface UiClarificationView {
  state: 'NEEDS_CLARIFICATION' | 'PLAN_PROPOSED' | 'UNSUPPORTED' | 'UNABLE_TO_INTERPRET';
  summary: string;
  questions: Array<{
    id: string;
    text: string;
    whyItMatters: string;
    options: string[];
    blocksExecution: boolean;
  }>;
  proposedSteps?: Array<{
    stepNumber: number;
    actionType: string;
    intent: string;
    isDestructive: boolean;
  }>;
  correctAssertions?: PlanAssertion[];
  reportedFailureAssertions?: PlanAssertion[];
  unsupportedReason?: string;
}

/**
 * Projects ReportAgentOutput into a clean, typed view model for Person 3 React components.
 * Eliminates any need for Person 3 to parse raw LLM text or regex strings.
 */
export function projectClarificationForUi(output: ReportAgentOutput): UiClarificationView {
  switch (output.variant) {
    case 'NEEDS_CLARIFICATION':
      return {
        state: 'NEEDS_CLARIFICATION',
        summary: output.extractedClaim.summary,
        questions: output.questions.map((q) => ({
          id: q.questionId,
          text: q.questionText,
          whyItMatters: q.whyItMatters,
          options: [...q.options],
          blocksExecution: q.blocksExecution,
        })),
      };

    case 'PLAN_PROPOSED':
      return {
        state: 'PLAN_PROPOSED',
        summary: output.extractedClaim.summary,
        questions: [],
        proposedSteps: output.experimentPlan.steps.map((s) => ({
          stepNumber: s.stepNumber,
          actionType: s.actionType,
          intent: s.intentDescription,
          isDestructive: s.isDestructive,
        })),
        correctAssertions: output.experimentPlan.correctBehaviorAssertions,
        reportedFailureAssertions: output.experimentPlan.reportedFailureAssertions,
      };

    case 'UNSUPPORTED_CLAIM':
      return {
        state: 'UNSUPPORTED',
        summary: output.reason,
        questions: [],
        unsupportedReason: output.recommendation,
      };

    case 'SCOPE_CONFLICT':
      return {
        state: 'UNSUPPORTED',
        summary: output.conflictDetails,
        questions: [],
        unsupportedReason: `Permitted scope: ${output.permittedScope}`,
      };

    case 'UNABLE_TO_INTERPRET':
    default:
      return {
        state: 'UNABLE_TO_INTERPRET',
        summary: output.explanation,
        questions: [],
      };
  }
}

export interface UiReviewerView {
  state: 'REPORT_SYNTHESIZED' | 'EVIDENCE_GAP' | 'INCONSISTENT' | 'FALLBACK';
  verdict: string;
  executiveSummary: string;
  attempt1Comparison?: {
    summary: string;
    failedAssertions: string[];
    matched: boolean;
  };
  attempt2Comparison?: {
    summary: string;
    failedAssertions: string[];
    matched: boolean;
  } | null;
  citations: Array<{
    artifactId?: string;
    artifactType: 'VIDEO' | 'CONSOLE_LOG' | 'NETWORK_LOG';
    safeUrl: string;
    explanation: string;
    offsetMs?: number;
  }>;
  hypothesis: {
    text: string;
    isVerifiedFact: false;
    tokens: string[];
    direction: string;
  } | null;
  caveats: string[];
  manualSteps: string[];
  deterministicFacts?: Record<string, unknown>;
}

/**
 * Projects EvidenceReviewOutput into a clean, typed view model for Person 3 React components.
 * Separates verified facts from diagnostic hypotheses with guaranteed isVerifiedFact: false.
 */
export function projectReviewForUi(output: EvidenceReviewOutput): UiReviewerView {
  switch (output.variant) {
    case 'REPORT_SYNTHESIZED':
      return {
        state: 'REPORT_SYNTHESIZED',
        verdict: output.observedReproductionVerdict,
        executiveSummary: output.executiveSummary,
        attempt1Comparison: {
          summary: output.attempt1Comparison.summary,
          failedAssertions: [...output.attempt1Comparison.failedAssertions],
          matched: output.attempt1Comparison.matchingFailureObserved,
        },
        attempt2Comparison: output.attempt2Comparison
          ? {
              summary: output.attempt2Comparison.summary,
              failedAssertions: [...output.attempt2Comparison.failedAssertions],
              matched: output.attempt2Comparison.matchingFailureObserved,
            }
          : null,
        citations: output.evidenceCitations.map((c) => ({
          artifactId: c.artifactId,
          artifactType: c.artifactType,
          safeUrl: c.safeUrl,
          explanation: c.relevanceExplanation,
          offsetMs: c.timestampOffsetMs,
        })),
        hypothesis: output.diagnosticHypothesis
          ? {
              text: output.diagnosticHypothesis.hypothesisText,
              isVerifiedFact: false,
              tokens: [...output.diagnosticHypothesis.supportingEvidenceTokens],
              direction: output.diagnosticHypothesis.suggestedInvestigationDirection,
            }
          : null,
        caveats: [...output.limitationsAndCaveats],
        manualSteps: [...output.manualReproductionSteps],
      };

    case 'EXPLANATION_UNAVAILABLE_FALLBACK':
      return {
        state: 'FALLBACK',
        verdict: output.reproductionVerdict,
        executiveSummary: `Fallback explanation: ${output.fallbackReason}`,
        citations: [],
        hypothesis: null,
        caveats: ['Model explanation was unavailable; displaying authoritative deterministic facts.'],
        manualSteps: [],
        deterministicFacts: output.deterministicFacts,
      };

    case 'EVIDENCE_GAP_DETECTED':
      return {
        state: 'EVIDENCE_GAP',
        verdict: 'INCONCLUSIVE',
        executiveSummary: `Evidence gap detected: missing ${output.missingArtifactTypes.join(', ')}.`,
        citations: [],
        hypothesis: null,
        caveats: [output.impactOnConfirmation],
        manualSteps: [],
      };

    case 'INCONSISTENT_EVIDENCE_DETECTED':
      return {
        state: 'INCONSISTENT',
        verdict: 'INCONSISTENT_OBSERVATIONS',
        executiveSummary: output.inconsistencySummary,
        citations: [],
        hypothesis: null,
        caveats: output.conflictingObservations,
        manualSteps: [],
      };

    case 'REVIEW_UNABLE_TO_COMPLETE':
    default:
      return {
        state: 'FALLBACK',
        verdict: 'INCONCLUSIVE',
        executiveSummary: `Review halted: ${output.errorDescription}`,
        citations: [],
        hypothesis: null,
        caveats: [`Error code: ${output.errorCode}`],
        manualSteps: [],
      };
  }
}
