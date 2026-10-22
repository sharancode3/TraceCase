import { NextResponse } from 'next/server';
import { getDevPublicJwks, assertDevAuthAllowed } from '@/server/auth/dev-auth';

export async function GET() {
  try {
    assertDevAuthAllowed();
    const jwks = await getDevPublicJwks();
    return NextResponse.json(jwks, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/json',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
}
