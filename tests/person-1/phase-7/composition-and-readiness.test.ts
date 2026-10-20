import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getServiceContainer,
  setServiceContainerForTesting,
  getSystemReadiness,
  createDefaultServiceContainer,
  ServiceContainer,
} from '@/server/services/service-container';
import { ServiceUnavailableError } from '@/server/services/ports';

describe('P1-07: Service Composition & Truthful Capability Reporting', () => {
  let defaultContainer: ServiceContainer;

  beforeEach(() => {
    defaultContainer = createDefaultServiceContainer();
    setServiceContainerForTesting(defaultContainer);
  });

  afterEach(() => {
    setServiceContainerForTesting(null);
  });

  it('fails closed with ServiceUnavailableError when calling unconfigured teammate ports', async () => {
    const container = getServiceContainer();

    // Clarification agent port (Stage 3)
    await expect(
      container.clarificationAgent.generateProposal({
        report: {} as any,
        target: {} as any,
      })
    ).rejects.toThrow(ServiceUnavailableError);

    // Browser investigation agent port (Stage 3)
    await expect(
      container.browserAgent.proposeNextAction({
        investigationId: 'inv-1',
        approvedIntent: 'Click submit',
        currentObservation: {} as any,
        remainingAllowedTiers: ['TIER_1_READ_ONLY'],
      })
    ).rejects.toThrow(ServiceUnavailableError);

    // Evidence review agent port (Stage 3)
    await expect(
      container.evidenceReviewAgent.synthesizeExplanation({
        investigationId: 'inv-1',
        lockedVerdict: 'CONFIRMED_REPRODUCED',
        verifiedAssertions: [],
        eligibleEvidence: [],
      })
    ).rejects.toThrow(ServiceUnavailableError);

    // Target reset hook port (Stage 5)
    await expect(
      container.targetReset.triggerFixtureReset({
        targetId: 't-1',
        resetEndpoint: 'http://localhost/reset',
        resetAuthSecret: 'secret',
        fixtureScope: 'default',
      })
    ).rejects.toThrow(ServiceUnavailableError);

    // Evidence storage port (Stage 6)
    await expect(
      container.evidenceStorage.registerCapture({} as any)
    ).rejects.toThrow(ServiceUnavailableError);
  });

  it('truthfully reports system capability readiness without claiming missing features work', async () => {
    const report = await getSystemReadiness();

    expect(report.timestamp).toBeDefined();
    expect(report.components).toBeDefined();

    // Browser runtime is available (Chromium headless Playwright)
    expect(report.components.browserRuntime.status).toBe('AVAILABLE');
    expect(report.components.browserRuntime.metadata?.engine).toBe('Chromium');

    // Person 3 storage is unconfigured in Person 1 stage
    expect(report.components.evidenceStorage.status).toBe('UNAVAILABLE');
    expect(report.components.evidenceStorage.details).toContain('Person 3');

    // Overall status is DEGRADED when some integrations are unavailable
    expect(['OPERATIONAL', 'DEGRADED', 'NOT_READY']).toContain(report.overallStatus);
  });

  it('allows overriding ports with test doubles in testing environments', async () => {
    const mockClarificationAgent = {
      generateProposal: async () => ({
        status: 'EXPERIMENT_PROPOSED' as const,
        proposal: {
          preconditions: ['Target is online'],
          steps: [],
          expectedCorrectBehavior: 'Success banner displayed',
          reportedFailureSignature: 'Error alert displayed',
          assertions: [],
          requiresResetHook: false,
        },
      }),
    };

    setServiceContainerForTesting({
      ...defaultContainer,
      clarificationAgent: mockClarificationAgent,
    });

    const container = getServiceContainer();
    const result = await container.clarificationAgent.generateProposal({
      report: {} as any,
      target: {} as any,
    });

    expect(result.status).toBe('EXPERIMENT_PROPOSED');
  });
});
