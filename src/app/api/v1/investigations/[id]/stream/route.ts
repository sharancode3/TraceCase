import { NextRequest } from 'next/server';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { eventsRepository } from '@/server/db/repositories/events.repository';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let principal;
  try {
    principal = await requireAuthenticatedPrincipal(req);
    await investigationWorkflowService.getOwnedInvestigationOrThrow(id, principal.id);
  } catch (error) {
    return handleWorkflowError(error);
  }

  // Parse start sequence from Last-Event-ID or query param
  const lastEventIdHeader = req.headers.get('last-event-id');
  const afterSeqQuery = req.nextUrl.searchParams.get('afterSequence');
  let afterSequence = 0;
  if (lastEventIdHeader) {
    const parsed = parseInt(lastEventIdHeader, 10);
    if (!Number.isNaN(parsed)) afterSequence = parsed;
  } else if (afterSeqQuery) {
    const parsed = parseInt(afterSeqQuery, 10);
    if (!Number.isNaN(parsed)) afterSequence = parsed;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const cleanup = () => {
        if (!isClosed) {
          isClosed = true;
          clearInterval(heartbeatInterval);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      };

      req.signal.addEventListener('abort', cleanup);

      // 1. Send backlog events
      try {
        const backlog = await eventsRepository.getEventsByInvestigation({
          investigationId: id,
          afterSequence,
          limit: 100,
        });

        for (const event of backlog.events) {
          if (isClosed) break;
          const sseChunk = `id: ${event.sequenceIndex}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseChunk));
        }
      } catch (err) {
        if (!isClosed) {
          controller.error(err);
        }
        return;
      }

      // 2. Set up heartbeat every 15s to keep SSE connection alive
      const heartbeatInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeatInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, 15000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
