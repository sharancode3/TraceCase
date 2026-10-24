/**
 * TraceCase — Evidence Storage Adapter and Checksum Utility (P3-03 / Slice 1)
 *
 * Provides cryptographic integrity checks, strict storage key validation,
 * and dual-bucket separation (RESTRICTED_RAW vs PUBLIC_SAFE) for evidence artifacts.
 *
 * Implements:
 * - TC-INV-009: In-Stream Redaction & Dual-Bucket Quarantining
 * - TC-INV-012: Mandatory Evidence Triad Byte Integrity (SHA-256)
 * - Strict path-traversal prevention for artifact object keys
 * - In-memory storage driver for local development and deterministic testing
 * - S3-compatible driver contract matching existing server environment config
 */

import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageTier, ArtifactKind } from '@/contracts/evidence';
import { StorageTierSchema, ArtifactKindSchema } from '@/contracts/evidence';
import { getServerEnv } from '@/server/config/env';

/**
 * Custom error thrown when an artifact storage key violates path or security invariants.
 */
export class InvalidStorageKeyError extends Error {
  constructor(message: string, public readonly key: string) {
    super(`[TraceCase Security] Invalid artifact storage key "${key}": ${message}`);
    this.name = 'InvalidStorageKeyError';
  }
}

/**
 * Custom error thrown when a requested artifact does not exist in the specified tier bucket.
 */
export class ArtifactNotFoundError extends Error {
  constructor(public readonly key: string, public readonly tier: StorageTier) {
    super(`[TraceCase Storage] Artifact "${key}" not found in storage tier "${tier}".`);
    this.name = 'ArtifactNotFoundError';
  }
}

/**
 * Custom error thrown when an overwrite is attempted on an immutable evidence artifact.
 */
export class ArtifactCollisionError extends Error {
  constructor(public readonly key: string, public readonly tier: StorageTier) {
    super(`[TraceCase Storage] Artifact "${key}" already exists in storage tier "${tier}" and overwrite is prohibited.`);
    this.name = 'ArtifactCollisionError';
  }
}

/**
 * Result of computing SHA-256 integrity and exact byte size.
 */
export interface ChecksumResult {
  /** 64-character lowercase hexadecimal SHA-256 digest */
  sha256Checksum: string;
  /** Exact size in bytes */
  byteSize: number;
}

/**
 * Computes the cryptographic SHA-256 digest and exact byte size of an artifact payload.
 * Pure function with zero side effects.
 */
export function computeSha256(data: Buffer | Uint8Array | string): ChecksumResult {
  const hash = createHash('sha256');
  let byteSize: number;

  if (typeof data === 'string') {
    byteSize = Buffer.byteLength(data, 'utf8');
    hash.update(data, 'utf8');
  } else if (Buffer.isBuffer(data)) {
    byteSize = data.length;
    hash.update(data);
  } else {
    byteSize = data.byteLength;
    hash.update(data);
  }

  const sha256Checksum = hash.digest('hex').toLowerCase();
  return { sha256Checksum, byteSize };
}

/**
 * Verifies that a payload matches an expected SHA-256 digest in constant time.
 */
