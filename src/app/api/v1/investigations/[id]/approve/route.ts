import { NextRequest, NextResponse } from 'next/server';
import { ApprovePlanCommandSchema } from '@/contracts/planning';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { isDevPreviewEnabled } from '@/server/config/env';
import { SYNTHETIC_PLAN_V1 } from '@/dev/fixtures';
import { verifyApprovalCompatibility } from '@/server/policy/approval-guard';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = ApprovePlanCommandSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'INVALID_APPROVAL_PAYLOAD', 'Validation failed', parsed.error.format()),
        { status: 400 }
      );
    }

    if (parsed.data.investigationId !== id) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'ID_MISMATCH', 'Path parameter does not match payload investigationId'),
        { status: 400 }
      );
    }

    // In preview mode, return explicitly simulated approval
    if (isDevPreviewEnabled()) {
      const simulatedRecord = {
        id: crypto.randomUUID(),
        investigationId: id,
        planVersion: parsed.data.planVersion,
        planHash: parsed.data.approvedPlanHash,
        approvedBy: 'operator-preview-persona',
        operatorNotes: parsed.data.operatorNotes || null,
        approvedAt: new Date().toISOString(),
        isSimulatedPreview: true,
      };

      return NextResponse.json({
        data: simulatedRecord,
        status: 'APPROVED',
        message: 'Plan approved in development simulation mode. No live browser jobs queued.',
      });
    }

    // Live mode: requires authenticated principal
    const principal = await requireAuthenticatedPrincipal(req);

    // Verify cryptographic plan compatibility
    const compatibility = verifyApprovalCompatibility(SYNTHETIC_PLAN_V1, {
      id: crypto.randomUUID(),
      investigationId: id,
      planVersion: parsed.data.planVersion,
      planHash: parsed.data.approvedPlanHash,
      approvedBy: principal.id,
      operatorNotes: parsed.data.operatorNotes || null,
      approvedAt: new Date().toISOString(),
    });

    if (!compatibility.isCompatible) {
      return NextResponse.json(
        createSafeError('CONFLICT_STALE_VERSION', 'PLAN_HASH_MISMATCH', compatibility.reason || 'Hash mismatch'),
        { status: 409 }
      );
    }

    return NextResponse.json({
      data: {
        investigationId: id,
        planVersion: parsed.data.planVersion,
        planHash: parsed.data.approvedPlanHash,
        approvedBy: principal.id,
        approvedAt: new Date().toISOString(),
      },
      status: 'APPROVED',
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 403 });
    }
    return NextResponse.json(
      createSafeError('INTERNAL_ERROR', 'SERVER_ERROR', error instanceof Error ? error.message : 'Unknown error'),
      { status: 500 }
    );
  }
}
