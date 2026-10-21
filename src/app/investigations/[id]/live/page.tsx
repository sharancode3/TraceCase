'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Play,
  ArrowRight,
  Terminal,
  RotateCcw,
  Activity,
  AlertCircle,
  CheckCircle2,
  Info,
  Radio,
  XCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createInitialProgressState,
  reduceProgressEvent,
} from '@/features/investigations/event-reducer';
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
  fetchInvestigationEvents,
} from '@/features/investigations/api-client';

const SIMULATED_STAGES = [
  {
    name: 'Attempt 1: Launch Browser & Execute Steps',
    event: {
      eventId: 'evt-01',
      schemaVersion: 1 as const,
      investigationId: 'b22ac10b-58cc-4372-a567-0e02b2c3d402',
      sequenceIndex: 0,
      eventType: 'ATTEMPT_STARTED' as const,
      timestamp: '2026-10-20T08:22:00.000Z',
      payload: { attemptNumber: 1 },
    },
    log: '[Attempt 1] Isolated Chromium context launched with CDP tracing enabled.',
  },
  {
    name: 'Attempt 1: Defect Signature Detected',
    event: {
      eventId: 'evt-02',
      schemaVersion: 1 as const,
      investigationId: 'b22ac10b-58cc-4372-a567-0e02b2c3d402',
      sequenceIndex: 1,
      eventType: 'ASSERTION_EVALUATED' as const,
      timestamp: '2026-10-20T08:22:05.000Z',
      payload: { stepIndex: 2, defectDetected: true, assertion: 'task-001 deleted instead of task-002' },
    },
    log: '[Attempt 1] Assertion PASSED: Defect signature observed (task-001 deleted).',
  },
  {
    name: 'Target Reset: POST /api/test/reset-fixture (TC-INV-006)',
    event: {
      eventId: 'evt-03',
      schemaVersion: 1 as const,
      investigationId: 'b22ac10b-58cc-4372-a567-0e02b2c3d402',
      sequenceIndex: 2,
      eventType: 'RESET_STARTED' as const,
      timestamp: '2026-10-20T08:22:07.000Z',
      payload: { endpoint: 'http://localhost:3005/api/test/reset-fixture' },
    },
    log: '[Reset Hook] Invoking POST /api/test/reset-fixture. Response: HTTP 200 OK (4 items restored).',
  },
  {
    name: 'Attempt 2: Confirmation Run under Fresh Context',
    event: {
      eventId: 'evt-04',
      schemaVersion: 1 as const,
      investigationId: 'b22ac10b-58cc-4372-a567-0e02b2c3d402',
      sequenceIndex: 3,
      eventType: 'ATTEMPT_STARTED' as const,
      timestamp: '2026-10-20T08:22:09.000Z',
      payload: { attemptNumber: 2 },
    },
    log: '[Attempt 2] Fresh browser context launched. Re-executing approved plan steps.',
  },
  {
    name: 'Attempt 2: Identical Defect Signature Confirmed (TC-INV-002)',
    event: {
      eventId: 'evt-05',
      schemaVersion: 1 as const,
      investigationId: 'b22ac10b-58cc-4372-a567-0e02b2c3d402',
      sequenceIndex: 4,
      eventType: 'ASSERTION_EVALUATED' as const,
      timestamp: '2026-10-20T08:22:14.000Z',
      payload: { stepIndex: 2, defectDetected: true, signatureMatch: true },
    },
    log: '[Attempt 2] Assertion PASSED: Identical defect signature confirmed on second run.',
  },
  {
    name: 'Evidence Finalization & In-Stream Scrubbing (TC-INV-009)',
    event: {
      eventId: 'evt-06',
      schemaVersion: 1 as const,
      investigationId: 'b22ac10b-58cc-4372-a567-0e02b2c3d402',
      sequenceIndex: 5,
      eventType: 'ARTIFACT_STORED' as const,
      timestamp: '2026-10-20T08:22:16.000Z',
      payload: { triadComplete: true, video: 'run1.webm', console: 'run1.log', network: 'run1.json' },
    },
    log: '[Evidence] 0 plaintext credentials found. Public safe triad published to S3.',
  },
  {
    name: 'Investigation Completed: CONFIRMED_REPRODUCED',
    event: {
      eventId: 'evt-07',
      schemaVersion: 1 as const,
      investigationId: 'b22ac10b-58cc-4372-a567-0e02b2c3d402',
      sequenceIndex: 6,
      eventType: 'INVESTIGATION_COMPLETED' as const,
      timestamp: '2026-10-20T08:22:18.000Z',
      payload: { verdict: 'CONFIRMED_REPRODUCED' },
    },
    log: '[Verdict] State updated: CONFIRMED_REPRODUCED. Two-run confirmation successful.',
  },
];

