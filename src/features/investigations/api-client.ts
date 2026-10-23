import {
  type SafeTargetProfile,
  type CreateTargetCommand,
  CreateTargetCommandSchema,
} from '@/contracts/targets';
import {
  type CreateReportCommand,
  type DraftReportIntake,
  type BugReportResponse,
  CreateReportCommandSchema,
  DraftReportIntakeSchema,
} from '@/contracts/reports';
import {
  type ApprovePlanCommand,
  type RejectPlanCommand,
  type RevokeApprovalCommand,
  type StartInvestigationCommand,
  type CancelInvestigationCommand,
  type RequestPlanningCommand,
  type AuthoritativeExperimentPlan,
  ApprovePlanCommandSchema,
  RejectPlanCommandSchema,
  RevokeApprovalCommandSchema,
  StartInvestigationCommandSchema,
  CancelInvestigationCommandSchema,
} from '@/contracts/planning';
import {
  type AnswerClarificationCommand,
  type BatchAnswerClarificationsCommand,
  AnswerClarificationCommandSchema,
  BatchAnswerClarificationsCommandSchema,
} from '@/contracts/clarification';
import {
  SafeErrorEnvelopeSchema,
} from '@/contracts/errors';
import type { InvestigationSnapshot } from '@/contracts/investigations';
export type { InvestigationSnapshot };
import type { InvestigationProgressEvent } from '@/contracts/events';

let clientAuthToken: string | null = null;

/**
 * Configures the in-memory authorization bearer token for client-side API requests.
 */
export function setClientAuthToken(token: string | null): void {
  clientAuthToken = token;
}

/**
 * Retrieves the currently active client authorization bearer token.
 */
export function getClientAuthToken(): string | null {
  return clientAuthToken;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  mode?: string;
  message?: string;
}

export interface ApiFailure {
  success: false;
  error: {
    category?: string;
    code: string;
    message: string;
    details?: unknown;
  };
  status: number;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface CreatedReportResult extends BugReportResponse {
  investigationId: string;
}

export interface PlanApprovalResult {
  investigationId: string;
  planVersion: number;
  planHash: string;
  approvedBy?: string;
  approvedAt?: string;
  isSimulatedPreview?: boolean;
}

export interface StartExecutionResult {
  status: string;
  jobId: string;
  queuedAt?: string;
  investigationId?: string;
  planVersion?: number;
  isSimulatedPreview?: boolean;
  message?: string;
}

export interface CancelExecutionResult {
  investigationId: string;
  previousStatus: string;
  lifecycleStatus: string;
  cancelledAt: string;
  isSimulatedPreview?: boolean;
}

export interface ClarificationQuestionItem {
  id: string;
  investigationId: string;
  questionIndex?: number;
  roundIndex?: number;
  questionText: string;
  suggestedOptions?: string[];
  explanation?: string;
  isAnswered: boolean;
  answerText?: string | null;
  answeredAt?: string | null;
  createdAt: string;
}

export interface RequestPlanningResult {
  status: 'CLARIFICATION_NEEDED' | 'PROPOSAL_READY' | 'UNABLE_TO_PROCEED' | string;
  plan?: AuthoritativeExperimentPlan;
  questions?: ClarificationQuestionItem[];
  reason?: string;
  workflowRevision?: number;
}

export interface PlanDetailResult {
  data: AuthoritativeExperimentPlan;
  version: number;
  planHash: string;
  createdAt: string;
  mode?: string;
}

export interface ArtifactItem {
  id: string;
  kind: string;
  attemptNumber?: number;
  storageTier: string;
  mimeType: string;
  sizeBytes: number;
  sha256Checksum: string;
  isEligibleForSharing: boolean;
  redactionApplied?: boolean;
  quarantineReason?: string | null;
  url: string;
  createdAt: string;
}

/**
 * Builds standard request headers, injecting Authorization Bearer token if configured.
 */
function buildRequestHeaders(customHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(customHeaders || {}),
  };

