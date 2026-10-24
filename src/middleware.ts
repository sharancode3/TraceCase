import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware for TraceCase Vercel Frontend Deployment Boundary
 *
 * Implements:
 * 1. Honest "Vercel first" state: If deployed on Vercel (or APP_ROLE=frontend) and
 *    BACKEND_API_URL is not yet configured, returns a structured 503 BACKEND_NOT_CONNECTED
 *    error rather than failing cryptically or attempting to run without backend infrastructure.
 * 2. Unrestricted local development & Render backend execution: Requests pass through
 *    directly to local route handlers when running in development or on Render.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Intercept API routes only
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const isVercelFrontend = Boolean(
    process.env.VERCEL === '1' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.APP_ROLE === 'frontend'
  );

  // If on Vercel frontend and BACKEND_API_URL is missing, report honest infrastructure state
  if (isVercelFrontend && !process.env.BACKEND_API_URL) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BACKEND_NOT_CONNECTED',
          category: 'INFRASTRUCTURE_UNAVAILABLE',
          message:
            'TraceCase frontend is running on Vercel, but BACKEND_API_URL is not configured yet. Complete the Render backend deployment and set BACKEND_API_URL in your Vercel Project Settings.',
          details: {
            topology: 'Vercel Frontend + Render Backend',
            status: 'Frontend Deployed / Backend Not Connected',
            actionRequired:
              'Set BACKEND_API_URL=https://<your-render-api-service>.onrender.com in Vercel Environment Variables and redeploy.',
          },
        },
        mode: 'unconnected',
      },
      { status: 503 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
