import { AnswerClarificationCommandSchema } from '@/contracts/clarification';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import type {
  ClarificationQuestionItem,
  ApiResponse,
  PlanDetailResult,
  InvestigationSnapshot,
} from './api-client';

export type ClarificationUiStatus =
  | 'LOADING'
  | 'FETCH_FAILED'
  | 'NO_PENDING_QUESTIONS'
  | 'QUESTIONS_READY'
  | 'SUBMITTING'
  | 'PLANNING'
  | 'PROPOSAL_READY'
  | 'CANNOT_PROCEED';

export interface ClarificationRoundGroup {
  roundIndex: number;
  isFullyAnswered: boolean;
  questions: ClarificationQuestionItem[];
}

export interface AnswerValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  answersToSubmit: Array<{ questionId: string; answerText: string }>;
}

/**
 * Organizes questions into ascending rounds, preserving question ordering.
 */
export function groupQuestionsByRound(
  questions: ClarificationQuestionItem[]
): ClarificationRoundGroup[] {
  if (!questions || questions.length === 0) return [];

  const roundMap = new Map<number, ClarificationQuestionItem[]>();

  for (const q of questions) {
    const round = q.roundIndex && q.roundIndex > 0 ? q.roundIndex : 1;
    const existing = roundMap.get(round) || [];
    existing.push(q);
    roundMap.set(round, existing);
  }

  const sortedRounds = Array.from(roundMap.keys()).sort((a, b) => a - b);

  return sortedRounds.map((roundIndex) => {
    const roundQuestions = (roundMap.get(roundIndex) || []).sort((a, b) => {
      const idxA = typeof a.questionIndex === 'number' ? a.questionIndex : 0;
      const idxB = typeof b.questionIndex === 'number' ? b.questionIndex : 0;
      return idxA - idxB;
    });

    return {
      roundIndex,
      isFullyAnswered: roundQuestions.every((q) => q.isAnswered),
      questions: roundQuestions,
    };
  });
}

/**
 * Validates pending clarification drafts against AnswerClarificationCommandSchema.
 * At least one pending question must receive an answer to proceed.
 */
export function validateClarificationAnswers(
  questions: ClarificationQuestionItem[],
  drafts: Record<string, string>
): AnswerValidationResult {
  const errors: Record<string, string> = {};
  const pending = questions.filter((q) => !q.isAnswered);

  const answersToSubmit: Array<{ questionId: string; answerText: string }> = [];

  for (const q of pending) {
    const text = (drafts[q.id] || '').trim();
    if (text.length > 0) {
      const result = AnswerClarificationCommandSchema.safeParse({
        questionId: q.id,
        answerText: text,
      });

      if (!result.success) {
        errors[q.id] = result.error.errors[0]?.message || 'Invalid answer format.';
      } else {
        answersToSubmit.push({
          questionId: q.id,
          answerText: text,
        });
      }
    }
  }

  if (pending.length > 0 && answersToSubmit.length === 0 && Object.keys(errors).length === 0) {
    const firstPendingId = pending[0].id;
    errors[firstPendingId] = 'Please provide an answer to at least one question to proceed.';
  }

  return {
    isValid: Object.keys(errors).length === 0 && answersToSubmit.length > 0,
    errors,
    answersToSubmit,
  };
}

/**
 * Verifies that an authoritative persisted experiment proposal exists
 * before allowing navigation to the plan review page.
 */
export function hasAuthoritativeProposal(
  plan: AuthoritativeExperimentPlan | null | undefined,
  version?: number | null,
  planHash?: string | null
): boolean {
  if (!plan) return false;
  if (typeof version !== 'number' || version <= 0) return false;
  if (!planHash || typeof planHash !== 'string' || planHash.trim().length === 0) return false;
  if (!Array.isArray(plan.assertions) || plan.assertions.length === 0) return false;
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) return false;
  return true;
}

/**
 * Evaluates initial page state from fetched clarifications, plan, and investigation data.
 * Guarantees that fetch failures are never treated as empty successes.
 */
export function determineInitialPageState(params: {
  fetchResult: ApiResponse<{ questions: ClarificationQuestionItem[] }>;
  planResult?: ApiResponse<PlanDetailResult>;
  investigationResult?: ApiResponse<InvestigationSnapshot>;
}): {
  status: ClarificationUiStatus;
  errorMessage?: string;
  statusCode?: number;
  planVersion?: number;
  planHash?: string;
  investigationReviewStatus?: string;
} {
  const { fetchResult, planResult, investigationResult } = params;

  // 1. Fetch Failure: Always maintain visible failure state
  if (!fetchResult.success) {
    return {
      status: 'FETCH_FAILED',
      errorMessage: fetchResult.error.message || 'Unable to load clarification questions.',
      statusCode: fetchResult.status,
    };
  }

  const questions = fetchResult.data.questions || [];
  const pendingQuestions = questions.filter((q) => !q.isAnswered);

  // 2. Proposal Ready: Only if authoritative plan revision is verified
  const invReviewStatus = investigationResult?.success ? investigationResult.data.reviewStatus : undefined;
  if (
    planResult?.success &&
    planResult.data &&
    hasAuthoritativeProposal(planResult.data.data, planResult.data.version, planResult.data.planHash) &&
    invReviewStatus === 'PROPOSAL_READY'
  ) {
    return {
      status: 'PROPOSAL_READY',
      planVersion: planResult.data.version,
      planHash: planResult.data.planHash,
    };
  }

  // 3. Questions Ready: When there are pending questions to answer
  if (pendingQuestions.length > 0) {
    return {
      status: 'QUESTIONS_READY',
    };
  }

  // 4. No Pending Questions: When all are answered or none existed, but no proposal is ready yet
  return {
    status: 'NO_PENDING_QUESTIONS',
    investigationReviewStatus: invReviewStatus || 'PENDING_PLANNING',
  };
}
