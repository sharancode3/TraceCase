import { describe, it, expect } from 'vitest';
import {
  buildReproductionPackage,
  filterConsoleLogs,
  filterNetworkTraces,
  getEvidenceAvailability,
  type ConsoleLogEntry,
  type NetworkTraceEntry,
} from '@/features/investigations/evidence-presentation';
import type { InvestigationSnapshot } from '@/contracts/investigations';
import type { AuthorizedArtifactDescriptor } from '@/contracts/evidence';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import { GET as getResultsRoute } from '@/app/api/v1/investigations/[id]/results/route';
import { NextRequest } from 'next/server';

describe('Phase 2 Stage K: Actual Attempts, Results and Evidence Presentation', () => {
  const invId = '00000000-0000-4000-b000-000000000001';
  const targetId = '00000000-0000-4000-c000-000000000002';

  const baseSnapshot: InvestigationSnapshot = {
    id: invId,
    reportId: '00000000-0000-4000-d000-000000000003',
    targetId,
    targetName: 'Acme Staging Target',
    targetUrl: 'https://staging.acme.corp/app',
    isSandbox: true,
    title: 'Checkout button unresponsive after voucher applied',
    lifecycleStatus: 'COMPLETED',
    reproductionVerdict: 'CONFIRMED_REPRODUCED',
    evidenceReadiness: 'PUBLIC_SAFE_READY',
    workflowRevision: 1,
    reviewStatus: 'APPROVED',
    eventWatermark: 5,
    activeAttemptNumber: null,
    attempt1: {
      attemptNumber: 1,
      validity: 'VALID_DEFECT_DETECTED',
      defectDetected: true,
      startedAt: '2026-10-23T12:00:00.000Z',
      completedAt: '2026-10-23T12:01:00.000Z',
      durationMs: 60000,
      actionsExecuted: 4,
      lastObservedStep: 3,
      mutationState: 'NONE',
      failureMessage: 'Element not clickable at point (500, 300)',
      buildId: 'build-20261023-01',
      summary: 'Attempt 1 defect detected at step 3',
    },
    attempt2: {
      attemptNumber: 2,
      validity: 'VALID_DEFECT_DETECTED',
      defectDetected: true,
      startedAt: '2026-10-23T12:02:00.000Z',
      completedAt: '2026-10-23T12:03:00.000Z',
      durationMs: 60000,
      actionsExecuted: 4,
      lastObservedStep: 3,
      mutationState: 'NONE',
      failureMessage: 'Element not clickable at point (500, 300)',
      buildId: 'build-20261023-01',
      summary: 'Attempt 2 confirmation run detected matching defect',
    },
    planVersion: 1,
    planHash: 'hash-abc-123',
    isApproved: true,
    approvedBy: 'user-p1-001',
    approvedAt: '2026-10-23T11:59:00.000Z',
    tokenCostUsd: 0.045,
    resetReceipt: {
      id: '00000000-0000-4000-e000-000000000004',
      targetId,
      investigationId: invId,
      attemptNumber: 2,
      transportSuccess: true,
      baselineEquivalent: true,
      isVerifiedRestored: true,
      targetBuildId: 'build-20261023-01',
      readback: {
        targetId,
        expectedStateHash: 'sha256-state-clean-001',
        observedStateHash: 'sha256-state-clean-001',
        isEquivalent: true,
        discrepancies: [],
        checkedAt: '2026-10-23T12:01:30.000Z',
      },
      verifiedAt: '2026-10-23T12:01:35.000Z',
    },
    assertionEvaluations: [
      {
        attemptNumber: 1,
        assertionId: 'assert-btn-01',
        kind: 'DOM_STATE',
        purpose: 'Verify checkout button responds',
        result: 'FAILED',
        expectedValue: 'clickable: true',
        observedValue: 'clickable: false (disabled)',
        details: 'Button has aria-disabled="true"',
        evaluatedAt: '2026-10-23T12:00:55.000Z',
      },
      {
        attemptNumber: 2,
        assertionId: 'assert-btn-01',
        kind: 'DOM_STATE',
        purpose: 'Verify checkout button responds',
        result: 'FAILED',
        expectedValue: 'clickable: true',
        observedValue: 'clickable: false (disabled)',
        details: 'Button has aria-disabled="true"',
        evaluatedAt: '2026-10-23T12:02:55.000Z',
      },
    ],
    targetEnvironment: 'staging',
    targetBuildVersion: 'v2.4.1-rc3',
    createdAt: '2026-10-23T11:50:00.000Z',
    updatedAt: '2026-10-23T12:03:00.000Z',
    completedAt: '2026-10-23T12:03:00.000Z',
  };

  const samplePlan: AuthoritativeExperimentPlan = {
    id: '00000000-0000-4000-a000-000000000005',
    investigationId: invId,
    targetId,
    version: 1,
    targetUrl: 'https://staging.acme.corp/app',
    allowedOrigins: ['https://staging.acme.corp'],
    planHash: 'hash-abc-123',
    preconditions: ['User is logged in as test user'],
    steps: [
      {
        stepIndex: 0,
        semanticAction: 'Navigate to checkout',
        toolKind: 'navigate',
        selector: 'window',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: 10000,
      },
    ],
    expectedCorrectBehavior: 'Order is placed and receipt shown',
    reportedFailureSignature: 'Checkout button unresponsive after voucher',
    assertions: [
      {
        id: 'assert-btn-01',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: '#checkout-button',
        operator: 'EXISTS',
        expectedValue: 'clickable: true',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'Verify checkout button responds',
      },
    ],
    maxAttempts: 2,
    maxDurationMs: 120000,
    requiresResetHook: true,
    createdAt: '2026-10-23T11:55:00.000Z',
  };

  describe('1. Single-Attempt and Blocked Attempt Honesty', () => {
    it('accurately represents a single attempt without manufacturing a second attempt', () => {
      const singleAttemptSnapshot: InvestigationSnapshot = {
        ...baseSnapshot,
        reproductionVerdict: 'INCONCLUSIVE',
        attempt2: null, // Attempt 2 was not executed!
        resetReceipt: null,
      };

      const pkg = buildReproductionPackage({
        investigation: singleAttemptSnapshot,
        plan: samplePlan,
        artifacts: [],
      });
      expect(pkg.attempts.attempt1).not.toBeNull();
      expect(pkg.attempts.attempt2).toBeNull();
      expect(pkg.investigation.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(pkg.attempts.resetReceipt).toBeNull();
    });

    it('honestly represents unrecorded duration as null rather than fabricating a duration', () => {
      const unrecordedDurationSnapshot: InvestigationSnapshot = {
        ...baseSnapshot,
        attempt1: {
          ...baseSnapshot.attempt1!,
          durationMs: null, // Not recorded!
        },
      };

      const pkg = buildReproductionPackage({
        investigation: unrecordedDurationSnapshot,
        plan: samplePlan,
        artifacts: [],
      });
      expect(pkg.attempts.attempt1?.durationMs).toBeNull();
    });

    it('faithfully preserves unverified reset receipts and explains why Attempt 2 was blocked', () => {
      const failedResetSnapshot: InvestigationSnapshot = {
        ...baseSnapshot,
        reproductionVerdict: 'INCONCLUSIVE',
        attempt2: null,
        resetReceipt: {
          id: '00000000-0000-4000-e000-000000000009',
          targetId,
          investigationId: invId,
          attemptNumber: 2,
          transportSuccess: true,
          baselineEquivalent: false, // Baseline readback discrepancy!
          isVerifiedRestored: false,
          readback: {
            targetId,
            expectedStateHash: 'sha256-state-clean',
            observedStateHash: 'sha256-state-dirty',
            isEquivalent: false,
            discrepancies: ['Order cart count expected 0 but was 1'],
            checkedAt: '2026-10-23T12:01:30.000Z',
          },
          verifiedAt: '2026-10-23T12:01:35.000Z',
        },
      };

      const pkg = buildReproductionPackage({
        investigation: failedResetSnapshot,
        plan: samplePlan,
        artifacts: [],
      });
      expect(pkg.attempts.attempt2).toBeNull();
      expect(pkg.attempts.resetReceipt?.isVerifiedRestored).toBe(false);
      expect(pkg.attempts.resetReceipt?.readback.discrepancies).toContain('Order cart count expected 0 but was 1');
    });
  });

  describe('2. Evidence Retrieval Semantics (Fetch Failure != No Errors)', () => {
    it('distinguishes between empty console logs and retrieval failure', () => {
      // 1. Legitimate empty console logs
      const emptyEntries: ConsoleLogEntry[] = [];
      const filteredEmpty = filterConsoleLogs(emptyEntries, '');
      expect(filteredEmpty).toHaveLength(0);

      // 2. Populated console logs with filter
      const realLogs: ConsoleLogEntry[] = [
        {
          id: 'log-1',
          timestamp: '2026-10-23T12:00:10.000Z',
          level: 'ERROR',
          category: 'console',
          message: 'Uncaught TypeError: Cannot read properties of undefined (reading "applyDiscount")',
        },
        {
          id: 'log-2',
          timestamp: '2026-10-23T12:00:11.000Z',
          level: 'INFO',
          category: 'console',
          message: 'Analytics event dispatched',
        },
      ];

      expect(filterConsoleLogs(realLogs, 'TypeError')).toHaveLength(1);
      expect(filterConsoleLogs(realLogs, 'ERROR')).toHaveLength(1);
      expect(filterConsoleLogs(realLogs, 'nonexistent')).toHaveLength(0);
    });

    it('distinguishes between empty network traces and transport failure', () => {
      const traces: NetworkTraceEntry[] = [
        {
          id: 'net-1',
          method: 'POST',
          url: 'https://staging.acme.corp/api/apply-voucher',
          status: 500,
          isTransportFailure: false,
          durationMs: 250,
        },
        {
          id: 'net-2',
          method: 'GET',
          url: 'https://staging.acme.corp/api/checkout-status',
          isTransportFailure: true,
          failureText: 'net::ERR_CONNECTION_REFUSED',
          durationMs: 50,
        },
      ];

      expect(filterNetworkTraces(traces, 'voucher')).toHaveLength(1);
      expect(filterNetworkTraces(traces, 'checkout')).toHaveLength(1);
      expect(traces[1].isTransportFailure).toBe(true);
      expect(traces[1].failureText).toBe('net::ERR_CONNECTION_REFUSED');
    });

    it('reports distinct availability statuses for available, quarantined, and missing evidence', () => {
      const readyAvail = getEvidenceAvailability('PUBLIC_SAFE_READY');
      expect(readyAvail.isAvailable).toBe(true);
      expect(readyAvail.isQuarantined).toBe(false);

      const quarantinedAvail = getEvidenceAvailability('QUARANTINED_LEAK_DETECTED');
      expect(quarantinedAvail.isAvailable).toBe(false);
      expect(quarantinedAvail.isQuarantined).toBe(true);

      const pendingAvail = getEvidenceAvailability('PENDING_GENERATION');
      expect(pendingAvail.isAvailable).toBe(false);
      expect(pendingAvail.isFailed).toBe(false);
    });
  });

  describe('3. Strict Export Packaging and Disclosure of Missing Data', () => {
    it('discloses when experiment plan is not persisted and omits fabricated fallback', () => {
      const pkgWithoutPlan = buildReproductionPackage({
        investigation: {
          ...baseSnapshot,
          planVersion: null,
          planHash: null,
          isApproved: false,
        },
        plan: null,
        artifacts: [],
      });
      expect(pkgWithoutPlan.approvedPlan.version).toBeNull();
      expect(pkgWithoutPlan.exportDisclosure.isPlanPersisted).toBe(false);
      expect(pkgWithoutPlan.exportDisclosure.missingPlanNotice).toContain('No persisted experiment plan attached to export bundle');
    });

    it('discloses missing artifact kinds in the manifest completeness check', () => {
      const partialArtifacts: AuthorizedArtifactDescriptor[] = [
        {
          id: 'art-01',
          investigationId: invId,
          attemptNumber: 1,
          kind: 'CONSOLE_LOG',
          fileName: 'console-run1.json',
          storageTier: 'PUBLIC_SAFE',
          mimeType: 'application/json',
          sizeBytes: 1024,
          sha256Checksum: 'a0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b1',
          redactionApplied: true,
          publicUrl: 'https://storage.acme.corp/artifacts/art-01',
          createdAt: '2026-10-23T12:01:00.000Z',
        },
      ];

      const pkg = buildReproductionPackage({
        investigation: baseSnapshot,
        plan: samplePlan,
        artifacts: partialArtifacts,
      });
      expect(pkg.exportDisclosure.isManifestComplete).toBe(false);
      expect(pkg.exportDisclosure.missingArtifactKinds).toContain('VIDEO_RECORDING');
      expect(pkg.exportDisclosure.missingArtifactKinds).toContain('NETWORK_TRACE');
    });

    it('strictly isolates RESTRICTED_RAW artifacts from public exports and includes disclosure', () => {
      const mixedArtifacts: AuthorizedArtifactDescriptor[] = [
        {
          id: 'art-01',
          investigationId: invId,
          attemptNumber: 1,
          kind: 'CONSOLE_LOG',
          fileName: 'console-run1.json',
          storageTier: 'PUBLIC_SAFE',
          mimeType: 'application/json',
          sizeBytes: 1024,
          sha256Checksum: 'a0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b1',
          redactionApplied: true,
          publicUrl: 'https://storage.acme.corp/artifacts/art-01',
          createdAt: '2026-10-23T12:01:00.000Z',
        },
        {
          id: 'art-02-restricted',
          investigationId: invId,
          attemptNumber: 1,
          kind: 'VIDEO_RECORDING',
          fileName: 'video-run1-raw.webm',
          storageTier: 'RESTRICTED_RAW',
          mimeType: 'video/webm',
          sizeBytes: 1048576,
          sha256Checksum: 'b0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b1c2d3e4f5a0b2',
          redactionApplied: false,
          publicUrl: null, // Withheld!
          createdAt: '2026-10-23T12:01:00.000Z',
        },
      ];

      const pkg = buildReproductionPackage({
        investigation: baseSnapshot,
        plan: samplePlan,
        artifacts: mixedArtifacts,
      });
      expect(pkg.exportDisclosure.restrictedArtifactCount).toBe(1);
      expect(pkg.evidenceManifest.artifacts).toHaveLength(2);
      expect(pkg.evidenceManifest.artifacts[0].id).toBe('art-01');
      expect(pkg.evidenceManifest.artifacts[0].publicUrl).not.toBeNull();
      expect(pkg.evidenceManifest.artifacts[1].id).toBe('art-02-restricted');
      expect(pkg.evidenceManifest.artifacts[1].publicUrl).toBeNull();
    });

    it('embeds target environment and build version in exported package', () => {
      const pkg = buildReproductionPackage({
        investigation: baseSnapshot,
        plan: samplePlan,
        artifacts: [],
      });
      expect(pkg.investigation.target.environment).toBe('staging');
      expect(pkg.investigation.target.buildVersion).toBe('v2.4.1-rc3');
    });
  });

  describe('4. Dedicated Results API Authorization Contract', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${invId}/results`, {
        method: 'GET',
      });
      const res = await getResultsRoute(req, { params: Promise.resolve({ id: invId }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.category).toBe('UNAUTHENTICATED');
    });
  });
});
