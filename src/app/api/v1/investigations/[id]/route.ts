import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  

  try {
    const principal = await requireAuthenticatedPrincipal(req);
    const snapshot = await investigationWorkflowService.getInvestigationSnapshot(id, principal.id);

    return NextResponse.json({ data: snapshot, mode: 'live' });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
