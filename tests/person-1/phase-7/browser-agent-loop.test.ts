import { describe, it, expect, vi } from 'vitest';
import { BrowserAgentLoop } from '@/server/ai/browser-agent-loop';
import type { Page } from 'playwright';
import type { AuthoritativeExperimentPlan, PlanStep } from '@/contracts/planning';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { BrowserInvestigationAgentPort } from '@/server/services/ports';
import type { ActionDispatcher } from '@/server/browser/action-dispatcher';
import type { ObservationManager } from '@/server/browser/observation-manager';
import type { TargetNetworkGuard } from '@/server/browser/target-network-guard';
import type { SanitizedBrowserObservation } from '@/contracts/observations';

describe('P1-07: Bounded Browser Agent Loop & Safety Policy', () => {
  const target: SafeTargetProfile = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Target',
    baseUrl: 'https://app.test.local',
    allowedOrigins: ['https://app.test.local'],
    isSandboxVerified: true,
    environment: 'development',
    hasResetCapability: true,
    hasTestAccountConfigured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const plan: AuthoritativeExperimentPlan = {
    id: '00000000-0000-0000-0000-000000000002',
    investigationId: '00000000-0000-0000-0000-000000000003',
    version: 1,
    targetId: target.id,
    targetUrl: target.baseUrl,
    allowedOrigins: target.allowedOrigins,
    preconditions: ['Target is online'],
    steps: [],
    expectedCorrectBehavior: 'Success banner appears',
    reportedFailureSignature: 'Crash alert appears',
    assertions: [],
    maxAttempts: 2,
    maxDurationMs: 60000,
    requiresResetHook: true,
    planHash: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
  };

  const createMockObservation = (url: string, elementText: string): SanitizedBrowserObservation => ({
    attemptNumber: 1,
    stepIndex: 1,
    currentUrl: url,
    pageTitle: 'Test Page',
    visibleDomElements: [
      {
        elementRef: 'ref-1',
        tagName: 'button',
        ariaRole: 'button',
        textSnippet: elementText,
        isInteractive: true,
      },
    ],
    recentConsoleEntries: [],
    recentNetworkFailures: [],
    freshnessTimestamp: new Date().toISOString(),
  });

  it('executes steps sequentially and finishes with READY_FOR_VERIFICATION', async () => {
    let callIndex = 0;
    const mockAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => {
        callIndex++;
        if (callIndex === 1) {
          return {
            kind: 'EXECUTE_ACTION',
            action: {
              stepIndex: 1,
              semanticAction: 'Click submit button',
              toolKind: 'click_button',
              selector: '#submit-btn',
              tier: 'TIER_2_SAFE_INTERACTION',
              timeoutMs: 5000,
            },
            rationale: 'Submitting the form',
            confidence: 0.95,
          };
        }
        return {
          kind: 'READY_FOR_VERIFICATION',
          rationale: 'Settling point reached, ready for deterministic assertions',
          expectedSettlingPointReached: true,
        };
      },
    };

    let obsCall = 0;
    const mockObsManager = {
      captureFreshObservation: async () => {
        obsCall++;
        return createMockObservation('https://app.test.local/form', `State ${obsCall}`);
      },
    } as unknown as ObservationManager;

    const mockDispatcher = {
      executeStep: async (_page: any, action: PlanStep) => ({
        stepIndex: action.stepIndex,
        action,
        tier: action.tier,
        status: 'SUCCESS' as const,
        durationMs: 150,
        uncertainty: 'NONE' as const,
        dispatchedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }),
    } as unknown as ActionDispatcher;

    const mockNetworkGuard = {
      validateUrl: () => ({ isAllowed: true }),
    } as unknown as TargetNetworkGuard;

    const mockPage = {} as Page;

    const result = await BrowserAgentLoop.run({
      page: mockPage,
      investigationId: plan.investigationId,
      approvedIntent: 'Reproduce form submission defect',
      plan,
      target,
      agent: mockAgent,
      actionDispatcher: mockDispatcher,
      observationManager: mockObsManager,
      networkGuard: mockNetworkGuard,
      maxPermittedTier: 'TIER_3_MUTATING_INTERACTION',
    });

    expect(result.outcome).toBe('READY_FOR_VERIFICATION');
    expect(result.actionsExecuted).toHaveLength(1);
    expect(result.actionsExecuted[0].status).toBe('SUCCESS');
    expect(result.finalReason).toContain('ready for deterministic assertions');
  });

  it('stops cleanly and returns reason when REQUEST_MANUAL_HELP is proposed', async () => {
    const mockAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => ({
        kind: 'REQUEST_MANUAL_HELP',
        reason: 'CAPTCHA_DETECTED',
        userPrompt: 'Cloudflare Turnstile challenge detected on login form.',
      }),
    };

    const mockObsManager = {
      captureFreshObservation: async () => createMockObservation('https://app.test.local/login', 'Login'),
    } as unknown as ObservationManager;

    const result = await BrowserAgentLoop.run({
      page: {} as Page,
      investigationId: plan.investigationId,
      approvedIntent: 'Reproduce defect',
      plan,
      target,
      agent: mockAgent,
      actionDispatcher: {} as ActionDispatcher,
      observationManager: mockObsManager,
      networkGuard: {} as TargetNetworkGuard,
      maxPermittedTier: 'TIER_3_MUTATING_INTERACTION',
    });

    expect(result.outcome).toBe('REQUEST_MANUAL_HELP');
    expect(result.finalReason).toContain('CAPTCHA_DETECTED');
    expect(result.actionsExecuted).toHaveLength(0);
  });

  it('automatically detects loop without progress and stops with STOP_NO_PROGRESS', async () => {
    const mockAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => ({
        kind: 'EXECUTE_ACTION',
        action: {
          stepIndex: 1,
          semanticAction: 'Click stuck button',
          toolKind: 'click_button',
          selector: '#stuck-btn',
          tier: 'TIER_2_SAFE_INTERACTION',
          timeoutMs: 5000,
        },
        rationale: 'Retrying button',
        confidence: 0.8,
      }),
    };

    // Observation always returns identical state signature
    const mockObsManager = {
      captureFreshObservation: async () => createMockObservation('https://app.test.local/same-page', 'Static Content'),
    } as unknown as ObservationManager;

    const mockDispatcher = {
      executeStep: async (_page: any, action: PlanStep) => ({
        stepIndex: action.stepIndex,
        action,
        tier: action.tier,
        status: 'SUCCESS' as const,
        durationMs: 50,
        uncertainty: 'NONE' as const,
        dispatchedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }),
    } as unknown as ActionDispatcher;

    const result = await BrowserAgentLoop.run({
      page: {} as Page,
      investigationId: plan.investigationId,
      approvedIntent: 'Reproduce defect',
      plan,
      target,
      agent: mockAgent,
      actionDispatcher: mockDispatcher,
      observationManager: mockObsManager,
      networkGuard: {} as TargetNetworkGuard,
      maxPermittedTier: 'TIER_3_MUTATING_INTERACTION',
      options: { maxConsecutiveNoProgress: 3 },
    });

    expect(result.outcome).toBe('STOP_NO_PROGRESS');
    expect(result.finalReason).toContain('No state change observed');
  });

  it('blocks actions exceeding maxPermittedTier before execution', async () => {
    const mockAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => ({
        kind: 'EXECUTE_ACTION',
        action: {
          stepIndex: 1,
          semanticAction: 'Delete user account',
          toolKind: 'click_button',
          selector: '#delete-account-btn',
          tier: 'TIER_4_DESTRUCTIVE', // Exceeds permitted tier!
          timeoutMs: 5000,
        },
        rationale: 'Purging account',
        confidence: 0.99,
      }),
    };

    const mockObsManager = {
      captureFreshObservation: async () => createMockObservation('https://app.test.local/settings', 'Settings'),
    } as unknown as ObservationManager;

    const executeSpy = vi.fn();
    const mockDispatcher = { executeStep: executeSpy } as unknown as ActionDispatcher;

    const result = await BrowserAgentLoop.run({
      page: {} as Page,
      investigationId: plan.investigationId,
      approvedIntent: 'Reproduce defect',
      plan,
      target,
      agent: mockAgent,
      actionDispatcher: mockDispatcher,
      observationManager: mockObsManager,
      networkGuard: {} as TargetNetworkGuard,
      maxPermittedTier: 'TIER_2_SAFE_INTERACTION', // Only tier 1 & 2 allowed!
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.actionsExecuted).toHaveLength(1);
    expect(result.actionsExecuted[0].status).toBe('FAILED');
    expect(result.actionsExecuted[0].errorDetails).toContain('BLOCKED_BY_POLICY');
  });

  it('halts immediately when a mutating action encounters MUTATION_UNCERTAIN', async () => {
    const mockAgent: BrowserInvestigationAgentPort = {
      proposeNextAction: async () => ({
        kind: 'EXECUTE_ACTION',
        action: {
          stepIndex: 1,
          semanticAction: 'Process payment',
          toolKind: 'click_button',
          selector: '#pay-btn',
          tier: 'TIER_3_MUTATING_INTERACTION',
          timeoutMs: 5000,
        },
        rationale: 'Triggering checkout',
        confidence: 0.9,
      }),
    };

    let obsCount = 0;
    const mockObsManager = {
      captureFreshObservation: async () => {
        obsCount++;
        return createMockObservation('https://app.test.local/pay', `Step ${obsCount}`);
      },
    } as unknown as ObservationManager;

    const mockDispatcher = {
      executeStep: async (_page: any, action: PlanStep) => ({
        stepIndex: action.stepIndex,
        action,
        tier: action.tier,
        status: 'TIMED_OUT' as const,
        durationMs: 5000,
        uncertainty: 'MUTATION_UNCERTAIN' as const, // Post-mutation network timeout!
        errorDetails: 'Timeout waiting for payment gateway response.',
        dispatchedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }),
    } as unknown as ActionDispatcher;

    const result = await BrowserAgentLoop.run({
      page: {} as Page,
      investigationId: plan.investigationId,
      approvedIntent: 'Reproduce defect',
      plan,
      target,
      agent: mockAgent,
      actionDispatcher: mockDispatcher,
      observationManager: mockObsManager,
      networkGuard: { validateUrl: () => ({ isAllowed: true }) } as unknown as TargetNetworkGuard,
      maxPermittedTier: 'TIER_3_MUTATING_INTERACTION',
    });

    expect(result.outcome).toBe('HALTED_ON_UNCERTAINTY');
    expect(result.actionsExecuted).toHaveLength(1);
    expect(result.actionsExecuted[0].uncertainty).toBe('MUTATION_UNCERTAIN');
  });
});
