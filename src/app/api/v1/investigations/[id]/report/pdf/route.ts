import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { investigationReportService } from '@/server/reporting/investigation-report.service';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isDownload = req.nextUrl.searchParams.get('download') === 'true';

  try {
    const principal = await requireAuthenticatedPrincipal(req);
    const reportData = await investigationReportService.getCanonicalReport(id, principal.id);
    const pdfBuffer = await investigationReportService.generateReportPdf(reportData);

    const filename = `tracecase-investigation-report-${id.slice(0, 8)}.pdf`;
    const disposition = isDownload ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
