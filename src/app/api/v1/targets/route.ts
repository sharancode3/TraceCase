import { NextRequest, NextResponse } from 'next/server';
import { CreateTargetCommandSchema, projectSafeTargetProfile } from '@/contracts/targets';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { SYNTHETIC_TARGETS } from '@/dev/fixtures';
import { isDevPreviewEnabled } from '@/server/config/env';
import { targetsRepository } from '@/server/db/repositories/targets.repository';

export async function GET(req: NextRequest) {
  // If preview is active, return sanitized synthetic catalog (F-03: zero secrets leaked)
  if (isDevPreviewEnabled()) {
    const safeTargets = SYNTHETIC_TARGETS.map((t) => projectSafeTargetProfile(t as unknown as Record<string, unknown>));
    return NextResponse.json({
      data: safeTargets,
      total: safeTargets.length,
      mode: 'preview_synthetic',
    });
  }

  try {
    const principal = await requireAuthenticatedPrincipal(req);

    const targets = await targetsRepository.listTargets(principal.id);
    const safeTargets = targets.map((t) => projectSafeTargetProfile(t as unknown as Record<string, unknown>));

    return NextResponse.json({
      data: safeTargets,
      total: safeTargets.length,
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
      createSafeError('SERVICE_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE', error instanceof Error ? error.message : 'Database unavailable'),
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateTargetCommandSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'INVALID_TARGET_PAYLOAD', 'Payload validation failed', parsed.error.format()),
        { status: 400 }
      );
    }

    if (isDevPreviewEnabled()) {
      const now = new Date().toISOString();
      const simulatedTarget = projectSafeTargetProfile({
        id: crypto.randomUUID(),
        name: parsed.data.name,
        baseUrl: parsed.data.baseUrl,
        allowedOrigins: parsed.data.allowedOrigins,
        isSandboxVerified: false, // Server controls sandbox classification, never client command
        environment: parsed.data.environment,
        createdAt: now,
        updatedAt: now,
      });

      return NextResponse.json(
        {
          data: simulatedTarget,
          created: true,
          mode: 'preview_synthetic',
          message: 'Target created in development simulation mode. Database write deferred to Stage 1.',
        },
        { status: 201 }
      );
    }

    // Live mode: requires authenticated principal and real persistence
    const principal = await requireAuthenticatedPrincipal(req);

    const created = await targetsRepository.createTarget({
      ownerId: principal.id,
      name: parsed.data.name,
      baseUrl: parsed.data.baseUrl,
      allowedOrigins: parsed.data.allowedOrigins,
      isSandbox: parsed.data.isSandboxRequested,
      isSandboxVerified: false, // Server authoritative verification
      testAccountRef: parsed.data.testAccountRef,
      fixtureResetEndpoint: parsed.data.fixtureResetEndpoint,
      environment: parsed.data.environment,
      createdBy: principal.id,
    });

    const safeTarget = projectSafeTargetProfile(created as unknown as Record<string, unknown>);

    return NextResponse.json(
      {
        data: safeTarget,
        created: true,
        mode: 'live',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 403 });
    }
    return NextResponse.json(
      createSafeError('SERVICE_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE', error instanceof Error ? error.message : 'Database write unavailable'),
      { status: 503 }
    );
  }
}
