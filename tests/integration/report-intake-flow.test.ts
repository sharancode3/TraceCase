import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitBugReport,
  requestPlanning,
} from '@/features/investigations/api-client';
import { DraftReportIntakeSchema, CreateReportCommandSchema } from '@/contracts/reports';
import type { DraftReportIntake } from '@/contracts/reports';

/**
 * ============================================================================
 * TRACECASE REPORT INTAKE & PLANNING RETRY REGRESSION SUITE (SECTION 4)
 * ============================================================================
 *
 * Proves that:
 * 1. Valid DraftReportIntake payloads with `rawDescription` pass validation and reach the HTTP route.
 * 2. Incomplete / vague reports with only targetId, title, and rawDescription succeed.
 * 3. Conflicting combinations (both rawDescription and bugDescription) fail client validation fail-closed.
 * 4. Authority-bearing or extraneous fields are rejected by strict schema validation.
 * 5. Planning failures preserve the saved investigation and allow retries without creating duplicate reports.
 */

describe('Report Intake & Autonomous Planning Flow (Section 4 Regression)', () => {
  const validTargetId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates and submits a vague DraftReportIntake with only targetId, title, and rawDescription', async () => {
    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: '22222222-2222-2222-2222-222222222222',
          investigationId: '33333333-3333-3333-3333-333333333333',
          targetId: validTargetId,
          title: 'Vague task disappearance',
          rawDescription: 'Tasks disappear when clicking random filters.',
          bugDescription: 'Tasks disappear when clicking random filters.',
        },
      }),
    });

    const vagueDraft: DraftReportIntake = {
      targetId: validTargetId,
      title: 'Vague task disappearance',
      rawDescription: 'Tasks disappear when clicking random filters.',
    };

    // Validated against DraftReportIntakeSchema
    const parseResult = DraftReportIntakeSchema.safeParse(vagueDraft);
    expect(parseResult.success).toBe(true);

    const result = await submitBugReport(vagueDraft, { fetchFn: customFetch });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.investigationId).toBe('33333333-3333-3333-3333-333333333333');
    }

    expect(customFetch).toHaveBeenCalledTimes(1);
    const [requestUrl, requestOptions] = customFetch.mock.calls[0];
    expect(requestUrl).toBe('/api/v1/reports');
    expect(JSON.parse(requestOptions.body)).toEqual(vagueDraft);
  });

  it('rejects conflicting payloads containing both rawDescription and bugDescription before network dispatch', async () => {
    const customFetch = vi.fn();

    const conflictingPayload = {
      targetId: validTargetId,
      title: 'Double description conflict',
      rawDescription: 'Raw text representation',
      bugDescription: 'Legacy description representation',
    };

    // Neither schema permits both fields because both schemas are .strict()
    expect(DraftReportIntakeSchema.safeParse(conflictingPayload).success).toBe(false);
    expect(CreateReportCommandSchema.safeParse(conflictingPayload).success).toBe(false);

    const result = await submitBugReport(conflictingPayload as any, { fetchFn: customFetch });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CLIENT_VALIDATION_ERROR');
      expect(result.status).toBe(400);
    }

    expect(customFetch).not.toHaveBeenCalled();
  });

  it('rejects authority-bearing or unrecognized fields fail-closed via strict validation', async () => {
    const customFetch = vi.fn();

    const authorityTamperingPayload = {
      targetId: validTargetId,
      title: 'Privilege escalation attempt',
      rawDescription: 'Attempting to inject server-owned status or ownerId',
      ownerId: '00000000-0000-0000-0000-000000000000',
      workflowRevision: 99,
      isApproved: true,
    };

    const result = await submitBugReport(authorityTamperingPayload as any, { fetchFn: customFetch });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CLIENT_VALIDATION_ERROR');
    }
    expect(customFetch).not.toHaveBeenCalled();
  });

  it('allows retrying experiment planning on an existing investigation without duplicating the report', async () => {
    const customFetch = vi.fn();
    const existingInvId = '44444444-4444-4444-4444-444444444444';

    // First attempt: planning fails with 503 (model offline)
    customFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: 'MODEL_OFFLINE',
          message: 'Selected model runtime is offline.',
        },
      }),
    });

    const firstTry = await requestPlanning(existingInvId, undefined, { fetchFn: customFetch });
    expect(firstTry.success).toBe(false);
    if (!firstTry.success) {
      expect(firstTry.error.code).toBe('MODEL_OFFLINE');
    }

    // Second attempt: model comes online, retry succeeds with existing investigation ID
    customFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          status: 'PROPOSAL_READY',
          investigationId: existingInvId,
          plan: {
            version: 1,
            planHash: 'a'.repeat(64),
            steps: [],
          },
        },
      }),
    });

    const retryResult = await requestPlanning(existingInvId, undefined, { fetchFn: customFetch });
    expect(retryResult.success).toBe(true);
    if (retryResult.success) {
      expect(retryResult.data.status).toBe('PROPOSAL_READY');
    }

    // Notice that no POST /api/v1/reports call was made during retry
    expect(customFetch).toHaveBeenCalledTimes(2);
    expect(customFetch.mock.calls[0][0]).toBe(`/api/v1/investigations/${existingInvId}/plan`);
    expect(customFetch.mock.calls[1][0]).toBe(`/api/v1/investigations/${existingInvId}/plan`);
  });
});
