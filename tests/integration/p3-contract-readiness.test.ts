import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  projectSafeTargetProfile,
  projectSafeModelTargetContext,
  SafeTargetProfileSchema,
  SafeModelTargetContextSchema,
} from '@/contracts/targets';
import {
  DraftReportIntakeSchema,
} from '@/contracts/reports';
import {
  AnswerClarificationCommandSchema,
  BatchAnswerClarificationsCommandSchema,
} from '@/contracts/clarification';
import {
  ApprovePlanCommandSchema,
} from '@/contracts/planning';
import {
  InvestigationSnapshotSchema,
} from '@/contracts/investigations';
import {
  InvestigationProgressEventSchema,
} from '@/contracts/events';
import {
  FinalizedCaptureReferenceSchema,
  ArtifactAccessGrantSchema,
} from '@/contracts/evidence';
import {
  createSafeSuccessEnvelope,
  createSafeError,
  SafeErrorEnvelopeSchema,
  SafeSuccessEnvelopeSchema,
} from '@/contracts/errors';

/**
 * ============================================================================
 * PERSON 3 CONTRACT READINESS SUITE
 * ============================================================================
 *
 * Verifies that all backend data projections, API command schemas, response
 * envelopes, event streams, and evidence artifact references strictly conform
 * to the shared contract specifications established for Person 3's frontend.
 */
