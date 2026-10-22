import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { getDb, isDbConfigured } from '@/server/db';
import { evidenceArtifactsTable, investigationsTable } from '@/server/db/schema';
import { resolvePrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { isDevPreviewEnabled } from '@/server/config/env';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      createSafeError('VALIDATION_FAILED', 'INVALID_INVESTIGATION_ID', 'Investigation ID must be a valid RFC 4122 UUID'),
      { status: 400 }
    );
  }

  if (isDevPreviewEnabled()) {
    return NextResponse.json({
      data: {
        artifacts: [],
        total: 0,
      },
      mode: 'preview_synthetic',
    });
  }

  const principal = await resolvePrincipal(req);
  if (!principal) {
    return NextResponse.json(
      createSafeError('UNAUTHENTICATED', 'UNAUTHENTICATED', 'Valid session credentials required to list artifacts.'),
      { status: 401 }
    );
  }

  if (!isDbConfigured()) {
    return NextResponse.json(
      createSafeError('SERVICE_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE', 'Database is required to resolve investigation artifacts.'),
      { status: 503 }
    );
  }

  try {
    const db = getDb();

    // Enforce ownership
    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(eq(investigationsTable.id, id))
      .limit(1);

    if (!inv) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'INVESTIGATION_NOT_FOUND', `Investigation ${id} not found.`),
        { status: 404 }
      );
    }

    if (inv.ownerId !== principal.id) {
      return NextResponse.json(
        createSafeError('UNAUTHORIZED', 'FORBIDDEN', 'You do not have permission to view artifacts for this investigation.'),
        { status: 403 }
      );
    }

    // Query eligible PUBLIC_SAFE artifacts
    const rows = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.investigationId, id),
          eq(evidenceArtifactsTable.storageTier, 'PUBLIC_SAFE'),
          eq(evidenceArtifactsTable.isEligibleForSharing, true)
        )
      );

    const artifacts = rows.map((r) => ({
      id: r.id,
      rawArtifactId: r.rawArtifactId ?? null,
      kind: r.kind,
      attemptNumber: r.attemptNumber,
      storageTier: r.storageTier,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      sha256Checksum: r.sha256Checksum,
      isEligibleForSharing: r.isEligibleForSharing,
      redactionApplied: r.redactionApplied,
      quarantineReason: r.quarantineReason,
      url: `/api/v1/investigations/${id}/artifacts/${r.id}`,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({
      data: {
        artifacts,
        total: artifacts.length,
      },
      mode: 'live',
    });
  } catch (error) {
    return NextResponse.json(
      createSafeError(
        'INTERNAL_ERROR',
        'DATABASE_ERROR',
        `Failed to retrieve artifacts: ${error instanceof Error ? error.message : String(error)}`
      ),
      { status: 500 }
    );
  }
}
