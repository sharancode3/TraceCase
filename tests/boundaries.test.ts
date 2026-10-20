import { describe, it, expect } from 'vitest';
import { requireAuthenticatedPrincipal, AuthenticationError } from '@/server/auth';
import { unavailableAiPlanner, unavailableBrowserWorker, ServiceUnavailableError } from '@/server/services/ports';
import { createSafeError } from '@/contracts/errors';

describe('Security Boundaries & Untrusted Input Isolation', () => {
  it('fails closed when authentication is missing', async () => {
    const mockRequest = new Request('http://localhost:3000/api/v1/targets', {
      method: 'POST',
      headers: {},
    });

    await expect(requireAuthenticatedPrincipal(mockRequest)).rejects.toThrow(AuthenticationError);
  });

  it('rejects preview headers from claiming authenticated authority', async () => {
    const mockPreviewRequest = new Request('http://localhost:3000/api/v1/targets', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-valid-operator-token',
        'x-tracecase-preview': 'true', // Attempting to use preview header on protected API
      },
    });

    await expect(requireAuthenticatedPrincipal(mockPreviewRequest)).rejects.toThrow(AuthenticationError);
  });

  it('throws typed ServiceUnavailableError for deferred AI adapter', async () => {
    await expect(
      unavailableAiPlanner.generateExperimentPlan({
        target: {
          id: '00000000-0000-0000-0000-000000000000',
          name: 'Demo',
          baseUrl: 'http://localhost:3005',
          allowedOrigins: ['http://localhost:3005'],
          isSandbox: true,
          environment: 'staging',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        bugTitle: 'Test Bug',
        description: 'Test Description',
        expected: 'Expected',
        observed: 'Observed',
      })
    ).rejects.toThrow(ServiceUnavailableError);
  });

  it('generates safe error envelope without leaking private stack traces or secrets', () => {
    const envelope = createSafeError(
      'POLICY_VIOLATION',
      'DESTRUCTIVE_ACTION_FORBIDDEN',
      'Destructive action blocked on non-sandbox host.',
      { attemptedAction: 'delete_element', targetId: 'prod-target-01' }
    );

    expect(envelope.success).toBe(false);
    expect(envelope.error.code).toBe('DESTRUCTIVE_ACTION_FORBIDDEN');
    expect(envelope.error.category).toBe('POLICY_VIOLATION');
    // Ensure no sensitive substrings
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('secret');
  });
});