export default function LiveInvestigationProgressPage() {
  const params = useParams();
  const id = params?.id as string;

  // View Mode: 'poller' for live snapshot polling; 'simulation' for reducer stepper
  const [activeTab, setActiveTab] = React.useState<'poller' | 'simulation'>('poller');

  // Live Snapshot Polling State
  const [liveSnapshot, setLiveSnapshot] = React.useState<InvestigationSnapshot | null>(null);
  const [isPollerActive, setIsPollerActive] = React.useState(false);
  const [pollCount, setPollCount] = React.useState(0);
  const [pollerError, setPollerError] = React.useState<string | null>(null);
  const [isTerminal, setIsTerminal] = React.useState(false);

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
      setCancellationNotice(`Execution successfully cancelled at ${new Date(result.data.cancelledAt).toLocaleTimeString()}.`);
      setIsTerminal(true);
      setIsPollerActive(false);
      setLiveSnapshot((prev) => prev ? { ...prev, lifecycleStatus: 'CANCELLED' } : null);
    } else {
      setCancelError(`Cancellation failed (${result.error.code}): ${result.error.message}`);
    }
  };

  // Reducer Simulation State
  const [currentStep, setCurrentStep] = React.useState(0);
  const [progressState, setProgressState] = React.useState(() =>
    createInitialProgressState('APPROVED')
  );
  const [simLogs, setSimLogs] = React.useState<string[]>([
    '[System] Ready for simulated execution. Click "Advance Next Stage" to step through state machine transitions.',
  ]);

  // Setup bounded snapshot poller
  React.useEffect(() => {
    if (!id) return;

    const poller = createInvestigationPoller({
      investigationId: id,
      intervalMs: 2500,
      maxPolls: 60,
      onUpdate: (snapshot, count) => {
        setLiveSnapshot(snapshot);
        setPollCount(count);
        setPollerError(null);
        if (isTerminalLifecycleStatus(snapshot.lifecycleStatus)) {
          setIsTerminal(true);
          setIsPollerActive(false);
        }
      },
      onError: (errMsg) => {
        setPollerError(errMsg);
      },
      onTerminal: () => {
        setIsTerminal(true);
        setIsPollerActive(false);
      },
      onMaxPollsReached: () => {
        setIsPollerActive(false);
      },
    });

    poller.start();
    setIsPollerActive(true);

    let lastEventId: string | undefined;
    const eventInterval = setInterval(async () => {
      try {
        const evRes = await fetchInvestigationEvents(id, lastEventId);
        if (evRes.success && evRes.data.events.length > 0) {
          for (const ev of evRes.data.events) {
            lastEventId = ev.eventId;
            setProgressState((prev) => reduceProgressEvent(prev, ev));
          }
        }
      } catch {
        // Event stream poll fallback
      }
    }, 2500);

    return () => {
      poller.stop();
      clearInterval(eventInterval);
      setIsPollerActive(false);
    };
  }, [id]);

  // Reducer simulation handlers
  const handleNextStep = () => {
    if (currentStep < SIMULATED_STAGES.length) {
      const stage = SIMULATED_STAGES[currentStep];
      setProgressState((prev) => reduceProgressEvent(prev, stage.event));
      setSimLogs((prev) => [...prev, stage.log]);
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleResetSim = () => {
    setCurrentStep(0);
    setProgressState(createInitialProgressState('APPROVED'));
    setSimLogs(['[System] Simulation reset to initial approved state.']);
  };

  const isSimCompleted = currentStep >= SIMULATED_STAGES.length;

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

      {/* Mode Navigation Tabs */}
      <div className="flex items-center border-b border-neutral-divider space-x-4 text-xs font-medium">
        <button
          onClick={() => setActiveTab('poller')}
          className={`pb-2.5 flex items-center space-x-2 transition-colors border-b-2 ${
            activeTab === 'poller'
              ? 'border-cobalt-action text-cobalt-action font-semibold'
              : 'border-transparent text-brand-muted hover:text-brand-navy'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Live Snapshot Poller</span>
          {isPollerActive && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('simulation')}
          className={`pb-2.5 flex items-center space-x-2 transition-colors border-b-2 ${
            activeTab === 'simulation'
              ? 'border-cobalt-action text-cobalt-action font-semibold'
              : 'border-transparent text-brand-muted hover:text-brand-navy'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Event Reducer Simulator (Stage 0)</span>
        </button>
      </div>

      {/* TAB 1: Live Snapshot Poller */}
      {activeTab === 'poller' && (
        <div className="space-y-5">
          {/* Person 1 SSE Dependency Notice */}
          <div className="p-4 rounded-control bg-lavender-surface border border-cobalt-action/30 text-xs text-brand-deepPurple space-y-1.5">
            <div className="font-semibold flex items-center space-x-1.5 text-cobalt-action">
              <Info className="w-4 h-4 shrink-0" />
              <span>Real-Time Stream Notice (P1-05 Worker Bus Pending)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-brand-navy/80">
              The continuous Server-Sent Events (SSE) stream endpoint (<code className="font-mono bg-white/70 px-1 py-0.5 rounded">GET /api/v1/investigations/[id]/events</code>) is pending Person 1 implementation. The UI is currently monitoring progress via bounded snapshot polling from <code className="font-mono bg-white/70 px-1 py-0.5 rounded">GET /api/v1/investigations/{id}</code> every 2.5s.
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
                    <span>Active Polling (Poll #{pollCount})</span>
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
        </div>
      )}

      {/* TAB 2: Reducer Event Simulator */}
      {activeTab === 'simulation' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-brand-muted">
              Advance through deterministic event reducer stages to verify sequence ordering and invariant enforcement.
            </span>
            <div className="flex items-center space-x-2">
              <Button size="sm" variant="outline" onClick={handleResetSim} className="space-x-1.5 text-xs">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Reducer</span>
              </Button>
              {!isSimCompleted ? (
                <Button size="sm" variant="primary" onClick={handleNextStep} className="space-x-1.5 text-xs">
                  <Play className="w-3.5 h-3.5" />
                  <span>Advance Stage ({currentStep + 1}/{SIMULATED_STAGES.length})</span>
                </Button>
              ) : (
                <Badge variant="confirmed">All Stages Reduced</Badge>
              )}
            </div>
          </div>

          {/* Stepper Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Deterministic Event Transitions</span>
                <Badge variant={isSimCompleted ? 'confirmed' : 'default'}>
                  Reduced Lifecycle: {progressState.currentStatus}
                </Badge>
              </CardTitle>
              <CardDescription>
                Exercising <code className="font-mono text-xs">reduceProgressEvent</code> with sequence gap tracking.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {SIMULATED_STAGES.map((s, idx) => {
                  const isPast = idx < currentStep;
                  const isCurrent = idx === currentStep;

                  return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-control border flex items-center justify-between text-xs transition-colors ${
                        isPast
                          ? 'bg-emerald-50/60 border-emerald-300 text-emerald-900'
                          : isCurrent
                          ? 'bg-lavender-surface border-cobalt-action text-brand-navy font-semibold ring-1 ring-cobalt-action'
                          : 'bg-neutral-surface/40 border-neutral-divider/80 text-brand-muted'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            isPast
                              ? 'bg-emerald-600 text-white'
                              : isCurrent
                              ? 'bg-cobalt-action text-white'
                              : 'bg-neutral-divider text-brand-muted'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span>{s.name}</span>
                      </div>

                      <div>
                        {isPast ? (
                          <span className="text-emerald-700 font-medium">Applied</span>
                        ) : isCurrent ? (
                          <span className="text-cobalt-action font-semibold animate-pulse">Ready to Apply...</span>
                        ) : (
                          <span className="text-brand-muted">Queued</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Diagnostic Console */}
          <Card className="bg-brand-navy text-white font-mono text-xs border-none shadow-card">
            <CardHeader className="border-b border-white/10 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-lavender-accent">
                  <Terminal className="w-4 h-4" />
                  <span className="font-semibold text-xs">Diagnostic Event Bus Stream</span>
                </div>
                <span className="text-[10px] text-white/50">{simLogs.length} events logged</span>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-1.5 max-h-56 overflow-y-auto">
              {simLogs.map((log, i) => (
                <div key={i} className="text-[11px] text-white/90 leading-relaxed font-mono">
                  {log}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
