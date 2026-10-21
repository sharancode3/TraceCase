import { describe, it, expect } from 'vitest';
import {
  createInitialProgressState,
  reduceProgressEvent,
  reduceProgressEvents,
  computeSequenceGaps,
} from '@/features/investigations/event-reducer';
import type { InvestigationProgressEvent } from '@/contracts/events';

describe('Event Reducer Out-of-Order, Sequence Gap, and Idempotency Protection (P3-05)', () => {
  const investigationId = 'a11ac10b-58cc-4372-a567-0e02b2c3d401';

  const makeEvent = (
    sequenceIndex: number,
    eventType: InvestigationProgressEvent['eventType'],
    payload: Record<string, unknown> = {},
    eventId = `evt-${sequenceIndex}-${eventType.toLowerCase()}`
  ): InvestigationProgressEvent => ({
    eventId,
    schemaVersion: 1,
    investigationId,
    sequenceIndex,
    eventType,
    timestamp: new Date(Date.now() + sequenceIndex * 1000).toISOString(),
    payload,
  });

  describe('Out-of-Order Arrival & State Regression Prevention', () => {
    it('prevents an older sequence index from regressing current lifecycle status', () => {
      let state = createInitialProgressState('APPROVED');

      // Sequence 0: Attempt 1 started
      state = reduceProgressEvent(
        state,
        makeEvent(0, 'ATTEMPT_STARTED', { attemptNumber: 1 })
      );
      // Sequence 1: Status changed to RUNNING_ATTEMPT_1
      state = reduceProgressEvent(
        state,
        makeEvent(1, 'STATUS_CHANGED', { newStatus: 'RUNNING_ATTEMPT_1' })
      );
      // Sequence 3: Target reset started (status -> RESETTING_TARGET)
      state = reduceProgressEvent(
        state,
        makeEvent(3, 'RESET_STARTED', {})
      );

      expect(state.currentStatus).toBe('RESETTING_TARGET');
      expect(state.lastSequenceIndex).toBe(3);

      // Delayed Event at sequence 2 arrives late!
      // This older event tries to set status to RUNNING_ATTEMPT_1
      const lateEvent = makeEvent(
        2,
        'STATUS_CHANGED',
        { newStatus: 'RUNNING_ATTEMPT_1' },
        'late-evt-2'
      );
      state = reduceProgressEvent(state, lateEvent);

      // Status must NOT regress to RUNNING_ATTEMPT_1; it must remain RESETTING_TARGET
      expect(state.currentStatus).toBe('RESETTING_TARGET');
      expect(state.lastSequenceIndex).toBe(3);
      // Event must still be recorded in sorted events list
      expect(state.events.map((e) => e.sequenceIndex)).toEqual([0, 1, 2, 3]);
    });

    it('prevents older events from regressing terminal completed or failed states', () => {
      let state = createInitialProgressState('APPROVED');

      // Forward event: Investigation Completed at sequence 5
      state = reduceProgressEvent(
        state,
        makeEvent(5, 'INVESTIGATION_COMPLETED', {})
      );
      expect(state.currentStatus).toBe('COMPLETED');
      expect(state.lastSequenceIndex).toBe(5);

      // Delayed events arrive late in reverse order
      state = reduceProgressEvent(
        state,
        makeEvent(4, 'STATUS_CHANGED', { newStatus: 'RUNNING_ATTEMPT_2' })
      );
      state = reduceProgressEvent(
        state,
        makeEvent(2, 'RESET_STARTED', {})
      );
      state = reduceProgressEvent(
        state,
        makeEvent(1, 'STATUS_CHANGED', { newStatus: 'RUNNING_ATTEMPT_1' })
      );

      // Status must remain terminal COMPLETED
      expect(state.currentStatus).toBe('COMPLETED');
      expect(state.lastSequenceIndex).toBe(5);
      expect(state.events.map((e) => e.sequenceIndex)).toEqual([1, 2, 4, 5]);
    });

    it('correctly captures intermediate attempt and step state from delayed events without regressing status', () => {
      let state = createInitialProgressState('APPROVED');

      // Sequence 2 arrives first: RESET_STARTED (status -> RESETTING_TARGET)
      state = reduceProgressEvent(
        state,
        makeEvent(2, 'RESET_STARTED', {})
      );
      expect(state.currentStatus).toBe('RESETTING_TARGET');
      expect(state.currentAttempt).toBeNull();
      expect(state.currentStepIndex).toBeNull();

      // Sequence 0 arrives late: ATTEMPT_STARTED with attemptNumber = 1
      state = reduceProgressEvent(
        state,
        makeEvent(0, 'ATTEMPT_STARTED', { attemptNumber: 1 })
      );

      // Sequence 1 arrives late: STEP_STARTED with stepIndex = 3
      state = reduceProgressEvent(
        state,
        makeEvent(1, 'STEP_STARTED', { stepIndex: 3 })
      );

      // Correctly captures attempt 1 and step 3 while keeping status at RESETTING_TARGET
      expect(state.currentAttempt).toBe(1);
      expect(state.currentStepIndex).toBe(3);
      expect(state.currentStatus).toBe('RESETTING_TARGET');
      expect(state.lastSequenceIndex).toBe(2);
    });
  });

  describe('Duplicate Event Handling (Idempotency)', () => {
    it('ignores duplicate deliveries of identical eventId without mutating state', () => {
      let state = createInitialProgressState('DRAFT');

      const event = makeEvent(0, 'STATUS_CHANGED', { newStatus: 'PLANNING' }, 'same-event-uuid');

      state = reduceProgressEvent(state, event);
      expect(state.currentStatus).toBe('PLANNING');
      expect(state.events.length).toBe(1);
      expect(state.processedEventIds.has('same-event-uuid')).toBe(true);

      // Send same event again
      const stateAfterDuplicate = reduceProgressEvent(state, event);
      // Identity check: must return exact same state reference
      expect(stateAfterDuplicate).toBe(state);
      expect(stateAfterDuplicate.events.length).toBe(1);
    });
  });

  describe('Sequence Gap Detection & Resolution', () => {
    it('detects missing sequence 0 when initial event starts at higher sequence', () => {
      let state = createInitialProgressState('DRAFT');

      // Initial event arrives at sequence 2 (missing 0 and 1)
      state = reduceProgressEvent(
        state,
        makeEvent(2, 'STEP_STARTED', { stepIndex: 0 })
      );

      expect(state.hasSequenceGap).toBe(true);
      expect(state.sequenceGaps).toEqual([
        { from: 0, to: 1, count: 2 },
      ]);
    });

    it('detects sequence gaps between non-consecutive events', () => {
      let state = createInitialProgressState('APPROVED');

      // Event 0
      state = reduceProgressEvent(state, makeEvent(0, 'ATTEMPT_STARTED', { attemptNumber: 1 }));
      expect(state.hasSequenceGap).toBe(false);

      // Event 3 (missing 1 and 2)
      state = reduceProgressEvent(state, makeEvent(3, 'STEP_STARTED', { stepIndex: 2 }));
      expect(state.hasSequenceGap).toBe(true);
      expect(state.sequenceGaps).toEqual([
        { from: 1, to: 2, count: 2 },
      ]);

      // Event 6 (additionally missing 4 and 5)
      state = reduceProgressEvent(state, makeEvent(6, 'RESET_STARTED', {}));
      expect(state.hasSequenceGap).toBe(true);
      expect(state.sequenceGaps).toEqual([
        { from: 1, to: 2, count: 2 },
        { from: 4, to: 5, count: 2 },
      ]);
    });

    it('clears sequence gaps when late-arriving events fill the missing gaps', () => {
      let state = createInitialProgressState('APPROVED');

      // Events 0 and 3 arrive
      state = reduceProgressEvent(state, makeEvent(0, 'ATTEMPT_STARTED', { attemptNumber: 1 }));
      state = reduceProgressEvent(state, makeEvent(3, 'RESET_STARTED', {}));
      expect(state.hasSequenceGap).toBe(true);
      expect(state.sequenceGaps).toEqual([{ from: 1, to: 2, count: 2 }]);

      // Late event 1 arrives
      state = reduceProgressEvent(state, makeEvent(1, 'STEP_STARTED', { stepIndex: 0 }));
      expect(state.hasSequenceGap).toBe(true);
      expect(state.sequenceGaps).toEqual([{ from: 2, to: 2, count: 1 }]);

      // Late event 2 arrives: all gaps now resolved
      state = reduceProgressEvent(state, makeEvent(2, 'STEP_STARTED', { stepIndex: 1 }));
      expect(state.hasSequenceGap).toBe(false);
      expect(state.sequenceGaps).toEqual([]);
    });

    it('computeSequenceGaps returns empty array for contiguous sequences', () => {
      const contiguous = [
        makeEvent(0, 'ATTEMPT_STARTED'),
        makeEvent(1, 'STEP_STARTED'),
        makeEvent(2, 'RESET_STARTED'),
      ];
      expect(computeSequenceGaps(contiguous)).toEqual([]);
    });

    it('computeSequenceGaps returns empty array for empty event list', () => {
      expect(computeSequenceGaps([])).toEqual([]);
    });
  });

  describe('Batch Reduction (reduceProgressEvents)', () => {
    it('processes an array of out-of-order events and computes accurate final state', () => {
      const events: InvestigationProgressEvent[] = [
        makeEvent(3, 'INVESTIGATION_COMPLETED'),
        makeEvent(0, 'ATTEMPT_STARTED', { attemptNumber: 1 }),
        makeEvent(2, 'RESET_STARTED'),
        makeEvent(1, 'STEP_STARTED', { stepIndex: 0 }),
      ];

      const initial = createInitialProgressState('APPROVED');
      const finalState = reduceProgressEvents(initial, events);

      expect(finalState.currentStatus).toBe('COMPLETED');
      expect(finalState.currentAttempt).toBe(1);
      expect(finalState.currentStepIndex).toBe(0);
      expect(finalState.hasSequenceGap).toBe(false);
      expect(finalState.lastSequenceIndex).toBe(3);
      expect(finalState.events.map((e) => e.sequenceIndex)).toEqual([0, 1, 2, 3]);
    });
  });

  describe('Invalid Payload Safety', () => {
    it('ignores invalid lifecycle status strings and does not corrupt status', () => {
      let state = createInitialProgressState('APPROVED');

      state = reduceProgressEvent(
        state,
        makeEvent(0, 'STATUS_CHANGED', { newStatus: 'MALICIOUS_OR_UNKNOWN_STATUS' })
      );

      // Must remain APPROVED
      expect(state.currentStatus).toBe('APPROVED');
    });
  });
});
