import { NextResponse } from 'next/server';
import { getServerEnv, isDevPreviewEnabled } from '@/server/config/env';
import { getSystemReadiness } from '@/server/services/service-container';

export async function GET() {
  try {
    const env = getServerEnv();
    const previewActive = isDevPreviewEnabled();
    const liveReadiness = await getSystemReadiness();

    // Distinguish configuration existence from live operational readiness (F-11)
    const readinessReport = {
      status: previewActive ? 'ready_preview' : (liveReadiness.overallStatus === 'OPERATIONAL' ? 'operational' : 'degraded'),
      overallStatus: liveReadiness.overallStatus,
      processAlive: true,
      environment: env.NODE_ENV,
      previewMode: previewActive,
      components: liveReadiness.components,
      subsystems: {
        configuration: {
          valid: true,
          databaseUrlPresent: Boolean(env.DATABASE_URL),
          aiApiKeyPresent: Boolean(env.OPENAI_API_KEY),
          s3EndpointPresent: Boolean(env.S3_ENDPOINT),
        },
        persistence: {
          applied: liveReadiness.components.database.status === 'AVAILABLE',
          status: liveReadiness.components.database.status === 'AVAILABLE' ? 'ready' : 'offline',
        },
        executionQueue: {
          configured: Boolean(env.DATABASE_URL),
          status: liveReadiness.components.queue.status === 'AVAILABLE' ? 'ready' : 'offline',
          outboxRelayReady: liveReadiness.components.queue.status === 'AVAILABLE',
          diagnosticReady: liveReadiness.components.queue.status === 'AVAILABLE',
          workerActive: liveReadiness.components.worker.status === 'AVAILABLE',
        },
        browserAutomation: {
          driverAvailable: liveReadiness.components.browserRuntime.status === 'AVAILABLE',
          status: liveReadiness.components.browserRuntime.status === 'AVAILABLE' ? 'ready' : 'unavailable',
          message: 'Playwright headless browser execution engine and evidence capture subsystem ready',
        },
        verificationAndReset: {
          verifierAvailable: liveReadiness.components.database.status === 'AVAILABLE',
          status: liveReadiness.components.database.status === 'AVAILABLE' ? 'ready' : 'offline',
          twoAttemptOrchestratorReady: liveReadiness.components.database.status === 'AVAILABLE',
          deterministicAssertionsReady: true,
          targetResetClientReady: true,
        },
        evidenceStorage: {
          bucketAccessible: liveReadiness.components.evidenceStorage.status === 'AVAILABLE',
          status: liveReadiness.components.evidenceStorage.status === 'AVAILABLE' ? 'ready' : 'runtime_deferred',
        },
        aiIntegration: {
          configured: liveReadiness.components.openai.status === 'AVAILABLE',
          provider: env.AI_PROVIDER,
          model: env.AI_PROVIDER === 'local_ollama' ? env.LOCAL_AI_MODEL : 'gpt-6-luna',
          status: liveReadiness.components.openai.status === 'AVAILABLE' ? 'ready' : 'unconfigured',
        },
      },
      investigationExecutionReady: previewActive || liveReadiness.overallStatus === 'OPERATIONAL',
      timestamp: liveReadiness.timestamp,
    };

    const isOperational = previewActive || liveReadiness.overallStatus === 'OPERATIONAL';
    const httpStatusCode = isOperational ? 200 : 503;

    return NextResponse.json(readinessReport, { status: httpStatusCode });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'not_ready',
        processAlive: true,
        error: error instanceof Error ? error.message : 'Configuration failure',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
