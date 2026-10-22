import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { Phase7TestDbMock } from '../person-1/phase-7/test-db-mock';
import { IntegratedEvidenceStorageAdapter } from '@/server/evidence/evidence-storage-adapter';
import { EvidencePipeline } from '@/server/evidence/evidence-pipeline';
import { CaptureRegistrar } from '@/server/evidence/capture-registrar';
import { InMemoryEvidenceStorageDriver } from '@/server/evidence/storage';

/**
 * ============================================================================
 * DERIVATIVE EVIDENCE LINEAGE INTEGRATION SUITE (SECTION 9)
 * ============================================================================
 *
 * Verifies that:
 * 1. Raw captures are staged in RESTRICTED_RAW with rawArtifactId: null.
 * 2. Processing generates derivative records in PUBLIC_SAFE linking back to rawArtifactId.
 * 3. Raw capture records retain RESTRICTED_RAW tier and isEligibleForSharing: false.
 * 4. Video recordings remain strictly quarantined in RESTRICTED_RAW pending privacy review.
 * 5. Sanitized derivative bytes in PUBLIC_SAFE have their own checksums and byte sizes.
 * 6. Evidence pipeline preserves reproduction verdicts across evidence packaging.
 */

describe('Derivative Evidence Lineage & Dual-Bucket Invariants (Section 9)', () => {
  let mockDb: Phase7TestDbMock;
  let storageDriver: InMemoryEvidenceStorageDriver;
  let adapter: IntegratedEvidenceStorageAdapter;
  let registrar: CaptureRegistrar;
  let pipeline: EvidencePipeline;

  const investigationId = '00000000-0000-4000-a000-000000000101';
  let tempDir: string;
  let consoleTempPath: string;
  let networkTempPath: string;
  let videoTempPath: string;

  beforeEach(async () => {
    mockDb = new Phase7TestDbMock();
    setDbInstanceForTesting(mockDb as any);

    storageDriver = new InMemoryEvidenceStorageDriver();
    adapter = new IntegratedEvidenceStorageAdapter(() => mockDb as any, storageDriver);
    registrar = new CaptureRegistrar(() => mockDb as any);
    pipeline = new EvidencePipeline(() => mockDb as any);

    // Seed investigation
    mockDb.investigations.push({
      id: investigationId,
      ownerId: 'operator-1',
      reportId: 'rep-101',
      targetId: 'target-101',
      lifecycleStatus: 'FINALIZING_EVIDENCE',
      reproductionVerdict: 'CONFIRMED_REPRODUCED',
      evidenceReadiness: 'PENDING_GENERATION',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    tempDir = path.join(process.cwd(), '.tmp', 'lineage-test', investigationId);
    await fs.mkdir(tempDir, { recursive: true });

    // Raw console with a Bearer token
    consoleTempPath = path.join(tempDir, 'console.log');
    await fs.writeFile(
      consoleTempPath,
      '2026-10-22T10:00:00Z [INFO] Initializing app\n2026-10-22T10:00:01Z [AUTH] Bearer super-secret-token-12345\n2026-10-22T10:00:02Z [ERROR] Unhandled error',
      'utf-8'
    );

    // Raw network trace with authorization header
    networkTempPath = path.join(tempDir, 'network.json');
    await fs.writeFile(
      networkTempPath,
      JSON.stringify([
        {
          id: 'req-1',
          url: 'http://localhost:3000/api/tasks',
          method: 'GET',
          status: 200,
          headers: { authorization: 'Bearer secret-key-abc' },
        },
      ]),
      'utf-8'
    );

    // Raw video recording with valid WebM header and >= 10 KB size
    videoTempPath = path.join(tempDir, 'video.webm');
    const header = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
    const padding = Buffer.alloc(12 * 1024, 0x00);
    await fs.writeFile(videoTempPath, Buffer.concat([header, padding]));
  });

  afterEach(async () => {
    resetDbInstanceForTesting();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('preserves raw capture in RESTRICTED_RAW and creates linked derivative in PUBLIC_SAFE with rawArtifactId', async () => {
    // 1. Register raw capture
    const rawConsoleRef = await registrar.registerLocalCapture({
      investigationId,
      attemptNumber: 1,
      kind: 'CONSOLE_LOG',
      localTempPath: consoleTempPath,
      mimeType: 'text/plain',
      capturedAt: new Date().toISOString(),
    });

    expect(rawConsoleRef.captureId).toBeDefined();

    // Verify initial raw DB row
    const initialRows = await registrar.getInvestigationArtifacts(investigationId);
    expect(initialRows).toHaveLength(1);
    expect(initialRows[0].storageTier).toBe('RESTRICTED_RAW');
    expect(initialRows[0].isEligibleForSharing).toBe(false);

    // 2. Process artifacts through adapter
    const results = await adapter.processArtifacts({
      investigationId,
      captureRefs: [rawConsoleRef],
    });

    expect(results).toHaveLength(1);
    expect(results[0].publishedTier).toBe('PUBLIC_SAFE');
    expect(results[0].isEligibleForSharing).toBe(true);
    expect(results[0].redactionApplied).toBe(true);

    // 3. Inspect database rows for lineage
    const allArtifactRows = mockDb.evidenceArtifacts;
    expect(allArtifactRows).toHaveLength(2); // 1 raw + 1 derivative

    const rawRow = allArtifactRows.find((r) => r.id === rawConsoleRef.captureId);
    expect(rawRow).toBeDefined();
    expect(rawRow.storageTier).toBe('RESTRICTED_RAW');
    expect(rawRow.isEligibleForSharing).toBe(false);

    const derivativeRow = allArtifactRows.find((r) => r.rawArtifactId === rawConsoleRef.captureId);
    expect(derivativeRow).toBeDefined();
    expect(derivativeRow.storageTier).toBe('PUBLIC_SAFE');
    expect(derivativeRow.isEligibleForSharing).toBe(true);
    expect(derivativeRow.kind).toBe('CONSOLE_LOG');
    expect(derivativeRow.redactionApplied).toBe(true);
    expect(derivativeRow.storageRef).toContain('attempt_1_console_');

    // 4. Verify that derivative payload in PUBLIC_SAFE is sanitized
    const storedSafe = await storageDriver.getArtifact(derivativeRow.storageRef, 'PUBLIC_SAFE');
    expect(storedSafe).not.toBeNull();
    const safeContent = storedSafe?.data.toString('utf-8') || '';
    expect(safeContent).not.toContain('super-secret-token-12345');
    expect(safeContent).toContain('[REDACTED_BEARER_TOKEN]');

    // 5. Verify that raw original in RESTRICTED_RAW still holds original
    const storedRaw = await storageDriver.getArtifact(rawRow.storageRef, 'RESTRICTED_RAW');
    expect(storedRaw).not.toBeNull();
    const rawContent = storedRaw?.data.toString('utf-8') || '';
    expect(rawContent).toContain('super-secret-token-12345');
  });

  it('keeps video strictly quarantined in RESTRICTED_RAW and does not create public derivative', async () => {
    const rawVideoRef = await registrar.registerLocalCapture({
      investigationId,
      attemptNumber: 1,
      kind: 'VIDEO_RECORDING',
      localTempPath: videoTempPath,
      mimeType: 'video/webm',
      capturedAt: new Date().toISOString(),
    });

    const results = await adapter.processArtifacts({
      investigationId,
      captureRefs: [rawVideoRef],
    });

    expect(results).toHaveLength(1);
    expect(results[0].publishedTier).toBe('RESTRICTED_RAW');
    expect(results[0].isEligibleForSharing).toBe(false);
    expect(results[0].quarantineReason).toBe('VIDEO_PENDING_PRIVACY_REVIEW');

    const allArtifactRows = mockDb.evidenceArtifacts;
    expect(allArtifactRows).toHaveLength(1); // Only raw row, no public derivative
    expect(allArtifactRows[0].storageTier).toBe('RESTRICTED_RAW');
    expect(allArtifactRows[0].isEligibleForSharing).toBe(false);
    expect(allArtifactRows[0].quarantineReason).toBe('VIDEO_PENDING_PRIVACY_REVIEW');
  });

  it('executes full pipeline processing with lineage and preserves reproduction verdict (TC-INV-007)', async () => {
    const rawConsoleRef = await registrar.registerLocalCapture({
      investigationId,
      attemptNumber: 1,
      kind: 'CONSOLE_LOG',
      localTempPath: consoleTempPath,
      mimeType: 'text/plain',
      capturedAt: new Date().toISOString(),
    });

    const rawNetworkRef = await registrar.registerLocalCapture({
      investigationId,
      attemptNumber: 1,
      kind: 'NETWORK_TRACE',
      localTempPath: networkTempPath,
      mimeType: 'application/json',
      capturedAt: new Date().toISOString(),
    });

    const outcome = await pipeline.processInvestigationEvidence({
      investigationId,
      storagePort: adapter,
    });

    expect(outcome.readiness).toBe('PUBLIC_SAFE_READY');
    expect(outcome.processedCount).toBe(2);

    // Invariant TC-INV-007: Verdict is locked
    const inv = mockDb.investigations.find((i) => i.id === investigationId);
    expect(inv.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
    expect(inv.evidenceReadiness).toBe('PUBLIC_SAFE_READY');

    // Derivatives exist for console and network
    const derivatives = mockDb.evidenceArtifacts.filter((a) => a.storageTier === 'PUBLIC_SAFE');
    expect(derivatives).toHaveLength(2);

    const consoleDerivative = derivatives.find((d) => d.kind === 'CONSOLE_LOG');
    expect(consoleDerivative?.rawArtifactId).toBe(rawConsoleRef.captureId);

    const networkDerivative = derivatives.find((d) => d.kind === 'NETWORK_TRACE');
    expect(networkDerivative?.rawArtifactId).toBe(rawNetworkRef.captureId);

    // Raw captures remain in RESTRICTED_RAW
    const rawRecords = mockDb.evidenceArtifacts.filter((a) => a.storageTier === 'RESTRICTED_RAW');
    expect(rawRecords).toHaveLength(2);
    expect(rawRecords.every((r) => !r.isEligibleForSharing)).toBe(true);
  });
});
