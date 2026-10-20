import { NextRequest, NextResponse } from 'next/server';
import { isDevPreviewEnabled } from '@/server/config/env';
import { SYNTHETIC_INVESTIGATIONS_CATALOG } from '@/dev/fixtures';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';

export async function GET(req: NextRequest) {
  if (isDevPreviewEnabled()) {
    return NextResponse.json({
      data: SYNTHETIC_INVESTIGATIONS_CATALOG,
      total: SYNTHETIC_INVESTIGATIONS_CATALOG.length,
      mode: 'preview_synthetic',
    });
  }

  try {
    await requireAuthenticatedPrincipal(req);
    return NextResponse.json({ data: [], total: 0, mode: 'live_database' });
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    return NextResponse.json(createSafeError('INTERNAL_ERROR', 'SERVER_ERROR', 'Unexpected error'), { status: 500 });
  }
}
