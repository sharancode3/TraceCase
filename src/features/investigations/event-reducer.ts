import type { InvestigationProgressEvent } from '@/contracts/events';
import type { InvestigationLifecycleStatus } from '@/contracts/status';
import { InvestigationLifecycleStatusSchema } from '@/contracts/status';

export interface SequenceGap {
  from: number;
  to: number;
  count: number;
}

export interface ReducedInvestigationProgress {
  initialStatus: InvestigationLifecycleStatus;
  currentStatus: InvestigationLifecycleStatus;
  currentAttempt: number | null;
  currentStepIndex: number | null;
  events: InvestigationProgressEvent[];
  processedEventIds: Set<string>;
  lastSequenceIndex: number;
  hasSequenceGap: boolean;
  sequenceGaps: SequenceGap[];
}

export function createInitialProgressState(
  initialStatus: InvestigationLifecycleStatus = 'DRAFT'
): ReducedInvestigationProgress {
  return {
    initialStatus,
    currentStatus: initialStatus,
    currentAttempt: null,
    currentStepIndex: null,
    events: [],
    processedEventIds: new Set<string>(),
    lastSequenceIndex: -1,
    hasSequenceGap: false,
    sequenceGaps: [],
  };
}

/**
 * Computes contiguous missing sequence gaps from an ordered event array.
 */
export function computeSequenceGaps(events: InvestigationProgressEvent[]): SequenceGap[] {
  if (events.length === 0) return [];

  const gaps: SequenceGap[] = [];

  // Check if initial sequence 0 is missing
  const firstSeq = events[0].sequenceIndex;
  if (firstSeq > 0) {
    gaps.push({ from: 0, to: firstSeq - 1, count: firstSeq });
  }

  // Detect gaps between consecutive events
  for (let i = 0; i < events.length - 1; i++) {
    const curr = events[i].sequenceIndex;
    const next = events[i + 1].sequenceIndex;
    if (next > curr + 1) {
      gaps.push({ from: curr + 1, to: next - 1, count: next - curr - 1 });
    }
  }

  return gaps;
}

/**
 * Pure helper to apply an event transition to accumulator state.
 */
function applySingleEvent(
  current: {
    status: InvestigationLifecycleStatus;
    attempt: number | null;
    step: number | null;
  },
  event: InvestigationProgressEvent
): {
  status: InvestigationLifecycleStatus;
  attempt: number | null;
  step: number | null;
} {
  let nextStatus = current.status;
  let nextAttempt = current.attempt;
  let nextStep = current.step;

  switch (event.eventType) {
    case 'STATUS_CHANGED':
      if (typeof event.payload?.newStatus === 'string') {
        const parsed = InvestigationLifecycleStatusSchema.safeParse(event.payload.newStatus);
        if (parsed.success) {
          nextStatus = parsed.data;
        }
      }
      break;

    case 'ATTEMPT_STARTED':
      if (typeof event.payload?.attemptNumber === 'number') {
        nextAttempt = event.payload.attemptNumber;
      }
      break;

    case 'STEP_STARTED':
      if (typeof event.payload?.stepIndex === 'number') {
        nextStep = event.payload.stepIndex;
      }
      break;

    case 'RESET_STARTED':
      nextStatus = 'RESETTING_TARGET';
      break;

    case 'INVESTIGATION_COMPLETED':
      nextStatus = 'COMPLETED';
      break;

    case 'INVESTIGATION_HALTED':
      nextStatus = 'FAILED';
      break;
  }

  return { status: nextStatus, attempt: nextAttempt, step: nextStep };
}

export function reduceProgressEvent(
  state: ReducedInvestigationProgress,
  event: InvestigationProgressEvent
): ReducedInvestigationProgress {
  // Idempotency: Ignore duplicate deliveries by eventId
  if (state.processedEventIds.has(event.eventId)) {
    return state;
  }

  const nextProcessed = new Set(state.processedEventIds);
  nextProcessed.add(event.eventId);

  // Insert event maintaining monotonic sequence ordering
  const nextEvents = [...state.events, event].sort((a, b) => {
    if (a.sequenceIndex !== b.sequenceIndex) {
      return a.sequenceIndex - b.sequenceIndex;
    }
    return a.timestamp.localeCompare(b.timestamp);
  });

  const nextLastSequenceIndex = Math.max(state.lastSequenceIndex, event.sequenceIndex);
  const sequenceGaps = computeSequenceGaps(nextEvents);
  const hasSequenceGap = sequenceGaps.length > 0;
  const initialStatus = state.initialStatus ?? 'DRAFT';

  let nextStatus: InvestigationLifecycleStatus;
  let nextAttempt: number | null;
  let nextStep: number | null;

  // Prevent older sequence index from regressing current lifecycle state:
  // If the event arrives in order (sequenceIndex >= lastSequenceIndex), apply incrementally.
  // If the event arrived out of order (sequenceIndex < lastSequenceIndex), replay canonical
  // history in sorted order so newer events always take precedence and cannot be regressed.
  if (event.sequenceIndex >= state.lastSequenceIndex) {
    const applied = applySingleEvent(
      {
        status: state.currentStatus,
        attempt: state.currentAttempt,
        step: state.currentStepIndex,
      },
      event
    );
    nextStatus = applied.status;
    nextAttempt = applied.attempt;
    nextStep = applied.step;
  } else {
    let replayStatus = initialStatus;
    let replayAttempt: number | null = null;
    let replayStep: number | null = null;

    for (const e of nextEvents) {
      const res = applySingleEvent(
        { status: replayStatus, attempt: replayAttempt, step: replayStep },
        e
      );
      replayStatus = res.status;
      replayAttempt = res.attempt;
      replayStep = res.step;
    }

    nextStatus = replayStatus;
    nextAttempt = replayAttempt;
    nextStep = replayStep;
  }

  return {
    initialStatus,
    currentStatus: nextStatus,
    currentAttempt: nextAttempt,
    currentStepIndex: nextStep,
    events: nextEvents,
    processedEventIds: nextProcessed,
    lastSequenceIndex: nextLastSequenceIndex,
    hasSequenceGap,
    sequenceGaps,
  };
}

/**
 * Helper to reduce an array of events into progress state in batch.
 */
export function reduceProgressEvents(
  state: ReducedInvestigationProgress,
  events: InvestigationProgressEvent[]
): ReducedInvestigationProgress {
  return events.reduce((acc, event) => reduceProgressEvent(acc, event), state);
}
