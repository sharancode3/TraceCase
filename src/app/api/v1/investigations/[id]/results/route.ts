import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { getDb, isDbConfigured } from '@/server/db';
import {
  investigationsTable,
  targetsTable,
  bugReportsTable,
  evidenceArtifactsTable,
} from '@/server/db/schema';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { attemptsRepository } from '@/server/db/repositories/attempts.repository';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * GET /api/v1/investigations/[id]/results
 * Returns authoritative attempt records, verified reset receipts, assertion observations,
 * target environment/build metadata, and accessible artifact descriptors.
 * Preserves strict cross-user ownership and RESTRICTED_RAW protections.
 */
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

  try {
    const principal = await requireAuthenticatedPrincipal(req);

    if (!isDbConfigured()) {
      return NextResponse.json(
        createSafeError('SERVICE_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE', 'Database is required to resolve results.'),
        { status: 503 }
      );
    }

    const db = getDb();
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

    // Cross-user access check
    if (inv.ownerId !== principal.id) {
      return NextResponse.json(
        createSafeError('UNAUTHORIZED', 'FORBIDDEN', 'You do not have permission to view results for this investigation.'),
        { status: 403 }
      );
    }

    // 1. Snapshot
    const snapshot = await investigationWorkflowService.getInvestigationSnapshot(id, principal.id);

    // 2. Query target and report for environment and build metadata
    const [target] = await db.select().from(targetsTable).where(eq(targetsTable.id, inv.targetId)).limit(1);
    const [report] = await db.select().from(bugReportsTable).where(eq(bugReportsTable.id, inv.reportId)).limit(1);

    // 3. Query reset receipt
    const rawReceipt = await attemptsRepository.getResetReceipt(id);
    const resetReceipt = rawReceipt
      ? {
          id: rawReceipt.id,
          targetId: rawReceipt.targetId,
          investigationId: rawReceipt.investigationId,
          attemptNumber: 2 as const,
          transportSuccess: rawReceipt.transportSuccess,
          baselineEquivalent: rawReceipt.baselineEquivalent,
          isVerifiedRestored: rawReceipt.isVerifiedRestored,
          targetBuildId: (target as unknown as { buildId?: string })?.buildId || undefined,
          readback: {
            targetId: rawReceipt.targetId,
            expectedStateHash: rawReceipt.expectedStateHash || '',
            observedStateHash: rawReceipt.observedStateHash || '',
            isEquivalent: rawReceipt.baselineEquivalent,
            discrepancies: Array.isArray(rawReceipt.discrepancies) ? (rawReceipt.discrepancies as string[]) : [],
            checkedAt: rawReceipt.verifiedAt.toISOString(),
          },
          verifiedAt: rawReceipt.verifiedAt.toISOString(),
        }
      : null;

    // 4. Query assertion evaluations
    const rawEvaluations = await attemptsRepository.getAssertionEvaluations(id);
    const assertionEvaluations = rawEvaluations.map((ev) => ({
      id: ev.id,
      attemptNumber: ev.attemptNumber,
      assertionId: ev.assertionId,
      kind: ev.kind,
      purpose: ev.purpose,
      result: ev.result,
      expectedValue: ev.expectedValue ?? null,
      observedValue: ev.observedValue ?? null,
      details: ev.details ?? null,
      evaluatedAt: ev.evaluatedAt.toISOString(),
    }));

    // 5. Query eligible public safe artifacts (strict security: omit restricted raw storage keys)
    const artifactRows = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.investigationId, id),
          eq(evidenceArtifactsTable.storageTier, 'PUBLIC_SAFE'),
          eq(evidenceArtifactsTable.isEligibleForSharing, true)
        )
      );

    const artifacts = artifactRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      attemptNumber: r.attemptNumber,
      storageTier: r.storageTier,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      sha256Checksum: r.sha256Checksum,
      isEligibleForSharing: r.isEligibleForSharing,
      redactionApplied: r.redactionApplied,
      url: `/api/v1/investigations/${id}/artifacts/${r.id}`,
      createdAt: r.createdAt.toISOString(),
    }));

    const restrictedRecordings = await db
      .select({ id: evidenceArtifactsTable.id })
      .from(evidenceArtifactsTable)
      .where(
        and(
          eq(evidenceArtifactsTable.investigationId, id),
          eq(evidenceArtifactsTable.kind, 'VIDEO_RECORDING'),
          eq(evidenceArtifactsTable.storageTier, 'RESTRICTED_RAW')
        )
      );

    return NextResponse.json({
      data: {
        investigationId: id,
        snapshot,
        environment: target?.environment || 'development',
        buildVersion: (target as unknown as { buildId?: string })?.buildId || report?.buildVersion || null,
        attempts: {
          attempt1: snapshot.attempt1,
          attempt2: snapshot.attempt2,
        },
        resetReceipt,
        assertionEvaluations,
        artifacts,
        restrictedRecordingCount: restrictedRecordings.length,
      },
      mode: 'live',
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
