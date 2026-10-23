import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { investigationReportService } from '@/server/reporting/investigation-report.service';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const principal = await requireAuthenticatedPrincipal(req);
    const reportData = await investigationReportService.getCanonicalReport(id, principal.id);

    return NextResponse.json({ success: true, data: reportData });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
