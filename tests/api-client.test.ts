import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractErrorMessage,
  fetchTargets,
  submitTarget,
  submitBugReport,
  approveInvestigationPlan,
  fetchInvestigation,
} from '@/features/investigations/api-client';
import { createSafeError } from '@/contracts/errors';

describe('Investigations API Client (P3-04)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error Message Extraction', () => {
    it('extracts structured message from SafeErrorEnvelope', () => {
      const envelope = createSafeError(
        'CONFLICT_STALE_VERSION',
        'PLAN_HASH_MISMATCH',
        'Stale plan hash rejected by approval guard'
      );
      const res = new Response(JSON.stringify(envelope), { status: 409 });
      const message = extractErrorMessage(res, envelope);
      expect(message).toBe('Stale plan hash rejected by approval guard');
    });

    it('falls back to standard HTTP status messages when body is empty or malformed', () => {
      const res401 = new Response('', { status: 401 });
      expect(extractErrorMessage(res401)).toContain('Authentication required');

      const res403 = new Response('', { status: 403 });
      expect(extractErrorMessage(res403)).toContain('Permission denied');

      const res409 = new Response('', { status: 409 });
      expect(extractErrorMessage(res409)).toContain('Plan conflict');
    });
  });

  describe('fetchTargets', () => {
    it('returns target catalog and mode on successful GET', async () => {
      const mockTargets = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Demo App',
          baseUrl: 'http://localhost:3005',
          allowedOrigins: ['http://localhost:3005'],
          isSandbox: true,
          environment: 'staging',
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:00:00.000Z',
        },
      ];

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockTargets, total: 1, mode: 'preview_synthetic' }),
      } as unknown as Response);

      const result = await fetchTargets({ fetchFn: customFetch });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.targets.length).toBe(1);
        expect(result.data.mode).toBe('preview_synthetic');
      }
      expect(customFetch).toHaveBeenCalledWith('/api/v1/targets', expect.objectContaining({ method: 'GET' }));
    });

    it('handles HTTP error responses from GET /api/v1/targets', async () => {
      const envelope = createSafeError('UNAUTHENTICATED', 'AUTH_REQUIRED', 'Sign-in required');
      const customFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => envelope,
      } as unknown as Response);

      const result = await fetchTargets({ fetchFn: customFetch });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(401);
        expect(result.error.message).toBe('Sign-in required');
      }
    });

    it('handles network failure gracefully', async () => {
      const customFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const result = await fetchTargets({ fetchFn: customFetch });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(0);
        expect(result.error.code).toBe('NETWORK_ERROR');
        expect(result.error.message).toContain('Connection refused');
      }
    });
  });

  describe('submitTarget', () => {
    it('rejects invalid payload on client before network call', async () => {
      const customFetch = vi.fn();
      // @ts-expect-error Testing invalid schema input
      const result = await submitTarget({ name: 'A' }, { fetchFn: customFetch });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(400);
        expect(result.error.code).toBe('CLIENT_VALIDATION_ERROR');
      }
      expect(customFetch).not.toHaveBeenCalled();
    });

    it('submits valid target command and receives created target', async () => {
      const validCommand = {
        name: 'Staging Portal',
        baseUrl: 'https://staging.testapp.corp',
        allowedOrigins: ['https://staging.testapp.corp'],
        isSandboxRequested: true,
        environment: 'staging' as const,
      };

      const serverResponseData = {
        id: '22222222-2222-2222-2222-222222222222',
        name: validCommand.name,
        baseUrl: validCommand.baseUrl,
        allowedOrigins: validCommand.allowedOrigins,
        isSandbox: false,
        environment: validCommand.environment,
        createdBy: 'usr-123',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: serverResponseData, created: true }),
      } as unknown as Response);

      const result = await submitTarget(validCommand, { fetchFn: customFetch });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(serverResponseData.id);
        expect(result.data.name).toBe('Staging Portal');
      }
    });

    it('surfaces 401 authentication error without claiming creation', async () => {
      const validCommand = {
        name: 'Protected Target',
        baseUrl: 'https://staging.testapp.corp',
        allowedOrigins: ['https://staging.testapp.corp'],
        isSandboxRequested: false,
        environment: 'staging' as const,
      };

      const envelope = createSafeError('UNAUTHENTICATED', 'AUTH_REQUIRED', 'Valid credentials required');
      const customFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => envelope,
      } as unknown as Response);

      const result = await submitTarget(validCommand, { fetchFn: customFetch });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(401);
        expect(result.error.message).toBe('Valid credentials required');
      }
    });
  });

  describe('submitBugReport', () => {
    it('validates bug report parameters locally before network call', async () => {
      const customFetch = vi.fn();
      // @ts-expect-error Testing missing required fields
      const result = await submitBugReport({ title: 'Short' }, { fetchFn: customFetch });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(400);
        expect(result.error.code).toBe('CLIENT_VALIDATION_ERROR');
      }
      expect(customFetch).not.toHaveBeenCalled();
    });

    it('submits valid report and returns created report with investigationId', async () => {
      const command = {
        targetId: '33333333-3333-3333-3333-333333333333',
        title: 'Deleting item with active filter removes wrong item',
        bugDescription: 'When active filter is selected and delete button is clicked on first item, index 0 is deleted instead.',
        expectedBehavior: 'Active item at index 0 should be deleted correctly.',
        observedBehavior: 'Completed item at overall index 0 is deleted.',
        suspectedSteps: ['1. Filter by active', '2. Click delete'],
        browserEnvironment: 'Chrome 128',
        buildVersion: 'v1.0.0',
      };

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'rep-uuid-001',
            investigationId: 'inv-uuid-001',
            ...command,
            createdBy: 'usr-001',
            createdAt: '2026-10-20T12:00:00.000Z',
            updatedAt: '2026-10-20T12:00:00.000Z',
          },
          created: true,
        }),
      } as unknown as Response);

      const result = await submitBugReport(command, { fetchFn: customFetch });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.investigationId).toBe('inv-uuid-001');
      }
    });
  });

  describe('approveInvestigationPlan', () => {
    it('rejects invalid plan hash locally', async () => {
      const customFetch = vi.fn();
      const result = await approveInvestigationPlan(
        '44444444-4444-4444-4444-444444444444',
        {
          investigationId: '44444444-4444-4444-4444-444444444444',
          planVersion: 1,
          approvedPlanHash: 'invalid-not-64-hex',
        },
        { fetchFn: customFetch }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(400);
        expect(result.error.code).toBe('CLIENT_VALIDATION_ERROR');
      }
      expect(customFetch).not.toHaveBeenCalled();
    });

    it('submits valid plan approval command and receives confirmation', async () => {
      const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const invId = '55555555-5555-5555-5555-555555555555';

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            investigationId: invId,
            planVersion: 1,
            planHash: validHash,
            approvedBy: 'operator-01',
            approvedAt: '2026-10-20T12:00:00.000Z',
          },
          status: 'APPROVED',
        }),
      } as unknown as Response);

      const result = await approveInvestigationPlan(
        invId,
        {
          investigationId: invId,
          planVersion: 1,
          approvedPlanHash: validHash,
          operatorNotes: 'Verified staging environment',
        },
        { fetchFn: customFetch }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.investigationId).toBe(invId);
        expect(result.data.planHash).toBe(validHash);
      }
    });

    it('correctly handles 409 plan hash mismatch error', async () => {
      const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const invId = '66666666-6666-6666-6666-666666666666';

      const conflictEnvelope = createSafeError(
        'CONFLICT_STALE_VERSION',
        'PLAN_HASH_MISMATCH',
        'Plan was modified since review was opened (TC-INV-004)'
      );

      const customFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => conflictEnvelope,
      } as unknown as Response);

      const result = await approveInvestigationPlan(
        invId,
        {
          investigationId: invId,
          planVersion: 1,
          approvedPlanHash: validHash,
        },
        { fetchFn: customFetch }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(409);
        expect(result.error.code).toBe('PLAN_HASH_MISMATCH');
        expect(result.error.message).toContain('Plan was modified');
      }
    });
  });

  describe('fetchInvestigation', () => {
    it('handles not found response', async () => {
      const notFoundEnvelope = createSafeError('NOT_FOUND', 'INVESTIGATION_NOT_FOUND', 'Investigation 999 not found');
      const customFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => notFoundEnvelope,
      } as unknown as Response);

      const result = await fetchInvestigation('999', { fetchFn: customFetch });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(404);
        expect(result.error.message).toContain('not found');
      }
    });
  });
});
