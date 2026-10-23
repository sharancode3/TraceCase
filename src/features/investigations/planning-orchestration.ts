import { requestPlanning, fetchPlan } from './api-client';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';

export type PlanningTransitionResult =
  | {
      outcome: 'PROPOSAL_READY';
      investigationId: string;
      planVersion: number;
      planHash: string;
      plan: AuthoritativeExperimentPlan;
      navigationTarget: string;
    }
  | {
      outcome: 'CLARIFICATION_NEEDED';
      investigationId: string;
      questionCount: number;
      navigationTarget: string;
    }
  | {
      outcome: 'UNABLE_TO_PROCEED';
      investigationId: string;
      reason: string;
      missingPrerequisites?: string[];
      isRetryable: boolean;
    }
  | {
      outcome: 'ERROR';
      investigationId: string;
      code: string;
      category: string;
      message: string;
      isRetryable: boolean;
      actionType: 'SIGN_IN' | 'RETRY' | 'DISMISS';
    };

/**
 * Sanitizes and formats planning errors to prevent exposing raw database errors,
 * Postgres error codes, provider internals, or internal stack traces.
 */
export function formatSafePlanningError(
  error: { code?: string; message?: string; status?: number; category?: string },
  investigationId: string
): PlanningTransitionResult & { outcome: 'ERROR' } {
  const code = error.code || 'REQUEST_PLANNING_FAILED';
  const category = error.category || 'INTERNAL_ERROR';
  const status = error.status;
  const rawMessage = error.message || '';

  // Detect and scrub internal keywords or database leaks
  const isInternalLeak =
    rawMessage.includes('SELECT') ||
    rawMessage.includes('INSERT') ||
    rawMessage.includes('UPDATE') ||
    rawMessage.includes('drizzle') ||
    rawMessage.includes('postgres') ||
    rawMessage.includes('PostgresError') ||
    rawMessage.includes('syntax error') ||
    rawMessage.includes('ECONNREFUSED') ||
    rawMessage.includes('table ') ||
    rawMessage.includes('column ');

  if (code === 'AUTHENTICATION_REQUIRED' || code === 'UNAUTHENTICATED' || status === 401) {
    return {
      outcome: 'ERROR',
      investigationId,
      code: 'AUTHENTICATION_REQUIRED',
      category: 'AUTHENTICATION_FAILED',
      message: 'Your session has expired or authentication is missing. Please sign in to prepare a plan.',
      isRetryable: true,
      actionType: 'SIGN_IN',
    };
  }

  if (code === 'PERMISSION_DENIED' || status === 403) {
    return {
      outcome: 'ERROR',
      investigationId,
      code: 'PERMISSION_DENIED',
      category: 'AUTHORIZATION_FAILED',
      message: 'You do not have permission to plan or modify this investigation.',
      isRetryable: false,
      actionType: 'DISMISS',
    };
  }

  if (code === 'INVESTIGATION_NOT_FOUND' || status === 404) {
    return {
      outcome: 'ERROR',
      investigationId,
      code: 'INVESTIGATION_NOT_FOUND',
      category: 'NOT_FOUND',
      message: `Investigation ${investigationId.slice(0, 8)} was not found. Please select a valid target and file a report.`,
      isRetryable: false,
      actionType: 'DISMISS',
    };
  }

  if (code === 'IDEMPOTENCY_REQUEST_IN_PROGRESS' || code === 'CONFLICT_STALE_VERSION' || status === 409) {
    return {
      outcome: 'ERROR',
      investigationId,
      code: 'PLANNING_IN_PROGRESS_OR_STALE',
      category: 'CONFLICT',
      message: 'A planning request for this investigation is already in progress or has been updated. Please wait a moment and retry.',
      isRetryable: true,
      actionType: 'RETRY',
    };
  }

  if (code === 'DATABASE_UNAVAILABLE' || code === 'SERVICE_NOT_CONFIGURED' || status === 503) {
    return {
      outcome: 'ERROR',
      investigationId,
      code: 'SERVICE_TEMPORARILY_UNAVAILABLE',
      category: 'SERVICE_UNAVAILABLE',
      message: 'The planning service or database is temporarily unavailable. Your report is preserved; please retry shortly.',
      isRetryable: true,
      actionType: 'RETRY',
    };
  }

  if (code === 'NETWORK_ERROR' || status === 0) {
    return {
      outcome: 'ERROR',
      investigationId,
      code: 'NETWORK_ERROR',
      category: 'INTERNAL_ERROR',
      message: 'Unable to connect to the TraceCase server. Your report and inputs are preserved; please check your network and retry.',
      isRetryable: true,
      actionType: 'RETRY',
    };
  }

  // Safe default scrubbed of database details
  const safeMessage = isInternalLeak
    ? 'An unexpected error occurred while communicating with the planning service. Your report is preserved; please retry.'
    : rawMessage || 'Autonomous planning request failed. Please retry.';

  return {
    outcome: 'ERROR',
    investigationId,
    code,
    category,
    message: safeMessage,
    isRetryable: true,
    actionType: 'RETRY',
  };
}

