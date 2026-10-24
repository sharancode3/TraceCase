import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSignedGrantId,
  verifyAccessGrant,
  clearAccessGrants,
  storeAccessGrant,
} from '@/server/evidence/evidence-storage-adapter';
import {
  S3EvidenceStorageDriver,
  InvalidStorageKeyError,
  getEvidenceStorageDriver,
  resetEvidenceStorageDriver,
} from '@/server/evidence/storage';

describe('Shared Evidence Storage & Stateless Signed Access Grants', () => {
  beforeEach(() => {
    clearAccessGrants();
    resetEvidenceStorageDriver();
  });

  describe('Stateless Signed Access Grants', () => {
    it('creates a signed grant token and verifies it statelessly after clearing in-memory registry', () => {
      const artifactId = 'c1234567-89ab-cdef-0123-456789abcdef';
      const userId = 'u-operator-42';
      const expiresAt = new Date(Date.now() + 60 * 1000); // 1 minute in future

      const grantId = createSignedGrantId({
        artifactId,
        investigationId: 'inv-test-01',
        authorizedUserId: userId,
        storageTier: 'PUBLIC_SAFE',
        expiresAt,
      });

      expect(typeof grantId).toBe('string');
      expect(grantId).toContain('.');

      // Store in memory, then verify
      storeAccessGrant({
        grantId,
        artifactId,
        investigationId: 'inv-test-01',
        authorizedUserId: userId,
        storageTier: 'PUBLIC_SAFE',
        expiresAt,
      });
      const inMemoryVerified = verifyAccessGrant(grantId, artifactId);
      expect(inMemoryVerified).not.toBeNull();
      expect(inMemoryVerified?.authorizedUserId).toBe(userId);

      // Now clear in-memory cache to simulate API restart or separate API instance
      clearAccessGrants();

      // Should still authoritatively verify using stateless cryptographic HMAC signature!
      const statelessVerified = verifyAccessGrant(grantId, artifactId);
      expect(statelessVerified).not.toBeNull();
      expect(statelessVerified?.artifactId).toBe(artifactId);
      expect(statelessVerified?.authorizedUserId).toBe(userId);
      expect(statelessVerified?.storageTier).toBe('PUBLIC_SAFE');
    });

    it('rejects an expired signed grant', () => {
      const artifactId = 'c1234567-89ab-cdef-0123-456789abcdef';
      const pastDate = new Date(Date.now() - 5000); // 5 seconds ago

      const grantId = createSignedGrantId({
        artifactId,
        authorizedUserId: 'u-operator',
        storageTier: 'PUBLIC_SAFE',
        expiresAt: pastDate,
      });

      clearAccessGrants();
      const verified = verifyAccessGrant(grantId, artifactId);
      expect(verified).toBeNull();
    });

    it('rejects a grant token with a tampered signature', () => {
      const artifactId = 'c1234567-89ab-cdef-0123-456789abcdef';
      const grantId = createSignedGrantId({
        artifactId,
        authorizedUserId: 'u-operator',
        storageTier: 'PUBLIC_SAFE',
        expiresAt: new Date(Date.now() + 60_000),
      });

      const [b64] = grantId.split('.');
      const tamperedGrantId = `${b64}.0000000000000000000000000000000000000000000000000000000000000000`;

      clearAccessGrants();
      const verified = verifyAccessGrant(tamperedGrantId, artifactId);
      expect(verified).toBeNull();
    });

    it('rejects a grant when verified against a different artifactId', () => {
      const artifactId = 'c1234567-89ab-cdef-0123-456789abcdef';
      const grantId = createSignedGrantId({
        artifactId,
        authorizedUserId: 'u-operator',
        storageTier: 'PUBLIC_SAFE',
        expiresAt: new Date(Date.now() + 60_000),
      });

      clearAccessGrants();
      const verified = verifyAccessGrant(grantId, 'other-artifact-id');
      expect(verified).toBeNull();
    });
  });

  describe('S3EvidenceStorageDriver', () => {
    it('initializes with configuration and implements EvidenceStorageDriver', () => {
      const driver = new S3EvidenceStorageDriver({
        endpoint: 'https://s3.us-east-1.amazonaws.com',
        region: 'us-east-1',
        accessKey: 'AKIA_TEST',
        secretKey: 'SECRET_TEST',
        publicBucket: 'test-public',
        restrictedBucket: 'test-restricted',
      });

      expect(driver).toBeDefined();
      expect(typeof driver.putArtifact).toBe('function');
      expect(typeof driver.getArtifact).toBe('function');
      expect(typeof driver.hasArtifact).toBe('function');
      expect(typeof driver.deleteArtifact).toBe('function');
      expect(typeof driver.listArtifacts).toBe('function');
    });

    it('enforces storage key path-traversal prevention before network operations', async () => {
      const driver = new S3EvidenceStorageDriver();

      await expect(
        driver.putArtifact({
          key: '../evil.txt',
          tier: 'PUBLIC_SAFE',
          data: 'test',
          mimeType: 'text/plain',
        })
      ).rejects.toThrow(InvalidStorageKeyError);

      await expect(
        driver.getArtifact('investigations/../../secret.txt', 'RESTRICTED_RAW')
      ).rejects.toThrow(InvalidStorageKeyError);
    });

    it('returns S3EvidenceStorageDriver when STORAGE_DRIVER=s3', () => {
      process.env.STORAGE_DRIVER = 's3';
      try {
        const driver = getEvidenceStorageDriver();
        expect(driver instanceof S3EvidenceStorageDriver).toBe(true);
      } finally {
        delete process.env.STORAGE_DRIVER;
        resetEvidenceStorageDriver();
      }
    });
  });
});
