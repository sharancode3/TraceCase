import {
  type ClientSafeTargetProfile,
  type CreateTargetCommand,
  CreateTargetCommandSchema,
} from '@/contracts/targets';
import {
  type CreateReportCommand,
  type BugReportResponse,
  CreateReportCommandSchema,
} from '@/contracts/reports';
import {
  type ApprovePlanCommand,
  ApprovePlanCommandSchema,
} from '@/contracts/planning';
import {
  SafeErrorEnvelopeSchema,
} from '@/contracts/errors';
import type { InvestigationSnapshot } from '@/contracts/investigations';

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
      return 'Plan conflict: The experiment plan hash does not match current version (TC-INV-004).';
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
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<{ targets: ClientSafeTargetProfile[]; total: number; mode: string }>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher('/api/v1/targets', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
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
): Promise<ApiResponse<ClientSafeTargetProfile>> {
  // Client-side schema validation before transmission
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
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
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
      mode: json.data?.isSandbox ? 'sandbox' : 'protected',
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
 */
export async function submitBugReport(
  command: CreateReportCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<CreatedReportResult>> {
  // Client-side schema validation before transmission
  const validation = CreateReportCommandSchema.safeParse(command);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'CLIENT_VALIDATION_ERROR',
        category: 'VALIDATION_FAILED',
        message: validation.error.errors[0]?.message || 'Validation error in bug report submission',
        details: validation.error.format(),
      },
      status: 400,
    };
  }

  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher('/api/v1/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
      body: JSON.stringify(validation.data),
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
 * Fetches an investigation snapshot from GET /api/v1/investigations/[id]
 */
export async function fetchInvestigation(
  id: string,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<InvestigationSnapshot>> {
  const fetcher = options?.fetchFn || fetch;
  try {
    const res = await fetcher(`/api/v1/investigations/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
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

/**
 * Submits cryptographic operator approval to POST /api/v1/investigations/[id]/approve
 */
export async function approveInvestigationPlan(
  id: string,
  command: ApprovePlanCommand,
  options?: { headers?: Record<string, string>; fetchFn?: typeof fetch }
): Promise<ApiResponse<PlanApprovalResult>> {
  // Validate command
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
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
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
