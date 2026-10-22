import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { eventsRepository } from '@/server/db/repositories/events.repository';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  

  try {
    const principal = await requireAuthenticatedPrincipal(req);

    // Verify ownership
    await investigationWorkflowService.getOwnedInvestigationOrThrow(id, principal.id);

    const searchParams = req.nextUrl.searchParams;
    const afterSequenceRaw = searchParams.get('afterSequence');
    const limitRaw = searchParams.get('limit');

    const afterSequence = afterSequenceRaw ? parseInt(afterSequenceRaw, 10) : 0;
    const limit = limitRaw ? parseInt(limitRaw, 10) : 50;

    const result = await eventsRepository.getEventsByInvestigation({
      investigationId: id,
      afterSequence: Number.isNaN(afterSequence) ? 0 : Math.max(0, afterSequence),
      limit: Number.isNaN(limit) ? 50 : Math.max(1, limit),
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleWorkflowError(error);
  }
}
