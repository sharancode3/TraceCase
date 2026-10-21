/**
 * TraceCase — Evidence Triad Processor and Manifest Builder (P3-03 / Slice 2)
 *
 * Ingests raw attempt telemetry (video, console logs, network traces), applies
 * in-stream and structured sanitization (P3-02), computes SHA-256 integrity digests,
 * isolates raw captures into RESTRICTED_RAW, uploads scrubbed derivatives into PUBLIC_SAFE,
 * and builds a canonical EvidenceManifest validated against EvidenceManifestSchema.
 *
 * Implements:
 * - TC-INV-009: In-Stream Redaction & Dual-Bucket Quarantining
 * - TC-INV-012: Mandatory Evidence Triad Byte Integrity (SHA-256)
 * - VES-EVD-002: Minimum video threshold (10 KB)
 * - VES-EVD-003: Console log byte bounding (500 KB default)
 * - Fail-closed promotion: only fully scanned, clean derivatives are eligible for PUBLIC_SAFE
 */

import { randomUUID } from 'node:crypto';
import type {
  EvidenceManifest,
  EvidenceArtifactMetadata,
} from '@/contracts/evidence';
import { EvidenceManifestSchema } from '@/contracts/evidence';
import type { EvidenceReadinessStatus } from '@/contracts/status';
import {
  buildStorageKey,
  type EvidenceStorageDriver,
  getEvidenceStorageDriver,
  type StoredArtifactRecord,
} from './storage';
import {
  sanitizeText,
  sanitizeStructuredData,
  isContentClean,
} from './sanitizer';

/** Minimum size in bytes for a video recording to be considered valid (.webm VP8/VP9) per VES-EVD-002 */
export const MIN_VIDEO_BYTE_SIZE = 10 * 1024; // 10,240 bytes (10 KB)

/** Default byte cap for console logs per VES-EVD-003 */
export const DEFAULT_MAX_LOG_SIZE_BYTES = 500 * 1024; // 500 KB

/** Default byte cap for network HAR/JSON traces */
export const DEFAULT_MAX_NETWORK_SIZE_BYTES = 1024 * 1024; // 1 MB

export interface EvidenceTriadInput {
  /** UUID of the investigation */
  investigationId: string;
  /** Attempt number (1 or 2). Defaults to 1 if omitted. */
  attemptNumber?: 1 | 2 | null;
  /** Raw Chromium viewport recording buffer (.webm). Must be >= 10 KB to be valid. */
  videoBuffer?: Buffer | Uint8Array | null;
  /** Raw CDP console log telemetry stream (.log) */
  consoleLog?: string | null;
  /** Raw CDP network telemetry (.json / HAR) */
  networkHar?: string | null;
}

export interface ProcessEvidenceTriadOptions {
  /** Maximum bytes for log files before bounded truncation occurs. Defaults to 500 KB. */
  maxLogSizeBytes?: number;
  /** Maximum bytes for network traces before bounded truncation occurs. Defaults to 1 MB. */
  maxNetworkSizeBytes?: number;
  /** Injected storage driver. Defaults to the active storage driver. */
  storageDriver?: EvidenceStorageDriver;
  /**
   * Optional public URL base. Retained for caller compatibility; strictly inactive in Slice 2
   * (all artifacts return publicUrl: null until Slice 3 authenticated retrieval is implemented).
   */
  publicUrlBase?: string;
}

export interface ProcessEvidenceTriadResult {
  /** Validated canonical evidence manifest */
  manifest: EvidenceManifest;
  /** Records of all artifacts successfully persisted in storage */
  storedArtifacts: StoredArtifactRecord[];
  /** Whether quarantine was applied due to leaks, truncation, or missing streams */
  quarantineApplied: boolean;
  /** Diagnostic error messages (structural, never containing raw secrets) */
  errors: string[];
}


interface TrackedUpload {
  storedRecord: StoredArtifactRecord;
  metadata: EvidenceArtifactMetadata;
}

