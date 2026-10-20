import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeSha256,
  verifySha256,
  validateStorageKey,
  buildStorageKey,
  resolveBucketName,
  InMemoryEvidenceStorageDriver,
  InvalidStorageKeyError,
  ArtifactCollisionError,
  getS3StorageConfig,
} from '@/server/evidence/storage';

describe('Evidence Storage Adapter and Checksum Utility (P3-03 / Slice 1)', () => {
  let driver: InMemoryEvidenceStorageDriver;

  beforeEach(() => {
    driver = new InMemoryEvidenceStorageDriver();
  });

  describe('Cryptographic SHA-256 Digest and Exact Byte Counting', () => {
    it('computes exact 64-character lowercase SHA-256 digest and byte size for ASCII text', () => {
      // Known RFC test vector: "hello world" -> b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
      const data = 'hello world';
      const result = computeSha256(data);

      expect(result.sha256Checksum).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
      expect(result.sha256Checksum).toHaveLength(64);
      expect(result.byteSize).toBe(11);
    });

    it('measures exact UTF-8 byte sizes for multibyte Unicode and emojis', () => {
      // Emoji 🔥 is 4 UTF-8 bytes and 2 UTF-16 code units
      const emojiString = 'TraceCase-🔥-Defect';
      const result = computeSha256(emojiString);

      // 'TraceCase-' (10) + '🔥' (4) + '-Defect' (7) = 21 UTF-8 bytes
      expect(result.byteSize).toBe(21);
      expect(result.sha256Checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('computes identical hashes for matching Buffer and string data', () => {
      const text = 'network_trace_telemetry_receipt_2026';
      const buffer = Buffer.from(text, 'utf8');

      const stringResult = computeSha256(text);
      const bufferResult = computeSha256(buffer);

      expect(stringResult.sha256Checksum).toBe(bufferResult.sha256Checksum);
      expect(stringResult.byteSize).toBe(bufferResult.byteSize);
    });

    it('verifySha256 correctly validates matching digests and rejects mismatched or corrupt hashes', () => {
      const payload = 'session_log_data_payload';
      const { sha256Checksum } = computeSha256(payload);

      expect(verifySha256(payload, sha256Checksum)).toBe(true);
      expect(verifySha256(payload, sha256Checksum.toUpperCase())).toBe(true); // Case-insensitive
      expect(verifySha256(payload, '0'.repeat(64))).toBe(false); // Wrong hash
      expect(verifySha256(payload, 'too-short')).toBe(false); // Invalid length
      expect(verifySha256('different_payload', sha256Checksum)).toBe(false); // Altered data
    });
  });

  describe('Storage Key Construction and Strict Security Validation', () => {
    const validUuid = 'b22ac10b-58cc-4372-a567-0e02b2c3d402';

    it('buildStorageKey constructs valid canonical scoped keys for attempt-specific artifacts', () => {
      const key = buildStorageKey({
        investigationId: validUuid,
        attemptNumber: 1,
        kind: 'VIDEO_RECORDING',
      });

      expect(key).toBe(`investigations/${validUuid}/attempts/1/video-recording.webm`);
      expect(() => validateStorageKey(key)).not.toThrow();
    });

    it('buildStorageKey constructs valid top-level scoped keys for investigation artifacts', () => {
      const key = buildStorageKey({
        investigationId: validUuid,
        kind: 'SYNTHESIS_REPORT',
      });

      expect(key).toBe(`investigations/${validUuid}/synthesis-report.md`);
      expect(() => validateStorageKey(key)).not.toThrow();
    });

    it('strictly rejects path traversal sequences (..)', () => {
      const maliciousKey = `investigations/${validUuid}/attempts/1/../../etc/passwd.log`;
      expect(() => validateStorageKey(maliciousKey)).toThrow(InvalidStorageKeyError);
    });

    it('strictly rejects leading slashes or Windows backslashes', () => {
      expect(() => validateStorageKey(`/investigations/${validUuid}/attempts/1/video.webm`)).toThrow(InvalidStorageKeyError);
      expect(() => validateStorageKey(`\\investigations\\${validUuid}\\attempts\\1\\video.webm`)).toThrow(InvalidStorageKeyError);
    });

    it('strictly rejects URL query strings and hash fragments', () => {
      expect(() => validateStorageKey(`investigations/${validUuid}/attempts/1/video.webm?token=leak`)).toThrow(InvalidStorageKeyError);
      expect(() => validateStorageKey(`investigations/${validUuid}/attempts/1/video.webm#fragment`)).toThrow(InvalidStorageKeyError);
    });

    it('strictly rejects non-UUID investigation identifiers', () => {
      expect(() => validateStorageKey('investigations/not-a-valid-uuid/attempts/1/video.webm')).toThrow(InvalidStorageKeyError);
    });

    it('strictly rejects invalid attempt numbers (e.g. 0, 3, 99)', () => {
      expect(() => validateStorageKey(`investigations/${validUuid}/attempts/3/video.webm`)).toThrow(InvalidStorageKeyError);
      expect(() => validateStorageKey(`investigations/${validUuid}/attempts/0/video.webm`)).toThrow(InvalidStorageKeyError);
    });
  });

  describe('Storage Driver Operations and Immutability', () => {
    const validKey = 'investigations/b22ac10b-58cc-4372-a567-0e02b2c3d402/attempts/1/console-log.log';

    it('stores and retrieves artifacts with exact byte integrity', async () => {
      const content = 'Test console log line 1\nTest console log line 2\n';
      const stored = await driver.putArtifact({
        key: validKey,
        tier: 'PUBLIC_SAFE',
        data: content,
        mimeType: 'text/plain',
      });

      expect(stored.key).toBe(validKey);
      expect(stored.tier).toBe('PUBLIC_SAFE');
      expect(stored.byteSize).toBe(Buffer.byteLength(content, 'utf8'));
      expect(stored.sha256Checksum).toMatch(/^[a-f0-9]{64}$/);

      const retrieved = await driver.getArtifact(validKey, 'PUBLIC_SAFE');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.data.toString('utf8')).toBe(content);
      expect(retrieved?.sha256Checksum).toBe(stored.sha256Checksum);
    });

    it('defensively clones retrieved data buffers so external mutations do not affect storage', async () => {
      const initial = 'Immutable initial data';
      await driver.putArtifact({
        key: validKey,
        tier: 'PUBLIC_SAFE',
        data: initial,
        mimeType: 'text/plain',
      });

      const retrieved1 = await driver.getArtifact(validKey, 'PUBLIC_SAFE');
      expect(retrieved1).not.toBeNull();
      // Mutate caller's buffer in-place
      retrieved1!.data.write('CORRUPTED');

      const retrieved2 = await driver.getArtifact(validKey, 'PUBLIC_SAFE');
      expect(retrieved2?.data.toString('utf8')).toBe(initial);
    });

    it('prohibits silent overwriting of existing artifacts unless explicitly authorized', async () => {
      await driver.putArtifact({
        key: validKey,
        tier: 'PUBLIC_SAFE',
        data: 'First write (immutable)',
        mimeType: 'text/plain',
      });

      // Default allowOverwrite is false: must throw ArtifactCollisionError
      await expect(
        driver.putArtifact({
          key: validKey,
          tier: 'PUBLIC_SAFE',
          data: 'Second conflicting write',
          mimeType: 'text/plain',
        })
      ).rejects.toThrow(ArtifactCollisionError);

      // With allowOverwrite: true, succeeds
      const updated = await driver.putArtifact({
        key: validKey,
        tier: 'PUBLIC_SAFE',
        data: 'Authorized update',
        mimeType: 'text/plain',
        allowOverwrite: true,
      });

      expect(updated.data.toString('utf8')).toBe('Authorized update');
    });

    it('returns null when querying for missing objects without throwing', async () => {
      const nonExistentKey = 'investigations/b22ac10b-58cc-4372-a567-0e02b2c3d402/attempts/1/missing.webm';
      const result = await driver.getArtifact(nonExistentKey, 'PUBLIC_SAFE');
      expect(result).toBeNull();
      expect(await driver.hasArtifact(nonExistentKey, 'PUBLIC_SAFE')).toBe(false);
    });

    it('supports listing and deleting artifacts by key', async () => {
      await driver.putArtifact({
        key: validKey,
        tier: 'PUBLIC_SAFE',
        data: 'Console output',
        mimeType: 'text/plain',
      });

      expect(await driver.hasArtifact(validKey, 'PUBLIC_SAFE')).toBe(true);

      const list = await driver.listArtifacts('investigations/b22ac10b-58cc-4372-a567-0e02b2c3d402', 'PUBLIC_SAFE');
      expect(list).toContain(validKey);

      const deleted = await driver.deleteArtifact(validKey, 'PUBLIC_SAFE');
      expect(deleted).toBe(true);
      expect(await driver.hasArtifact(validKey, 'PUBLIC_SAFE')).toBe(false);
    });
  });

  describe('Dual-Bucket Quarantine and Isolation (RESTRICTED_RAW vs PUBLIC_SAFE)', () => {
    const rawKey = 'investigations/b22ac10b-58cc-4372-a567-0e02b2c3d402/attempts/1/raw-trace.log';

    it('resolves distinct bucket names from server configuration for each tier', () => {
      const publicBucket = resolveBucketName('PUBLIC_SAFE');
      const restrictedBucket = resolveBucketName('RESTRICTED_RAW');

      expect(publicBucket).toBe('tracecase-public-safe');
      expect(restrictedBucket).toBe('tracecase-restricted-raw');
      expect(publicBucket).not.toBe(restrictedBucket);
    });

    it('strictly isolates RESTRICTED_RAW artifacts so they cannot be retrieved via PUBLIC_SAFE', async () => {
      const rawSecretTrace = 'DEBUG: Authorization: Bearer unredacted_production_secret_token_123';

      // 1. Store in RESTRICTED_RAW bucket
      await driver.putArtifact({
        key: rawKey,
        tier: 'RESTRICTED_RAW',
        data: rawSecretTrace,
        mimeType: 'text/plain',
      });

      // 2. Querying RESTRICTED_RAW succeeds
      const rawResult = await driver.getArtifact(rawKey, 'RESTRICTED_RAW');
      expect(rawResult).not.toBeNull();
      expect(rawResult?.data.toString('utf8')).toBe(rawSecretTrace);
      expect(rawResult?.tier).toBe('RESTRICTED_RAW');
      expect(rawResult?.bucket).toBe('tracecase-restricted-raw');

      // 3. Querying PUBLIC_SAFE for the same key MUST return null (quarantined)
      const publicResult = await driver.getArtifact(rawKey, 'PUBLIC_SAFE');
      expect(publicResult).toBeNull();
      expect(await driver.hasArtifact(rawKey, 'PUBLIC_SAFE')).toBe(false);
    });

    it('extracts S3 storage configuration without exposing secrets or throwing', () => {
      const config = getS3StorageConfig();

      expect(config.endpoint).toBe('http://localhost:9000');
      expect(config.publicBucket).toBe('tracecase-public-safe');
      expect(config.restrictedBucket).toBe('tracecase-restricted-raw');
      expect(config.region).toBe('us-east-1');
      expect(config.accessKey).toBeDefined();
      expect(config.secretKey).toBeDefined();
    });
  });
});