  if (clientAuthToken && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${clientAuthToken}`;
  }

  return headers;
}

/**
 * Extracts a human-readable, safe error message from an API response and envelope.
 */
export function extractErrorMessage(res: Response, jsonBody?: unknown): string {
  // If the server returned a structured SafeErrorEnvelope
  if (jsonBody && typeof jsonBody === 'object') {
    const envelopeParsed = SafeErrorEnvelopeSchema.safeParse(jsonBody);
    if (envelopeParsed.success) {
      return envelopeParsed.data.error.message;
    }

    const casted = jsonBody as { error?: { message?: string; code?: string }; message?: string };
    if (casted.error?.message) {
      return casted.error.message;
    }
    if (casted.message) {
      return casted.message;
    }
  }

  // Fallback to standard HTTP status messages
  switch (res.status) {
    case 400:
      return 'Request validation failed. Please check form fields.';
    case 401:
      return 'Authentication required. Valid credentials required for live API mutation.';
    case 403:
      return 'Permission denied. You do not have authorization for this operation.';
    case 404:
      return 'Requested resource was not found.';
    case 409:
      return 'Plan conflict: State revision or plan hash mismatch (TC-INV-005).';
    case 422:
      return 'Policy violation: The requested action violates target sandbox restrictions.';
    case 500:
      return 'Internal server error occurred while processing request.';
    case 503:
      return 'Backend service unavailable.';
    default:
      return res.statusText ? `Request failed with status ${res.status}: ${res.statusText}` : `Request failed (${res.status})`;
  }
}

/**
 * Fetches configured target environments from GET /api/v1/targets
 */
export async function fetchTargets(
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<ApiResponse<{ targets: SafeTargetProfile[]; total: number; mode: string }>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher('/api/v1/targets', {
      method: 'GET',
      headers: buildRequestHeaders(options?.headers),
      signal: options?.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'FETCH_TARGETS_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: {
        targets: Array.isArray(json?.data) ? json.data : [],
        total: typeof json?.total === 'number' ? json.total : (json?.data?.length || 0),
        mode: json?.mode || 'unknown',
      },
      mode: json?.mode,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while fetching targets',
      },
      status: 0,
    };
  }
}

/**
 * Submits a new target registration to POST /api/v1/targets
 */
export async function submitTarget(
  command: CreateTargetCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<SafeTargetProfile>> {
  const validation = CreateTargetCommandSchema.safeParse(command);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: validation.error.errors[0]?.message || 'Validation error in target parameters',
        details: validation.error.format(),
      },
      status: 400,
    };
  }

  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher('/api/v1/targets', {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(validation.data),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'SUBMIT_TARGET_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.data,
      mode: json.data?.isSandboxVerified ? 'sandbox' : 'protected',
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while submitting target',
      },
      status: 0,
    };
  }
}

/**
 * Submits a bug report intake command to POST /api/v1/reports
 * Supports both full CreateReportCommand and realistic incomplete DraftReportIntake.
 */
export async function submitBugReport(
  command: CreateReportCommand | DraftReportIntake,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; idempotencyKey?: string }
): Promise<ApiResponse<CreatedReportResult>> {
  const fullValidation = CreateReportCommandSchema.safeParse(command);
  const draftValidation = fullValidation.success ? null : DraftReportIntakeSchema.safeParse(command);

  if (!fullValidation.success && (!draftValidation || !draftValidation.success)) {
    const errorMsg =
      fullValidation.error.errors[0]?.message ||
      draftValidation?.error.errors[0]?.message ||
      'Validation error in bug report submission';
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: errorMsg,
        details: fullValidation.error.format(),
      },
      status: 400,
    };
  }

  const validatedData = fullValidation.success
    ? fullValidation.data
    : draftValidation && draftValidation.success
    ? draftValidation.data
    : command;
  const fetcher = options?.fetchFn || fetch;
  const idempotencyHeaders: Record<string, string> = {};
  const effectiveKey = options?.idempotencyKey || ('idempotencyKey' in validatedData ? validatedData.idempotencyKey : undefined);
  if (effectiveKey) {
    idempotencyHeaders['X-Idempotency-Key'] = effectiveKey;
  }

  try {
    const res = await fetcher('/api/v1/reports', {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...idempotencyHeaders,
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(validatedData),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'SUBMIT_REPORT_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.data,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while submitting bug report',
      },
      status: 0,
    };
  }
}

/**
 * Fetches user investigations list from GET /api/v1/investigations
 */
export async function fetchInvestigations(
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<ApiResponse<{ investigations: InvestigationSnapshot[]; total: number; mode: string }>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher('/api/v1/investigations', {
      method: 'GET',
      headers: buildRequestHeaders(options?.headers),
      signal: options?.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'FETCH_INVESTIGATIONS_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: {
        investigations: Array.isArray(json?.data) ? json.data : [],
        total: typeof json?.total === 'number' ? json.total : (json?.data?.length || 0),
        mode: json?.mode || 'unknown',
      },
      mode: json?.mode,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while fetching investigations',
      },
      status: 0,
    };
  }
}

/**
 * Fetches an investigation snapshot from GET /api/v1/investigations/[id]
 */
export async function fetchInvestigation(
  id: string,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<ApiResponse<InvestigationSnapshot>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: buildRequestHeaders(options?.headers),
      signal: options?.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'FETCH_INVESTIGATION_FAILED',
          category: json?.error?.category || 'NOT_FOUND',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.data,
      mode: json.mode,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while fetching investigation',
      },
      status: 0,
    };
  }
}

export interface InvestigationResultsData {
  investigationId: string;
  snapshot: InvestigationSnapshot;
  environment: string;
  buildVersion: string | null;
  attempts: {
    attempt1: InvestigationSnapshot['attempt1'];
    attempt2: InvestigationSnapshot['attempt2'];
  };
  resetReceipt: InvestigationSnapshot['resetReceipt'];
  assertionEvaluations: InvestigationSnapshot['assertionEvaluations'];
  artifacts: ArtifactItem[];
  restrictedRecordingCount: number;
}

/**
 * Fetches authoritative results, attempts, reset receipt, and assertion evaluations from GET /api/v1/investigations/[id]/results
 */
export async function fetchInvestigationResults(
  id: string,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<ApiResponse<InvestigationResultsData>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/results`, {
      method: 'GET',
      headers: buildRequestHeaders(options?.headers),
      signal: options?.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'FETCH_RESULTS_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.data,
      mode: json.mode,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while fetching results',
      },
      status: 0,
    };
  }
}

