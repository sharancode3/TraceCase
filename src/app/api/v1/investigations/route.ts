import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { investigationsRepository } from '@/server/db/repositories/investigations.repository';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';

export async function GET(req: NextRequest) {
  

  try {
    const principal = await requireAuthenticatedPrincipal(req);

    const records = await investigationsRepository.listInvestigations(principal.id);
    const investigations = await Promise.all(records.map((record) =>
      investigationWorkflowService.getInvestigationSnapshot(record.id, principal.id)
    ));

    return NextResponse.json({
      data: investigations,
      total: investigations.length,
      mode: 'live',
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 403 });
    }
    return NextResponse.json(
      createSafeError('SERVICE_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE', error instanceof Error ? error.message : 'Database query unavailable'),
      { status: 503 }
    );
  }
}
