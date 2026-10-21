import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTerminalLifecycleStatus,
  createInvestigationPoller,
  formatProgressEventLog,
} from '@/features/investigations/live-progress';
import type { InvestigationSnapshot } from '@/contracts/investigations';
import type { InvestigationProgressEvent } from '@/contracts/events';

describe('Live Investigation Progress & Poller (P3-05)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('isTerminalLifecycleStatus', () => {
    it('identifies COMPLETED, FAILED, and CANCELLED as terminal states', () => {
      expect(isTerminalLifecycleStatus('COMPLETED')).toBe(true);
      expect(isTerminalLifecycleStatus('FAILED')).toBe(true);
      expect(isTerminalLifecycleStatus('CANCELLED')).toBe(true);
    });

    it('identifies in-progress and pending states as non-terminal', () => {
      expect(isTerminalLifecycleStatus('DRAFT')).toBe(false);
      expect(isTerminalLifecycleStatus('PLANNING')).toBe(false);
      expect(isTerminalLifecycleStatus('AWAITING_APPROVAL')).toBe(false);
      expect(isTerminalLifecycleStatus('APPROVED')).toBe(false);
      expect(isTerminalLifecycleStatus('QUEUED')).toBe(false);
      expect(isTerminalLifecycleStatus('RUNNING_ATTEMPT_1')).toBe(false);
      expect(isTerminalLifecycleStatus('RESETTING_TARGET')).toBe(false);
      expect(isTerminalLifecycleStatus('RUNNING_ATTEMPT_2')).toBe(false);
      expect(isTerminalLifecycleStatus('FINALIZING_EVIDENCE')).toBe(false);
    });
  });

  describe('createInvestigationPoller', () => {
    const makeSnapshot = (status: InvestigationSnapshot['lifecycleStatus']): InvestigationSnapshot => ({
      id: 'inv-test-001',
      reportId: 'rep-001',
      targetId: 'tgt-001',
      targetName: 'Target App',
      targetUrl: 'http://localhost:3005',
      isSandbox: true,
      title: 'Test Bug',
      lifecycleStatus: status,
      reproductionVerdict: 'PENDING',
      evidenceReadiness: 'PENDING_GENERATION',
      activeAttemptNumber: 1,
      attempt1: null,
      attempt2: null,
      planVersion: 1,
      planHash: 'hash',
      isApproved: true,
      approvedBy: 'usr-001',
      approvedAt: '2026-10-20T12:00:00.000Z',
      tokenCostUsd: 0.05,
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
      completedAt: null,
    });

    it('polls repeatedly on active states and updates listener', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        const status = callCount >= 3 ? 'RUNNING_ATTEMPT_2' : 'RUNNING_ATTEMPT_1';
        return {
          success: true,
          data: makeSnapshot(status),
        };
      });

      const onUpdate = vi.fn();
      const poller = createInvestigationPoller({
        investigationId: 'inv-test-001',
        intervalMs: 1000,
        fetchFn: mockFetch,
        onUpdate,
      });

      poller.start();
      expect(poller.isActive()).toBe(true);

      // First tick
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledTimes(1);

      // Second tick
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Third tick
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      poller.stop();
      expect(poller.isActive()).toBe(false);
    });

    it('stops polling automatically when terminal state is reached', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        success: true,
        data: makeSnapshot('COMPLETED'),
      });

      const onTerminal = vi.fn();
      const poller = createInvestigationPoller({
        investigationId: 'inv-test-001',
        intervalMs: 1000,
        fetchFn: mockFetch,
        onTerminal,
      });

      poller.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onTerminal).toHaveBeenCalledWith('COMPLETED', expect.objectContaining({ lifecycleStatus: 'COMPLETED' }));
      expect(poller.isActive()).toBe(false);

      // Subsequent timer advancement should NOT trigger more polls
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles consecutive errors and halts after threshold', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Connection refused' },
        status: 0,
      });

      const onError = vi.fn();
      const poller = createInvestigationPoller({
        investigationId: 'inv-test-001',
        intervalMs: 500,
        maxConsecutiveErrors: 3,
        fetchFn: mockFetch,
        onError,
      });

      poller.start();

      await vi.advanceTimersByTimeAsync(0); // Error 1
      await vi.advanceTimersByTimeAsync(500); // Error 2
      await vi.advanceTimersByTimeAsync(500); // Error 3 (Threshold reached, halts)

      expect(poller.isActive()).toBe(false);
      expect(onError).toHaveBeenCalledWith('Connection refused', 1);
      expect(onError).toHaveBeenCalledWith('Connection refused', 2);
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('Polling stopped after 3 consecutive network/API errors.'),
        3
      );
    });

    it('stops polling when maxPolls is reached', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        success: true,
        data: makeSnapshot('RUNNING_ATTEMPT_1'),
      });

      const onMaxPolls = vi.fn();
      const poller = createInvestigationPoller({
        investigationId: 'inv-test-001',
        intervalMs: 500,
        maxPolls: 2,
        fetchFn: mockFetch,
        onMaxPollsReached: onMaxPolls,
      });

      poller.start();

      await vi.advanceTimersByTimeAsync(0); // Poll 1
      await vi.advanceTimersByTimeAsync(500); // Poll 2
      await vi.advanceTimersByTimeAsync(500); // Exceeded maxPolls

      expect(poller.isActive()).toBe(false);
      expect(onMaxPolls).toHaveBeenCalledWith(2);
    });
  });

  describe('formatProgressEventLog', () => {
    it('formats ATTEMPT_STARTED log', () => {
      const event: InvestigationProgressEvent = {
        eventId: 'evt-1',
        schemaVersion: 1,
        investigationId: 'inv-1',
        sequenceIndex: 0,
        eventType: 'ATTEMPT_STARTED',
        timestamp: '2026-10-20T10:00:00.000Z',
        payload: { attemptNumber: 1 },
      };
      const log = formatProgressEventLog(event);
      expect(log).toContain('Attempt 1');
      expect(log).toContain('Execution started');
    });

    it('formats RESET_STARTED log', () => {
      const event: InvestigationProgressEvent = {
        eventId: 'evt-2',
        schemaVersion: 1,
        investigationId: 'inv-1',
        sequenceIndex: 1,
        eventType: 'RESET_STARTED',
        timestamp: '2026-10-20T10:00:05.000Z',
        payload: { endpoint: 'http://localhost:3005/api/reset' },
      };
      const log = formatProgressEventLog(event);
      expect(log).toContain('Reset Hook');
      expect(log).toContain('http://localhost:3005/api/reset');
    });

    it('formats INVESTIGATION_COMPLETED log', () => {
      const event: InvestigationProgressEvent = {
        eventId: 'evt-3',
        schemaVersion: 1,
        investigationId: 'inv-1',
        sequenceIndex: 2,
        eventType: 'INVESTIGATION_COMPLETED',
        timestamp: '2026-10-20T10:00:10.000Z',
        payload: { verdict: 'CONFIRMED_REPRODUCED' },
      };
      const log = formatProgressEventLog(event);
      expect(log).toContain('Completed');
      expect(log).toContain('CONFIRMED_REPRODUCED');
    });
  });
});