/**
 * Processes the raw Evidence Triad (Video, Console, Network Trace) for an investigation attempt:
 * 1. Validates inputs and applies minimum threshold checks (e.g. video >= 10 KB).
 * 2. Isolates raw un-sanitized logs in RESTRICTED_RAW (publicUrl: null).
 * 3. Applies regex and structured sanitization to produce clean derivatives.
 * 4. Runs secondary clean-content checks (isContentClean) and scan-completion verification.
 * 5. Uploads clean derivatives to PUBLIC_SAFE if and only if completely scanned and clean.
 * 6. Synthesizes and schema-validates the final canonical EvidenceManifest.
 */
export async function processEvidenceTriad(
  input: EvidenceTriadInput,
  options: ProcessEvidenceTriadOptions = {}
): Promise<ProcessEvidenceTriadResult> {
  const { investigationId } = input;
  const attemptNumber: 1 | 2 = input.attemptNumber === 2 ? 2 : 1;
  const storageDriver = options.storageDriver ?? getEvidenceStorageDriver();
  const maxLogSizeBytes = options.maxLogSizeBytes ?? DEFAULT_MAX_LOG_SIZE_BYTES;
  const maxNetworkSizeBytes = options.maxNetworkSizeBytes ?? DEFAULT_MAX_NETWORK_SIZE_BYTES;

  // Basic UUID format check on investigationId
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!investigationId || !uuidRegex.test(investigationId)) {
    throw new Error(`[TraceCase] Invalid investigationId "${investigationId}": must be a valid RFC 4122 UUID.`);
  }

  const storedArtifacts: StoredArtifactRecord[] = [];
  const manifestArtifacts: EvidenceArtifactMetadata[] = [];
  const trackedUploads: TrackedUpload[] = [];
  const quarantineReasons: string[] = [];
  const errors: string[] = [];

  const recordUpload = (storedRecord: StoredArtifactRecord, metadata: EvidenceArtifactMetadata): void => {
    storedArtifacts.push(storedRecord);
    manifestArtifacts.push(metadata);
    trackedUploads.push({ storedRecord, metadata });
  };

  let hasVideo = false;
  let hasConsoleLog = false;
  let hasNetworkTrace = false;
  let secretScrubbingVerified = true;
  let storageFailed = false;

  // ==========================================
  // 1. VIDEO RECORDING PROCESSING (VES-EVD-002)
  // ==========================================
  if (input.videoBuffer && (Buffer.isBuffer(input.videoBuffer) || input.videoBuffer instanceof Uint8Array)) {
    const videoByteLength = Buffer.isBuffer(input.videoBuffer)
      ? input.videoBuffer.length
      : input.videoBuffer.byteLength;

    if (videoByteLength < MIN_VIDEO_BYTE_SIZE) {
      // Undersized or corrupted video recording (< 10 KB)
      hasVideo = false;
      quarantineReasons.push(
        `VIDEO_RECORDING_UNDERSIZED: Video size (${videoByteLength} bytes) is below the minimum required ${MIN_VIDEO_BYTE_SIZE} bytes`
      );

      // Store in RESTRICTED_RAW for developer diagnostics; never promote to PUBLIC_SAFE
      try {
        const rawVideoKey = buildStorageKey({
          investigationId,
          attemptNumber,
          kind: 'VIDEO_RECORDING',
          fileName: `attempt_${attemptNumber}_undersized_recording.webm`,
        });
        const rawRecord = await storageDriver.putArtifact({
          key: rawVideoKey,
          tier: 'RESTRICTED_RAW',
          data: input.videoBuffer,
          mimeType: 'video/webm',
        });
        recordUpload(rawRecord, {
          id: randomUUID(),
          investigationId,
          attemptNumber,
          kind: 'VIDEO_RECORDING',
          storageTier: 'RESTRICTED_RAW',
          fileName: `attempt_${attemptNumber}_undersized_recording.webm`,
          mimeType: 'video/webm',
          sizeBytes: rawRecord.byteSize,
          sha256Checksum: rawRecord.sha256Checksum,
          redactionApplied: false,
          publicUrl: null, // RESTRICTED_RAW must be null
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        storageFailed = true;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to store undersized video: ${msg}`);
        quarantineReasons.push('STORAGE_UPLOAD_ERROR: Failed to store undersized video recording');
      }
    } else {
      // Valid video recording (>= 10 KB per VES-EVD-002)
      // SEC-01 Remediation: Byte size confirms container integrity, NOT visual content safety.
      // Until a specification-compliant video inspection/redaction pipeline exists, all raw video
      // is retained exclusively in RESTRICTED_RAW with publicUrl: null. No uninspected video is
      // promoted to PUBLIC_SAFE.
      hasVideo = true;
      try {
        const videoKey = buildStorageKey({
          investigationId,
          attemptNumber,
          kind: 'VIDEO_RECORDING',
          fileName: `attempt_${attemptNumber}_raw_recording.webm`,
        });
        const record = await storageDriver.putArtifact({
          key: videoKey,
          tier: 'RESTRICTED_RAW',
          data: input.videoBuffer,
          mimeType: 'video/webm',
        });
        recordUpload(record, {
          id: randomUUID(),
          investigationId,
          attemptNumber,
          kind: 'VIDEO_RECORDING',
          storageTier: 'RESTRICTED_RAW',
          fileName: `attempt_${attemptNumber}_raw_recording.webm`,
          mimeType: 'video/webm',
          sizeBytes: record.byteSize,
          sha256Checksum: record.sha256Checksum,
          redactionApplied: false,
          publicUrl: null, // STRICTLY NULL: Video inspection/redaction not implemented; fails closed in RESTRICTED_RAW
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        storageFailed = true;
        hasVideo = false;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to upload video recording: ${msg}`);
        quarantineReasons.push('STORAGE_UPLOAD_ERROR: Video recording upload failed');
      }
    }
  } else {
    hasVideo = false;
    quarantineReasons.push('VIDEO_RECORDING_MISSING: No video recording stream was provided');
  }

  // ==========================================
  // 2. CONSOLE LOG PROCESSING (VES-EVD-003)
  // ==========================================
  if (typeof input.consoleLog === 'string') {
    hasConsoleLog = true;

    // Substep 2a: Retain raw original in RESTRICTED_RAW (TC-INV-009)
    try {
      const rawConsoleKey = buildStorageKey({
        investigationId,
        attemptNumber,
        kind: 'CONSOLE_LOG',
        fileName: `attempt_${attemptNumber}_raw_console.log`,
      });
      const rawRecord = await storageDriver.putArtifact({
        key: rawConsoleKey,
        tier: 'RESTRICTED_RAW',
        data: input.consoleLog,
        mimeType: 'text/plain',
      });
      recordUpload(rawRecord, {
        id: randomUUID(),
        investigationId,
        attemptNumber,
        kind: 'CONSOLE_LOG',
        storageTier: 'RESTRICTED_RAW',
        fileName: `attempt_${attemptNumber}_raw_console.log`,
        mimeType: 'text/plain',
        sizeBytes: rawRecord.byteSize,
        sha256Checksum: rawRecord.sha256Checksum,
        redactionApplied: false,
        publicUrl: null, // STRICTLY NULL
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      storageFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to store raw console log: ${msg}`);
      quarantineReasons.push('STORAGE_UPLOAD_ERROR: Raw console log upload failed');
    }

    // Substep 2b: Apply in-stream sanitization and boundary check
    const scrubResult = sanitizeText(input.consoleLog, { maxSizeBytes: maxLogSizeBytes });
    const isClean = isContentClean(scrubResult.safeContent);
    const isCompleted = scrubResult.scanCompleted && !scrubResult.truncated;

    if (!isCompleted) {
      secretScrubbingVerified = false;
      quarantineReasons.push('CONSOLE_LOG_TRUNCATED: Console log exceeded byte size limit; scan was incomplete');
    }

    if (!isClean) {
      secretScrubbingVerified = false;
      quarantineReasons.push('CONSOLE_LOG_RESIDUAL_SECRET: Unredacted sensitive token pattern detected in console log');
    }

    // Fail-closed gate: Only store in PUBLIC_SAFE if scan was completed AND clean
    if (isCompleted && isClean) {
      try {
        const safeConsoleKey = buildStorageKey({
          investigationId,
          attemptNumber,
          kind: 'CONSOLE_LOG',
          fileName: `attempt_${attemptNumber}_console.log`,
        });
        const safeRecord = await storageDriver.putArtifact({
          key: safeConsoleKey,
          tier: 'PUBLIC_SAFE',
          data: scrubResult.safeContent,
          mimeType: 'text/plain',
        });
        recordUpload(safeRecord, {
          id: randomUUID(),
          investigationId,
          attemptNumber,
          kind: 'CONSOLE_LOG',
          storageTier: 'PUBLIC_SAFE',
          fileName: `attempt_${attemptNumber}_console.log`,
          mimeType: 'text/plain',
          sizeBytes: safeRecord.byteSize,
          sha256Checksum: safeRecord.sha256Checksum,
          redactionApplied: scrubResult.redactionsApplied,
          publicUrl: null, // STRICTLY NULL: Authenticated retrieval service belongs to Slice 3
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        storageFailed = true;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to upload sanitized console log: ${msg}`);
        quarantineReasons.push('STORAGE_UPLOAD_ERROR: Sanitized console log upload failed');
      }
    } else {
      // Store the incomplete/dirty derivative in RESTRICTED_RAW with publicUrl: null
      try {
        const quarantinedKey = buildStorageKey({
          investigationId,
          attemptNumber,
          kind: 'CONSOLE_LOG',
          fileName: `attempt_${attemptNumber}_quarantined_console.log`,
        });
        const quarantinedRecord = await storageDriver.putArtifact({
          key: quarantinedKey,
          tier: 'RESTRICTED_RAW',
          data: scrubResult.safeContent,
          mimeType: 'text/plain',
        });
        recordUpload(quarantinedRecord, {
          id: randomUUID(),
          investigationId,
          attemptNumber,
          kind: 'CONSOLE_LOG',
          storageTier: 'RESTRICTED_RAW',
          fileName: `attempt_${attemptNumber}_quarantined_console.log`,
          mimeType: 'text/plain',
          sizeBytes: quarantinedRecord.byteSize,
          sha256Checksum: quarantinedRecord.sha256Checksum,
          redactionApplied: scrubResult.redactionsApplied,
          publicUrl: null, // STRICTLY NULL
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        storageFailed = true;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to store quarantined console log: ${msg}`);
      }
    }
  } else {
    hasConsoleLog = false;
    quarantineReasons.push('CONSOLE_LOG_MISSING: Console log telemetry was not provided');
  }

  // ==========================================
  // 3. NETWORK TRACE PROCESSING (VES-EVD-004)
  // ==========================================
  if (typeof input.networkHar === 'string') {
    hasNetworkTrace = true;

    // Substep 3a: Retain raw original in RESTRICTED_RAW (TC-INV-009)
    try {
      const rawNetworkKey = buildStorageKey({
        investigationId,
        attemptNumber,
        kind: 'NETWORK_TRACE',
        fileName: `attempt_${attemptNumber}_raw_network.json`,
      });
      const rawRecord = await storageDriver.putArtifact({
        key: rawNetworkKey,
        tier: 'RESTRICTED_RAW',
        data: input.networkHar,
        mimeType: 'application/json',
      });
      recordUpload(rawRecord, {
        id: randomUUID(),
        investigationId,
        attemptNumber,
        kind: 'NETWORK_TRACE',
        storageTier: 'RESTRICTED_RAW',
        fileName: `attempt_${attemptNumber}_raw_network.json`,
        mimeType: 'application/json',
        sizeBytes: rawRecord.byteSize,
        sha256Checksum: rawRecord.sha256Checksum,
        redactionApplied: false,
        publicUrl: null, // STRICTLY NULL
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      storageFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to store raw network trace: ${msg}`);
      quarantineReasons.push('STORAGE_UPLOAD_ERROR: Raw network trace upload failed');
    }

    // Substep 3b: Parse and sanitize network telemetry
    let isStructured = false;
    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(input.networkHar);
      isStructured = typeof parsedJson === 'object' && parsedJson !== null;
    } catch {
      isStructured = false;
    }

    let safeNetworkText: string;
    let isClean = false;
    let isCompleted = false;
    let redactionApplied = false;

    if (isStructured) {
      const structResult = sanitizeStructuredData(parsedJson, {
        maxSizeBytes: maxNetworkSizeBytes,
      });
      safeNetworkText = JSON.stringify(structResult.safeContent, null, 2);
      isClean = isContentClean(safeNetworkText);
      isCompleted = structResult.scanCompleted && !structResult.truncated;
      redactionApplied = structResult.redactionsApplied;
    } else {
      // Safe fallback for malformed or raw text network traces
      const textResult = sanitizeText(input.networkHar, {
        maxSizeBytes: maxNetworkSizeBytes,
      });
      safeNetworkText = textResult.safeContent;
      isClean = isContentClean(safeNetworkText);
      isCompleted = textResult.scanCompleted && !textResult.truncated;
      redactionApplied = textResult.redactionsApplied;
    }

    if (!isCompleted) {
      secretScrubbingVerified = false;
      quarantineReasons.push('NETWORK_TRACE_TRUNCATED: Network trace exceeded byte size limit; scan was incomplete');
    }

    if (!isClean) {
      secretScrubbingVerified = false;
      quarantineReasons.push('NETWORK_TRACE_RESIDUAL_SECRET: Unredacted sensitive token pattern detected in network trace');
    }

    // Fail-closed gate: Only store in PUBLIC_SAFE if scan was completed AND clean
    if (isCompleted && isClean) {
      try {
        const safeNetworkKey = buildStorageKey({
          investigationId,
          attemptNumber,
          kind: 'NETWORK_TRACE',
          fileName: `attempt_${attemptNumber}_network.json`,
        });
        const safeRecord = await storageDriver.putArtifact({
          key: safeNetworkKey,
          tier: 'PUBLIC_SAFE',
          data: safeNetworkText,
          mimeType: 'application/json',
        });
        recordUpload(safeRecord, {
          id: randomUUID(),
          investigationId,
          attemptNumber,
          kind: 'NETWORK_TRACE',
          storageTier: 'PUBLIC_SAFE',
          fileName: `attempt_${attemptNumber}_network.json`,
          mimeType: 'application/json',
          sizeBytes: safeRecord.byteSize,
          sha256Checksum: safeRecord.sha256Checksum,
          redactionApplied,
          publicUrl: null, // STRICTLY NULL: Authenticated retrieval service belongs to Slice 3
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        storageFailed = true;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to upload sanitized network trace: ${msg}`);
        quarantineReasons.push('STORAGE_UPLOAD_ERROR: Sanitized network trace upload failed');
      }
    } else {
      // Store quarantined derivative in RESTRICTED_RAW with publicUrl: null
      try {
        const quarantinedKey = buildStorageKey({
          investigationId,
          attemptNumber,
          kind: 'NETWORK_TRACE',
          fileName: `attempt_${attemptNumber}_quarantined_network.json`,
        });
        const quarantinedRecord = await storageDriver.putArtifact({
          key: quarantinedKey,
          tier: 'RESTRICTED_RAW',
          data: safeNetworkText,
          mimeType: 'application/json',
        });
        recordUpload(quarantinedRecord, {
          id: randomUUID(),
          investigationId,
          attemptNumber,
          kind: 'NETWORK_TRACE',
          storageTier: 'RESTRICTED_RAW',
          fileName: `attempt_${attemptNumber}_quarantined_network.json`,
          mimeType: 'application/json',
          sizeBytes: quarantinedRecord.byteSize,
          sha256Checksum: quarantinedRecord.sha256Checksum,
          redactionApplied,
          publicUrl: null, // STRICTLY NULL
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        storageFailed = true;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to store quarantined network trace: ${msg}`);
      }
    }
  } else {
    hasNetworkTrace = false;
    quarantineReasons.push('NETWORK_TRACE_MISSING: Network trace telemetry was not provided');
  }

  // ==========================================
  // 4. TRIAD COMPLETENESS & READINESS STATUS
  // ==========================================
  const triadComplete = hasVideo && hasConsoleLog && hasNetworkTrace && !storageFailed;
  const verifiedClean = secretScrubbingVerified && !storageFailed;

  let readinessStatus: EvidenceReadinessStatus;
  if (storageFailed) {
    readinessStatus = 'STORAGE_SYNC_FAILED';
  } else if (!triadComplete || !verifiedClean || quarantineReasons.length > 0) {
    readinessStatus = 'QUARANTINED_LEAK_DETECTED';
  } else {
    readinessStatus = 'PUBLIC_SAFE_READY';
  }

  // Priority 3 & SEC-03 Refinement: Rollback on storage synchronization failure.
  // Deletes any artifacts uploaded prior to the failure using storageDriver.deleteArtifact().
  // If deletion throws or returns false, truthfully retain the orphaned record with publicUrl: null
  // and record diagnostics. Only purge an artifact from records if deleteArtifact returns true.
  if (storageFailed) {
    const remainingStored: StoredArtifactRecord[] = [];
    const remainingMetadata: EvidenceArtifactMetadata[] = [];

    for (const upload of trackedUploads) {
      let deleted = false;
      try {
        deleted = await storageDriver.deleteArtifact(upload.storedRecord.key, upload.storedRecord.tier);
      } catch (cleanupErr) {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        errors.push(`Rollback cleanup exception for ${upload.storedRecord.key}: ${msg}`);
      }

      if (deleted) {
        // Successfully purged from storage; omit from retained records
      } else {
        // Deletion returned false or threw an exception; object remains orphaned in storage.
        // Truthfully retain in records with publicUrl: null and record diagnostics.
        upload.metadata.publicUrl = null;
        remainingStored.push(upload.storedRecord);
        remainingMetadata.push(upload.metadata);
        errors.push(
          `Rollback cleanup failed: Artifact "${upload.storedRecord.key}" could not be deleted from ${upload.storedRecord.tier} and remains orphaned in storage.`
        );
        quarantineReasons.push(
          `STORAGE_CLEANUP_FAILED: Artifact "${upload.storedRecord.key}" remained in ${upload.storedRecord.tier} storage after rollback failure`
        );
      }
    }

    storedArtifacts.length = 0;
    storedArtifacts.push(...remainingStored);

    manifestArtifacts.length = 0;
    manifestArtifacts.push(...remainingMetadata);
  }

  // Priority 2 Remediation: Prevent URL exposure for quarantined or failed evidence
  // A manifest with QUARANTINED_LEAK_DETECTED or STORAGE_SYNC_FAILED must not expose any artifact through a non-null publicUrl.
  if (readinessStatus === 'QUARANTINED_LEAK_DETECTED' || readinessStatus === 'STORAGE_SYNC_FAILED') {
    for (const artifact of manifestArtifacts) {
      artifact.publicUrl = null;
    }
  }

  const manifest: EvidenceManifest = {
    investigationId,
    readinessStatus,
    artifacts: manifestArtifacts,
    triadComplete,
    hasVideo,
    hasConsoleLog,
    hasNetworkTrace,
    secretScrubbingVerified: verifiedClean,
    quarantineReasons: quarantineReasons.length > 0 ? quarantineReasons : undefined,
    generatedAt: new Date().toISOString(),
  };

  // Strictly validate the resulting manifest against canonical schema
  const validation = EvidenceManifestSchema.safeParse(manifest);
  if (!validation.success) {
    throw new Error(
      `[TraceCase Internal Error] Evidence manifest violates EvidenceManifestSchema: ${JSON.stringify(validation.error.issues)}`
    );
  }

  return {
    manifest,
    storedArtifacts,
    quarantineApplied: quarantineReasons.length > 0,
    errors,
  };
}
