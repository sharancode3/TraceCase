import { NextRequest, NextResponse } from 'next/server';
import {
  CreateTargetCommandSchema,
  projectSafeTargetProfile,
  parseAndNormalizeTargetUrl,
} from '@/contracts/targets';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { targetsRepository } from '@/server/db/repositories/targets.repository';

export async function GET(req: NextRequest) {
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

    // Server-side authoritative URL & SSRF validation
    const urlCheck = parseAndNormalizeTargetUrl(parsed.data.baseUrl);
    if (!urlCheck.isValid || !urlCheck.normalizedOrigin) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'INVALID_TARGET_URL', urlCheck.error || 'Invalid target baseUrl'),
        { status: 400 }
      );
    }

    // Validate any extra allowed origins against SSRF and parse rules
    const validatedOrigins = new Set<string>([urlCheck.normalizedOrigin]);
    if (parsed.data.allowedOrigins && parsed.data.allowedOrigins.length > 0) {
      for (const originStr of parsed.data.allowedOrigins) {
        const originCheck = parseAndNormalizeTargetUrl(originStr);
        if (!originCheck.isValid || !originCheck.normalizedOrigin) {
          return NextResponse.json(
            createSafeError('VALIDATION_FAILED', 'INVALID_ALLOWED_ORIGIN', originCheck.error || `Invalid allowed origin '${originStr}'`),
            { status: 400 }
          );
        }
        validatedOrigins.add(originCheck.normalizedOrigin);
      }
    }

    // Validate fixture reset endpoint if provided
    if (parsed.data.fixtureResetEndpoint) {
      const resetCheck = parseAndNormalizeTargetUrl(parsed.data.fixtureResetEndpoint);
      if (!resetCheck.isValid) {
        return NextResponse.json(
          createSafeError('VALIDATION_FAILED', 'INVALID_RESET_ENDPOINT', resetCheck.error || 'Invalid fixture reset hook URL'),
          { status: 400 }
        );
      }
    }

    // Live mode: requires authenticated principal and real persistence
    const principal = await requireAuthenticatedPrincipal(req);

    // In local development, non-production sandbox requests are verified
    const isLocalDev = process.env.NODE_ENV === 'development' || process.env.DEV_PREVIEW_MODE === 'true';
    const isProduction = parsed.data.environment === 'production';
    const isSandboxRequested = Boolean(parsed.data.isSandboxRequested);
    const isSandboxVerified = isSandboxRequested && !isProduction && isLocalDev;

    // For local targets on localhost / port 3005, auto-link reset endpoint and secret if not explicitly provided
    const isLocalDemo = urlCheck.normalizedOrigin.includes('3005') || urlCheck.normalizedOrigin.includes('3006') || urlCheck.normalizedOrigin.includes('localhost');
    const defaultResetEndpoint = isLocalDemo ? `${urlCheck.normalizedOrigin}/api/test/reset-fixture` : null;
    const defaultSecretRef = isLocalDemo ? 'env:TARGET_RESET_SECRET' : null;

    const created = await targetsRepository.createTarget({
      ownerId: principal.id,
      name: parsed.data.name,
      baseUrl: urlCheck.normalizedBaseUrl || parsed.data.baseUrl,
      allowedOrigins: Array.from(validatedOrigins),
      isSandbox: isSandboxRequested,
      isSandboxVerified,
      testAccountRef: parsed.data.testAccountRef,
      fixtureResetEndpoint: parsed.data.fixtureResetEndpoint || defaultResetEndpoint,
      fixtureResetAuthSecretRef: defaultSecretRef,
      environment: parsed.data.environment,
      createdBy: principal.id,
    });

    const safeTarget = projectSafeTargetProfile({
      ...(created as unknown as Record<string, unknown>),
      fixtureScope: parsed.data.fixtureScope || (parsed.data.baseUrl.includes('/workbench') ? 'workbench_work_items' : undefined),
    });

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
