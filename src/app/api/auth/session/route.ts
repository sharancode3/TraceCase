import { NextRequest, NextResponse } from 'next/server';
import { resolvePrincipal } from '@/server/auth';
import { createOperatorToken } from '@/server/auth/operator-auth';

export async function GET(req: NextRequest) {
  try {
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
      mode: 'operator_session',
    });
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

    const response = NextResponse.json({
      success: true,
      token,
      principal: {
        email,
        role: 'operator',
        label: 'TraceCase Operator',
      },
      message: 'Operator session established.',
    });

    // Set genuine tc_session cookie
    response.cookies.set('tc_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
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
