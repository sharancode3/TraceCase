import { eq, and, isNull } from 'drizzle-orm';
import { getDb, DbClient } from '@/server/db';
import { investigationsTable, evidenceArtifactsTable } from '@/server/db/schema';
import { eventsRepository } from '@/server/db/repositories/events.repository';
import type { EvidenceReadinessStatus } from '@/contracts/status';
import type { FinalizedCaptureReference } from '@/contracts/evidence';
import { EvidenceStoragePort, unavailableEvidenceStorage, ServiceUnavailableError } from '@/server/services/ports';

export interface EvidencePipelineOutcome {
  readiness: EvidenceReadinessStatus;
  processedCount: number;
  quarantinedCount: number;
  errors?: string[];
}

export class EvidencePipeline {
  constructor(private dbProvider: () => DbClient = getDb) {}

  /**
   * Processes raw staged evidence into verified public-safe artifacts.
   * Coordinates with Person 3's EvidenceStoragePort for redaction and dual-bucket storage.
   *
   * CRITICAL FAULT-ISOLATION INVARIANT (TC-INV-007):
   * A failure or unavailability in evidence processing NEVER modifies or invalidates
   * the deterministic reproduction verdict (CONFIRMED_REPRODUCED, NOT_REPRODUCED, etc.).
   */
  public async processInvestigationEvidence(params: {
    investigationId: string;
    storagePort?: EvidenceStoragePort;
    requireFullTriad?: boolean;
  }): Promise<EvidencePipelineOutcome> {
    const db = this.dbProvider();
    const port = params.storagePort || unavailableEvidenceStorage;

    // 1. Fetch raw artifact records
    const rawArtifacts = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(and(eq(evidenceArtifactsTable.investigationId, params.investigationId), isNull(evidenceArtifactsTable.rawArtifactId)));

    if (rawArtifacts.length === 0) {
      await db
        .update(investigationsTable)
        .set({
          evidenceReadiness: 'STORAGE_SYNC_FAILED',
          updatedAt: new Date(),
        })
        .where(eq(investigationsTable.id, params.investigationId));

      return {
        readiness: 'STORAGE_SYNC_FAILED',
        processedCount: 0,
        quarantinedCount: 0,
        errors: ['No raw capture artifacts were registered for this investigation.'],
      };
    }

    const captureRefs: FinalizedCaptureReference[] = [];
    for (const r of rawArtifacts) {
      if (r.attemptNumber !== 1 && r.attemptNumber !== 2) {
        continue; // Exclude invalid attempt numbers rather than defaulting to 1
      }
      captureRefs.push({
        captureId: r.id,
        investigationId: r.investigationId,
        attemptNumber: r.attemptNumber,
        kind: r.kind as FinalizedCaptureReference['kind'],
        storageRef: r.storageRef || `local://${r.localPath}`,
        sizeBytes: r.sizeBytes,
        sha256Checksum: r.sha256Checksum,
        capturedAt: r.capturedAt.toISOString(),
      });
    }

    // 2. Delegate to Person 3's sanitization & packaging service
    try {
      const results = await port.processArtifacts({
        investigationId: params.investigationId,
        captureRefs,
      });

      let quarantinedCount = 0;
      let processedCount = 0;

      for (const res of results) {
        if (res.isEligibleForSharing) {
          processedCount++;
        } else {
          quarantinedCount++;
        }

        // Check if dual-bucket derivative lineage is already persisted for this raw artifact
        let hasPersistedDerivative = false;
        try {
          const existingDerivative = await db
            .select()
            .from(evidenceArtifactsTable)
            .where(
              and(
                eq(evidenceArtifactsTable.investigationId, params.investigationId),
                eq(evidenceArtifactsTable.rawArtifactId, res.artifactId)
              )
            )
            .limit(1);
          hasPersistedDerivative = existingDerivative.length > 0;
        } catch {
          hasPersistedDerivative = false;
        }

        if (hasPersistedDerivative) {
          // Dual-bucket derivative lineage is already active.
          // Retain raw capture in RESTRICTED_RAW and avoid overwriting it to PUBLIC_SAFE.
          await db
            .update(evidenceArtifactsTable)
            .set({
              quarantineReason: res.quarantineReason || null,
              updatedAt: new Date(),
            })
            .where(eq(evidenceArtifactsTable.id, res.artifactId));
        } else {
          // Fallback for mock storage ports / unit tests where raw artifact is updated in place
          await db
            .update(evidenceArtifactsTable)
            .set({
              storageTier: res.publishedTier,
              redactionApplied: res.redactionApplied,
              isEligibleForSharing: res.isEligibleForSharing,
              quarantineReason: res.quarantineReason || null,
              updatedAt: new Date(),
            })
            .where(eq(evidenceArtifactsTable.id, res.artifactId));
        }

        const matchedRaw = rawArtifacts.find((r) => r.id === res.artifactId);
        await eventsRepository.appendEvent({
          investigationId: params.investigationId,
          eventType: 'ARTIFACT_STORED',
          message: `Artifact ${res.kind} processed: tier=${res.publishedTier}, shareable=${res.isEligibleForSharing}.`,
          payload: {
            artifactId: res.artifactId,
            kind: res.kind,
            storageTier: res.publishedTier,
            sizeBytes: matchedRaw?.sizeBytes ?? 0,
            redactionApplied: res.redactionApplied,
          },
        });
      }

      let finalReadiness: EvidenceReadinessStatus;
      if (results.length === 0) {
        finalReadiness = 'STORAGE_SYNC_FAILED';
      } else if (quarantinedCount > 0 && processedCount === 0) {
        finalReadiness = 'QUARANTINED_LEAK_DETECTED';
      } else if (processedCount > 0 && quarantinedCount === 0) {
        if (params.requireFullTriad) {
          // Identify all distinct executed attempts in this batch of capture references
          const executedAttempts = Array.from(new Set(captureRefs.map((c) => c.attemptNumber))).filter(
            (n): n is 1 | 2 => n === 1 || n === 2
          );

          let allAttemptsHaveTriad = executedAttempts.length > 0;
          for (const attNum of executedAttempts) {
            const attCaptureIds = new Set(
              captureRefs.filter((c) => c.attemptNumber === attNum).map((c) => c.captureId)
            );
            const attShareableKinds = new Set(
              results
                .filter((r) => r.isEligibleForSharing && attCaptureIds.has(r.artifactId))
                .map((r) => r.kind)
            );
            const attHasTriad =
              attShareableKinds.has('VIDEO_RECORDING') &&
              attShareableKinds.has('CONSOLE_LOG') &&
              attShareableKinds.has('NETWORK_TRACE');
            if (!attHasTriad) {
              allAttemptsHaveTriad = false;
              break;
            }
          }

          finalReadiness = allAttemptsHaveTriad ? 'PUBLIC_SAFE_READY' : 'PACKAGING_IN_PROGRESS';
        } else {
          finalReadiness = 'PUBLIC_SAFE_READY';
        }
      } else {
        // Partial success with some leaks/quarantines
        finalReadiness = 'PACKAGING_IN_PROGRESS';
      }

      await db
        .update(investigationsTable)
        .set({
          evidenceReadiness: finalReadiness,
          updatedAt: new Date(),
        })
        .where(eq(investigationsTable.id, params.investigationId));

      return {
        readiness: finalReadiness,
        processedCount,
        quarantinedCount,
        errors: results.length === 0 ? ['Evidence packaging returned empty results manifest.'] : undefined,
      };
    } catch (err: unknown) {
      const isUnavailable = err instanceof ServiceUnavailableError;
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Fault-tolerance: preserve reproduction verdict, only update evidence readiness
      const fallbackReadiness: EvidenceReadinessStatus = isUnavailable
        ? 'PACKAGING_IN_PROGRESS'
        : 'STORAGE_SYNC_FAILED';

      await db
        .update(investigationsTable)
        .set({
          evidenceReadiness: fallbackReadiness,
          updatedAt: new Date(),
        })
        .where(eq(investigationsTable.id, params.investigationId));

      return {
        readiness: fallbackReadiness,
        processedCount: 0,
        quarantinedCount: 0,
        errors: [errorMsg],
      };
    }
  }

