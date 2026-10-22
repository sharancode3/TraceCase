import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { getDb } from '@/server/db';
import { investigationsTable } from '@/server/db/schema';
import { clarificationsRepository } from '@/server/db/repositories/clarifications.repository';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  

  try {
    const principal = await requireAuthenticatedPrincipal(req);
    const db = getDb();

    // Verify ownership
    const [inv] = await db
      .select({ id: investigationsTable.id })
      .from(investigationsTable)
      .where(
        and(
          eq(investigationsTable.id, id),
          eq(investigationsTable.ownerId, principal.id)
        )
      )
      .limit(1);

    if (!inv) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'INVESTIGATION_NOT_FOUND', `Investigation ${id} not found`),
        { status: 404 }
      );
    }

    const questions = await clarificationsRepository.listQuestions(id);

    return NextResponse.json({
      data: questions,
      total: questions.length,
      mode: 'live',
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