export function verifySha256(data: Buffer | Uint8Array | string, expectedChecksum: string): boolean {
  if (!expectedChecksum || expectedChecksum.length !== 64) {
    return false;
  }
  const { sha256Checksum } = computeSha256(data);
  try {
    const actualBuf = Buffer.from(sha256Checksum, 'hex');
    const expectedBuf = Buffer.from(expectedChecksum.toLowerCase(), 'hex');
    if (actualBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Canonical regular expression for strict artifact storage keys.
 * Structure:
 *   investigations/{uuid}/attempts/{1|2}/{fileName}
 *   or investigations/{uuid}/{fileName}
 */
const STORAGE_KEY_REGEX = /^investigations\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(\/attempts\/[12])?\/[a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+$/;

/**
 * Strictly validates an artifact storage key to prevent path traversal,
 * cross-investigation pollution, leading slashes, and malformed identifiers.
 *
 * @throws {InvalidStorageKeyError} If key fails any security rule
 */
export function validateStorageKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new InvalidStorageKeyError('Key must be a non-empty string', String(key));
  }

  // Reject leading slashes or backslashes
  if (key.startsWith('/') || key.startsWith('\\')) {
    throw new InvalidStorageKeyError('Key must not begin with a slash or backslash', key);
  }

  // Reject null bytes or control characters
  if (/[\0\r\n\t]/.test(key)) {
    throw new InvalidStorageKeyError('Key contains invalid control characters or null bytes', key);
  }

  // Reject directory traversal
  if (key.includes('..') || key.includes('//') || key.includes('\\')) {
    throw new InvalidStorageKeyError('Key contains illegal path traversal characters (.., //, or \\)', key);
  }

  // Reject URL query strings or hash fragments
  if (key.includes('?') || key.includes('#')) {
    throw new InvalidStorageKeyError('Key must not contain URL query parameters or fragments', key);
  }

  // Must match canonical scoped hierarchy
  if (!STORAGE_KEY_REGEX.test(key)) {
    throw new InvalidStorageKeyError('Key does not conform to canonical format investigations/{id}/[attempts/{num}/]{file}.{ext}', key);
  }
}

/**
 * Parameters for building a canonical, scoped storage key.
 */
export interface BuildStorageKeyParams {
  investigationId: string;
  attemptNumber?: 1 | 2 | null;
  kind: ArtifactKind;
  fileName?: string;
  artifactId?: string;
}

const DEFAULT_EXTENSIONS: Record<ArtifactKind, string> = {
  VIDEO_RECORDING: 'webm',
  CONSOLE_LOG: 'log',
  NETWORK_TRACE: 'json',
  SCREENSHOT: 'png',
  SYNTHESIS_REPORT: 'md',
  REPORTER_ATTACHMENT: 'bin',
};

/**
 * Safely constructs a canonical scoped storage key from typed parameters.
 */
export function buildStorageKey(params: BuildStorageKeyParams): string {
  const { investigationId, attemptNumber, kind, fileName, artifactId } = params;

  // Validate kind against canonical enum
  const kindParse = ArtifactKindSchema.safeParse(kind);
  if (!kindParse.success) {
    throw new InvalidStorageKeyError(`Unsupported artifact kind "${kind}"`, String(kind));
  }

  const ext = DEFAULT_EXTENSIONS[kind] || 'bin';
  let baseName: string;

  if (fileName) {
    // Sanitize caller-supplied fileName to alphanumeric, dashes, dots, underscores
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9_\-.]/g, '_');
    baseName = cleanFileName.includes('.') ? cleanFileName : `${cleanFileName}.${ext}`;
  } else if (artifactId) {
    baseName = `${artifactId}.${ext}`;
  } else {
    const kindLower = kind.toLowerCase().replace(/_/g, '-');
    baseName = `${kindLower}.${ext}`;
  }

  let key: string;
  if (attemptNumber === 1 || attemptNumber === 2) {
    key = `investigations/${investigationId}/attempts/${attemptNumber}/${baseName}`;
  } else {
    key = `investigations/${investigationId}/${baseName}`;
  }

  validateStorageKey(key);
  return key;
}

/**
 * Resolves the target S3/MinIO bucket name for a given storage tier based on server configuration.
 */
export function resolveBucketName(tier: StorageTier): string {
  const tierParse = StorageTierSchema.safeParse(tier);
  if (!tierParse.success) {
    throw new Error(`[TraceCase Storage] Invalid storage tier: "${tier}".`);
  }

  const env = getServerEnv();
  return tier === 'RESTRICTED_RAW' ? env.S3_BUCKET_RESTRICTED : env.S3_BUCKET_PUBLIC;
}

/**
 * Immutable metadata record for an artifact held in storage.
 */
export interface StoredArtifactRecord {
  key: string;
  tier: StorageTier;
  bucket: string;
  data: Buffer;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  storedAt: string;
}

/**
 * Options for uploading or storing an artifact.
 */
export interface PutArtifactOptions {
  key: string;
  tier: StorageTier;
  data: Buffer | Uint8Array | string;
  mimeType: string;
  /** Whether to allow replacing an existing artifact with the same key. Defaults to false. */
  allowOverwrite?: boolean;
}

/**
 * Result returned when retrieving an artifact from storage.
 */
export interface GetArtifactResult {
  key: string;
  tier: StorageTier;
  bucket: string;
  data: Buffer;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  storedAt: string;
}

/**
 * Generic interface for evidence storage drivers.
 * Suitable for both in-memory unit testing and real S3/MinIO drivers.
 */
