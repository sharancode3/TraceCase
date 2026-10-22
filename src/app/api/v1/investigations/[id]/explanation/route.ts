import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { evidenceReviewService } from '@/server/ai/evidence-review-service';
import { handleWorkflowError } from '@/server/workflow/workflow-http';
import { InvestigationClaimHandler } from '@/server/queue/investigation-claim-handler';
import { executionLeaseService } from '@/server/queue/execution-lease.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const principal = await requireAuthenticatedPrincipal(req);
    await investigationWorkflowService.getInvestigationSnapshot(id, principal.id);
    const row = await evidenceReviewService.getPersistedExplanation(id);
    return NextResponse.json({ data: row ? {
      summary: row.naturalLanguageSummary,
      verifiedFacts: row.verifiedFactsExplanation,
      observationsVsHypotheses: row.observationsVsHypotheses,
      limitations: row.limitationsAndGaps,
      generatedAt: row.generatedAt.toISOString(),
    } : null });
  } catch (error) { return handleWorkflowError(error); }
}

// In-flight explanation regeneration promises to deduplicate concurrent requests per investigation
const inFlightExplanations = new Map<string, Promise<void>>();

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const principal = await requireAuthenticatedPrincipal(req);
    await investigationWorkflowService.getInvestigationSnapshot(id, principal.id);

    // Guard against concurrent duplicate review requests
    let inFlight = inFlightExplanations.get(id);
    if (!inFlight) {
      inFlight = (async () => {
        try {
          await new InvestigationClaimHandler(executionLeaseService).regenerateExplanation(id);
        } finally {
          inFlightExplanations.delete(id);
        }
      })();
      inFlightExplanations.set(id, inFlight);
    }
    await inFlight;

    return GET(req, context);
  } catch (error) { return handleWorkflowError(error); }
}
