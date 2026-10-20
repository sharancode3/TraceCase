import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, DbClient } from '@/server/db';
import { evidenceArtifactsTable } from '@/server/db/schema';
import type {
  ArtifactKind,
  CaptureRegistrationCommand,
  FinalizedCaptureReference,
} from '@/contracts/evidence';

export interface RegisteredArtifactRecord {
  id: string;
  investigationId: string;
  attemptNumber: number | null;
  kind: ArtifactKind;
  storageTier: 'RESTRICTED_RAW' | 'PUBLIC_SAFE';
  localPath: string | null;
  storageRef: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256Checksum: string;
  redactionApplied: boolean;
  isEligibleForSharing: boolean;
  quarantineReason: string | null;
  capturedAt: Date;
}

export class CaptureRegistrar {
  constructor(private dbProvider: () => DbClient = getDb) {}

  /**
   * Computes SHA-256 hash and size of a local staging file.
   */
  public static async inspectFile(filePath: string): Promise<{ sizeBytes: number; sha256Checksum: string }> {
    const buffer = await fs.readFile(filePath);
    const sizeBytes = buffer.length;
    const sha256Checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    return { sizeBytes, sha256Checksum };
  }

  /**
   * Registers a captured raw file from local staging into evidence_artifacts table.
   * Stored in RESTRICTED_RAW tier until processed by sanitization pipeline.
   * Fails closed if the file cannot be accessed or verified on disk.
   */
  public async registerLocalCapture(command: CaptureRegistrationCommand): Promise<FinalizedCaptureReference> {
    const db = this.dbProvider();
    const artifactId = crypto.randomUUID();

    const stats = await CaptureRegistrar.inspectFile(command.localTempPath);
    const sizeBytes = stats.sizeBytes;
    const sha256Checksum = stats.sha256Checksum;

    const storageRef = `raw://${command.investigationId}/attempt-${command.attemptNumber}/${path.basename(command.localTempPath)}`;

    await db.insert(evidenceArtifactsTable).values({
      id: artifactId,
      investigationId: command.investigationId,
      attemptNumber: command.attemptNumber,
      kind: command.kind,
      storageTier: 'RESTRICTED_RAW',
      localPath: command.localTempPath,
      storageRef,
      mimeType: command.mimeType,
      sizeBytes,
      sha256Checksum,
      redactionApplied: false,
      isEligibleForSharing: false,
      capturedAt: new Date(command.capturedAt),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      captureId: artifactId,
      investigationId: command.investigationId,
      attemptNumber: command.attemptNumber,
      kind: command.kind,
      storageRef,
      sizeBytes,
      sha256Checksum,
      capturedAt: command.capturedAt,
    };
  }

  /**
   * Scans an attempt staging directory and registers any verified capture artifacts.
   * Scans both the root staging directory and the videos subdirectory created by VideoManager.
   */
  public async registerAttemptCapturesFromDirectory(params: {
    investigationId: string;
    attemptNumber: 1 | 2;
    stagingDir: string;
  }): Promise<FinalizedCaptureReference[]> {
    const registered: FinalizedCaptureReference[] = [];
    const dirsToScan = [params.stagingDir, path.join(params.stagingDir, 'videos')];

    for (const dir of dirsToScan) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const filePath = path.join(dir, entry.name);
          let kind: ArtifactKind | null = null;
          let mimeType = 'application/octet-stream';

          if (entry.name.endsWith('.webm')) {
            kind = 'VIDEO_RECORDING';
            mimeType = 'video/webm';
          } else if (entry.name.includes('console') && entry.name.endsWith('.json')) {
            kind = 'CONSOLE_LOG';
            mimeType = 'application/json';
          } else if (entry.name.includes('network') && entry.name.endsWith('.json')) {
            kind = 'NETWORK_TRACE';
            mimeType = 'application/json';
          } else if (entry.name.endsWith('.png')) {
            kind = 'SCREENSHOT';
            mimeType = 'image/png';
          }

          if (kind) {
            try {
              const ref = await this.registerLocalCapture({
                investigationId: params.investigationId,
                attemptNumber: params.attemptNumber,
                kind,
                localTempPath: filePath,
                mimeType,
                capturedAt: new Date().toISOString(),
              });
              registered.push(ref);
            } catch {
              // Skip unreadable files
            }
          }
        }
      } catch {
        // Directory might not exist if attempt didn't run or didn't create subfolder
      }
    }
    return registered;
  }

  /**
   * Retrieves all registered artifacts for an investigation.
   */
  public async getInvestigationArtifacts(investigationId: string): Promise<RegisteredArtifactRecord[]> {
    const db = this.dbProvider();
    const rows = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(eq(evidenceArtifactsTable.investigationId, investigationId));

    return rows.map((r) => ({
      id: r.id,
      investigationId: r.investigationId,
      attemptNumber: r.attemptNumber,
      kind: r.kind as ArtifactKind,
      storageTier: r.storageTier as 'RESTRICTED_RAW' | 'PUBLIC_SAFE',
      localPath: r.localPath,
      storageRef: r.storageRef,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      sha256Checksum: r.sha256Checksum,
      redactionApplied: r.redactionApplied,
      isEligibleForSharing: r.isEligibleForSharing,
      quarantineReason: r.quarantineReason,
      capturedAt: r.capturedAt,
    }));
  }
}

export const captureRegistrar = new CaptureRegistrar();
