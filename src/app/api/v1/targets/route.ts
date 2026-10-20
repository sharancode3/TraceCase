import { NextRequest, NextResponse } from 'next/server';
import { CreateTargetCommandSchema } from '@/contracts/targets';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { SYNTHETIC_TARGETS } from '@/dev/fixtures';
import { isDevPreviewEnabled } from '@/server/config/env';

export async function GET(req: NextRequest) {
  // If preview is active and request is read-only preview, return sanitized synthetic catalog
  if (isDevPreviewEnabled()) {
    return NextResponse.json({
      data: SYNTHETIC_TARGETS,
      total: SYNTHETIC_TARGETS.length,
      mode: 'preview_synthetic',
    });
  }

  try {
    await requireAuthenticatedPrincipal(req);
    // In live mode with database connected, query targets table
    return NextResponse.json({ data: [], total: 0, mode: 'live_database' });
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    return NextResponse.json(createSafeError('INTERNAL_ERROR', 'SERVER_ERROR', 'Unexpected error'), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requireAuthenticatedPrincipal(req);
    const body = await req.json();
    const parsed = CreateTargetCommandSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'INVALID_TARGET_PAYLOAD', 'Payload validation failed', parsed.error.format()),
        { status: 400 }
      );
    }

    // In Stage 0, persistence to database is stubbed behind interface
    const newTarget = {
      id: crypto.randomUUID(),
      name: parsed.data.name,
      baseUrl: parsed.data.baseUrl,
      allowedOrigins: parsed.data.allowedOrigins,
      isSandbox: false, // Server controls sandbox classification, never client command
      environment: parsed.data.environment,
      createdBy: principal.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ data: newTarget, created: true }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 403 });
    }
    return NextResponse.json(
      createSafeError('INTERNAL_ERROR', 'SERVER_ERROR', error instanceof Error ? error.message : 'Unknown error'),
      { status: 500 }
    );
  }
}
