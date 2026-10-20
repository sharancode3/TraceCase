import type { InvestigationProgressEvent } from '@/contracts/events';
import type { InvestigationLifecycleStatus } from '@/contracts/status';

export interface ReducedInvestigationProgress {
  currentStatus: InvestigationLifecycleStatus;
  currentAttempt: number | null;
  currentStepIndex: number | null;
  events: InvestigationProgressEvent[];
  processedEventIds: Set<string>;
  lastSequenceIndex: number;
}

export function createInitialProgressState(
  initialStatus: InvestigationLifecycleStatus = 'DRAFT'
): ReducedInvestigationProgress {
  return {
    currentStatus: initialStatus,
    currentAttempt: null,
    currentStepIndex: null,
    events: [],
    processedEventIds: new Set<string>(),
    lastSequenceIndex: -1,
  };
}

export function reduceProgressEvent(
  state: ReducedInvestigationProgress,
  event: InvestigationProgressEvent
): ReducedInvestigationProgress {
  // Idempotency: Ignore duplicate deliveries
  if (state.processedEventIds.has(event.eventId)) {
    return state;
  }

  const nextProcessed = new Set(state.processedEventIds);
  nextProcessed.add(event.eventId);

  let nextStatus = state.currentStatus;
  let nextAttempt = state.currentAttempt;
  let nextStep = state.currentStepIndex;

  switch (event.eventType) {
    case 'STATUS_CHANGED':
      if (typeof event.payload.newStatus === 'string') {
        nextStatus = event.payload.newStatus as InvestigationLifecycleStatus;
      }
      break;

    case 'ATTEMPT_STARTED':
      if (typeof event.payload.attemptNumber === 'number') {
        nextAttempt = event.payload.attemptNumber;
      }
      break;

    case 'STEP_STARTED':
      if (typeof event.payload.stepIndex === 'number') {
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

  // Insert event maintaining monotonic sequence ordering
  const nextEvents = [...state.events, event].sort((a, b) => a.sequenceIndex - b.sequenceIndex);

  return {
    currentStatus: nextStatus,
    currentAttempt: nextAttempt,
    currentStepIndex: nextStep,
    events: nextEvents,
    processedEventIds: nextProcessed,
    lastSequenceIndex: Math.max(state.lastSequenceIndex, event.sequenceIndex),
  };
}
