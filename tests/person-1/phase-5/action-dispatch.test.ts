import { describe, it, expect } from 'vitest';
import { ActionDispatcher } from '@/server/browser/action-dispatcher';
import { TargetNetworkGuard } from '@/server/browser/target-network-guard';
import { ObservationManager } from '@/server/browser/observation-manager';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { PlanStep } from '@/contracts/planning';

describe('P1-05: Typed Action Dispatcher & Uncertainty Tracking', () => {
  const target: SafeTargetProfile = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Test App',
    baseUrl: 'https://staging.testapp.com',
    allowedOrigins: ['https://staging.testapp.com'],
    isSandboxVerified: true,
    environment: 'staging',
    hasResetCapability: true,
    hasTestAccountConfigured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const guard = new TargetNetworkGuard(target);
  const obsManager = new ObservationManager(1);

  it('marks read-only actions with uncertainty NONE on success', async () => {
    const dispatcher = new ActionDispatcher(guard, obsManager);

    const mockLocator: any = {
      count: async () => 1,
      innerText: async () => 'Welcome Back',
    };

    const mockPage: any = {
      locator: () => mockLocator,
    };

    const step: PlanStep = {
      stepIndex: 1,
      semanticAction: 'Read header title',
      toolKind: 'get_text',
      selector: '#header-title',
      tier: 'TIER_1_READ_ONLY',
      timeoutMs: 5000,
    };

    const receipt = await dispatcher.executeStep(mockPage, step);
    expect(receipt.status).toBe('SUCCESS');
    expect(receipt.uncertainty).toBe('NONE');
    expect(receipt.durationMs).toBeGreaterThanOrEqual(0);
    expect(receipt.completedAt).toBeDefined();
  });

  it('marks successful mutating actions with uncertainty NONE (tool success does not prove mutation)', async () => {
    const dispatcher = new ActionDispatcher(guard, obsManager);

    const mockLocator: any = {
      count: async () => 1,
      click: async () => {},
    };

    const mockPage: any = {
      locator: () => mockLocator,
    };

    const step: PlanStep = {
      stepIndex: 2,
      semanticAction: 'Click delete account button',
      toolKind: 'click_button',
      selector: '#delete-btn',
      tier: 'TIER_3_MUTATING_INTERACTION',
      timeoutMs: 5000,
    };

    const receipt = await dispatcher.executeStep(mockPage, step);
    expect(receipt.status).toBe('SUCCESS');
    expect(receipt.uncertainty).toBe('NONE');
    expect(receipt.errorDetails).toBeUndefined();
  });

  it('preserves MUTATION_UNCERTAIN when a mutating interaction times out', async () => {
    const dispatcher = new ActionDispatcher(guard, obsManager);

    const timeoutError = new Error('Timeout 5000ms exceeded while waiting for element');
    timeoutError.name = 'TimeoutError';

    const mockLocator: any = {
      count: async () => 1,
      click: async () => {
        throw timeoutError;
      },
    };

    const mockPage: any = {
      locator: () => mockLocator,
    };

    const step: PlanStep = {
      stepIndex: 3,
      semanticAction: 'Click transfer funds submit button',
      toolKind: 'click_button',
      selector: '#transfer-funds-btn',
      tier: 'TIER_3_MUTATING_INTERACTION',
      timeoutMs: 5000,
    };

    const receipt = await dispatcher.executeStep(mockPage, step);
    expect(receipt.status).toBe('TIMED_OUT');
    expect(receipt.uncertainty).toBe('MUTATION_UNCERTAIN');
    expect(receipt.errorDetails).toContain('Timeout');
  });

  it('preserves MUTATION_UNCERTAIN when a mutating action throws an unhandled error midway', async () => {
    const dispatcher = new ActionDispatcher(guard, obsManager);

    const mockLocator: any = {
      count: async () => 1,
      fill: async () => {
        throw new Error('Target page crashed or closed unexpectedly');
      },
    };

    const mockPage: any = {
      locator: () => mockLocator,
    };

    const step: PlanStep = {
      stepIndex: 4,
      semanticAction: 'Fill new email input',
      toolKind: 'fill_input',
      selector: '#email-input',
      value: 'new@example.com',
      tier: 'TIER_3_MUTATING_INTERACTION',
      timeoutMs: 5000,
    };

    const receipt = await dispatcher.executeStep(mockPage, step);
    expect(receipt.status).toBe('FAILED');
    expect(receipt.uncertainty).toBe('MUTATION_UNCERTAIN');
    expect(receipt.errorDetails).toContain('Target page crashed');
  });

  it('blocks out-of-scope navigation immediately before dispatch', async () => {
    const dispatcher = new ActionDispatcher(guard, obsManager);

    const mockPage: any = {
      goto: async () => {},
    };

    const step: PlanStep = {
      stepIndex: 5,
      semanticAction: 'Navigate to external phishing URL',
      toolKind: 'navigate',
      value: 'https://evil.external.org/login',
      tier: 'TIER_2_SAFE_INTERACTION',
      timeoutMs: 5000,
    };

    const receipt = await dispatcher.executeStep(mockPage, step);
    expect(receipt.status).toBe('FAILED');
    expect(receipt.uncertainty).toBe('NONE'); // navigation blocked pre-dispatch
    expect(receipt.errorDetails).toContain('[TargetNetworkGuard]');
  });
});
