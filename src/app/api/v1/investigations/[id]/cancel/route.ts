import { NextRequest, NextResponse } from 'next/server';
import { CancelInvestigationCommandSchema } from '@/contracts/planning';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { isDevPreviewEnabled } from '@/server/config/env';
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
    const rawBody = await req.json();
    const parsed = CancelInvestigationCommandSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'INVALID_CANCEL_PAYLOAD', 'Validation failed', parsed.error.format()),
        { status: 400 }
      );
    }

    if (parsed.data.investigationId !== id) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'ID_MISMATCH', 'Path parameter does not match payload investigationId'),
        { status: 400 }
      );
    }

    if (isDevPreviewEnabled()) {
      return NextResponse.json({
        status: 'CANCELLED',
        investigationId: id,
        cancellationReason: parsed.data.cancellationReason,
        isSimulatedPreview: true,
      });
    }

    const principal = await requireAuthenticatedPrincipal(req);
    const idempotencyKey = extractIdempotencyKey(req, rawBody as Record<string, unknown>);

    return await executeWithIdempotency({
      principalId: principal.id,
      idempotencyKey,
      resourceId: id,
      commandName: 'CANCEL_INVESTIGATION',
      payload: parsed.data,
      handler: async () => {
        const result = await investigationWorkflowService.cancelInvestigation({
          investigationId: id,
          ownerId: principal.id,
          cancellationReason: parsed.data.cancellationReason,
          expectedWorkflowRevision: parsed.data.expectedWorkflowRevision,
        });

        return {
          status: 200,
          body: {
            status: 'CANCELLED',
            workflowRevision: result.workflowRevision,
          },
        };
      },
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
