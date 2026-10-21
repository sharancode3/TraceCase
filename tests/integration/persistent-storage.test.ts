import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  PersistentDiskEvidenceStorageDriver,
  ArtifactCollisionError,
  InvalidStorageKeyError,
  computeSha256,
} from '@/server/evidence/storage';

describe('PersistentDiskEvidenceStorageDriver (Multi-Process Persistence)', () => {
  const testBaseDir = path.resolve(process.cwd(), '.tmp', 'test-storage', randomUUID());

  beforeEach(async () => {
    await fs.mkdir(testBaseDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true }).catch(() => {});
  });

  it('persists written artifacts across driver restart (re-instantiation)', async () => {
    const invId = randomUUID();
    const driverWriter = new PersistentDiskEvidenceStorageDriver(testBaseDir);
    const key = `investigations/${invId}/attempts/1/console.log`;
    const content = 'Application log line 1\nApplication log line 2';

    // Process 1 writes to storage
    await driverWriter.putArtifact({
      key,
      tier: 'PUBLIC_SAFE',
      data: content,
      mimeType: 'text/plain',
    });

    // Process 2 (simulating process restart) reads from the same baseDir
    const driverReader = new PersistentDiskEvidenceStorageDriver(testBaseDir);
    const retrieved = await driverReader.getArtifact(key, 'PUBLIC_SAFE');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.data.toString('utf8')).toBe(content);
    expect(retrieved?.mimeType).toBe('text/plain');
    expect(retrieved?.byteSize).toBe(Buffer.byteLength(content, 'utf8'));
    expect(retrieved?.sha256Checksum).toBe(computeSha256(content).sha256Checksum);
  });

  it('enforces strict bucket isolation between PUBLIC_SAFE and RESTRICTED_RAW', async () => {
    const invId = randomUUID();
    const driver = new PersistentDiskEvidenceStorageDriver(testBaseDir);
    const rawKey = `investigations/${invId}/attempts/1/raw-trace.json`;
    const rawSecretContent = '{"auth": "super-secret-token"}';

    // Store in RESTRICTED_RAW
    await driver.putArtifact({
      key: rawKey,
      tier: 'RESTRICTED_RAW',
      data: rawSecretContent,
      mimeType: 'application/json',
    });

    // Querying PUBLIC_SAFE for the raw object must return null
    const safeLookup = await driver.getArtifact(rawKey, 'PUBLIC_SAFE');
    expect(safeLookup).toBeNull();

    // Querying RESTRICTED_RAW must find it
    const rawLookup = await driver.getArtifact(rawKey, 'RESTRICTED_RAW');
    expect(rawLookup).not.toBeNull();
    expect(rawLookup?.data.toString('utf8')).toBe(rawSecretContent);
  });

  it('rejects path traversal attempts with InvalidStorageKeyError', async () => {
    const driver = new PersistentDiskEvidenceStorageDriver(testBaseDir);
    const maliciousKey = '../../etc/passwd';

    await expect(
      driver.putArtifact({
        key: maliciousKey,
        tier: 'PUBLIC_SAFE',
        data: 'malicious',
        mimeType: 'text/plain',
      })
    ).rejects.toThrow(InvalidStorageKeyError);
  });

  it('prohibits overwriting existing artifacts unless allowOverwrite is true', async () => {
    const invId = randomUUID();
    const driver = new PersistentDiskEvidenceStorageDriver(testBaseDir);
    const key = `investigations/${invId}/attempts/1/video.webm`;

    await driver.putArtifact({
      key,
      tier: 'RESTRICTED_RAW',
      data: Buffer.alloc(100),
      mimeType: 'video/webm',
    });

    // Second write without allowOverwrite should throw ArtifactCollisionError
    await expect(
      driver.putArtifact({
        key,
        tier: 'RESTRICTED_RAW',
        data: Buffer.alloc(200),
        mimeType: 'video/webm',
        allowOverwrite: false,
      })
    ).rejects.toThrow(ArtifactCollisionError);

    // With allowOverwrite: true, should succeed
    const overwritten = await driver.putArtifact({
      key,
      tier: 'RESTRICTED_RAW',
      data: Buffer.alloc(200),
      mimeType: 'video/webm',
      allowOverwrite: true,
    });
    expect(overwritten.byteSize).toBe(200);
  });

  it('lists artifacts matching prefix correctly', async () => {
    const invId = randomUUID();
    const driver = new PersistentDiskEvidenceStorageDriver(testBaseDir);

    await driver.putArtifact({
      key: `investigations/${invId}/attempts/1/log-a.log`,
      tier: 'PUBLIC_SAFE',
      data: 'a',
      mimeType: 'text/plain',
    });
    await driver.putArtifact({
      key: `investigations/${invId}/attempts/1/log-b.log`,
      tier: 'PUBLIC_SAFE',
      data: 'b',
      mimeType: 'text/plain',
    });
    await driver.putArtifact({
      key: `investigations/${invId}/attempts/2/log-c.log`,
      tier: 'PUBLIC_SAFE',
      data: 'c',
      mimeType: 'text/plain',
    });

    const attempt1Logs = await driver.listArtifacts(`investigations/${invId}/attempts/1/`, 'PUBLIC_SAFE');
    expect(attempt1Logs).toEqual([
      `investigations/${invId}/attempts/1/log-a.log`,
      `investigations/${invId}/attempts/1/log-b.log`,
    ]);
  });
});
