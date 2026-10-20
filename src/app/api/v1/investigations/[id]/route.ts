import { NextRequest, NextResponse } from 'next/server';
import { isDevPreviewEnabled } from '@/server/config/env';
import { SYNTHETIC_INVESTIGATIONS_CATALOG } from '@/dev/fixtures';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDevPreviewEnabled()) {
    const item = SYNTHETIC_INVESTIGATIONS_CATALOG.find((inv) => inv.id === id);
    if (!item) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'INVESTIGATION_NOT_FOUND', `Investigation ${id} not found in preview catalog`),
        { status: 404 }
      );
    }
    return NextResponse.json({ data: item, mode: 'preview_synthetic' });
  }

  try {
    const principal = await requireAuthenticatedPrincipal(req);
    const snapshot = await investigationWorkflowService.getInvestigationSnapshot(id, principal.id);

    return NextResponse.json({ data: snapshot, mode: 'live' });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
