import { NextRequest, NextResponse } from 'next/server';
import { ApprovePlanCommandSchema } from '@/contracts/planning';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
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
    const parsed = ApprovePlanCommandSchema.safeParse(rawBody);

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
    

    // Live mode: requires authenticated principal
    const principal = await requireAuthenticatedPrincipal(req);
    const idempotencyKey = extractIdempotencyKey(req, rawBody as Record<string, unknown>);

    return await executeWithIdempotency({
      principalId: principal.id,
      idempotencyKey,
      resourceId: id,
      commandName: 'APPROVE_PLAN',
      payload: parsed.data,
      handler: async () => {
        const result = await investigationWorkflowService.approvePlan({
          investigationId: id,
          ownerId: principal.id,
          planVersion: parsed.data.planVersion,
          approvedPlanHash: parsed.data.approvedPlanHash,
          operatorNotes: parsed.data.operatorNotes,
          expectedWorkflowRevision: parsed.data.expectedWorkflowRevision,
        });

        return {
          status: 200,
          body: {
            data: result.approvalRecord,
            status: 'APPROVED',
            workflowRevision: result.workflowRevision,
          },
        };
      },
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
