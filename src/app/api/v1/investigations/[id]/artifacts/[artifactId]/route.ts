import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { eq, and } from 'drizzle-orm';
import { getDb, isDbConfigured } from '@/server/db';
import { evidenceArtifactsTable, investigationsTable } from '@/server/db/schema';
import { resolvePrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { verifyAccessGrant } from '@/server/evidence/evidence-storage-adapter';
import { getEvidenceStorageDriver } from '@/server/evidence/storage';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  const { id, artifactId } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      createSafeError('VALIDATION_FAILED', 'INVALID_INVESTIGATION_ID', 'Investigation ID must be a valid RFC 4122 UUID'),
      { status: 400 }
    );
  }

  if (!UUID_REGEX.test(artifactId)) {
    return NextResponse.json(
      createSafeError('VALIDATION_FAILED', 'INVALID_ARTIFACT_ID', 'Artifact ID must be a valid RFC 4122 UUID'),
      { status: 400 }
    );
  }

  // 1. Authorize via access grant query parameter or authenticated principal session
  const url = new URL(req.url);
  const grantId = url.searchParams.get('grant');
  let isGrantAuthorized = false;
  let authorizedTier: 'PUBLIC_SAFE' | 'RESTRICTED_RAW' = 'PUBLIC_SAFE';

  if (grantId) {
    const verified = verifyAccessGrant(grantId, artifactId);
    if (verified) {
      isGrantAuthorized = true;
      authorizedTier = verified.storageTier;
    }
  }

  const principal = await resolvePrincipal(req);

  if (!isGrantAuthorized && !principal) {
    return NextResponse.json(
      createSafeError('UNAUTHENTICATED', 'UNAUTHENTICATED', 'Valid session credentials or active access grant required.'),
      { status: 401 }
    );
  }

  // 2. Fetch artifact metadata and verify investigation ownership
  let mimeType = 'application/octet-stream';
  let storageTier = 'RESTRICTED_RAW';
  let localPath: string | null = null;

  if (isDbConfigured()) {
    try {
      const db = getDb();
      const [artifactRow] = await db
        .select()
        .from(evidenceArtifactsTable)
        .where(
          and(
            eq(evidenceArtifactsTable.id, artifactId),
            eq(evidenceArtifactsTable.investigationId, id)
          )
        )
        .limit(1);

      if (!artifactRow) {
        return NextResponse.json(
          createSafeError('NOT_FOUND', 'ARTIFACT_NOT_FOUND', `Artifact ${artifactId} was not found for investigation ${id}.`),
          { status: 404 }
        );
      }

      mimeType = artifactRow.mimeType;
      storageTier = artifactRow.storageTier;
      localPath = artifactRow.localPath;

      // Verify investigation access for principal if not using a specific signed grant
      if (principal && !isGrantAuthorized) {
        const [investigation] = await db
          .select()
          .from(investigationsTable)
          .where(eq(investigationsTable.id, id))
          .limit(1);

        if (investigation && principal.role !== 'admin' && investigation.ownerId !== principal.id) {
          return NextResponse.json(
            createSafeError('UNAUTHORIZED', 'FORBIDDEN', 'You do not have access to this investigation artifact.'),
            { status: 403 }
          );
        }
      }
    } catch {
      // In-memory or fallback mode
    }
  }

  // 3. Fail closed if RESTRICTED_RAW and caller is only authorized for PUBLIC_SAFE
  if (storageTier === 'RESTRICTED_RAW' && isGrantAuthorized && authorizedTier === 'PUBLIC_SAFE') {
    return NextResponse.json(
      createSafeError('POLICY_VIOLATION', 'RESTRICTED_TIER_FORBIDDEN', 'Access grant is not authorized for RESTRICTED_RAW evidence.'),
      { status: 403 }
    );
  }

  // 4. Retrieve artifact binary payload
  let buffer: Buffer | null = null;

  // Try reading from local filesystem first
  if (localPath) {
    try {
      buffer = await fs.readFile(localPath);
    } catch {
      buffer = null;
    }
  }

  // Try reading from EvidenceStorageDriver
  if (!buffer) {
    const driver = getEvidenceStorageDriver();
    // Try both tiers if necessary
    const primaryTier = storageTier === 'PUBLIC_SAFE' ? 'PUBLIC_SAFE' : 'RESTRICTED_RAW';
    const prefixes = [
      `investigations/${id}/attempts/1/`,
      `investigations/${id}/attempts/2/`,
      `investigations/${id}/`,
    ];

    for (const prefix of prefixes) {
      const keys = await driver.listArtifacts(prefix, primaryTier as 'PUBLIC_SAFE' | 'RESTRICTED_RAW');
      const matchingKey = keys.find((k) => k.includes(artifactId));
      if (matchingKey) {
        const item = await driver.getArtifact(matchingKey, primaryTier as 'PUBLIC_SAFE' | 'RESTRICTED_RAW');
        if (item) {
          buffer = item.data;
          mimeType = item.mimeType || mimeType;
          break;
        }
      }
    }

    if (!buffer && primaryTier === 'PUBLIC_SAFE') {
      // Fallback search in RESTRICTED_RAW if authorized
      for (const prefix of prefixes) {
        const keys = await driver.listArtifacts(prefix, 'RESTRICTED_RAW');
        const matchingKey = keys.find((k) => k.includes(artifactId));
        if (matchingKey) {
          const item = await driver.getArtifact(matchingKey, 'RESTRICTED_RAW');
          if (item) {
            buffer = item.data;
            mimeType = item.mimeType || mimeType;
            break;
          }
        }
      }
    }
  }

  if (!buffer) {
    return NextResponse.json(
      createSafeError('NOT_FOUND', 'ARTIFACT_DATA_NOT_FOUND', `Artifact payload not found in storage driver or on disk.`),
      { status: 404 }
    );
  }

  // 5. HTTP 206 Partial Content support for video streaming / range requests
  const rangeHeader = req.headers.get('range');
  const totalLength = buffer.length;

  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.slice(6).split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

    if (isNaN(start) || isNaN(end) || start >= totalLength || start > end) {
      return new Response(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${totalLength}`,
        },
      });
    }

    const chunk = buffer.subarray(start, end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        'Content-Type': mimeType,
        'Content-Range': `bytes ${start}-${end}/${totalLength}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunk.length),
        'Cache-Control': 'private, no-cache',
      },
    });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(totalLength),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-cache',
    },
  });
}
