import { NextRequest, NextResponse } from 'next/server';
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
  let grantInvestigationId: string | undefined;

  if (grantId) {
    const verified = verifyAccessGrant(grantId, artifactId);
    if (verified) {
      isGrantAuthorized = true;
      authorizedTier = verified.storageTier;
      grantInvestigationId = verified.investigationId;
    }
  }

  const principal = await resolvePrincipal(req);

  if (!isGrantAuthorized && !principal) {
    return NextResponse.json(
      createSafeError('UNAUTHENTICATED', 'UNAUTHENTICATED', 'Valid session credentials or active access grant required.'),
      { status: 401 }
    );
  }

  // Reject grant if bound to a mismatched investigation
  if (isGrantAuthorized && grantInvestigationId && grantInvestigationId !== id) {
    return NextResponse.json(
      createSafeError('UNAUTHORIZED', 'FORBIDDEN', 'Access grant is not authorized for this investigation.'),
      { status: 403 }
    );
  }

  // 2. Fetch artifact metadata and verify investigation ownership
  if (!isDbConfigured()) {
    return NextResponse.json(
      createSafeError('SERVICE_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE', 'Database is required to resolve artifact metadata.'),
      { status: 503 }
    );
  }

  let artifactRow: typeof evidenceArtifactsTable.$inferSelect | undefined;
  let investigationRow: typeof investigationsTable.$inferSelect | undefined;

  try {
    const db = getDb();
    const [foundArtifact] = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.id, artifactId),
          eq(evidenceArtifactsTable.investigationId, id)
        )
      )
      .limit(1);

    artifactRow = foundArtifact;

    if (!artifactRow) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'ARTIFACT_NOT_FOUND', `Artifact ${artifactId} was not found for investigation ${id}.`),
        { status: 404 }
      );
    }

    const [foundInvestigation] = await db
      .select()
      .from(investigationsTable)
      .where(eq(investigationsTable.id, id))
      .limit(1);

    investigationRow = foundInvestigation;

    if (!investigationRow) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'INVESTIGATION_NOT_FOUND', `Investigation ${id} was not found.`),
        { status: 404 }
      );
    }
  } catch (error) {
    // Fail-closed: do not swallow database errors to fall back to searching storage
    return NextResponse.json(
      createSafeError('INTERNAL_ERROR', 'DATABASE_ERROR', `Failed to query artifact metadata: ${error instanceof Error ? error.message : String(error)}`),
      { status: 500 }
    );
  }

  // 3. Strict ownership enforcement: authenticated principal must own the investigation
  if (principal && !isGrantAuthorized) {
    if (investigationRow.ownerId !== principal.id) {
      return NextResponse.json(
        createSafeError('UNAUTHORIZED', 'FORBIDDEN', 'You do not have access to this investigation artifact.'),
        { status: 403 }
      );
    }
  }

  // 4. Tier and Eligibility Enforcement
  // Normal viewers MUST NOT receive RESTRICTED_RAW merely by being logged in
  if (artifactRow.storageTier === 'RESTRICTED_RAW') {
    const hasExplicitRestrictedGrant = isGrantAuthorized && authorizedTier === 'RESTRICTED_RAW';
    if (!hasExplicitRestrictedGrant) {
      return NextResponse.json(
        createSafeError(
          'POLICY_VIOLATION',
          'RESTRICTED_TIER_FORBIDDEN',
          'Access to RESTRICTED_RAW evidence requires explicit restricted-review authorization.'
        ),
        { status: 403 }
      );
    }
  }

  // For PUBLIC_SAFE artifacts, verify sharing eligibility
  if (artifactRow.storageTier === 'PUBLIC_SAFE' && !artifactRow.isEligibleForSharing) {
    return NextResponse.json(
      createSafeError('POLICY_VIOLATION', 'ARTIFACT_NOT_ELIGIBLE', 'Artifact is not eligible for viewing or sharing.'),
      { status: 403 }
    );
  }

  // 5. Retrieve exact persisted object identity from Storage Driver
  // Never read raw localPath before/instead of processed derivative.
  // Never search other tiers. Never guess keys by substring.
  const storageKey = artifactRow.storageRef;
  if (!storageKey) {
    return NextResponse.json(
      createSafeError('NOT_FOUND', 'STORAGE_KEY_NOT_FOUND', `Persisted storage reference missing for artifact ${artifactId}.`),
      { status: 404 }
    );
  }

  const driver = getEvidenceStorageDriver();
  const targetTier = artifactRow.storageTier as 'PUBLIC_SAFE' | 'RESTRICTED_RAW';
  const storedItem = await driver.getArtifact(storageKey, targetTier);

  if (!storedItem) {
    return NextResponse.json(
      createSafeError('NOT_FOUND', 'DERIVATIVE_NOT_FOUND', 'Processed evidence artifact not found in storage driver.'),
      { status: 404 }
    );
  }

  const buffer = storedItem.data;
  const mimeType = storedItem.mimeType || artifactRow.mimeType || 'application/octet-stream';
  const totalLength = buffer.length;

  // 6. RFC 7233 Partial Content / Range Handling
  const rangeHeader = req.headers.get('range');

  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const rangeValue = rangeHeader.slice(6).trim();

    // Reject multipart ranges as unsupported (RFC 7233 Sec 4.4)
    if (rangeValue.includes(',')) {
      return new Response(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${totalLength}`,
        },
      });
    }

    const parts = rangeValue.split('-');
    let start: number;
    let end: number;

    if (parts[0] === '' && parts[1]) {
      // Suffix range: bytes=-N
      const suffixLength = parseInt(parts[1], 10);
      if (isNaN(suffixLength) || suffixLength <= 0) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${totalLength}` },
        });
      }
      start = Math.max(0, totalLength - suffixLength);
      end = totalLength - 1;
    } else {
      start = parseInt(parts[0], 10);
      if (parts[1] === '') {
        // Open-ended range: bytes=N-
        end = totalLength - 1;
      } else {
        // Bounded range: bytes=N-M (clamped to totalLength - 1)
        end = Math.min(parseInt(parts[1], 10), totalLength - 1);
      }
    }

    if (isNaN(start) || isNaN(end) || start < 0 || start >= totalLength || start > end) {
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
        'Cache-Control': 'private, no-transform, max-age=3600',
      },
    });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(totalLength),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-transform, max-age=3600',
    },
  });
}
