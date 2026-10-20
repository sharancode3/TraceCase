import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'tracecase-web',
    timestamp: new Date().toISOString(),
    stage: 'Stage 0: Foundation Baseline',
  });
}
