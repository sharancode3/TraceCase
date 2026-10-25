'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Info,
  XCircle,
  Loader2,
  ArrowLeft,
  Terminal,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  createInvestigationPoller,
  isTerminalLifecycleStatus,
} from '@/features/investigations/live-progress';
import {
  getLifecyclePresentation,
  getVerdictPresentation,
  getEvidencePresentation,
} from '@/contracts/status';
import type { InvestigationSnapshot } from '@/contracts/investigations';
import {
  cancelInvestigationExecution,
} from '@/features/investigations/api-client';

export default function LiveInvestigationProgressPage() {
  const params = useParams();
  const id = params?.id as string;

  // View Mode: 'poller' for live snapshot polling; 'simulation' for reducer stepper
  const activeTab = 'poller';

  // Live Snapshot Polling State
  const [liveSnapshot, setLiveSnapshot] = React.useState<InvestigationSnapshot | null>(null);
  const [isPollerActive, setIsPollerActive] = React.useState(false);
  const [pollCount, setPollCount] = React.useState(0);
  const [workerAvailable, setWorkerAvailable] = React.useState<boolean | null>(null);
  const [pollerError, setPollerError] = React.useState<string | null>(null);
  const [isTerminal, setIsTerminal] = React.useState(false);

  // Live Execution Events State
  interface LiveEventItem {
    id: string;
    sequenceIndex: number;
    eventType: string;
    payload: Record<string, unknown>;
    emittedAt: string;
  }
  const [events, setEvents] = React.useState<LiveEventItem[]>([]);

  // Cancellation State
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancellationNotice, setCancellationNotice] = React.useState<string | null>(null);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const handleCancelExecution = async () => {
    if (!confirm('Are you sure you want to cancel execution of this investigation?')) {
      return;
    }
    setIsCancelling(true);
    setCancelError(null);
    const result = await cancelInvestigationExecution(id, {
      investigationId: id,
      cancellationReason: 'Operator cancelled from live progress view',
    });
    setIsCancelling(false);

    if (result.success) {
      const rawDate = result.data?.cancelledAt;
      const parsedDate = rawDate ? new Date(rawDate) : new Date();
      const timeStr = isNaN(parsedDate.getTime()) ? new Date().toLocaleTimeString() : parsedDate.toLocaleTimeString();
      setCancellationNotice(`Execution successfully cancelled at ${timeStr}.`);
      setIsTerminal(true);
      setIsPollerActive(false);
      setLiveSnapshot((prev) => prev ? { ...prev, lifecycleStatus: 'CANCELLED' } : null);
    } else {
      setCancelError(`Cancellation failed (${result.error.code}): ${result.error.message}`);
    }
  };

  // Check worker readiness when in QUEUED state
  React.useEffect(() => {
    if (liveSnapshot?.lifecycleStatus !== 'QUEUED') return;
    let mounted = true;
    fetch('/api/ready')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        const isReady = Boolean(data.investigationExecutionReady && data.components?.worker?.status === 'AVAILABLE');
        setWorkerAvailable(isReady);
      })
      .catch(() => {
        if (mounted) setWorkerAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, [liveSnapshot?.lifecycleStatus, pollCount]);

  // Setup bounded snapshot and event poller
  React.useEffect(() => {
    if (!id) return;

    let isSubscribed = true;
    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/v1/investigations/${encodeURIComponent(id)}/events?limit=50`);
        if (res.ok && isSubscribed) {
          const json = await res.json();
          if (Array.isArray(json.events)) {
            setEvents(json.events);
          }
        }
      } catch {
        // Non-blocking
      }
    };

    fetchEvents();

    const poller = createInvestigationPoller({
      investigationId: id,
      intervalMs: 2500,
      maxPolls: 60,
      onUpdate: (snapshot, count) => {
        setLiveSnapshot(snapshot);
        setPollCount(count);
        setPollerError(null);
        fetchEvents();
        if (isTerminalLifecycleStatus(snapshot.lifecycleStatus)) {
          setIsTerminal(true);
          setIsPollerActive(false);
          fetchEvents();
        }
      },
      onError: (errMsg) => {
        setPollerError(errMsg);
      },
      onTerminal: () => {
        setIsTerminal(true);
        setIsPollerActive(false);
        fetchEvents();
      },
      onMaxPollsReached: () => {
        setIsPollerActive(false);
        fetchEvents();
      },
    });

    poller.start();
    setIsPollerActive(true);

    return () => {
      isSubscribed = false;
      poller.stop();
      setIsPollerActive(false);
    };
  }, [id]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-xs text-brand-muted">
        <Link href={`/investigations/${id}`} className="hover:text-cobalt-action flex items-center space-x-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Investigation</span>
        </Link>
        <span>/</span>
        <span className="text-brand-navy font-medium">Live Execution Progress</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
            Execution Progress & Diagnostics
          </h2>
          <p className="text-sm text-brand-muted mt-1">
            Real-time snapshot observation, reducer verification, and two-run execution tracking.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Cancellation Control */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancelExecution}
            disabled={isCancelling || isTerminal}
            className="text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800 space-x-1.5"
          >
            {isCancelling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            <span>{isCancelling ? 'Cancelling...' : 'Cancel Run'}</span>
          </Button>

          <Link href={`/investigations/${id}`}>
            <Button size="sm" variant="primary" className="space-x-1.5">
              <span>View Investigation Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Cancellation Notice */}
      {cancellationNotice && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center justify-between"
        >
          <div className="flex items-center space-x-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{cancellationNotice}</span>
          </div>
          <button
            onClick={() => setCancellationNotice(null)}
            className="text-amber-800 font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Cancellation Error */}
      {cancelError && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-control bg-red-50 border border-red-300 text-xs text-red-900 flex items-center justify-between"
        >
          <div className="flex items-center space-x-2 font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{cancelError}</span>
          </div>
          <button
            onClick={() => setCancelError(null)}
            className="text-red-800 font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: Live Snapshot Poller */}
      {activeTab === 'poller' && (
        <div className="space-y-5">
          {/* Person 1 SSE Dependency Notice */}
          <div className="p-4 rounded-control bg-lavender-surface border border-cobalt-action/30 text-xs text-brand-deepPurple space-y-1.5">
            <div className="font-semibold flex items-center space-x-1.5 text-cobalt-action">
              <Info className="w-4 h-4 shrink-0" />
              <span>Live progress</span>
            </div>
            <p className="text-[11px] leading-relaxed text-brand-navy/80">
              This page checks the actual investigation status every 2.5 seconds. Browser runs continue in the background.
            </p>
          </div>

          {/* Poller Status Banner */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-3">
                <span className="font-semibold text-brand-navy">Connection Status:</span>
                {isTerminal ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-neutral-surface text-brand-navy border border-neutral-divider font-semibold flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Terminal State Reached (Polling Stopped)</span>
                  </span>
                ) : isPollerActive ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>
                      {liveSnapshot?.lifecycleStatus === 'QUEUED' && workerAvailable === false
                        ? 'Queued (Waiting for Worker Daemon)'
                        : `Active Polling (Poll #${pollCount})`}
                    </span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-neutral-surface text-brand-muted border border-neutral-divider">
                    Idle / Stopped
                  </span>
                )}
              </div>

              {pollerError && (
                <div className="text-status-confirmed flex items-center space-x-1 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Transient issue: {pollerError}</span>
                </div>
              )}
            </div>
          </Card>

          {liveSnapshot?.lifecycleStatus === 'QUEUED' && workerAvailable === false && (
            <div className="p-3.5 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1">
              <div className="font-semibold flex items-center space-x-1.5 text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Execution Worker Daemon Offline</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                This investigation is queued and waiting for an active browser worker to pick up the job. The web server and database are operational, but no worker heartbeat has been received within the last 60 seconds. Start the worker daemon (<code>pnpm worker</code>) to execute queued investigations.
              </p>
            </div>
          )}

          {/* Current Snapshot Details */}
          {liveSnapshot ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{liveSnapshot.title}</CardTitle>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      getLifecyclePresentation(liveSnapshot.lifecycleStatus).badgeClass
                    }`}
                  >
                    {getLifecyclePresentation(liveSnapshot.lifecycleStatus).label}
                  </span>
                </div>
                <CardDescription>
                  Target: {liveSnapshot.targetName} ({liveSnapshot.targetUrl}) | ID: {liveSnapshot.id}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {/* 3-Dimensional Status Matrix */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-control bg-neutral-surface border border-neutral-divider space-y-1">
                    <span className="text-[11px] text-brand-muted font-medium">Lifecycle Status</span>
                    <div className="font-bold text-brand-navy">
                      {getLifecyclePresentation(liveSnapshot.lifecycleStatus).label}
                    </div>
                    <p className="text-[10px] text-brand-muted">
                      {getLifecyclePresentation(liveSnapshot.lifecycleStatus).description}
                    </p>
                  </div>

                  <div className="p-3 rounded-control bg-neutral-surface border border-neutral-divider space-y-1">
                    <span className="text-[11px] text-brand-muted font-medium">Reproduction Verdict</span>
                    <div className="font-bold text-brand-navy">
                      {getVerdictPresentation(liveSnapshot.reproductionVerdict).label}
                    </div>
                    <p className="text-[10px] text-brand-muted">
                      {getVerdictPresentation(liveSnapshot.reproductionVerdict).description}
                    </p>
                  </div>

                  <div className="p-3 rounded-control bg-neutral-surface border border-neutral-divider space-y-1">
                    <span className="text-[11px] text-brand-muted font-medium">Evidence Readiness</span>
                    <div className="font-bold text-brand-navy">
                      {getEvidencePresentation(liveSnapshot.evidenceReadiness).label}
                    </div>
                    <p className="text-[10px] text-brand-muted">
                      {getEvidencePresentation(liveSnapshot.evidenceReadiness).description}
                    </p>
                  </div>
                </div>

                {/* Two-Run Execution Verification */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-3.5 rounded-control border border-neutral-divider bg-white space-y-2">
                    <div className="flex items-center justify-between font-bold text-brand-navy">
                      <span>Attempt 1 (Initial Run)</span>
                      {liveSnapshot.attempt1 ? (
                        <span className="text-emerald-700 text-[11px]">Executed</span>
                      ) : (
                        <span className="text-brand-muted text-[11px]">Pending</span>
                      )}
                    </div>
                    {liveSnapshot.attempt1 ? (
                      <div className="text-[11px] text-brand-muted space-y-1">
                        <div>Validity: <span className="font-semibold text-brand-navy">{liveSnapshot.attempt1.validity}</span></div>
                        <div>Defect Observed: <span className="font-semibold text-brand-navy">{liveSnapshot.attempt1.defectDetected ? 'Yes (Signature Matched)' : 'No'}</span></div>
                        <div>Actions: {liveSnapshot.attempt1.actionsExecuted} executed</div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-brand-muted">Waiting for browser worker dispatch.</p>
                    )}
                  </div>

                  <div className="p-3.5 rounded-control border border-neutral-divider bg-white space-y-2">
                    <div className="flex items-center justify-between font-bold text-brand-navy">
                      <span>Attempt 2 (Confirmation Run)</span>
                      {liveSnapshot.attempt2 ? (
                        <span className="text-emerald-700 text-[11px]">Executed</span>
                      ) : (
                        <span className="text-brand-muted text-[11px]">Pending</span>
                      )}
                    </div>
                    {liveSnapshot.attempt2 ? (
                      <div className="text-[11px] text-brand-muted space-y-1">
                        <div>Validity: <span className="font-semibold text-brand-navy">{liveSnapshot.attempt2.validity}</span></div>
                        <div>Defect Observed: <span className="font-semibold text-brand-navy">{liveSnapshot.attempt2.defectDetected ? 'Yes (Signature Confirmed)' : 'No'}</span></div>
                        <div>Actions: {liveSnapshot.attempt2.actionsExecuted} executed</div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-brand-muted">Runs only after target fixture reset hook succeeds.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="p-8 text-center text-xs text-brand-muted space-y-3">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-cobalt-action" />
              <div>Fetching initial snapshot for investigation {id}...</div>
            </Card>
          )}

          {/* Terminal Guidance Callout */}
          {isTerminal && liveSnapshot && (
            <div className="space-y-3">
              {liveSnapshot.lifecycleStatus === 'COMPLETED' ? (
                <div className="p-4 rounded-control bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold flex items-center space-x-1.5 text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Reproduction Run Complete</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-relaxed">
                      Two-attempt execution has finished. The defect reproduction verdict, telemetry, and evidence triads are ready for review.
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center space-x-2">
                    <Link href={`/investigations/${id}`}>
                      <Button size="sm" variant="primary" className="space-x-1.5 bg-emerald-700 hover:bg-emerald-800 text-white">
                        <span>View Evidence Triad & Report</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : liveSnapshot.lifecycleStatus === 'FAILED' ? (
                <div className="p-4 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold flex items-center space-x-1.5 text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Execution Inconclusive</span>
                    </div>
                    <p className="text-[11px] text-amber-900/90 leading-relaxed">
                      {(events.find((e) => e.eventType === 'TARGET_RESET_FAILED')?.payload?.message as string) ||
                       'Execution did not confirm reproduction: target baseline reset or runner error occurred.'}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center space-x-2">
                    <Link href={`/investigations/${id}`}>
                      <Button size="sm" variant="outline" className="border-amber-300 hover:bg-amber-100 text-amber-900">
                        <span>View Telemetry</span>
                      </Button>
                    </Link>
                    <Link href="/investigations/new">
                      <Button size="sm" variant="primary" className="space-x-1 bg-brand-navy hover:bg-brand-navy/90 text-white">
                        <span>New Report</span>
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Real-time Playwright Activity & Event Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-cobalt-action" />
                  <span>Playwright Execution Activity & Events</span>
                </CardTitle>
                <span className="text-[11px] text-brand-muted">
                  {events.length} {events.length === 1 ? 'event' : 'events'} recorded
                </span>
              </div>
              <CardDescription className="text-xs">
                Real-time factual log of browser automation steps, baseline resets, and verifier evaluations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.length === 0 ? (
                <p className="text-xs text-brand-muted py-4 text-center">Waiting for browser worker to emit execution events...</p>
              ) : (
                <div className="divide-y divide-neutral-divider/60 font-sans text-xs">
                  {events
                    .filter((evt, idx, arr) => !(evt.eventType === 'EXECUTION_ADMITTED' && arr[idx - 1]?.eventType === 'EXECUTION_ADMITTED'))
                    .map((evt) => {
                    const msg = (evt.payload?.message as string) || evt.eventType;
                    const isError = evt.eventType.includes('FAIL') || evt.eventType.includes('ERROR');
                    const isSuccess = evt.eventType.includes('COMPLETED') || evt.eventType.includes('APPROVED');
                    return (
                      <div key={evt.id} className="py-2.5 flex items-start space-x-3">
                        <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-surface border border-neutral-divider text-brand-muted">
                          #{evt.sequenceIndex}
                        </span>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              isError
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : isSuccess
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-lavender-surface text-brand-deepPurple border border-cobalt-action/20'
                            }`}>
                              {evt.eventType.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] text-brand-muted">
                              {new Date(evt.emittedAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-xs text-brand-navy leading-relaxed break-words font-medium">
                            {msg}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