export interface EvidenceStorageDriver {
  putArtifact(options: PutArtifactOptions): Promise<StoredArtifactRecord>;
  getArtifact(key: string, tier: StorageTier): Promise<GetArtifactResult | null>;
  hasArtifact(key: string, tier: StorageTier): Promise<boolean>;
  deleteArtifact(key: string, tier: StorageTier): Promise<boolean>;
  listArtifacts(prefix: string, tier: StorageTier): Promise<string[]>;
  clear?(): Promise<void>;
}

/**
 * Deterministic in-memory evidence storage driver.
 *
 * Implements strict bucket isolation:
 * - `RESTRICTED_RAW` objects are stored in an isolated internal bucket map.
 * - `PUBLIC_SAFE` objects are stored in a separate bucket map.
 * - Querying `PUBLIC_SAFE` for an object in `RESTRICTED_RAW` returns null.
 * - Enforces immutable evidence write semantics (no silent overwrite unless explicitly authorized).
 * - Never logs secret contents or raw payload bytes.
 */
export class InMemoryEvidenceStorageDriver implements EvidenceStorageDriver {
  private readonly restrictedBucket = new Map<string, StoredArtifactRecord>();
  private readonly publicSafeBucket = new Map<string, StoredArtifactRecord>();

  private getBucketMap(tier: StorageTier): Map<string, StoredArtifactRecord> {
    return tier === 'RESTRICTED_RAW' ? this.restrictedBucket : this.publicSafeBucket;
  }

  async putArtifact(options: PutArtifactOptions): Promise<StoredArtifactRecord> {
    const { key, tier, data, mimeType, allowOverwrite = false } = options;

    validateStorageKey(key);
    const bucket = resolveBucketName(tier);
    const bucketMap = this.getBucketMap(tier);

    if (bucketMap.has(key) && !allowOverwrite) {
      throw new ArtifactCollisionError(key, tier);
    }

    const { sha256Checksum, byteSize } = computeSha256(data);

    let bufferData: Buffer;
    if (Buffer.isBuffer(data)) {
      bufferData = Buffer.from(data);
    } else if (typeof data === 'string') {
      bufferData = Buffer.from(data, 'utf8');
    } else {
      bufferData = Buffer.from(data);
    }

    const record: StoredArtifactRecord = {
      key,
      tier,
      bucket,
      data: bufferData,
      mimeType,
      byteSize,
      sha256Checksum,
      storedAt: new Date().toISOString(),
    };

    bucketMap.set(key, record);
    return record;
  }

  async getArtifact(key: string, tier: StorageTier): Promise<GetArtifactResult | null> {
    validateStorageKey(key);
    const bucketMap = this.getBucketMap(tier);
    const record = bucketMap.get(key);

    if (!record) {
      return null;
    }

    // Return defensive clone of data buffer to prevent caller mutations
    return {
      ...record,
      data: Buffer.from(record.data),
    };
  }

  async hasArtifact(key: string, tier: StorageTier): Promise<boolean> {
    validateStorageKey(key);
    return this.getBucketMap(tier).has(key);
  }

  async deleteArtifact(key: string, tier: StorageTier): Promise<boolean> {
    validateStorageKey(key);
    return this.getBucketMap(tier).delete(key);
  }

  async listArtifacts(prefix: string, tier: StorageTier): Promise<string[]> {
    const bucketMap = this.getBucketMap(tier);
    const results: string[] = [];

    for (const key of bucketMap.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        results.push(key);
      }
    }

    return results.sort();
  }

  async clear(): Promise<void> {
    this.restrictedBucket.clear();
    this.publicSafeBucket.clear();
  }
}

/**
 * Persistent on-disk evidence storage driver.
 *
 * Implements strict bucket isolation on the local filesystem:
 * - RESTRICTED_RAW stored in <baseDir>/restricted_raw/
 * - PUBLIC_SAFE stored in <baseDir>/public_safe/
 * - Atomic writes via temporary files and rename
 * - Preserves artifacts across process restarts and enables multi-process access (Web <-> Worker)
 * - Validates keys against path traversal
 */
