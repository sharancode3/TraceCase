import { NextRequest, NextResponse } from 'next/server';
import { isDevPreviewEnabled } from '@/server/config/env';
import { SYNTHETIC_INVESTIGATIONS_CATALOG } from '@/dev/fixtures';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDevPreviewEnabled()) {
    const item = SYNTHETIC_INVESTIGATIONS_CATALOG.find((inv) => inv.id === id);
    if (!item) {
      return NextResponse.json(
        createSafeError('NOT_FOUND', 'INVESTIGATION_NOT_FOUND', `Investigation ${id} not found`),
        { status: 404 }
      );
    }
    return NextResponse.json({ data: item, mode: 'preview_synthetic' });
  }

  try {
    await requireAuthenticatedPrincipal(req);
    return NextResponse.json(
      createSafeError('NOT_FOUND', 'INVESTIGATION_NOT_FOUND', `Investigation ${id} not found in database`),
      { status: 404 }
    );
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    return NextResponse.json(createSafeError('INTERNAL_ERROR', 'SERVER_ERROR', 'Unexpected error'), { status: 500 });
  }
}
