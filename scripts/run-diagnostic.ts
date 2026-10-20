import { getDb } from '../src/server/db';
import { outboxMessagesTable, diagnosticRunsTable } from '../src/server/db/schema';
import { QUEUE_SYSTEM_DIAGNOSTIC } from '../src/server/queue/types';
import { eq } from 'drizzle-orm';

async function main() {
  const diagnosticId = crypto.randomUUID();
  console.log(`[TraceCase Diagnostic] Enqueuing harmless diagnostic run ${diagnosticId}...`);

  const db = getDb();
  const now = new Date();

  await db.insert(outboxMessagesTable).values({
    queueName: QUEUE_SYSTEM_DIAGNOSTIC,
    payload: {
      diagnosticId,
      submittedAt: now.toISOString(),
      requestedBy: 'cli-operator',
    },
    singletonKey: `diagnostic-${diagnosticId}`,
    status: 'PENDING',
    createdAt: now,
  });

  console.log(`[TraceCase Diagnostic] Harmless diagnostic job successfully submitted to transactional outbox.`);
  console.log(`[TraceCase Diagnostic] Waiting up to 15 seconds for background worker claim...`);

  const deadline = Date.now() + 15000;
  let finished = false;

  while (Date.now() < deadline) {
    const [run] = await db
      .select()
      .from(diagnosticRunsTable)
      .where(eq(diagnosticRunsTable.jobId, diagnosticId))
      .limit(1);

    if (run && run.status === 'COMPLETED') {
      console.log(`[TraceCase Diagnostic] Success: diagnostic run completed!`);
      console.log(`[TraceCase Diagnostic] Worker Instance: ${run.workerInstanceId}`);
      console.log(`[TraceCase Diagnostic] Fencing Epoch: ${run.fencingEpoch}`);
      console.log(`[TraceCase Diagnostic] Started: ${run.startedAt.toISOString()}`);
      console.log(`[TraceCase Diagnostic] Completed: ${run.completedAt?.toISOString()}`);
      console.log(`[TraceCase Diagnostic] Details:`, JSON.stringify(run.details, null, 2));
      finished = true;
      break;
    } else if (run && run.status === 'FAILED') {
      console.error(`[TraceCase Diagnostic] Failure: diagnostic run failed!`);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!finished) {
    console.log(`[TraceCase Diagnostic] Notice: Job remains queued in outbox. Ensure 'pnpm dev:worker' is running.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[TraceCase Diagnostic] Uncaught error:', err);
  process.exit(1);
});
