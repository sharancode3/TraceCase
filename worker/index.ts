import http from 'node:http';
import { getWorkerConfig } from './config';
import {
  PgBossAdapter,
  InMemoryQueueAdapter,
  QueueAdapter,
  QUEUE_SYSTEM_DIAGNOSTIC,
  QUEUE_INVESTIGATION_EXECUTION,
  DiagnosticJobData,
  InvestigationExecutionJobData,
  executionLeaseService,
  DiagnosticJobHandler,
  InvestigationClaimHandler,
  OutboxRelayService,
  workerHeartbeatService,
} from '@/server/queue';
import { PlaywrightBrowserWorker } from '@/server/browser';
import { TwoAttemptController } from '@/server/verification/two-attempt-controller';
import type { BrowserWorkerPort, BrowserInvestigationAgentPort } from '@/server/services/ports';
import { getServiceContainer } from '@/server/services/service-container';

export async function bootstrapWorker(
  customQueue?: QueueAdapter,
  customBrowserWorker?: BrowserWorkerPort,
  customBrowserAgent?: BrowserInvestigationAgentPort
) {
  const config = getWorkerConfig();
  console.log('[TraceCase Worker] Initializing daemon process...');
  console.log(`[TraceCase Worker] Worker ID: ${config.workerId}`);
  console.log(`[TraceCase Worker] Global Execution Lease Slot: Concurrency-1 singleton`);

  let isShuttingDown = false;
  let activeJobCount = 0;

  // Select queue adapter
  const queue: QueueAdapter =
    customQueue ||
    (process.env.USE_IN_MEMORY_QUEUE === 'true'
      ? new InMemoryQueueAdapter()
      : new PgBossAdapter(config.databaseUrl));

  const browserWorker: BrowserWorkerPort =
    customBrowserWorker || new PlaywrightBrowserWorker();
  const browserAgent: BrowserInvestigationAgentPort =
    customBrowserAgent || getServiceContainer().browserAgent;
  const diagnosticHandler = new DiagnosticJobHandler(executionLeaseService);
  const controller = new TwoAttemptController(
    executionLeaseService,
    browserWorker,
    undefined,
    {
      browserAgent,
      defaultExecutionMode: (process.env.DEFAULT_EXECUTION_MODE as any) || 'AI_GROUNDED',
    }
  );
  const claimHandler = new InvestigationClaimHandler(
    executionLeaseService,
    browserWorker,
    undefined,
    controller
  );
  const outboxRelay = new OutboxRelayService(queue);

  // Health probe server
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: isShuttingDown ? 'draining' : 'healthy',
          workerId: config.workerId,
          concurrency: config.concurrency,
          activeJobs: activeJobCount,
          queueHealthy: queue.isHealthy(),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(config.port, () => {
    console.log(`[TraceCase Worker] Health probe listening on port ${config.port} (/health)`);
  });

  try {
    await queue.start();
    console.log('[TraceCase Worker] Queue adapter initialized and listening.');

    // Register job handlers
    await queue.work<DiagnosticJobData>(QUEUE_SYSTEM_DIAGNOSTIC, async (job) => {
      activeJobCount++;
      try {
        console.log(`[TraceCase Worker] Claiming diagnostic job ${job.data.diagnosticId}...`);
        await diagnosticHandler.executeDiagnostic(job.data, config.workerId);
        console.log(`[TraceCase Worker] Completed diagnostic job ${job.data.diagnosticId}.`);
      } catch (err) {
        console.error(`[TraceCase Worker] Failed diagnostic job ${job.data.diagnosticId}:`, err);
        throw err;
      } finally {
        activeJobCount--;
      }
    });

    await queue.work<InvestigationExecutionJobData>(QUEUE_INVESTIGATION_EXECUTION, async (job) => {
      activeJobCount++;
      try {
        console.log(`[TraceCase Worker] Claiming investigation execution request ${job.data.executionRequestId}...`);
        const result = await claimHandler.handleInvestigationExecution(job.data, config.workerId);
        console.log(`[TraceCase Worker] Investigation execution request outcome: ${result.status}`);
      } catch (err) {
        console.error(`[TraceCase Worker] Failed investigation execution ${job.data.executionRequestId}:`, err);
        throw err;
      } finally {
        activeJobCount--;
      }
    });

    // Initial worker heartbeat
    await workerHeartbeatService.recordHeartbeat({
      workerId: config.workerId,
      status: 'ACTIVE',
      activeJobs: 0,
      pid: process.pid,
    }).catch(() => {});

    // Periodic worker heartbeat (every 10s)
    const heartbeatInterval = setInterval(async () => {
      if (!isShuttingDown) {
        try {
          await workerHeartbeatService.recordHeartbeat({
            workerId: config.workerId,
            status: 'ACTIVE',
            activeJobs: activeJobCount,
            pid: process.pid,
          });
        } catch (hbErr) {
          console.error('[TraceCase Worker] Worker heartbeat update error:', hbErr);
        }
      }
    }, 10_000);

    // Start periodic outbox relay
    const relayInterval = setInterval(async () => {
      if (!isShuttingDown) {
        try {
          await outboxRelay.relayPendingMessages(25);
        } catch (err) {
          console.error('[TraceCase Worker] Outbox relay error:', err);
        }
      }
    }, 2000);

    // One-shot CI / verification execution
    if (process.env.WORKER_RUN_ONCE === 'true') {
      console.log('[TraceCase Worker] WORKER_RUN_ONCE mode: executing single relay pass...');
      try {
        await outboxRelay.relayPendingMessages(50);
      } catch (err: unknown) {
        console.log('[TraceCase Worker] One-shot outbox relay pass encountered database error:', err instanceof Error ? err.message : String(err));
      }
      clearInterval(relayInterval);
      clearInterval(heartbeatInterval);
      server.close();
      await queue.stop();
      if ('close' in browserWorker && typeof (browserWorker as any).close === 'function') {
        await (browserWorker as any).close();
      }
      await workerHeartbeatService.recordShutdown(config.workerId).catch(() => {});
      console.log('[TraceCase Worker] One-shot verification pass complete.');
      return {
        server,
        queue,
        controller,
        claimHandler,
        browserWorker,
        browserAgent,
        diagnosticHandler,
        outboxRelay,
        shutdown: async () => {},
      };
    }

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`[TraceCase Worker] Received ${signal}. Initiating graceful shutdown...`);

      clearInterval(relayInterval);
      clearInterval(heartbeatInterval);

      // Report draining status in heartbeat
      await workerHeartbeatService.recordHeartbeat({
        workerId: config.workerId,
        status: 'DRAINING',
        activeJobs: activeJobCount,
        pid: process.pid,
      }).catch(() => {});

      server.close(() => {
        console.log('[TraceCase Worker] Health probe server stopped.');
      });

      const drainDeadline = Date.now() + config.drainTimeoutSec * 1000;
      while (activeJobCount > 0 && Date.now() < drainDeadline) {
        console.log(`[TraceCase Worker] Draining: waiting for ${activeJobCount} active jobs to finish...`);
        await new Promise((r) => setTimeout(r, 500));
      }

      await queue.stop();
      if ('close' in browserWorker && typeof (browserWorker as any).close === 'function') {
        await (browserWorker as any).close();
      }
      await workerHeartbeatService.recordShutdown(config.workerId).catch(() => {});
      console.log('[TraceCase Worker] Worker stopped cleanly.');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return {
      server,
      queue,
      controller,
      claimHandler,
      browserWorker,
      browserAgent,
      diagnosticHandler,
      outboxRelay,
      shutdown,
    };
  } catch (err) {
    server.close();
    throw err;
  }
}

// Auto-run if executed directly
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  bootstrapWorker().catch((error) => {
    console.error('[TraceCase Worker] Fatal initialization error:', error);
    process.exit(1);
  });
}
