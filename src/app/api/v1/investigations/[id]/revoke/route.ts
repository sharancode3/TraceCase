import { NextRequest, NextResponse } from 'next/server';
import { RevokeApprovalCommandSchema } from '@/contracts/planning';
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
    const parsed = RevokeApprovalCommandSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'INVALID_REVOKE_PAYLOAD', 'Validation failed', parsed.error.format()),
        { status: 400 }
      );
    }

    if (parsed.data.investigationId !== id) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'ID_MISMATCH', 'Path parameter does not match payload investigationId'),
        { status: 400 }
      );
    }

    

    const principal = await requireAuthenticatedPrincipal(req);
    const idempotencyKey = extractIdempotencyKey(req, rawBody as Record<string, unknown>);

    return await executeWithIdempotency({
      principalId: principal.id,
      idempotencyKey,
      resourceId: id,
      commandName: 'REVOKE_APPROVAL',
      payload: parsed.data,
      handler: async () => {
        const result = await investigationWorkflowService.revokeApproval({
          investigationId: id,
          ownerId: principal.id,
          planVersion: parsed.data.planVersion,
          revocationReason: parsed.data.revocationReason,
          expectedWorkflowRevision: parsed.data.expectedWorkflowRevision,
        });

        return {
          status: 200,
          body: {
            status: 'REVOKED',
            workflowRevision: result.workflowRevision,
          },
        };
      },
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