/**
 * Fetches pending clarification questions from GET /api/v1/investigations/[id]/clarifications
 */
export async function fetchClarifications(
  id: string,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<ApiResponse<{ questions: ClarificationQuestionItem[]; total: number; mode: string }>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/clarifications`, {
      method: 'GET',
      headers: buildRequestHeaders(options?.headers),
      signal: options?.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'FETCH_CLARIFICATIONS_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: {
        questions: Array.isArray(json?.data) ? json.data : [],
        total: typeof json?.total === 'number' ? json.total : (json?.data?.length || 0),
        mode: json?.mode || 'unknown',
      },
      mode: json?.mode,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while fetching clarifications',
      },
      status: 0,
    };
  }
}

/**
 * Submits an answer to clarification questions via POST /api/v1/investigations/[id]/clarifications/answer
 */
export async function answerClarification(
  id: string,
  command: AnswerClarificationCommand | BatchAnswerClarificationsCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<unknown>> {
  const single = AnswerClarificationCommandSchema.safeParse(command);
  const batch = single.success ? null : BatchAnswerClarificationsCommandSchema.safeParse(command);

  if (!single.success && (!batch || !batch.success)) {
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: 'Invalid clarification answer payload',
        details: single.error.format(),
      },
      status: 400,
    };
  }

  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/clarifications/answer`, {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(single.success ? single.data : batch!.data),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'ANSWER_CLARIFICATION_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.data,
      message: json.message,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while answering clarification',
      },
      status: 0,
    };
  }
}

/**
 * Submits cryptographic operator approval to POST /api/v1/investigations/[id]/approve
 */
export async function approveInvestigationPlan(
  id: string,
  command: ApprovePlanCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<PlanApprovalResult>> {
  const validation = ApprovePlanCommandSchema.safeParse(command);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: validation.error.errors[0]?.message || 'Validation error in plan approval payload',
        details: validation.error.format(),
      },
      status: 400,
    };
  }

  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(validation.data),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'APPROVAL_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.data,
      message: json.message,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while submitting approval',
      },
      status: 0,
    };
  }
}

/**
 * Rejects a proposed experiment plan via POST /api/v1/investigations/[id]/reject
 */
export async function rejectInvestigationPlan(
  id: string,
  command: RejectPlanCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<{ status: string; workflowRevision: number }>> {
  const validation = RejectPlanCommandSchema.safeParse(command);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: validation.error.errors[0]?.message || 'Validation error in plan rejection payload',
        details: validation.error.format(),
      },
      status: 400,
    };
  }

  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(validation.data),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'REJECT_PLAN_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.data || json.body || json,
      message: json.message,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network failure while rejecting plan',
      },
      status: 0,
    };
  }
}

/**
 * Revokes previously granted approval via POST /api/v1/investigations/[id]/revoke
 */
export async function revokeInvestigationPlan(
  id: string,
  command: RevokeApprovalCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<{ status: string; workflowRevision: number }>> {
  const validation = RevokeApprovalCommandSchema.safeParse(command);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: validation.error.errors[0]?.message || 'Validation error in plan revocation payload',
        details: validation.error.format(),
      },
      status: 400,
    };
  }

  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(validation.data),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'REVOKE_APPROVAL_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.data || json.body || json,
      message: json.message,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network failure while revoking plan approval',
      },
      status: 0,
    };
  }
}

/**
 * Starts execution of an approved investigation via POST /api/v1/investigations/[id]/start
 */
