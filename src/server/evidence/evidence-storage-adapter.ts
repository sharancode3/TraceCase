import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, DbClient, isDbConfigured } from '@/server/db';
import { evidenceArtifactsTable } from '@/server/db/schema';
import type { EvidenceStoragePort } from '@/server/services/ports';
import { ServiceUnavailableError } from '@/server/services/ports';
import type {
  CaptureRegistrationCommand,
  FinalizedCaptureReference,
  ArtifactProcessingResult,
  ArtifactAccessGrant,
  StorageTier,
} from '@/contracts/evidence';
import { CaptureRegistrar } from './capture-registrar';
import {
  getEvidenceStorageDriver,
  type EvidenceStorageDriver,
  buildStorageKey,
} from './storage';
import {
  sanitizeText,
  sanitizeStructuredData,
  isContentClean,
} from './sanitizer';
import {
  MIN_VIDEO_BYTE_SIZE,
  DEFAULT_MAX_LOG_SIZE_BYTES,
  DEFAULT_MAX_NETWORK_SIZE_BYTES,
} from './processor';

export interface StoredAccessGrant {
  grantId: string;
  artifactId: string;
  investigationId?: string;
  authorizedUserId: string;
  storageTier: StorageTier;
  expiresAt: Date;
}

// In-memory grant registry for time-limited authorized artifact downloads
const accessGrantRegistry = new Map<string, StoredAccessGrant>();

export function storeAccessGrant(grant: StoredAccessGrant): void {
  accessGrantRegistry.set(grant.grantId, grant);
}

export function verifyAccessGrant(grantId: string, artifactId: string): StoredAccessGrant | null {
  const grant = accessGrantRegistry.get(grantId);
  if (!grant) return null;
  if (grant.artifactId !== artifactId) return null;
  if (Date.now() > grant.expiresAt.getTime()) {
    accessGrantRegistry.delete(grantId);
    return null;
  }
  return grant;
}

export function clearAccessGrants(): void {
  accessGrantRegistry.clear();
}

/**
 * Integrated Evidence Storage Adapter connecting Person 1's EvidenceStoragePort
 * to Person 3's dual-bucket storage, sanitizer, and access grant infrastructure.
 *
 * Implements:
 * - TC-INV-009: In-Stream Redaction & Dual-Bucket Quarantining
 * - TC-INV-012: Mandatory Evidence Triad Byte Integrity (SHA-256)
 * - VES-EVD-002: Minimum video threshold (10 KB)
 * - VES-EVD-003: Console log byte bounding (500 KB default)
 * - Fail-closed privacy: uninspected video strictly retained in RESTRICTED_RAW
 */
export class IntegratedEvidenceStorageAdapter implements EvidenceStoragePort {
  private readonly storageDriver: EvidenceStorageDriver;

  constructor(
    private dbProvider: () => DbClient = getDb,
    storageDriver?: EvidenceStorageDriver
  ) {
    this.storageDriver = storageDriver ?? getEvidenceStorageDriver();
  }

  /**
   * Registers a raw capture reference into the evidence_artifacts table and
   * stages the raw artifact bytes into RESTRICTED_RAW storage.
   */
  public async registerCapture(
    command: CaptureRegistrationCommand
  ): Promise<FinalizedCaptureReference> {
    if (!command || !command.localTempPath || !command.investigationId) {
      throw new ServiceUnavailableError(
        'EvidenceStoragePort',
        'Cannot register capture: command is missing required fields (investigationId or localTempPath).'
      );
    }
    const registrar = new CaptureRegistrar(this.dbProvider);
    const ref = await registrar.registerLocalCapture(command);

    // Stage raw capture into storage driver under RESTRICTED_RAW
    try {
      const buffer = await fs.readFile(command.localTempPath);
      const ext = path.extname(command.localTempPath).replace(/^\./, '') || 'bin';
      const key = buildStorageKey({
        investigationId: command.investigationId,
        attemptNumber: command.attemptNumber,
        kind: command.kind,
        fileName: `${ref.captureId}.${ext}`,
      });

      await this.storageDriver.putArtifact({
        key,
        tier: 'RESTRICTED_RAW',
        data: buffer,
        mimeType: command.mimeType,
        allowOverwrite: true,
      });
    } catch {
      // Registrar already inspected size and hash; file will be read from local disk if available
    }

    return ref;
  }

