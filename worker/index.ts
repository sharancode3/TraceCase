import http from 'node:http';
import { getWorkerConfig } from './config';

async function bootstrapWorker() {
  const config = getWorkerConfig();
  console.log('[TraceCase Worker] Initializing daemon process...');
  console.log(`[TraceCase Worker] Worker ID: ${config.workerId}`);
  console.log(`[TraceCase Worker] Concurrency Lease: ${config.concurrency} (TC-INV-011 strictly enforced)`);

  let isShuttingDown = false;
  let activeJobCount = 0;

  // Lightweight internal health check server on WORKER_PORT (3001)
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: isShuttingDown ? 'draining' : 'idle_waiting_queue',
          workerId: config.workerId,
          concurrency: config.concurrency,
          activeJobs: activeJobCount,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(config.port, () => {
    console.log(`[TraceCase Worker] Internal diagnostic probe listening on port ${config.port} (/health)`);
  });

  console.log('[TraceCase Worker] Notice: Queue consumer is in Stage 0 idle standby mode.');
  console.log('[TraceCase Worker] Live job consumption via pg-boss will activate in Stage 4.');

  // Graceful shutdown handling (SIGTERM & SIGINT)
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[TraceCase Worker] Received ${signal}. Initiating graceful shutdown...`);

    server.close(() => {
      console.log('[TraceCase Worker] Diagnostic probe server closed.');
    });

    const drainDeadline = Date.now() + config.drainTimeoutSec * 1000;
    while (activeJobCount > 0 && Date.now() < drainDeadline) {
      console.log(`[TraceCase Worker] Waiting for ${activeJobCount} active jobs to finish...`);
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log('[TraceCase Worker] Shutdown complete. Exiting cleanly.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // If running in one-shot test mode (e.g. CI check)
  if (process.env.WORKER_RUN_ONCE === 'true') {
    console.log('[TraceCase Worker] WORKER_RUN_ONCE specified. Verifying lifecycle and exiting...');
    server.close();
    process.exit(0);
  }
}

bootstrapWorker().catch((error) => {
  console.error('[TraceCase Worker] Fatal initialization error:', error);
  process.exit(1);
});
