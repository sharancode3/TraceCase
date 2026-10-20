import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { CaptureRegistrar } from '@/server/evidence/capture-registrar';
import { EvidencePipeline } from '@/server/evidence/evidence-pipeline';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase7TestDbMock } from './test-db-mock';
import { ServiceUnavailableError, type EvidenceStoragePort } from '@/server/services/ports';

describe('P1-07: Evidence Capture Registration & Resilient Pipeline Processing', () => {
  let mockDb: Phase7TestDbMock;
  let registrar: CaptureRegistrar;
  let pipeline: EvidencePipeline;

  const invId = '00000000-1111-4111-8111-000000000001';
  let tempFilePath: string;

  beforeEach(async () => {
    mockDb = new Phase7TestDbMock();
    setDbInstanceForTesting(mockDb as any);
    registrar = new CaptureRegistrar(() => mockDb as any);
    pipeline = new EvidencePipeline(() => mockDb as any);

    // Seed investigation with a locked verdict
    mockDb.investigations.push({
      id: invId,
      ownerId: 'user-1',
      reportId: 'rep-1',
      targetId: 'target-1',
      lifecycleStatus: 'FINALIZING_EVIDENCE',
      reproductionVerdict: 'CONFIRMED_REPRODUCED',
      evidenceReadiness: 'PENDING_GENERATION',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create a real temp file to verify hash and size inspection
    const tempDir = path.join(process.cwd(), '.tmp', 'test-evidence');
    await fs.mkdir(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, `sample-trace-${Date.now()}.json`);
    await fs.writeFile(tempFilePath, JSON.stringify({ entries: [{ log: 'Button clicked' }] }), 'utf-8');
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  it('registers raw local captures into RESTRICTED_RAW tier with factual checksum and size', async () => {
    const ref = await registrar.registerLocalCapture({
      investigationId: invId,
      attemptNumber: 1,
      kind: 'CONSOLE_LOG',
      localTempPath: tempFilePath,
      mimeType: 'application/json',
      capturedAt: new Date().toISOString(),
    });

    expect(ref.captureId).toBeDefined();
    expect(ref.investigationId).toBe(invId);
    expect(ref.sizeBytes).toBeGreaterThan(0);
    expect(ref.sha256Checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify DB record
    const artifacts = await registrar.getInvestigationArtifacts(invId);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].storageTier).toBe('RESTRICTED_RAW');
    expect(artifacts[0].isEligibleForSharing).toBe(false);
  });

  it('promotes sanitized artifacts to PUBLIC_SAFE and marks evidence READY when storage port succeeds', async () => {
    const ref = await registrar.registerLocalCapture({
      investigationId: invId,
      attemptNumber: 1,
      kind: 'VIDEO_RECORDING',
      localTempPath: tempFilePath,
      mimeType: 'video/webm',
      capturedAt: new Date().toISOString(),
    });

    const mockStoragePort: EvidenceStoragePort = {
      registerCapture: async () => ref,
      processArtifacts: async (params) => [
        {
          artifactId: ref.captureId,
          investigationId: params.investigationId,
          kind: 'VIDEO_RECORDING',
          originalTier: 'RESTRICTED_RAW',
          publishedTier: 'PUBLIC_SAFE',
          redactionApplied: true,
          isEligibleForSharing: true,
        },
      ],
      createAccessGrant: async () => ({} as any),
    };

    const outcome = await pipeline.processInvestigationEvidence({
      investigationId: invId,
      storagePort: mockStoragePort,
    });

    expect(outcome.readiness).toBe('PUBLIC_SAFE_READY');
    expect(outcome.processedCount).toBe(1);

    // Verify DB artifact tier update
    const artifacts = await registrar.getInvestigationArtifacts(invId);
    expect(artifacts[0].storageTier).toBe('PUBLIC_SAFE');
    expect(artifacts[0].isEligibleForSharing).toBe(true);

    // Verify investigation evidenceReadiness and locked reproductionVerdict
    const inv = mockDb.investigations[0];
    expect(inv.evidenceReadiness).toBe('PUBLIC_SAFE_READY');
    expect(inv.reproductionVerdict).toBe('CONFIRMED_REPRODUCED'); // Invariant TC-INV-007
  });

  it('preserves reproduction verdict when storage port is unavailable (falls back to PACKAGING_IN_PROGRESS)', async () => {
    await registrar.registerLocalCapture({
      investigationId: invId,
      attemptNumber: 1,
      kind: 'NETWORK_TRACE',
      localTempPath: tempFilePath,
      mimeType: 'application/json',
      capturedAt: new Date().toISOString(),
    });

    const unavailableStoragePort: EvidenceStoragePort = {
      registerCapture: async () => {
        throw new ServiceUnavailableError('EvidenceStoragePort', 'Person 3 integration not yet active.');
      },
      processArtifacts: async () => {
        throw new ServiceUnavailableError('EvidenceStoragePort', 'Person 3 integration not yet active.');
      },
      createAccessGrant: async () => {
        throw new ServiceUnavailableError('EvidenceStoragePort', 'Person 3 integration not yet active.');
      },
    };

    const outcome = await pipeline.processInvestigationEvidence({
      investigationId: invId,
      storagePort: unavailableStoragePort,
    });

    expect(outcome.readiness).toBe('PACKAGING_IN_PROGRESS');

    // CRITICAL TC-INV-007 check: Reproduction verdict is NOT altered or corrupted by storage downtime
    const inv = mockDb.investigations[0];
    expect(inv.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
    expect(inv.evidenceReadiness).toBe('PACKAGING_IN_PROGRESS');
  });

  it('preserves reproduction verdict when artifact packaging fails (sets evidenceReadiness to STORAGE_SYNC_FAILED)', async () => {
    await registrar.registerLocalCapture({
      investigationId: invId,
      attemptNumber: 1,
      kind: 'VIDEO_RECORDING',
      localTempPath: tempFilePath,
      mimeType: 'video/webm',
      capturedAt: new Date().toISOString(),
    });

    const failingStoragePort: EvidenceStoragePort = {
      registerCapture: async () => ({} as any),
      processArtifacts: async () => {
        throw new Error('Video compression codec failure: corrupt frame encountered.');
      },
      createAccessGrant: async () => ({} as any),
    };

    const outcome = await pipeline.processInvestigationEvidence({
      investigationId: invId,
      storagePort: failingStoragePort,
    });

    expect(outcome.readiness).toBe('STORAGE_SYNC_FAILED');
    expect(outcome.errors?.[0]).toContain('corrupt frame');

    // CRITICAL: Defect verification finding remains valid regardless of evidence processing failure
    const inv = mockDb.investigations[0];
    expect(inv.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
    expect(inv.evidenceReadiness).toBe('STORAGE_SYNC_FAILED');
  });
});