/**
 * Centrally executes planning or replanning for an investigation, enforcing:
 * 1. Authoritative verification of the persisted plan revision before proposal navigation.
 * 2. Explicit handling of proposal, clarification-needed, unable-to-proceed, and error outcomes.
 * 3. Sanitized error messages free from provider or database internals.
 */
export async function executePlanningTransition(params: {
  investigationId: string;
  expectedWorkflowRevision?: number;
  userGuidance?: string;
  idempotencyKey?: string;
  fetchFn?: typeof fetch;
}): Promise<PlanningTransitionResult> {
  const { investigationId, expectedWorkflowRevision, userGuidance, idempotencyKey, fetchFn } = params;

  try {
    const planResult = await requestPlanning(
      investigationId,
      {
        userGuidance,
        expectedWorkflowRevision,
      },
      {
        fetchFn,
        idempotencyKey,
      }
    );

    if (!planResult.success) {
      return formatSafePlanningError(planResult.error, investigationId);
    }

    const planData = planResult.data as {
      status?: string;
      reason?: string;
      missingPrerequisites?: string[];
      plan?: AuthoritativeExperimentPlan;
      questions?: unknown[];
    };

    if (planData.status === 'PROPOSAL_READY' || planData.status === 'EXPERIMENT_PROPOSED') {
      // REQUIREMENT 10: Authoritative confirmation of current persisted proposal before navigation
      const planFetch = await fetchPlan(investigationId, { fetchFn });

      if (
        planFetch.success &&
        planFetch.data &&
        typeof planFetch.data.version === 'number' &&
        planFetch.data.version > 0 &&
        typeof planFetch.data.planHash === 'string' &&
        planFetch.data.planHash.length > 0
      ) {
        return {
          outcome: 'PROPOSAL_READY',
          investigationId,
          planVersion: planFetch.data.version,
          planHash: planFetch.data.planHash,
          plan: (planFetch.data.data as AuthoritativeExperimentPlan) || planData.plan,
          navigationTarget: `/investigations/${investigationId}/approve`,
        };
      }

      // If the planning result claimed proposal ready, but authoritative storage cannot confirm it:
      return {
        outcome: 'ERROR',
        investigationId,
        code: 'PLAN_PERSISTENCE_UNCONFIRMED',
        category: 'INTERNAL_ERROR',
        message: 'An experiment plan was proposed, but could not be authoritatively confirmed from persisted storage. Please retry planning.',
        isRetryable: true,
        actionType: 'RETRY',
      };
    }

    if (planData.status === 'CLARIFICATION_NEEDED') {
      return {
        outcome: 'CLARIFICATION_NEEDED',
        investigationId,
        questionCount: Array.isArray(planData.questions) ? planData.questions.length : 0,
        navigationTarget: `/investigations/${investigationId}/clarify`,
      };
    }

    if (planData.status === 'UNABLE_TO_PROCEED') {
      return {
        outcome: 'UNABLE_TO_PROCEED',
        investigationId,
        reason: planData.reason || 'Missing required preconditions to form an automated test plan',
        missingPrerequisites: planData.missingPrerequisites,
        isRetryable: true,
      };
    }

    return {
      outcome: 'ERROR',
      investigationId,
      code: 'UNRECOGNIZED_PLANNING_STATUS',
      category: 'INTERNAL_ERROR',
      message: 'Autonomous planning returned an unrecognized status. Please retry.',
      isRetryable: true,
      actionType: 'RETRY',
    };
  } catch (err: unknown) {
    const errorObj = {
      code: 'CLIENT_EXECUTION_EXCEPTION',
      message: err instanceof Error ? err.message : String(err),
      category: 'INTERNAL_ERROR',
    };
    return formatSafePlanningError(errorObj, investigationId);
  }
}
