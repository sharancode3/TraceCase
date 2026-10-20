import { z } from 'zod';
import { EvidenceReadinessStatusSchema } from './status';

export const ArtifactKindSchema = z.enum([
  'REPORTER_ATTACHMENT',
  'VIDEO_RECORDING',
  'CONSOLE_LOG',
  'NETWORK_TRACE',
  'SCREENSHOT',
  'SYNTHESIS_REPORT',
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const StorageTierSchema = z.enum([
  'PUBLIC_SAFE',
  'RESTRICTED_RAW',
]);
export type StorageTier = z.infer<typeof StorageTierSchema>;

/**
 * Capture registration command dispatched by the browser execution worker.
 * Uses worker-local disk references, avoiding passing large in-memory buffers across APIs.
 */
export const CaptureRegistrationCommandSchema = z.object({
  investigationId: z.string().uuid(),
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  kind: ArtifactKindSchema,
  localTempPath: z.string().min(1),
  mimeType: z.string(),
  capturedAt: z.string().datetime(),
}).strict();
export type CaptureRegistrationCommand = z.infer<typeof CaptureRegistrationCommandSchema>;

/**
 * Finalized capture reference returned by the capture subsystem.
 */
export const FinalizedCaptureReferenceSchema = z.object({
  captureId: z.string().uuid(),
  investigationId: z.string().uuid(),
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  kind: ArtifactKindSchema,
  storageRef: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256Checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  capturedAt: z.string().datetime(),
});
export type FinalizedCaptureReference = z.infer<typeof FinalizedCaptureReferenceSchema>;

/**
 * Capture coverage receipt.
 * Explicitly separates successfully captured empty logs from capture failures,
 * and tracks video context finalization integrity.
 */
export const CaptureCoverageReceiptSchema = z.object({
  investigationId: z.string().uuid(),
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  hasVideoRecording: z.boolean(),
  videoStatus: z.enum(['FINALIZED', 'MISSING', 'UNFINALIZED_CORRUPT', 'CONTEXT_CRASH']),
  hasConsoleLogs: z.boolean(),
  consoleStatus: z.enum(['CAPTURED_WITH_ENTRIES', 'CAPTURED_EMPTY', 'CAPTURE_FAILED', 'UNAVAILABLE']),
  hasNetworkTrace: z.boolean(),
  networkStatus: z.enum(['CAPTURED_WITH_REQUESTS', 'CAPTURED_EMPTY', 'CAPTURE_FAILED', 'UNAVAILABLE']),
  coverageComplete: z.boolean(),
});
export type CaptureCoverageReceipt = z.infer<typeof CaptureCoverageReceiptSchema>;

/**
 * Processing result produced by Person 3's sanitization and storage service.
 */
export const ArtifactProcessingResultSchema = z.object({
  artifactId: z.string().uuid(),
  investigationId: z.string().uuid(),
  kind: ArtifactKindSchema,
  originalTier: StorageTierSchema,
  publishedTier: StorageTierSchema,
  redactionApplied: z.boolean(),
  redactionDetails: z.object({
    tokensMasked: z.number().int().nonnegative(),
    piiMasked: z.number().int().nonnegative(),
  }).optional(),
  isEligibleForSharing: z.boolean(),
  quarantineReason: z.string().optional(),
});
export type ArtifactProcessingResult = z.infer<typeof ArtifactProcessingResultSchema>;

/**
 * Temporary authorized access grant.
 * Replaces hardcoded public URLs with time-limited signed grants.
 */
export const ArtifactAccessGrantSchema = z.object({
  grantId: z.string().uuid(),
  artifactId: z.string().uuid(),
  authorizedUserId: z.string(),
  storageTier: StorageTierSchema,
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type ArtifactAccessGrant = z.infer<typeof ArtifactAccessGrantSchema>;

/**
 * Legacy artifact metadata schema.
 * Preserved for preview fixtures and UI compatibility.
 */
export const EvidenceArtifactMetadataSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  attemptNumber: z.number().int().min(1).max(2).nullable(),
  kind: ArtifactKindSchema,
  storageTier: StorageTierSchema,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256Checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  redactionApplied: z.boolean(),
  publicUrl: z.string().url().nullable(), // Null for RESTRICTED_RAW
  createdAt: z.string().datetime(),
});
export type EvidenceArtifactMetadata = z.infer<typeof EvidenceArtifactMetadataSchema>;

/**
 * Legacy evidence manifest schema.
 * Preserved for preview fixtures.
 */
export const EvidenceManifestSchema = z.object({
  investigationId: z.string().uuid(),
  readinessStatus: EvidenceReadinessStatusSchema,
  artifacts: z.array(EvidenceArtifactMetadataSchema),
  triadComplete: z.boolean(),
  hasVideo: z.boolean(),
  hasConsoleLog: z.boolean(),
  hasNetworkTrace: z.boolean(),
  secretScrubbingVerified: z.boolean(),
  quarantineReasons: z.array(z.string()).optional(),
  generatedAt: z.string().datetime(),
});
export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
