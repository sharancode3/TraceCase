import { NextRequest, NextResponse } from 'next/server';
import { isDevPreviewEnabled } from '@/server/config/env';
import { SYNTHETIC_INVESTIGATIONS_CATALOG } from '@/dev/fixtures';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { investigationsRepository } from '@/server/db/repositories/investigations.repository';

export async function GET(req: NextRequest) {
  if (isDevPreviewEnabled()) {
    return NextResponse.json({
      data: SYNTHETIC_INVESTIGATIONS_CATALOG,
      total: SYNTHETIC_INVESTIGATIONS_CATALOG.length,
      mode: 'preview_synthetic',
    });
  }

  try {
    const principal = await requireAuthenticatedPrincipal(req);

    const investigations = await investigationsRepository.listInvestigations(principal.id);

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
