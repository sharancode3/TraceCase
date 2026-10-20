import { NextResponse } from 'next/server';
import { getServerEnv, isDevPreviewEnabled } from '@/server/config/env';

export async function GET() {
  try {
    const env = getServerEnv();
    const previewActive = isDevPreviewEnabled();

    return NextResponse.json({
      status: 'ready',
      environment: env.NODE_ENV,
      previewMode: previewActive,
      integrations: {
        databaseConfigured: Boolean(env.DATABASE_URL),
        aiConfigured: Boolean(env.OPENAI_API_KEY),
        storageConfigured: Boolean(env.S3_ENDPOINT),
        workerPortConfigured: env.WORKER_PORT > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'not_ready',
        error: error instanceof Error ? error.message : 'Unknown configuration error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
