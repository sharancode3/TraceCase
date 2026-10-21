import type { InvestigationLifecycleStatus } from '@/contracts/status';
import type { InvestigationSnapshot } from '@/contracts/investigations';
import type { InvestigationProgressEvent } from '@/contracts/events';
import { type ApiResponse, fetchInvestigation } from '@/features/investigations/api-client';

/**
 * Terminal lifecycle states where worker execution has concluded.
 * Polling loops must cease upon entering any of these states.
 */
export const TERMINAL_LIFECYCLE_STATES: ReadonlySet<InvestigationLifecycleStatus> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

/**
 * Returns true if the lifecycle state is a terminal state.
 */
export function isTerminalLifecycleStatus(status: InvestigationLifecycleStatus): boolean {
  return TERMINAL_LIFECYCLE_STATES.has(status);
}

export interface PollerOptions {
  investigationId: string;
  intervalMs?: number;
  maxPolls?: number;
  maxConsecutiveErrors?: number;
  fetchFn?: (id: string) => Promise<ApiResponse<InvestigationSnapshot>>;
  onUpdate?: (snapshot: InvestigationSnapshot, pollCount: number) => void;
  onError?: (errorMessage: string, consecutiveErrors: number) => void;
  onTerminal?: (status: InvestigationLifecycleStatus, snapshot: InvestigationSnapshot) => void;
  onMaxPollsReached?: (pollCount: number) => void;
}

export interface PollerController {
  start: () => void;
  stop: () => void;
  isActive: () => boolean;
  getPollCount: () => number;
  getConsecutiveErrors: () => number;
}

/**
 * Creates a cleanup-safe, bounded polling controller for investigation snapshots.
 * Automatically stops on terminal states, unmount, or consecutive failure threshold.
 * Prevents overlapping in-flight fetch requests.
 */
export function createInvestigationPoller(options: PollerOptions): PollerController {
  const {
    investigationId,
    intervalMs = 2500,
    maxPolls = 60,
    maxConsecutiveErrors = 5,
    fetchFn = fetchInvestigation,
    onUpdate,
    onError,
    onTerminal,
    onMaxPollsReached,
  } = options;

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let inFlight = false;
  let pollCount = 0;
  let consecutiveErrors = 0;

  async function pollStep() {
    if (!active) return;
    if (inFlight) return; // Prevent overlapping requests

    if (pollCount >= maxPolls) {
      active = false;
      onMaxPollsReached?.(pollCount);
      return;
    }

    inFlight = true;
    pollCount++;

    try {
      const result = await fetchFn(investigationId);
      if (!active) return; // Component unmounted during fetch

      if (result.success) {
        consecutiveErrors = 0;
        const snapshot = result.data;
        onUpdate?.(snapshot, pollCount);

        if (isTerminalLifecycleStatus(snapshot.lifecycleStatus)) {
          active = false;
          onTerminal?.(snapshot.lifecycleStatus, snapshot);
          return;
        }
      } else {
        consecutiveErrors++;
        onError?.(result.error.message, consecutiveErrors);

        if (consecutiveErrors >= maxConsecutiveErrors) {
          active = false;
          onError?.(
            `Polling stopped after ${consecutiveErrors} consecutive network/API errors.`,
            consecutiveErrors
          );
          return;
        }
      }
    } catch (err) {
      if (!active) return;
      consecutiveErrors++;
      const message = err instanceof Error ? err.message : 'Unknown polling error';
      onError?.(message, consecutiveErrors);

      if (consecutiveErrors >= maxConsecutiveErrors) {
        active = false;
        return;
      }
    } finally {
      inFlight = false;
      if (active) {
        timerId = setTimeout(pollStep, intervalMs);
      }
    }
  }

  return {
    start: () => {
      if (active) return;
      active = true;
      consecutiveErrors = 0;
      pollStep();
    },
    stop: () => {
      active = false;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    isActive: () => active,
    getPollCount: () => pollCount,
    getConsecutiveErrors: () => consecutiveErrors,
  };
}

/**
 * Formats a diagnostic console log message from an investigation progress event.
 */
export function formatProgressEventLog(event: InvestigationProgressEvent): string {
  const time = event.timestamp.split('T')[1]?.replace('Z', '') || event.timestamp;
  switch (event.eventType) {
    case 'ATTEMPT_STARTED':
      return `[${time}] [Attempt ${event.payload.attemptNumber}] Execution started. Headless browser context initialized.`;
    case 'STEP_STARTED':
      return `[${time}] [Step ${event.payload.stepIndex}] Executing action: ${event.payload.action}`;
    case 'ASSERTION_EVALUATED':
      return `[${time}] [Assertion] Step ${event.payload.stepIndex}: Defect detected = ${event.payload.defectDetected}`;
    case 'RESET_STARTED':
      return `[${time}] [Reset Hook] Triggering fixture reset: ${event.payload.endpoint}`;
    case 'ARTIFACT_STORED':
      return `[${time}] [Evidence] Stored artifact ${event.payload.artifactKind} (attempt ${event.payload.attemptNumber ?? 'N/A'})`;
    case 'STATUS_CHANGED':
      return `[${time}] [Status] Lifecycle transition -> ${event.payload.newStatus}`;
    case 'INVESTIGATION_COMPLETED':
      return `[${time}] [Completed] Final verdict: ${event.payload.verdict}`;
    case 'INVESTIGATION_HALTED':
      return `[${time}] [Halted] Reason: ${event.payload.reason}`;
    default:
      return `[${time}] [${event.eventType}] Sequence #${event.sequenceIndex}`;
  }
}