export async function startInvestigationExecution(
  id: string,
  command: StartInvestigationCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<StartExecutionResult>> {
  const validation = StartInvestigationCommandSchema.safeParse(command);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: validation.error.errors[0]?.message || 'Validation error in start execution payload',
        details: validation.error.format(),
      },
      status: 400,
    };
  }

  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/start`, {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(validation.data),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'START_EXECUTION_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.body || json,
      message: json.message,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while starting execution',
      },
      status: 0,
    };
  }
}

/**
 * Cancels an in-flight or queued investigation via POST /api/v1/investigations/[id]/cancel
 */
export async function cancelInvestigationExecution(
  id: string,
  command: CancelInvestigationCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<CancelExecutionResult>> {
  const validation = CancelInvestigationCommandSchema.safeParse(command);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: validation.error.errors[0]?.message || 'Validation error in cancellation payload',
        details: validation.error.format(),
      },
      status: 400,
    };
  }

  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(validation.data),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'CANCEL_EXECUTION_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json.body || json,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while cancelling execution',
      },
      status: 0,
    };
  }
}

/**
 * Fetches progress events for an investigation from GET /api/v1/investigations/[id]/events
 */
export async function fetchInvestigationEvents(
  id: string,
  afterEventId?: string,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<ApiResponse<{ events: InvestigationProgressEvent[]; hasMore: boolean }>> {
  const fetcher = options?.fetchFn || fetch;
  const url = afterEventId
    ? `/api/v1/investigations/${encodeURIComponent(id)}/events?after=${encodeURIComponent(afterEventId)}`
    : `/api/v1/investigations/${encodeURIComponent(id)}/events`;

  try {
    const res = await fetcher(url, {
      method: 'GET',
      headers: buildRequestHeaders(options?.headers),
      signal: options?.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'FETCH_EVENTS_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: {
        events: Array.isArray(json?.data) ? json.data : [],
        hasMore: Boolean(json?.hasMore),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while fetching events',
      },
      status: 0,
    };
  }
}

/**
 * Triggers experiment planning or replanning for an investigation via POST /api/v1/investigations/[id]/plan
 */
export async function requestPlanning(
  id: string,
  command?: Partial<RequestPlanningCommand>,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; idempotencyKey?: string }
): Promise<ApiResponse<RequestPlanningResult>> {
  const fetcher = options?.fetchFn || fetch;
  const payload = {
    investigationId: id,
    ...(command || {}),
  };
  const idempotencyHeaders: Record<string, string> = {};
  const effectiveKey = options?.idempotencyKey || (command as { idempotencyKey?: string } | undefined)?.idempotencyKey;
  if (effectiveKey) {
    idempotencyHeaders['X-Idempotency-Key'] = effectiveKey;
  }

  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/plan`, {
      method: 'POST',
      headers: buildRequestHeaders({
        'Content-Type': 'application/json',
        ...idempotencyHeaders,
        ...(options?.headers || {}),
      }),
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'REQUEST_PLANNING_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json?.data || json,
      mode: json?.mode,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while requesting planning',
      },
      status: 0,
    };
  }
}

/**
 * Fetches the authoritative experiment plan revision for an investigation via GET /api/v1/investigations/[id]/plan
 */
export async function fetchPlan(
  id: string,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<ApiResponse<PlanDetailResult>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/plan`, {
      method: 'GET',
      headers: buildRequestHeaders(options?.headers),
      signal: options?.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'FETCH_PLAN_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: json,
      mode: json?.mode,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while fetching plan',
      },
      status: 0,
    };
  }
}

/**
 * Fetches the list of eligible processed evidence artifacts for an investigation via GET /api/v1/investigations/[id]/artifacts
 */
export async function fetchArtifacts(
  id: string,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<ApiResponse<{ artifacts: ArtifactItem[]; total: number; mode: string; restrictedRecordingCount?: number }>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}/artifacts`, {
      method: 'GET',
      headers: buildRequestHeaders(options?.headers),
      signal: options?.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: json?.error?.code || 'FETCH_ARTIFACTS_FAILED',
          category: json?.error?.category || 'INTERNAL_ERROR',
          message: extractErrorMessage(res, json),
          details: json?.error?.details,
        },
        status: res.status,
      };
    }

    return {
      success: true,
      data: {
        artifacts: Array.isArray(json?.data?.artifacts) ? json.data.artifacts : [],
        restrictedRecordingCount: json?.data?.restrictedRecordingCount || 0,
        total: typeof json?.data?.total === 'number' ? json.data.total : (json?.data?.artifacts?.length || 0),
        mode: json?.mode || 'live',
      },
      mode: json?.mode,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        category: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Network connection failure while fetching artifacts',
      },
      status: 0,
    };
  }
}