describe('Person 3 Frontend & Evidence Viewer Contract Readiness', () => {
  describe('Safe Target & Model Context Projections', () => {
    it('projects safe target profiles without exposing reset secrets or credentials', () => {
      const rawTarget = {
        id: randomUUID(),
        name: 'Staging Demo Target',
        baseUrl: 'https://staging.app.local',
        allowedOrigins: ['https://staging.app.local'],
        isSandbox: true,
        isSandboxVerified: true,
        environment: 'staging',
        fixtureResetEndpoint: 'https://staging.app.local/api/test/reset-fixture',
        fixtureResetAuthSecretRef: 'super-secret-reset-token-2026',
        testAccountRef: 'user_admin_01',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const safeProfile = projectSafeTargetProfile(rawTarget);
      const parsed = SafeTargetProfileSchema.parse(safeProfile);

      expect(parsed.id).toBe(rawTarget.id);
      expect(parsed.baseUrl).toBe(rawTarget.baseUrl);
      expect(parsed.hasResetCapability).toBe(true);
      expect(parsed.hasTestAccountConfigured).toBe(true);

      // Verify internal security fields are NEVER present in projected output
      expect((safeProfile as any).fixtureResetAuthSecretRef).toBeUndefined();
      expect((safeProfile as any).fixtureResetEndpoint).toBeUndefined();
      expect((safeProfile as any).testAccountRef).toBeUndefined();
    });

    it('projects model target context with truth-telling hasResetCapability and no secrets', () => {
      const rawTarget = {
        id: randomUUID(),
        name: 'Staging Target',
        baseUrl: 'https://staging.app.local',
        allowedOrigins: ['https://staging.app.local'],
        isSandbox: true,
        isSandboxVerified: true,
        environment: 'staging',
        fixtureResetEndpoint: 'https://staging.app.local/api/test/reset-fixture',
        fixtureResetAuthSecretRef: 'secret',
      };

      const modelContext = projectSafeModelTargetContext(rawTarget);
      const parsed = SafeModelTargetContextSchema.parse(modelContext);

      expect(parsed.targetId).toBe(rawTarget.id);
      expect(parsed.hasResetCapability).toBe(true);
      expect((modelContext as any).fixtureResetAuthSecretRef).toBeUndefined();
    });
  });

  describe('API Command Envelopes (User Inputs)', () => {
    it('validates DraftReportIntakeSchema commands with required fields', () => {
      const validCommand = {
        targetId: randomUUID(),
        title: 'Task deletion index mismatch under Active filter',
        rawDescription: 'Deleting an active task removes the first completed item instead.',
        browserEnvironment: 'Chrome 131 / Windows 11',
      };

      const parsed = DraftReportIntakeSchema.parse(validCommand);
      expect(parsed.title).toBe(validCommand.title);
      expect(parsed.rawDescription).toBe(validCommand.rawDescription);
    });

    it('validates single and batch clarification answer commands', () => {
      const qId = randomUUID();
      const singleAnswer = {
        questionId: qId,
        answerText: 'Active view filter was selected.',
        expectedWorkflowRevision: 2,
      };

      const parsedSingle = AnswerClarificationCommandSchema.parse(singleAnswer);
      expect(parsedSingle.questionId).toBe(qId);
      expect(parsedSingle.answerText).toBe(singleAnswer.answerText);

      const batchAnswers = {
        answers: [
          { questionId: qId, answerText: 'Active' },
          { questionId: randomUUID(), answerText: 'Task B' },
        ],
        expectedWorkflowRevision: 2,
      };

      const parsedBatch = BatchAnswerClarificationsCommandSchema.parse(batchAnswers);
      expect(parsedBatch.answers).toHaveLength(2);
    });

    it('validates human plan approval commands with strict hash binding', () => {
      const validApproval = {
        investigationId: randomUUID(),
        planVersion: 1,
        approvedPlanHash: '25a69e82dd674f474f365ca3d04a9aea5983045c4336cc5c173f0d32280bfc54',
        operatorNotes: 'Verified safe to execute on staging environment.',
        expectedWorkflowRevision: 3,
      };

      const parsed = ApprovePlanCommandSchema.parse(validApproval);
      expect(parsed.planVersion).toBe(1);
      expect(parsed.approvedPlanHash).toBe(validApproval.approvedPlanHash);
    });
  });

  describe('Standard Response Envelopes & Error Handling', () => {
    it('wraps successful payloads in standard SafeSuccessEnvelope', () => {
      const payload = {
        investigationId: randomUUID(),
        status: 'EXPERIMENT_PROPOSED',
      };

      const envelope = createSafeSuccessEnvelope(payload);
      const parsed = SafeSuccessEnvelopeSchema.parse(envelope);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(payload);
      expect(typeof parsed.requestId).toBe('string');
      expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
    });

    it('wraps errors in standard SafeErrorEnvelope without leaking raw internal stacks', () => {
      const safeError = createSafeError(
        'CONFLICT_STALE_VERSION',
        'PLAN_HASH_MISMATCH',
        'The reviewed plan hash differs from current stored revision.',
        { expectedRevision: 2, actualRevision: 3 }
      );

      const parsed = SafeErrorEnvelopeSchema.parse(safeError);

      expect(parsed.success).toBe(false);
      expect(parsed.error.category).toBe('CONFLICT_STALE_VERSION');
      expect(parsed.error.code).toBe('PLAN_HASH_MISMATCH');
      expect(parsed.error.message).toContain('differs from current stored revision');
      expect(parsed.error.details).toEqual({ expectedRevision: 2, actualRevision: 3 });
      expect((parsed as any).stack).toBeUndefined();
    });
  });

  describe('Investigation Snapshots & Progress Stream Items', () => {
    it('validates full InvestigationSnapshotSchema state representations', () => {
      const snapshot = {
        id: randomUUID(),
        reportId: randomUUID(),
        targetId: randomUUID(),
        targetName: 'Controlled Demo Target',
        targetUrl: 'https://staging.demo.local',
        isSandbox: true,
        title: 'Task deletion bug',
        lifecycleStatus: 'COMPLETED' as const,
        reproductionVerdict: 'CONFIRMED_REPRODUCED' as const,
        evidenceReadiness: 'PUBLIC_SAFE_READY' as const,
        workflowRevision: 5,
        reviewStatus: 'APPROVED' as const,
        eventWatermark: 8,
        activeAttemptNumber: null,
        attempt1: {
          attemptNumber: 1 as const,
          validity: 'VALID_DEFECT_DETECTED' as const,
          defectDetected: true,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 450,
          actionsExecuted: 4,
          lastObservedStep: 3,
          mutationState: 'NONE' as const,
          failureMessage: null,
        },
        attempt2: {
          attemptNumber: 2 as const,
          validity: 'VALID_DEFECT_DETECTED' as const,
          defectDetected: true,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 430,
          actionsExecuted: 4,
          lastObservedStep: 3,
          mutationState: 'NONE' as const,
          failureMessage: null,
        },
        planVersion: 1,
        planHash: '25a69e82dd674f474f365ca3d04a9aea5983045c4336cc5c173f0d32280bfc54',
        isApproved: true,
        approvedBy: 'usr-admin',
        approvedAt: new Date().toISOString(),
        tokenCostUsd: 0.015,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const parsed = InvestigationSnapshotSchema.parse(snapshot);
      expect(parsed.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
      expect(parsed.attempt1?.validity).toBe('VALID_DEFECT_DETECTED');
      expect(parsed.attempt2?.validity).toBe('VALID_DEFECT_DETECTED');
    });

    it('validates InvestigationProgressEventSchema for UI stream consumption', () => {
      const event = {
        eventId: randomUUID(),
        investigationId: randomUUID(),
        sequenceIndex: 3,
        eventType: 'ATTEMPT_STARTED' as const,
        timestamp: new Date().toISOString(),
        payload: {
          attemptNumber: 1,
        },
      };

      const parsed = InvestigationProgressEventSchema.parse(event);
      expect(parsed.sequenceIndex).toBe(3);
      expect(parsed.eventType).toBe('ATTEMPT_STARTED');
    });
  });

  describe('Evidence Triad & Artifact Access Grants', () => {
    it('validates FinalizedCaptureReferenceSchema with integrity hashes', () => {
      const captureRef = {
        captureId: randomUUID(),
        investigationId: randomUUID(),
        attemptNumber: 1 as const,
        kind: 'VIDEO_RECORDING' as const,
        storageRef: 's3://tracecase-evidence/attempt-1/video.webm',
        sizeBytes: 2048576,
        sha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        capturedAt: new Date().toISOString(),
      };

      const parsed = FinalizedCaptureReferenceSchema.parse(captureRef);
      expect(parsed.kind).toBe('VIDEO_RECORDING');
      expect(parsed.sha256Checksum).toHaveLength(64);
    });

    it('validates ArtifactAccessGrantSchema for authenticated viewers', () => {
      const grant = {
        grantId: randomUUID(),
        artifactId: randomUUID(),
        authorizedUserId: 'usr-analyst-42',
        storageTier: 'PUBLIC_SAFE' as const,
        downloadUrl: 'https://cdn.tracecase.local/signed/attempt-1/video.webm?signature=abcdef',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      const parsed = ArtifactAccessGrantSchema.parse(grant);
      expect(parsed.downloadUrl).toContain('https://cdn.tracecase.local');
      expect(new Date(parsed.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });
});