export class PersistentDiskEvidenceStorageDriver implements EvidenceStorageDriver {
  private readonly baseDir: string;
  private readonly restrictedDir: string;
  private readonly publicSafeDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.env.TRACECASE_STORAGE_DIR || path.resolve(process.cwd(), '.tracecase-storage');
    this.restrictedDir = path.resolve(this.baseDir, 'restricted_raw');
    this.publicSafeDir = path.resolve(this.baseDir, 'public_safe');
  }

  private getTierDir(tier: StorageTier): string {
    return tier === 'RESTRICTED_RAW' ? this.restrictedDir : this.publicSafeDir;
  }

  private resolveKeyPath(key: string, tier: StorageTier): string {
    validateStorageKey(key);
    const tierDir = this.getTierDir(tier);
    const normalizedKey = key.split('/').join(path.sep);
    const resolved = path.resolve(tierDir, normalizedKey);
    if (!resolved.startsWith(tierDir + path.sep) && resolved !== tierDir) {
      throw new InvalidStorageKeyError(`Path traversal detected: "${key}"`, key);
    }
    return resolved;
  }

  async putArtifact(options: PutArtifactOptions): Promise<StoredArtifactRecord> {
    const { key, tier, data, mimeType, allowOverwrite = false } = options;
    validateStorageKey(key);
    const filePath = this.resolveKeyPath(key, tier);

    try {
      await fs.stat(filePath);
      if (!allowOverwrite) {
        throw new ArtifactCollisionError(key, tier);
      }
    } catch (err: unknown) {
      if (err instanceof ArtifactCollisionError) throw err;
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let bufferData: Buffer;
    if (Buffer.isBuffer(data)) {
      bufferData = Buffer.from(data);
    } else if (typeof data === 'string') {
      bufferData = Buffer.from(data, 'utf8');
    } else {
      bufferData = Buffer.from(data);
    }

    const { byteSize, sha256Checksum } = computeSha256(bufferData);
    const storedAt = new Date().toISOString();

    const tempPath = `${filePath}.tmp.${randomUUID()}`;
    await fs.writeFile(tempPath, bufferData);
    try {
      await fs.rename(tempPath, filePath);
    } catch {
      // Windows NTFS atomic replace fallback when file already exists
      try {
        await fs.unlink(filePath);
        await fs.rename(tempPath, filePath);
      } catch {
        await fs.copyFile(tempPath, filePath);
        await fs.unlink(tempPath);
      }
    }

    const metaPath = `${filePath}.meta.json`;
    const meta = { key, tier, mimeType, byteSize, sha256Checksum, storedAt };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    return {
      key,
      tier,
      bucket: resolveBucketName(tier),
      data: bufferData,
      mimeType,
      byteSize,
      sha256Checksum,
      storedAt,
    };
  }

  async getArtifact(key: string, tier: StorageTier): Promise<GetArtifactResult | null> {
    validateStorageKey(key);
    const filePath = this.resolveKeyPath(key, tier);

    try {
      await fs.stat(filePath);
    } catch {
      return null;
    }

    const data = await fs.readFile(filePath);

    let mimeType = 'application/octet-stream';
    let storedAt = new Date().toISOString();
    try {
      const metaText = await fs.readFile(`${filePath}.meta.json`, 'utf8');
      const meta = JSON.parse(metaText);
      mimeType = meta.mimeType || mimeType;
      storedAt = meta.storedAt || storedAt;
    } catch {
      // Fallback if sidecar metadata is absent
    }

    const { byteSize, sha256Checksum } = computeSha256(data);
    return {
      key,
      tier,
      bucket: resolveBucketName(tier),
      data,
      mimeType,
      byteSize,
      sha256Checksum,
      storedAt,
    };
  }

  async hasArtifact(key: string, tier: StorageTier): Promise<boolean> {
    validateStorageKey(key);
    const filePath = this.resolveKeyPath(key, tier);
    try {
      await fs.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteArtifact(key: string, tier: StorageTier): Promise<boolean> {
    validateStorageKey(key);
    const filePath = this.resolveKeyPath(key, tier);
    try {
      await fs.unlink(filePath);
      await fs.unlink(`${filePath}.meta.json`).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async listArtifacts(prefix: string, tier: StorageTier): Promise<string[]> {
    const tierDir = this.getTierDir(tier);
    const results: string[] = [];

    async function walk(dir: string, base: string) {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.endsWith('.meta.json') || entry.includes('.tmp.')) continue;
        const fullPath = path.join(dir, entry);
        const relPath = path.join(base, entry);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            await walk(fullPath, relPath);
          } else {
            const key = relPath.split(path.sep).join('/');
            if (!prefix || key.startsWith(prefix)) {
              results.push(key);
            }
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    await walk(tierDir, '');
    return results.sort();
  }

  async clear(): Promise<void> {
    await fs.rm(this.restrictedDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(this.publicSafeDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * S3-compatible configuration contract for remote object storage drivers.
 * Uses existing environment keys declared in ServerEnv without adding dependencies.
 */
export interface S3CompatibleStorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  publicBucket: string;
  restrictedBucket: string;
}

/**
 * Extracts and returns the S3-compatible storage configuration from the server environment.
 */
export function getS3StorageConfig(): S3CompatibleStorageConfig {
  const env = getServerEnv();
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    publicBucket: env.S3_BUCKET_PUBLIC,
    restrictedBucket: env.S3_BUCKET_RESTRICTED,
  };
}

/**
 * Operational S3-compatible object storage driver implementing AWS Signature Version 4 (SigV4).
 * Supports AWS S3, Cloudflare R2, MinIO, Wasabi, and DigitalOcean Spaces without external SDK dependencies.
 *
 * Implements strict dual-bucket isolation:
 * - RESTRICTED_RAW stored in S3_BUCKET_RESTRICTED
 * - PUBLIC_SAFE stored in S3_BUCKET_PUBLIC
 * - Path traversal validation on all storage keys
 * - Cryptographic SHA-256 integrity computation and byte accounting
 */
export class S3EvidenceStorageDriver implements EvidenceStorageDriver {
  private readonly config: S3CompatibleStorageConfig;

  constructor(config?: Partial<S3CompatibleStorageConfig>) {
    const defaultConfig = getS3StorageConfig();
    this.config = {
      endpoint: config?.endpoint || defaultConfig.endpoint,
      region: config?.region || defaultConfig.region || 'us-east-1',
      accessKey: config?.accessKey || defaultConfig.accessKey,
      secretKey: config?.secretKey || defaultConfig.secretKey,
      publicBucket: config?.publicBucket || defaultConfig.publicBucket,
      restrictedBucket: config?.restrictedBucket || defaultConfig.restrictedBucket,
    };
  }

  private getBucketName(tier: StorageTier): string {
    return tier === 'RESTRICTED_RAW' ? this.config.restrictedBucket : this.config.publicBucket;
  }

  private buildUrl(tier: StorageTier, key: string): URL {
    const bucket = this.getBucketName(tier);
    const base = this.config.endpoint.replace(/\/+$/, '');
    return new URL(`${base}/${bucket}/${key}`);
  }

  private getSigV4Headers(
    method: string,
    url: URL,
    payloadSha256: string,
    contentType?: string
  ): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadSha256,
    };
    if (contentType) {
      headers['content-type'] = contentType;
    }

    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(';');
    const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join('');

    const canonicalRequest = [
      method,
      url.pathname,
      url.searchParams.toString(),
      canonicalHeaders,
      signedHeaders,
      payloadSha256,
    ].join('\n');

    const canonicalRequestHash = createHash('sha256').update(canonicalRequest).digest('hex');
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    const kDate = createHmac('sha256', `AWS4${this.config.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.config.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${this.config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return headers;
  }

  async putArtifact(options: PutArtifactOptions): Promise<StoredArtifactRecord> {
    const { key, tier, data, mimeType, allowOverwrite = false } = options;
    validateStorageKey(key);

    if (!allowOverwrite) {
      const exists = await this.hasArtifact(key, tier);
      if (exists) {
        throw new ArtifactCollisionError(key, tier);
      }
    }

    let bufferData: Buffer;
    if (Buffer.isBuffer(data)) {
      bufferData = Buffer.from(data);
    } else if (typeof data === 'string') {
      bufferData = Buffer.from(data, 'utf8');
    } else {
      bufferData = Buffer.from(data);
    }

    const { sha256Checksum, byteSize } = computeSha256(bufferData);
    const url = this.buildUrl(tier, key);
    const headers = this.getSigV4Headers('PUT', url, sha256Checksum, mimeType);

    const res = await fetch(url.toString(), {
      method: 'PUT',
      headers,
      body: new Uint8Array(bufferData),
    });

    if (!res.ok) {
      throw new Error(`[S3 Storage] Failed to put artifact "${key}" (${res.status} ${res.statusText})`);
    }

    return {
      key,
      tier,
      bucket: this.getBucketName(tier),
      data: bufferData,
      mimeType,
      byteSize,
      sha256Checksum,
      storedAt: new Date().toISOString(),
    };
  }

  async getArtifact(key: string, tier: StorageTier): Promise<GetArtifactResult | null> {
    validateStorageKey(key);
    const url = this.buildUrl(tier, key);
    const emptySha256 = createHash('sha256').update('').digest('hex');
    const headers = this.getSigV4Headers('GET', url, emptySha256);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`[S3 Storage] Failed to get artifact "${key}" (${res.status} ${res.statusText})`);
    }

    const arrayBuf = await res.arrayBuffer();
    const data = Buffer.from(arrayBuf);
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    const { sha256Checksum, byteSize } = computeSha256(data);

    return {
      key,
      tier,
      bucket: this.getBucketName(tier),
      data,
      mimeType,
      byteSize,
      sha256Checksum,
      storedAt: res.headers.get('last-modified') || new Date().toISOString(),
    };
  }

  async hasArtifact(key: string, tier: StorageTier): Promise<boolean> {
    validateStorageKey(key);
    const url = this.buildUrl(tier, key);
    const emptySha256 = createHash('sha256').update('').digest('hex');
    const headers = this.getSigV4Headers('HEAD', url, emptySha256);

    const res = await fetch(url.toString(), {
      method: 'HEAD',
      headers,
    });

    if (res.status === 200) return true;
    if (res.status === 404) return false;
    return false;
  }

  async deleteArtifact(key: string, tier: StorageTier): Promise<boolean> {
    validateStorageKey(key);
    const url = this.buildUrl(tier, key);
    const emptySha256 = createHash('sha256').update('').digest('hex');
    const headers = this.getSigV4Headers('DELETE', url, emptySha256);

    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers,
    });

    return res.ok || res.status === 404;
  }

  async listArtifacts(prefix: string, tier: StorageTier): Promise<string[]> {
    const bucket = this.getBucketName(tier);
    const base = this.config.endpoint.replace(/\/+$/, '');
    const url = new URL(`${base}/${bucket}?list-type=2&prefix=${encodeURIComponent(prefix || '')}`);
    const emptySha256 = createHash('sha256').update('').digest('hex');
    const headers = this.getSigV4Headers('GET', url, emptySha256);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      return [];
    }

    const xml = await res.text();
    const keys: string[] = [];
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(xml)) !== null) {
      if (match[1]) {
        keys.push(match[1]);
      }
    }
    return keys.sort();
  }
}

let defaultDriverInstance: EvidenceStorageDriver | null = null;

/**
 * Returns the active evidence storage driver.
 * Uses persistent disk storage by default for multi-process cross-boundary persistence,
 * falling back to in-memory only when TRACECASE_FORCE_IN_MEMORY_STORAGE is set,
 * or S3 object storage when STORAGE_DRIVER is configured as 's3' or S3 credentials are provided.
 */
export function getEvidenceStorageDriver(): EvidenceStorageDriver {
  if (!defaultDriverInstance) {
    const driverType = process.env.STORAGE_DRIVER?.toLowerCase();
    const hasS3Config = Boolean(
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY &&
      process.env.S3_BUCKET_PUBLIC
    );

    if (process.env.TRACECASE_FORCE_IN_MEMORY_STORAGE === 'true') {
      defaultDriverInstance = new InMemoryEvidenceStorageDriver();
    } else if (driverType === 's3' || (hasS3Config && driverType !== 'disk')) {
      defaultDriverInstance = new S3EvidenceStorageDriver();
    } else {
      defaultDriverInstance = new PersistentDiskEvidenceStorageDriver();
    }
  }
  return defaultDriverInstance;
}

/**
 * Explicitly sets the driver instance for testing.
 */
export function setEvidenceStorageDriverForTesting(driver: EvidenceStorageDriver | null): void {
  defaultDriverInstance = driver;
}

/**
 * Resets the default driver instance (useful between isolated test suites).
 */
export function resetEvidenceStorageDriver(): void {
  defaultDriverInstance = null;
}
