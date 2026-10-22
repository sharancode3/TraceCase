import { NextRequest, NextResponse } from 'next/server';
import { resolvePrincipal } from '@/server/auth';
import { createDevOperatorToken, assertDevAuthAllowed } from '@/server/auth/dev-auth';

export async function GET(req: NextRequest) {
  try {
    assertDevAuthAllowed();
    const principal = await resolvePrincipal(req);
    return NextResponse.json({
      authenticated: Boolean(principal),
      principal: principal
        ? {
            id: principal.id,
            email: principal.email,
            role: principal.role,
          }
        : null,
      mode: 'local_development',
    });
  } catch {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertDevAuthAllowed();
    const body = await req.json().catch(() => ({}));
    const email = body?.email || 'operator@tracecase.local';

    const token = await createDevOperatorToken({ email });

    const response = NextResponse.json({
      success: true,
      token,
      principal: {
        email,
        role: 'operator',
        label: 'Local Development Operator',
      },
      message: 'Local development session established.',
    });

    // Set genuine tc_session cookie
    response.cookies.set('tc_session', token, {
      httpOnly: true,
      secure: false, // Local HTTP development
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: 'Failed to create development session',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    assertDevAuthAllowed();
    const response = NextResponse.json({
      success: true,
      message: 'Development session cleared.',
    });

    response.cookies.set('tc_session', '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
}
