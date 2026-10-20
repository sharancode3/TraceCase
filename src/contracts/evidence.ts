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
  publicUrl: z.string().url().nullable(), // Null for RESTRICTED_RAW to prevent accidental disclosure
  createdAt: z.string().datetime(),
});
export type EvidenceArtifactMetadata = z.infer<typeof EvidenceArtifactMetadataSchema>;

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