  /**
   * Authoritatively checks whether an investigation has a complete, shareable evidence triad
   * (video recording, console logs, network trace) in PUBLIC_SAFE tier for each required attempt.
   */
  public async validateEvidenceTriad(
    investigationId: string,
    requiredAttempts?: number[]
  ): Promise<{
    isComplete: boolean;
    hasVideo: boolean;
    hasConsole: boolean;
    hasNetwork: boolean;
    missingKinds: string[];
    perAttempt: Record<
      number,
      {
        hasVideo: boolean;
        hasConsole: boolean;
        hasNetwork: boolean;
        isComplete: boolean;
        missingKinds: string[];
      }
    >;
    artifacts: Array<{
      id: string;
      kind: string;
      attemptNumber: number | null;
      storageTier: string;
      isEligibleForSharing: boolean;
    }>;
  }> {
    const db = this.dbProvider();
    const artifacts = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(eq(evidenceArtifactsTable.investigationId, investigationId));

    const shareable = artifacts.filter((a) => a.isEligibleForSharing && a.storageTier === 'PUBLIC_SAFE');

    // Determine target attempt numbers to evaluate
    let targetAttempts = requiredAttempts;
    if (!targetAttempts || targetAttempts.length === 0) {
      const distinctAttempts = Array.from(new Set(artifacts.map((a) => a.attemptNumber))).filter(
        (n): n is number => n === 1 || n === 2
      );
      targetAttempts = distinctAttempts.length > 0 ? distinctAttempts.sort() : [1];
    }

    const perAttempt: Record<
      number,
      {
        hasVideo: boolean;
        hasConsole: boolean;
        hasNetwork: boolean;
        isComplete: boolean;
        missingKinds: string[];
      }
    > = {};

    let allComplete = true;
    for (const attemptNum of targetAttempts) {
      const attemptArtifacts = shareable.filter((a) => a.attemptNumber === attemptNum);
      const hasVideo = attemptArtifacts.some((a) => a.kind === 'VIDEO_RECORDING');
      const hasConsole = attemptArtifacts.some((a) => a.kind === 'CONSOLE_LOG');
      const hasNetwork = attemptArtifacts.some((a) => a.kind === 'NETWORK_TRACE');

      const missing: string[] = [];
      if (!hasVideo) missing.push('VIDEO_RECORDING');
      if (!hasConsole) missing.push('CONSOLE_LOG');
      if (!hasNetwork) missing.push('NETWORK_TRACE');

      const isAttemptComplete = hasVideo && hasConsole && hasNetwork;
      if (!isAttemptComplete) allComplete = false;

      perAttempt[attemptNum] = {
        hasVideo,
        hasConsole,
        hasNetwork,
        isComplete: isAttemptComplete,
        missingKinds: missing,
      };
    }

    const overallHasVideo = shareable.some((a) => a.kind === 'VIDEO_RECORDING');
    const overallHasConsole = shareable.some((a) => a.kind === 'CONSOLE_LOG');
    const overallHasNetwork = shareable.some((a) => a.kind === 'NETWORK_TRACE');

    const globalMissing: string[] = [];
    if (!overallHasVideo) globalMissing.push('VIDEO_RECORDING');
    if (!overallHasConsole) globalMissing.push('CONSOLE_LOG');
    if (!overallHasNetwork) globalMissing.push('NETWORK_TRACE');

    return {
      isComplete: allComplete && targetAttempts.length > 0,
      hasVideo: overallHasVideo,
      hasConsole: overallHasConsole,
      hasNetwork: overallHasNetwork,
      missingKinds: globalMissing,
      perAttempt,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        kind: a.kind,
        attemptNumber: a.attemptNumber,
        storageTier: a.storageTier,
        isEligibleForSharing: a.isEligibleForSharing,
      })),
    };
  }

  public async getEligibleEvidence(
    investigationId: string
  ): Promise<FinalizedCaptureReference[]> {
    const db = this.dbProvider();
    const artifacts = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.investigationId, investigationId),
          eq(evidenceArtifactsTable.isEligibleForSharing, true),
          eq(evidenceArtifactsTable.storageTier, 'PUBLIC_SAFE')
        )
      );

    return artifacts
      .filter((a) => a.attemptNumber === 1 || a.attemptNumber === 2)
      .map((a) => ({
        captureId: a.id,
        investigationId: a.investigationId,
        attemptNumber: a.attemptNumber as 1 | 2,
        kind: a.kind as FinalizedCaptureReference['kind'],
        storageRef: a.storageRef || `local://${a.localPath || a.id}`,
        sizeBytes: a.sizeBytes,
        sha256Checksum: a.sha256Checksum,
        capturedAt: a.capturedAt.toISOString(),
      }));
  }
}

export const evidencePipeline = new EvidencePipeline();
