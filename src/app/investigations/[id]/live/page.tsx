'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Play,
  ArrowRight,
  Terminal,
  RotateCcw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createInitialProgressState,
  reduceProgressEvent,
} from '@/features/investigations/event-reducer';

const SIMULATED_STAGES = [
  {
    name: 'Attempt 1: Launch Browser & Execute Steps',
    event: {
      eventId: 'evt-01',
      schemaVersion: 1 as const,
      investigationId: 'b22ac10b-58cc-4372-a567-0e02b2c3d402',
      sequenceIndex: 0,
      eventType: 'ATTEMPT_STARTED' as const,
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
      payload: { verdict: 'CONFIRMED_REPRODUCED' },
    },
    log: '[Verdict] State updated: CONFIRMED_REPRODUCED. Two-run confirmation successful.',
  },
];

export default function LiveSimulationPage() {
  const params = useParams();
  const id = params?.id as string;

  const [currentStep, setCurrentStep] = React.useState(0);
  const [progressState, setProgressState] = React.useState(() =>
    createInitialProgressState('APPROVED')
  );
  const [logs, setLogs] = React.useState<string[]>([
    '[System] Ready for simulated execution. Click "Advance Next Stage" to step through the state machine.',
  ]);

  const handleNextStep = () => {
    if (currentStep < SIMULATED_STAGES.length) {
      const stage = SIMULATED_STAGES[currentStep];
      setProgressState((prev) => reduceProgressEvent(prev, stage.event));
      setLogs((prev) => [...prev, stage.log]);
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setProgressState(createInitialProgressState('APPROVED'));
    setLogs(['[System] Simulation reset to initial approved state.']);
  };

  const isCompleted = currentStep >= SIMULATED_STAGES.length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
            Execution Progress Simulator
          </h2>
          <p className="text-sm text-brand-muted mt-1">
            Simulate real-time worker events, fixture reset hooks, and two-run confirmation logic.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button size="sm" variant="outline" onClick={handleReset} className="space-x-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Simulation</span>
          </Button>
          {!isCompleted ? (
            <Button size="sm" variant="primary" onClick={handleNextStep} className="space-x-1.5">
              <Play className="w-3.5 h-3.5" />
              <span>Advance Next Stage ({currentStep + 1}/{SIMULATED_STAGES.length})</span>
            </Button>
          ) : (
            <Link href={`/investigations/${id}`}>
              <Button size="sm" variant="primary" className="space-x-1.5">
                <span>View Final Result</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Progress Stepper Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Workflow Stages Timeline</span>
            <Badge variant={isCompleted ? 'confirmed' : 'default'}>
              Lifecycle: {progressState.currentStatus}
            </Badge>
          </CardTitle>
          <CardDescription>
            Notice: In Stage 0, Playwright browser execution is simulated through state event reducers.
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
                      <span className="text-emerald-700 font-medium">Completed</span>
                    ) : isCurrent ? (
                      <span className="text-cobalt-action font-semibold animate-pulse">In Progress...</span>
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

      {/* Real-time Diagnostic Event Console */}
      <Card className="bg-brand-navy text-white font-mono text-xs border-none shadow-card">
        <CardHeader className="border-b border-white/10 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-lavender-accent">
              <Terminal className="w-4 h-4" />
              <span className="font-semibold text-xs">Diagnostic Event Bus Stream</span>
            </div>
            <span className="text-[10px] text-white/50">{logs.length} events logged</span>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-1.5 max-h-56 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="text-[11px] text-white/90 leading-relaxed font-mono">
              {log}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
