import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { RequestPlanningCommandSchema } from '@/contracts/planning';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { isDevPreviewEnabled } from '@/server/config/env';
import { getDb } from '@/server/db';
import { getServiceContainer } from '@/server/services/service-container';
import { investigationsTable, experimentPlanRevisionsTable } from '@/server/db/schema';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import {
  handleWorkflowError,
  extractIdempotencyKey,
  executeWithIdempotency,
} from '@/server/workflow/workflow-http';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const rawBody = (await req.json().catch(() => ({}))) || {};
    const payloadWithId = {
      investigationId: id,
      ...rawBody,
    };
    const parsed = RequestPlanningCommandSchema.safeParse(payloadWithId);

    if (!parsed.success) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'INVALID_PLAN_REQUEST_PAYLOAD', 'Validation failed', parsed.error.format()),
        { status: 400 }
      );
    }

    if (isDevPreviewEnabled()) {
      return NextResponse.json({
        status: 'PROPOSAL_READY',
        investigationId: id,
        message: 'Plan proposed in development preview mode.',
        isSimulatedPreview: true,
      });
    }

    const principal = await requireAuthenticatedPrincipal(req);
    const idempotencyKey = extractIdempotencyKey(req, rawBody as Record<string, unknown>);

    return await executeWithIdempotency({
      principalId: principal.id,
      idempotencyKey,
      resourceId: id,
      commandName: 'REQUEST_PLANNING',
      payload: parsed.data,
      handler: async () => {
        const result = await investigationWorkflowService.requestPlanning({
          investigationId: id,
          ownerId: principal.id,
          userGuidance: parsed.data.userGuidance,
          expectedWorkflowRevision: parsed.data.expectedWorkflowRevision,
          plannerPort: getServiceContainer().clarificationAgent,
        });

        return {
          status: 200,
          body: {
            data: result,
          },
        };
      },
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDevPreviewEnabled()) {
    return NextResponse.json({
      data: {
        investigationId: id,
        version: 1,
        message: 'Preview plan details',
      },
      mode: 'preview_synthetic',
    });
  }

  try {
    const principal = await requireAuthenticatedPrincipal(req);
    const db = getDb();

    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(
        and(
          eq(investigationsTable.id, id),
          eq(investigationsTable.ownerId, principal.id)
        )
      )
      .limit(1);

    if (!inv) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'INVESTIGATION_NOT_FOUND', `Investigation ${id} not found`),
        { status: 404 }
      );
    }

    if (!inv.planVersion) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'PLAN_NOT_FOUND', `No plan revision exists for investigation ${id}`),
        { status: 404 }
      );
    }

    const [revision] = await db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(
        and(
          eq(experimentPlanRevisionsTable.investigationId, id),
          eq(experimentPlanRevisionsTable.version, inv.planVersion)
        )
      )
      .limit(1);

    if (!revision) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'PLAN_REVISION_NOT_FOUND', `Plan revision v${inv.planVersion} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: revision.planPayload,
      version: revision.version,
      planHash: revision.planHash,
      createdAt: revision.createdAt.toISOString(),
      mode: 'live',
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
