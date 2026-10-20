import { describe, it, expect } from 'vitest';
import {
  LiveProgressEventSchema,
  EventStreamWatermarkSchema,
} from '@/contracts/events';
import {
  AttemptExecutionReceiptSchema,
  ReproductionAssessmentSchema,
} from '@/contracts/observations';
import {
  CaptureCoverageReceiptSchema,
  ArtifactAccessGrantSchema,
} from '@/contracts/evidence';
import {
  unavailableReportClarificationAgent,
  unavailableBrowserInvestigationAgent,
  unavailableEvidenceReviewAgent,
  unavailableBrowserWorker,
  unavailableTargetReset,
  unavailableEvidenceStorage,
  unavailableQueueDispatcher,
  ServiceUnavailableError,
} from '@/server/services/ports';

describe('P1-01: Discriminated Events, Coverage Receipts, and Unavailable Service Ports', () => {
  it('validates strictly discriminated live progress events and rejects invalid payloads', () => {
    const validStatusEvent = {
      eventId: '11111111-1111-4111-8111-111111111111',
      schemaVersion: 1,
      investigationId: '22222222-2222-4222-8222-222222222222',
      sequenceIndex: 3,
      eventType: 'STATUS_CHANGED',
      timestamp: '2026-10-20T12:00:00.000Z',
      payload: {
        previousStatus: 'PLANNING',
        newStatus: 'AWAITING_APPROVAL',
        reason: 'Operator review requested',
      },
    };

    expect(LiveProgressEventSchema.safeParse(validStatusEvent).success).toBe(true);

    // Event with invalid lifecycle status string
    const invalidStatusEvent = {
      ...validStatusEvent,
      payload: {
        previousStatus: 'UNKNOWN_STATUS_STRING', // Invalid
        newStatus: 'AWAITING_APPROVAL',
      },
    };
    expect(LiveProgressEventSchema.safeParse(invalidStatusEvent).success).toBe(false);

    // Event with wrong payload type for eventType
    const mismatchedPayloadEvent = {
      ...validStatusEvent,
      eventType: 'STEP_STARTED',
      payload: {
        previousStatus: 'PLANNING', // Wrong payload for STEP_STARTED
        newStatus: 'AWAITING_APPROVAL',
      },
    };
    expect(LiveProgressEventSchema.safeParse(mismatchedPayloadEvent).success).toBe(false);
  });

  it('validates event stream watermark for gap detection', () => {
    const watermark = {
      investigationId: '22222222-2222-4222-8222-222222222222',
      lastDeliveredSequenceIndex: 5,
      snapshotTimestamp: '2026-10-20T12:05:00.000Z',
      expectedNextSequenceIndex: 6,
    };

    expect(EventStreamWatermarkSchema.safeParse(watermark).success).toBe(true);
  });

  it('separates browser attempt facts from trusted reproduction assessment', () => {
    // 1. Browser attempt receipt: execution facts only (no verdict)
    const attemptReceipt = {
      investigationId: '22222222-2222-4222-8222-222222222222',
      attemptNumber: 1,
      actionsExecuted: [
        {
          stepIndex: 0,
          action: {
            stepIndex: 0,
            semanticAction: 'Click delete',
            toolKind: 'click_button',
            tier: 'TIER_3_MUTATING_INTERACTION',
            timeoutMs: 5000,
          },
          tier: 'TIER_3_MUTATING_INTERACTION',
          status: 'SUCCESS',
          durationMs: 420,
          uncertainty: 'MUTATION_CONFIRMED',
          dispatchedAt: '2026-10-20T12:00:00.000Z',
          completedAt: '2026-10-20T12:00:01.000Z',
        },
      ],
      captureCoverage: {
        investigationId: '22222222-2222-4222-8222-222222222222',
        attemptNumber: 1,
        hasVideoRecording: true,
        videoStatus: 'FINALIZED',
        hasConsoleLogs: true,
        consoleStatus: 'CAPTURED_EMPTY', // Empty console logs is distinct from capture failure
        hasNetworkTrace: true,
        networkStatus: 'CAPTURED_WITH_REQUESTS',
        coverageComplete: true,
      },
      totalDurationMs: 1420,
      completedCleanly: true,
      startedAt: '2026-10-20T12:00:00.000Z',
      finishedAt: '2026-10-20T12:00:02.000Z',
    };

    expect(AttemptExecutionReceiptSchema.safeParse(attemptReceipt).success).toBe(true);
    // Notice: attemptReceipt does NOT contain 'defectDetected' or 'reproductionVerdict'

    // 2. Authoritative reproduction assessment: evaluated by trusted verification code
    const verdictAssessment = {
      investigationId: '22222222-2222-4222-8222-222222222222',
      verdict: 'CONFIRMED_REPRODUCED',
      validAttemptCount: 2,
      matchingAttemptCount: 2,
      summary: 'Two consecutive runs reproduced the array index deletion defect with verified baseline restoration.',
      assessedAt: '2026-10-20T12:10:00.000Z',
    };

    expect(ReproductionAssessmentSchema.safeParse(verdictAssessment).success).toBe(true);
  });

  it('distinguishes successfully captured empty logs from capture failures', () => {
    const emptyConsoleCoverage = {
      investigationId: '22222222-2222-4222-8222-222222222222',
      attemptNumber: 1,
      hasVideoRecording: true,
      videoStatus: 'FINALIZED',
      hasConsoleLogs: true,
      consoleStatus: 'CAPTURED_EMPTY',
      hasNetworkTrace: true,
      networkStatus: 'CAPTURED_WITH_REQUESTS',
      coverageComplete: true,
    };
    expect(CaptureCoverageReceiptSchema.safeParse(emptyConsoleCoverage).success).toBe(true);

    const failedCaptureCoverage = {
      ...emptyConsoleCoverage,
      hasConsoleLogs: false,
      consoleStatus: 'CAPTURE_FAILED',
      coverageComplete: false,
    };
    expect(CaptureCoverageReceiptSchema.safeParse(failedCaptureCoverage).success).toBe(true);
    expect(failedCaptureCoverage.consoleStatus).toBe('CAPTURE_FAILED');
  });

  it('validates time-limited artifact access grants', () => {
    const grant = {
      grantId: '33333333-3333-4333-8333-333333333333',
      artifactId: '44444444-4444-4444-8444-444444444444',
      authorizedUserId: 'user-bob',
      storageTier: 'PUBLIC_SAFE',
      downloadUrl: 'https://s3.local/tracecase-public-safe/video.webm?X-Amz-Signature=test',
      expiresAt: '2026-10-20T13:00:00.000Z',
    };

    expect(ArtifactAccessGrantSchema.safeParse(grant).success).toBe(true);
  });

  it('fails closed with typed ServiceUnavailableError across all deferred ports', async () => {
    await expect(
      unavailableReportClarificationAgent.generateProposal({} as any)
    ).rejects.toThrow(ServiceUnavailableError);

    await expect(
      unavailableBrowserInvestigationAgent.proposeNextAction({} as any)
    ).rejects.toThrow(ServiceUnavailableError);

    await expect(
      unavailableEvidenceReviewAgent.synthesizeExplanation({} as any)
    ).rejects.toThrow(ServiceUnavailableError);

    await expect(
      unavailableBrowserWorker.executeAttempt({} as any)
    ).rejects.toThrow(ServiceUnavailableError);

    await expect(
      unavailableTargetReset.triggerFixtureReset({} as any)
    ).rejects.toThrow(ServiceUnavailableError);

    await expect(
      unavailableEvidenceStorage.registerCapture({} as any)
    ).rejects.toThrow(ServiceUnavailableError);

    await expect(
      unavailableQueueDispatcher.enqueueInvestigation({} as any)
    ).rejects.toThrow(ServiceUnavailableError);
  });
});
