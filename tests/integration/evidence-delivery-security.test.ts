import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { GET } from '@/app/api/v1/investigations/[id]/artifacts/[artifactId]/route';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import {
  setEvidenceStorageDriverForTesting,
  InMemoryEvidenceStorageDriver,
  buildStorageKey,
} from '@/server/evidence/storage';
import {
  storeAccessGrant,
  clearAccessGrants,
} from '@/server/evidence/evidence-storage-adapter';
import { setCustomPrincipalResolverForTesting } from '@/server/auth';

import { Phase7TestDbMock } from '../person-1/phase-7/test-db-mock';

class MockDbForEvidenceDelivery extends Phase7TestDbMock {
  public shouldThrow = false;

  override select(selectFields?: any) {
    if (this.shouldThrow) {
      throw new Error('Simulated PostgreSQL Connection Error');
    }
    return super.select(selectFields);
  }
}

describe('Evidence Delivery Security & Boundary Containment (Section 3)', () => {
  let mockDb: MockDbForEvidenceDelivery;
  let driver: InMemoryEvidenceStorageDriver;
  const ownerId = randomUUID();
  const strangerId = randomUUID();
  const investigationId = randomUUID();
  const rawArtifactId = randomUUID();
  const derivativeArtifactId = randomUUID();

  const SYNTHETIC_SECRET = 'SUPER_SECRET_TOKEN_XYZ_99999';
  const SANITIZED_CONTENT = 'Request Authorization: Bearer [REDACTED_SECRET]';
  const RAW_CONTENT = `Request Authorization: Bearer ${SYNTHETIC_SECRET}`;

  let rawTempPath: string;
  let ownerToken: string;
  let strangerToken: string;

  beforeEach(async () => {
    mockDb = new MockDbForEvidenceDelivery();
    setDbInstanceForTesting(mockDb as any);
    driver = new InMemoryEvidenceStorageDriver();
    setEvidenceStorageDriverForTesting(driver);
    clearAccessGrants();

    ownerToken = 'token-owner-valid';
    strangerToken = 'token-stranger-valid';

    setCustomPrincipalResolverForTesting(async (req) => {
      const auth = req.headers.get('authorization');
      if (auth === `Bearer ${ownerToken}`) {
        return { id: ownerId, role: 'operator', email: 'owner@tracecase.local' };
      }
      if (auth === `Bearer ${strangerToken}`) {
        return { id: strangerId, role: 'operator', email: 'stranger@tracecase.local' };
      }
      return null;
    });

    // Write raw content to local temp file to simulate raw staging file
    const tempDir = path.resolve(process.cwd(), '.tmp', 'test-sec');
    await fs.mkdir(tempDir, { recursive: true });
    rawTempPath = path.join(tempDir, `raw-${randomUUID()}.log`);
    await fs.writeFile(rawTempPath, RAW_CONTENT, 'utf8');

    // Seed investigation in DB
    mockDb.investigations = [
      {
        id: investigationId,
        ownerId: ownerId,
        reportId: randomUUID(),
        targetId: randomUUID(),
        lifecycleStatus: 'COMPLETED',
        evidenceReadiness: 'PUBLIC_SAFE_READY',
      },
    ];

    // Seed processed derivative artifact in DB pointing to PUBLIC_SAFE
    const safeKey = buildStorageKey({
      investigationId,
      attemptNumber: 1,
      kind: 'CONSOLE_LOG',
      fileName: `console_${derivativeArtifactId}.log`,
    });

    // Store sanitized content in driver under PUBLIC_SAFE
    await driver.putArtifact({
      key: safeKey,
      tier: 'PUBLIC_SAFE',
      data: SANITIZED_CONTENT,
      mimeType: 'text/plain',
    });

    // Seed RAW artifact in DB pointing to RESTRICTED_RAW
    const rawKey = buildStorageKey({
      investigationId,
      attemptNumber: 1,
      kind: 'CONSOLE_LOG',
      fileName: `raw_console_${rawArtifactId}.log`,
    });
    await driver.putArtifact({
      key: rawKey,
      tier: 'RESTRICTED_RAW',
      data: RAW_CONTENT,
      mimeType: 'text/plain',
    });
  });

  afterEach(async () => {
    resetDbInstanceForTesting();
    setEvidenceStorageDriverForTesting(null);
    clearAccessGrants();
    await fs.rm(rawTempPath, { force: true }).catch(() => {});
  });

  it('1. serves sanitized derivative bytes and NEVER falls back to localPath or leaks raw secret', async () => {
    mockDb.evidenceArtifacts = [
      {
        id: derivativeArtifactId,
        investigationId,
        attemptNumber: 1,
        kind: 'CONSOLE_LOG',
        storageTier: 'PUBLIC_SAFE',
        localPath: rawTempPath, // localPath points to RAW file containing secret!
        storageRef: `investigations/${investigationId}/attempts/1/console_${derivativeArtifactId}.log`,
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(SANITIZED_CONTENT),
        sha256Checksum: 'a'.repeat(64),
        isEligibleForSharing: true,
        redactionApplied: true,
      },
    ];

    const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    const res = await GET(req, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });

    expect(res.status).toBe(200);
    const bodyText = await res.text();
    // Must contain sanitized content
    expect(bodyText).toBe(SANITIZED_CONTENT);
    // Must NEVER contain raw secret!
    expect(bodyText).not.toContain(SYNTHETIC_SECRET);
  });

  it('2. when derivative object is deleted from storage, handler returns 404 and NEVER falls back to raw bytes', async () => {
    mockDb.evidenceArtifacts = [
      {
        id: derivativeArtifactId,
        investigationId,
        attemptNumber: 1,
        kind: 'CONSOLE_LOG',
        storageTier: 'PUBLIC_SAFE',
        localPath: rawTempPath, // raw file on disk still contains secret!
        storageRef: `investigations/${investigationId}/attempts/1/console_${derivativeArtifactId}.log`,
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(SANITIZED_CONTENT),
        sha256Checksum: 'a'.repeat(64),
        isEligibleForSharing: true,
        redactionApplied: true,
      },
    ];

    // Delete derivative from PUBLIC_SAFE storage driver
    await driver.deleteArtifact(`investigations/${investigationId}/attempts/1/console_${derivativeArtifactId}.log`, 'PUBLIC_SAFE');

    const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    const res = await GET(req, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });

    // Must return 404 NOT FOUND, NOT 200 with raw bytes!
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('DERIVATIVE_NOT_FOUND');
  });

  it('3. rejects cross-user access even when the requesting user is authenticated', async () => {
    mockDb.evidenceArtifacts = [
      {
        id: derivativeArtifactId,
        investigationId,
        attemptNumber: 1,
        kind: 'CONSOLE_LOG',
        storageTier: 'PUBLIC_SAFE',
        storageRef: `investigations/${investigationId}/attempts/1/console_${derivativeArtifactId}.log`,
        mimeType: 'text/plain',
        isEligibleForSharing: true,
      },
    ];

    const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`, {
      headers: {
        Authorization: `Bearer ${strangerToken}`, // Stranger is authenticated but not owner
      },
    });

    const res = await GET(req, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('4. rejects unauthenticated requests with 401', async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`);
    const res = await GET(req, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });
    expect(res.status).toBe(401);
  });

  it('5. returns 404 on missing artifact record', async () => {
    mockDb.evidenceArtifacts = []; // empty
    const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const res = await GET(req, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });
    expect(res.status).toBe(404);
  });

  it('6. fails closed on database failure and does not search storage', async () => {
    mockDb.shouldThrow = true;
    const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const res = await GET(req, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('DATABASE_ERROR');
  });

  it('7. ordinary logged-in user cannot access RESTRICTED_RAW artifact without explicit restricted grant', async () => {
    mockDb.evidenceArtifacts = [
      {
        id: rawArtifactId,
        investigationId,
        attemptNumber: 1,
        kind: 'CONSOLE_LOG',
        storageTier: 'RESTRICTED_RAW',
        storageRef: `investigations/${investigationId}/attempts/1/raw_console_${rawArtifactId}.log`,
        mimeType: 'text/plain',
        isEligibleForSharing: false,
      },
    ];

    const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${rawArtifactId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    const res = await GET(req, {
      params: Promise.resolve({ id: investigationId, artifactId: rawArtifactId }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('RESTRICTED_TIER_FORBIDDEN');
  });

  it('8. a PUBLIC_SAFE access grant cannot authorize retrieval of RESTRICTED_RAW evidence', async () => {
    mockDb.evidenceArtifacts = [
      {
        id: rawArtifactId,
        investigationId,
        attemptNumber: 1,
        kind: 'CONSOLE_LOG',
        storageTier: 'RESTRICTED_RAW',
        storageRef: `investigations/${investigationId}/attempts/1/raw_console_${rawArtifactId}.log`,
        mimeType: 'text/plain',
        isEligibleForSharing: false,
      },
    ];

    const grantId = randomUUID();
    storeAccessGrant({
      grantId,
      artifactId: rawArtifactId,
      investigationId,
      authorizedUserId: strangerId,
      storageTier: 'PUBLIC_SAFE', // grant is for PUBLIC_SAFE
      expiresAt: new Date(Date.now() + 60000),
    });

    const req = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${rawArtifactId}?grant=${grantId}`);

    const res = await GET(req, {
      params: Promise.resolve({ id: investigationId, artifactId: rawArtifactId }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('RESTRICTED_TIER_FORBIDDEN');
  });

  it('9. supports RFC 7233 Range requests with 206 Partial Content and correct byte slicing', async () => {
    mockDb.evidenceArtifacts = [
      {
        id: derivativeArtifactId,
        investigationId,
        attemptNumber: 1,
        kind: 'CONSOLE_LOG',
        storageTier: 'PUBLIC_SAFE',
        storageRef: `investigations/${investigationId}/attempts/1/console_${derivativeArtifactId}.log`,
        mimeType: 'text/plain',
        isEligibleForSharing: true,
      },
    ];

    // Bounded range: bytes=0-6
    const reqBounded = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        Range: 'bytes=0-6',
      },
    });

    const resBounded = await GET(reqBounded, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });

    expect(resBounded.status).toBe(206);
    expect(resBounded.headers.get('Content-Range')).toBe(`bytes 0-6/${SANITIZED_CONTENT.length}`);
    expect(resBounded.headers.get('Content-Length')).toBe('7');
    const boundedText = await resBounded.text();
    expect(boundedText).toBe(SANITIZED_CONTENT.slice(0, 7));

    // Suffix range: bytes=-10 (last 10 bytes)
    const reqSuffix = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        Range: 'bytes=-10',
      },
    });

    const resSuffix = await GET(reqSuffix, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });

    expect(resSuffix.status).toBe(206);
    const suffixText = await resSuffix.text();
    expect(suffixText).toBe(SANITIZED_CONTENT.slice(-10));

    // Unsatisfiable range: bytes=9999-99999 -> 416
    const reqInvalid = new NextRequest(`http://localhost:3000/api/v1/investigations/${investigationId}/artifacts/${derivativeArtifactId}`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        Range: 'bytes=9999-99999',
      },
    });

    const resInvalid = await GET(reqInvalid, {
      params: Promise.resolve({ id: investigationId, artifactId: derivativeArtifactId }),
    });

    expect(resInvalid.status).toBe(416);
    expect(resInvalid.headers.get('Content-Range')).toBe(`bytes */${SANITIZED_CONTENT.length}`);
  });
});
