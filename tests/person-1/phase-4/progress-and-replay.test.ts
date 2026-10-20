import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { eventsRepository } from '@/server/db/repositories/events.repository';
import { GET as getEventsRoute } from '@/app/api/v1/investigations/[id]/events/route';
import { GET as getStreamRoute } from '@/app/api/v1/investigations/[id]/stream/route';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { setCustomPrincipalResolverForTesting } from '@/server/auth';
import { Phase4TestDbMock } from './test-db-mock';

describe('P1-04: Progress Events, Watermark, Replay, and SSE Streaming', () => {
  let mockDb: Phase4TestDbMock;

  const principal = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'operator@tracecase.internal',
    role: 'operator' as const,
    externalIssuer: 'https://auth.tracecase.test',
    externalSubject: 'usr-test-01',
  };

  const invId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const targetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const reportId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    process.env.DEV_PREVIEW_MODE = 'false';
    setCustomPrincipalResolverForTesting(async () => principal);

    mockDb = new Phase4TestDbMock();
    setDbInstanceForTesting(mockDb as any);

    // Seed target & report
    mockDb.targets.push({
      id: targetId,
      ownerId: principal.id,
      name: 'Test Target',
      baseUrl: 'https://demo.app.local',
      allowedOrigins: ['https://demo.app.local'],
      isSandbox: true,
      isSandboxVerified: true,
    });

    mockDb.bugReports.push({
      id: reportId,
      ownerId: principal.id,
      targetId,
      title: 'Crash on button click',
    });

    // Seed investigation
    mockDb.investigations.push({
      id: invId,
      ownerId: principal.id,
      targetId,
      reportId,
      lifecycleStatus: 'INITIALIZED',
      reviewStatus: 'PROPOSAL_READY',
      workflowRevision: 1,
      eventSequenceCounter: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    setCustomPrincipalResolverForTesting(null);
    resetDbInstanceForTesting();
  });

  it('atomically increments sequence index on each emitted event', async () => {
    const seq1 = await investigationWorkflowService.emitEvent(invId, 'CLARIFICATION_REQUESTED', { count: 2 });
    expect(seq1).toBe(1);

    const seq2 = await investigationWorkflowService.emitEvent(invId, 'PLAN_PROPOSED', { planVersion: 1 });
    expect(seq2).toBe(2);

    const snapshot = await investigationWorkflowService.getInvestigationSnapshot(invId, principal.id);
    expect(snapshot.eventWatermark).toBe(2);

    expect(mockDb.investigationEvents.length).toBe(2);
    expect(mockDb.investigationEvents[0].sequenceIndex).toBe(1);
    expect(mockDb.investigationEvents[1].sequenceIndex).toBe(2);
  });

  it('replays progress events using cursor pagination via eventsRepository', async () => {
    // Seed 4 events
    for (let i = 1; i <= 4; i++) {
      mockDb.investigationEvents.push({
        id: `evt-${i}`,
        investigationId: invId,
        sequenceIndex: i,
        eventType: `STEP_${i}`,
        payload: { step: i },
        emittedAt: new Date(),
      });
    }
    mockDb.investigations[0].eventSequenceCounter = 4;

    // Fetch from beginning
    const all = await eventsRepository.getEventsByInvestigation({
      investigationId: invId,
      afterSequence: 0,
    });
    expect(all.events.length).toBe(4);
    expect(all.currentWatermark).toBe(4);

    // Fetch after cursor = 2
    const afterTwo = await eventsRepository.getEventsByInvestigation({
      investigationId: invId,
      afterSequence: 2,
    });
    expect(afterTwo.events.length).toBe(2);
    expect(afterTwo.events[0].sequenceIndex).toBe(3);
    expect(afterTwo.events[1].sequenceIndex).toBe(4);
  });

  it('serves cursor-based event query via HTTP GET /api/v1/investigations/[id]/events', async () => {
    // Seed events
    mockDb.investigationEvents.push(
      {
        id: 'evt-1',
        investigationId: invId,
        sequenceIndex: 1,
        eventType: 'PLAN_APPROVED',
        payload: { planVersion: 1 },
        emittedAt: new Date(),
      },
      {
        id: 'evt-2',
        investigationId: invId,
        sequenceIndex: 2,
        eventType: 'EXECUTION_ADMITTED',
        payload: { jobId: 'job-1' },
        emittedAt: new Date(),
      }
    );
    mockDb.investigations[0].eventSequenceCounter = 2;

    const req = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${invId}/events?afterSequence=1`, {
        method: 'GET',
      })
    );

    const res = await getEventsRoute(req, { params: Promise.resolve({ id: invId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.investigationId).toBe(invId);
    expect(json.currentWatermark).toBe(2);
    expect(json.events.length).toBe(1);
    expect(json.events[0].sequenceIndex).toBe(2);
    expect(json.events[0].eventType).toBe('EXECUTION_ADMITTED');
  });

  it('streams backlog events as text/event-stream via SSE route', async () => {
    mockDb.investigationEvents.push({
      id: 'evt-1',
      investigationId: invId,
      sequenceIndex: 1,
      eventType: 'PLAN_APPROVED',
      payload: { planVersion: 1 },
      emittedAt: new Date(),
    });
    mockDb.investigations[0].eventSequenceCounter = 1;

    const req = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${invId}/stream?afterSequence=0`, {
        method: 'GET',
      })
    );

    const res = await getStreamRoute(req, { params: Promise.resolve({ id: invId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const chunk = await reader!.read();
    expect(chunk.done).toBe(false);

    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain('id: 1');
    expect(text).toContain('event: PLAN_APPROVED');
    expect(text).toContain('PLAN_APPROVED');

    await reader!.cancel();
  });
});
