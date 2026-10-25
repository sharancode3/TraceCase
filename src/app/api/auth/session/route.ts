import { NextRequest, NextResponse } from 'next/server';
import { resolvePrincipal } from '@/server/auth';
import { createOperatorToken } from '@/server/auth/operator-auth';
import { verifyJwtToken } from '@/server/auth/jwt';
import { principalsRepository } from '@/server/db/repositories/principals.repository';
import { isDbConfigured, ensureDatabaseMigrated } from '@/server/db';
import { ensureCuratedInvestigations } from '@/server/workflow/curated-investigations';

export async function GET(req: NextRequest) {
  try {
    let principal = await resolvePrincipal(req);
    let token: string | null = null;

    if (!principal) {
      // Auto-establish operator session so refreshing in browser never signs out the user
      token = await createOperatorToken({ email: 'operator@tracecase.local' });
      const claims = await verifyJwtToken(token);
      if (isDbConfigured()) {
        await ensureDatabaseMigrated();
        const principalRecord = await principalsRepository.findOrCreateByExternalAuth({
          externalIssuer: claims.issuer,
          externalSubject: claims.subject,
          email: claims.email,
          role: 'operator',
        });
        principal = {
          id: principalRecord.id,
          email: principalRecord.email ?? 'operator@tracecase.local',
          role: 'operator',
          externalIssuer: principalRecord.externalIssuer,
          externalSubject: principalRecord.externalSubject,
        };
      }
    }

    if (principal && isDbConfigured()) {
      ensureCuratedInvestigations(principal.id).catch((err) => {
        console.warn('[CuratedInvestigations] Auto-sync error:', err);
      });
    }

    const response = NextResponse.json({
      authenticated: Boolean(principal),
      token,
      principal: principal
        ? {
            id: principal.id,
            email: principal.email,
            role: principal.role,
          }
        : null,
      mode: 'operator_session',
    });

    if (token) {
      // Set persistent 30-day session cookie
      response.cookies.set('tc_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to resolve session' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = body?.email || 'operator@tracecase.local';

    const token = await createOperatorToken({ email });

    let principalId: string | undefined;
    if (isDbConfigured()) {
      await ensureDatabaseMigrated();
      const claims = await verifyJwtToken(token);
      const principalRecord = await principalsRepository.findOrCreateByExternalAuth({
        externalIssuer: claims.issuer,
        externalSubject: claims.subject,
        email: claims.email,
        role: 'operator',
      });
      principalId = principalRecord.id;
      ensureCuratedInvestigations(principalRecord.id).catch((err) => {
        console.warn('[CuratedInvestigations] Auto-sync error on login:', err);
      });
    }

    const response = NextResponse.json({
      success: true,
      token,
      principal: {
        id: principalId,
        email,
        role: 'operator',
        label: 'TraceCase Operator',
      },
      message: 'Operator session established.',
    });

    // Set persistent 30-day session cookie
    response.cookies.set('tc_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to establish operator session.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: 'Operator session terminated.',
  });

  // Explicitly invalidate tc_session cookie
  response.cookies.set('tc_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