  /**
   * Processes raw staged evidence into sanitized public derivatives where eligible,
   * isolating unscrubbed or dirty payloads in RESTRICTED_RAW.
   */
  public async processArtifacts(params: {
    investigationId: string;
    captureRefs: FinalizedCaptureReference[];
  }): Promise<ArtifactProcessingResult[]> {
    const results: ArtifactProcessingResult[] = [];

    // Query DB for artifact records to obtain local file paths if DB is configured
    const localPathMap: Map<string, string> = new Map();
    if (isDbConfigured()) {
      try {
        const db = this.dbProvider();
        const rows = await db
          .select()
          .from(evidenceArtifactsTable)
          .where(eq(evidenceArtifactsTable.investigationId, params.investigationId));

        for (const row of rows) {
          if (row.localPath) {
            localPathMap.set(row.id, row.localPath);
          }
        }
      } catch {
        // Fall back to storageRef or driver lookup
      }
    }

    for (const ref of params.captureRefs) {
      const attemptNumber = ref.attemptNumber === 2 ? 2 : 1;
      let rawBuffer: Buffer | null = null;

      // 1. Try reading from disk staging path
      const localPath = localPathMap.get(ref.captureId);
      if (localPath) {
        try {
          rawBuffer = await fs.readFile(localPath);
        } catch {
          rawBuffer = null;
        }
      }

      // 2. Fall back to reading from storageDriver RESTRICTED_RAW
      if (!rawBuffer) {
        const ext = ref.kind === 'VIDEO_RECORDING' ? 'webm' : ref.kind === 'CONSOLE_LOG' ? 'log' : 'json';
        const keyWithId = buildStorageKey({
          investigationId: params.investigationId,
          attemptNumber,
          kind: ref.kind,
          fileName: `${ref.captureId}.${ext}`,
        });

        const stored = await this.storageDriver.getArtifact(keyWithId, 'RESTRICTED_RAW');
        if (stored) {
          rawBuffer = stored.data;
        }
      }

      // 3. Fail closed if raw bytes cannot be verified or read from disk or storage
      if (!rawBuffer) {
        results.push({
          artifactId: ref.captureId,
          investigationId: params.investigationId,
          kind: ref.kind,
          originalTier: 'RESTRICTED_RAW',
          publishedTier: 'RESTRICTED_RAW',
          redactionApplied: false,
          isEligibleForSharing: false,
          quarantineReason: 'RAW_SOURCE_UNAVAILABLE',
        });
        continue;
      }

      // 4. Process according to artifact kind
      if (ref.kind === 'CONSOLE_LOG') {
        const rawText = rawBuffer.toString('utf-8');

        // Retain raw original in RESTRICTED_RAW
        const rawConsoleKey = buildStorageKey({
          investigationId: params.investigationId,
          attemptNumber,
          kind: 'CONSOLE_LOG',
          fileName: `attempt_${attemptNumber}_raw_console_${ref.captureId}.log`,
        });
        await this.storageDriver.putArtifact({
          key: rawConsoleKey,
          tier: 'RESTRICTED_RAW',
          data: rawText,
          mimeType: 'text/plain',
          allowOverwrite: true,
        });

        // Apply in-stream sanitization and boundary check
        const scrubResult = sanitizeText(rawText, { maxSizeBytes: DEFAULT_MAX_LOG_SIZE_BYTES });
        const isClean = isContentClean(scrubResult.safeContent);
        const isCompleted = scrubResult.scanCompleted && !scrubResult.truncated;

        if (isCompleted && isClean) {
          const safeConsoleKey = buildStorageKey({
            investigationId: params.investigationId,
            attemptNumber,
            kind: 'CONSOLE_LOG',
            fileName: `attempt_${attemptNumber}_console_${ref.captureId}.log`,
          });
          await this.storageDriver.putArtifact({
            key: safeConsoleKey,
            tier: 'PUBLIC_SAFE',
            data: scrubResult.safeContent,
            mimeType: 'text/plain',
            allowOverwrite: true,
          });

          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'CONSOLE_LOG',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'PUBLIC_SAFE',
            redactionApplied: scrubResult.redactionsApplied,
            redactionDetails: {
              tokensMasked: scrubResult.redactionCount,
              piiMasked: 0,
            },
            isEligibleForSharing: true,
          });
        } else {
          const quarantinedKey = buildStorageKey({
            investigationId: params.investigationId,
            attemptNumber,
            kind: 'CONSOLE_LOG',
            fileName: `attempt_${attemptNumber}_quarantined_console_${ref.captureId}.log`,
          });
          await this.storageDriver.putArtifact({
            key: quarantinedKey,
            tier: 'RESTRICTED_RAW',
            data: scrubResult.safeContent,
            mimeType: 'text/plain',
            allowOverwrite: true,
          });

          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'CONSOLE_LOG',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'RESTRICTED_RAW',
            redactionApplied: scrubResult.redactionsApplied,
            isEligibleForSharing: false,
            quarantineReason: !isCompleted ? 'CONSOLE_LOG_TRUNCATED' : 'CONSOLE_LOG_RESIDUAL_SECRET',
          });
        }
      } else if (ref.kind === 'NETWORK_TRACE') {
        const rawText = rawBuffer.toString('utf-8');

        const rawNetworkKey = buildStorageKey({
          investigationId: params.investigationId,
          attemptNumber,
          kind: 'NETWORK_TRACE',
          fileName: `attempt_${attemptNumber}_raw_network_${ref.captureId}.json`,
        });
        await this.storageDriver.putArtifact({
          key: rawNetworkKey,
          tier: 'RESTRICTED_RAW',
          data: rawText,
          mimeType: 'application/json',
          allowOverwrite: true,
        });

        // Bound network trace size before unrestricted parsing
        if (rawBuffer.length > DEFAULT_MAX_NETWORK_SIZE_BYTES) {
          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'NETWORK_TRACE',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'RESTRICTED_RAW',
            redactionApplied: false,
            isEligibleForSharing: false,
            quarantineReason: 'NETWORK_TRACE_OVERSIZED',
          });
          continue;
        }

        let isJsonParsed = false;
        let safeNetworkText = '';
        let redactionsApplied = false;

        try {
          const parsed = JSON.parse(rawText);
          isJsonParsed = true;
          const scrubbed = sanitizeStructuredData(parsed);
          safeNetworkText = JSON.stringify(scrubbed);
          redactionsApplied = true;
        } catch {
          isJsonParsed = false;
        }

        // Malformed JSON must not automatically be promoted to safe processed evidence
        if (!isJsonParsed) {
          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'NETWORK_TRACE',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'RESTRICTED_RAW',
            redactionApplied: false,
            isEligibleForSharing: false,
            quarantineReason: 'NETWORK_TRACE_MALFORMED_JSON',
          });
          continue;
        }

        const isClean = isContentClean(safeNetworkText);
        if (isClean) {
          const safeNetworkKey = buildStorageKey({
            investigationId: params.investigationId,
            attemptNumber,
            kind: 'NETWORK_TRACE',
            fileName: `attempt_${attemptNumber}_network_${ref.captureId}.json`,
          });
          await this.storageDriver.putArtifact({
            key: safeNetworkKey,
            tier: 'PUBLIC_SAFE',
            data: safeNetworkText,
            mimeType: 'application/json',
            allowOverwrite: true,
          });

          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'NETWORK_TRACE',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'PUBLIC_SAFE',
            redactionApplied: redactionsApplied,
            isEligibleForSharing: true,
          });
        } else {
          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'NETWORK_TRACE',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'RESTRICTED_RAW',
            redactionApplied: redactionsApplied,
            isEligibleForSharing: false,
            quarantineReason: 'NETWORK_TRACE_RESIDUAL_SECRET',
          });
        }
      } else if (ref.kind === 'VIDEO_RECORDING') {
        const videoByteLength = rawBuffer.length;

        // Container check: WebM magic bytes (0x1A 0x45 0xDF 0xA3)
        const isWebm =
          rawBuffer.length >= 4 &&
          rawBuffer[0] === 0x1a &&
          rawBuffer[1] === 0x45 &&
          rawBuffer[2] === 0xdf &&
          rawBuffer[3] === 0xa3;

        if (!isWebm) {
          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'VIDEO_RECORDING',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'RESTRICTED_RAW',
            redactionApplied: false,
            isEligibleForSharing: false,
            quarantineReason: 'VIDEO_CONTAINER_INVALID',
          });
          continue;
        }

        if (videoByteLength < MIN_VIDEO_BYTE_SIZE) {
          const rawVideoKey = buildStorageKey({
            investigationId: params.investigationId,
            attemptNumber,
            kind: 'VIDEO_RECORDING',
            fileName: `attempt_${attemptNumber}_undersized_recording_${ref.captureId}.webm`,
          });
          await this.storageDriver.putArtifact({
            key: rawVideoKey,
            tier: 'RESTRICTED_RAW',
            data: rawBuffer,
            mimeType: 'video/webm',
            allowOverwrite: true,
          });

          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'VIDEO_RECORDING',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'RESTRICTED_RAW',
            redactionApplied: false,
            isEligibleForSharing: false,
            quarantineReason: 'VIDEO_RECORDING_UNDERSIZED',
          });
        } else {
          // Valid video recording (>= 10 KB per VES-EVD-002)
          // Privacy policy: Byte size confirms container integrity, NOT visual content safety.
          // Uninspected video is strictly retained in RESTRICTED_RAW and withheld from sharing
          // until verified through an explicit privacy review.
          const videoKey = buildStorageKey({
            investigationId: params.investigationId,
            attemptNumber,
            kind: 'VIDEO_RECORDING',
            fileName: `attempt_${attemptNumber}_raw_recording_${ref.captureId}.webm`,
          });
          await this.storageDriver.putArtifact({
            key: videoKey,
            tier: 'RESTRICTED_RAW',
            data: rawBuffer,
            mimeType: 'video/webm',
            allowOverwrite: true,
          });

          results.push({
            artifactId: ref.captureId,
            investigationId: params.investigationId,
            kind: 'VIDEO_RECORDING',
            originalTier: 'RESTRICTED_RAW',
            publishedTier: 'RESTRICTED_RAW',
            redactionApplied: false,
            isEligibleForSharing: false,
            quarantineReason: 'VIDEO_PENDING_PRIVACY_REVIEW',
          });
        }
      } else {
        // Unknown or unsupported artifact kinds remain withheld
        results.push({
          artifactId: ref.captureId,
          investigationId: params.investigationId,
          kind: ref.kind,
          originalTier: 'RESTRICTED_RAW',
          publishedTier: 'RESTRICTED_RAW',
          redactionApplied: false,
          isEligibleForSharing: false,
          quarantineReason: 'UNSUPPORTED_ARTIFACT_POLICY',
        });
      }
    }

    return results;
  }

  /**
   * Creates a time-limited signed access grant for authenticated artifact download.
   */
  public async createAccessGrant(params: {
    artifactId: string;
    userId: string;
    tier: string;
  }): Promise<ArtifactAccessGrant> {
    const grantId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute expiration
    const requestedTier: StorageTier = params.tier === 'PUBLIC_SAFE' ? 'PUBLIC_SAFE' : 'RESTRICTED_RAW';

    let investigationId = params.artifactId;
    if (isDbConfigured()) {
      try {
        const db = this.dbProvider();
        const [artifactRow] = await db
          .select()
          .from(evidenceArtifactsTable)
          .where(eq(evidenceArtifactsTable.id, params.artifactId))
          .limit(1);

        if (artifactRow) {
          investigationId = artifactRow.investigationId;
          // Policy: A grant for processed content must never authorize a restricted object
          if (artifactRow.storageTier === 'RESTRICTED_RAW' && requestedTier === 'PUBLIC_SAFE') {
            throw new Error('A PUBLIC_SAFE grant cannot authorize a RESTRICTED_RAW artifact.');
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('PUBLIC_SAFE')) throw err;
      }
    }

    storeAccessGrant({
      grantId,
      artifactId: params.artifactId,
      investigationId,
      authorizedUserId: params.userId,
      storageTier: requestedTier,
      expiresAt,
    });

    return {
      grantId,
      artifactId: params.artifactId,
      authorizedUserId: params.userId,
      storageTier: requestedTier,
      downloadUrl: `/api/v1/investigations/${investigationId}/artifacts/${params.artifactId}?grant=${grantId}`,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
