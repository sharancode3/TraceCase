'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bug, ArrowRight, AlertCircle, Loader2, Info, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { DraftReportIntake } from '@/contracts/reports';
import { fetchTargets, submitBugReport, fetchInvestigation } from '@/features/investigations/api-client';
import { executePlanningTransition } from '@/features/investigations/planning-orchestration';

export default function NewReportPage() {
  const router = useRouter();

  const [targets, setTargets] = React.useState<SafeTargetProfile[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);
  const [targetWarning, setTargetWarning] = React.useState<string | null>(null);
  const [savedInvestigationId, setSavedInvestigationId] = React.useState<string | null>(null);
  const [planningPhase, setPlanningPhase] = React.useState<
    'idle' | 'saving_report' | 'planning' | 'planning_error' | 'unable_to_proceed'
  >('idle');
  const [unableToProceedDetails, setUnableToProceedDetails] = React.useState<{
    reason: string;
    missingPrerequisites?: string[];
  } | null>(null);

  // Synchronization refs for preventing duplicate clicks and discarding stale responses
  const submittingRef = React.useRef(false);
  const requestSeqRef = React.useRef(0);
  const saveIdempotencyKeyRef = React.useRef<string>('');

  // Initialize or maintain save idempotency key
  if (!saveIdempotencyKeyRef.current) {
    saveIdempotencyKeyRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'intake-' + Date.now();
  }

  const [formData, setFormData] = React.useState({
    targetId: '',
    title: '',
    bugDescription: '',
    expectedBehavior: '',
    observedBehavior: '',
    suspectedSteps: '',
    browserEnvironment: '',
    buildVersion: '',
    diagnosticLogs: '',
  });

  const selectedTarget = React.useMemo(() => {
    return targets.find((t) => t.id === formData.targetId) || null;
  }, [targets, formData.targetId]);

  // Fetch target environments on mount & check durable URL recovery
  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      const res = await fetchTargets();
      if (!isMounted) return;
      if (res.success && res.data.targets.length > 0) {
        setTargets(res.data.targets);

        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const requestedTargetId = urlParams?.get('targetId');
        const requestedInvId = urlParams?.get('investigationId');

        // Check if returning to an already saved investigation (Durable Navigation Pattern)
        if (requestedInvId) {
          const invRes = await fetchInvestigation(requestedInvId);
          if (!isMounted) return;
          if (invRes.success && invRes.data) {
            setSavedInvestigationId(invRes.data.id);
            if (invRes.data.targetId) {
              setFormData((prev) => ({ ...prev, targetId: invRes.data.targetId }));
            }
            if (invRes.data.reviewStatus === 'CLARIFICATION_PENDING') {
              router.push(`/investigations/${invRes.data.id}/clarify`);
              return;
            }
            if (invRes.data.reviewStatus === 'PROPOSAL_READY' && invRes.data.planVersion) {
              router.push(`/investigations/${invRes.data.id}/approve`);
              return;
            }
            if (invRes.data.reviewStatus === 'BLOCKED') {
              setPlanningPhase('unable_to_proceed');
              setUnableToProceedDetails({ reason: 'Investigation was previously marked blocked during planning.' });
              return;
            }
          }
        }

        if (requestedTargetId) {
          const matched = res.data.targets.find((t: SafeTargetProfile) => t.id === requestedTargetId);
          if (matched) {
            setFormData((prev) => ({ ...prev, targetId: matched.id }));
            setTargetWarning(null);
          } else {
            setTargetWarning(
              'The requested target is unavailable, invalid, or unauthorized for your account. Please select a valid profile from your registered targets below.'
            );
            setFormData((prev) => ({ ...prev, targetId: '' }));
          }
        } else if (res.data.targets.length === 1) {
          setFormData((prev) => ({ ...prev, targetId: res.data.targets[0].id }));
        } else {
          setFormData((prev) => ({ ...prev, targetId: '' }));
        }
      } else if (res.success && res.data.targets.length === 0) {
        setTargets([]);
        setFormData((prev) => ({ ...prev, targetId: '' }));
      } else {
        setTargets([]);
        setValidationError(res.success ? 'No registered targets. Register a target first.' : `Cannot load targets: ${res.error.message}. Sign in and check the database connection.`);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [router]);

  /**
   * Plans or retries planning for an authoritative persisted investigation.
   * Never calls report creation; uses executePlanningTransition for typed outcomes.
   */
  const handleRequestPlanningForInvestigation = async (invId: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionError(null);
    setPlanningPhase('planning');

    const currentSeq = ++requestSeqRef.current;

    try {
      const transitionResult = await executePlanningTransition({
        investigationId: invId,
      });

      // Discard stale responses from delayed or superseded requests
      if (requestSeqRef.current !== currentSeq) {
        return;
      }

      if (transitionResult.outcome === 'PROPOSAL_READY') {
        router.push(transitionResult.navigationTarget);
      } else if (transitionResult.outcome === 'CLARIFICATION_NEEDED') {
        router.push(transitionResult.navigationTarget);
      } else if (transitionResult.outcome === 'UNABLE_TO_PROCEED') {
        setPlanningPhase('unable_to_proceed');
        setUnableToProceedDetails({
          reason: transitionResult.reason,
          missingPrerequisites: transitionResult.missingPrerequisites,
        });
      } else {
        // ERROR outcome
        setPlanningPhase('planning_error');
        setSubmissionError(transitionResult.message);
      }
    } catch (err: unknown) {
      if (requestSeqRef.current === currentSeq) {
        setPlanningPhase('planning_error');
        setSubmissionError(
          err instanceof Error ? err.message : 'Unexpected planning error. Your report is preserved; please retry.'
        );
      }
    } finally {
      if (requestSeqRef.current === currentSeq) {
        setIsSubmitting(false);
        submittingRef.current = false;
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSubmissionError(null);

    // Prevent duplicate clicks while an operation is in-flight
    if (submittingRef.current) {
      return;
    }

    // If report was already persisted, retry planning directly against that existing ID
    if (savedInvestigationId) {
      await handleRequestPlanningForInvestigation(savedInvestigationId);
      return;
    }

    // Validate that a registered target is selected
    if (!formData.targetId) {
      setValidationError('Please select a registered target application before submitting a bug report.');
      return;
    }

    // Validate primary fields
    if (formData.title.trim().length < 3) {
      setValidationError('Please enter a bug summary or title (minimum 3 characters).');
      return;
    }

    if (formData.bugDescription.trim().length < 5) {
      setValidationError('Please describe what occurred (minimum 5 characters). Uncertainty is completely okay.');
      return;
    }

    // Combine diagnostic logs into description cleanly without exceeding schema bounds
    const combinedDescription = formData.diagnosticLogs.trim()
      ? `${formData.bugDescription.trim()}\n\n[Diagnostic Logs]\n${formData.diagnosticLogs.trim()}`
      : formData.bugDescription.trim();

    const trimmedDescription = combinedDescription.slice(0, 5000);

    const stepsArray = formData.suspectedSteps
      ? formData.suspectedSteps.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20)
      : undefined;

    // Strict DraftReportIntake payload with client command idempotency key
    const payload: DraftReportIntake = {
      targetId: formData.targetId,
      title: formData.title.trim().slice(0, 200),
      rawDescription: trimmedDescription,
      ...(formData.expectedBehavior.trim() ? { expectedBehavior: formData.expectedBehavior.trim().slice(0, 2000) } : {}),
      ...(formData.observedBehavior.trim() ? { observedBehavior: formData.observedBehavior.trim().slice(0, 2000) } : {}),
      ...(stepsArray && stepsArray.length > 0 ? { suspectedSteps: stepsArray } : {}),
      ...(formData.browserEnvironment.trim() ? { browserEnvironment: formData.browserEnvironment.trim().slice(0, 100) } : {}),
      ...(formData.buildVersion.trim() ? { buildVersion: formData.buildVersion.trim().slice(0, 50) } : {}),
      idempotencyKey: saveIdempotencyKeyRef.current,
    };

    submittingRef.current = true;
    setIsSubmitting(true);
    setPlanningPhase('saving_report');
    const currentSeq = ++requestSeqRef.current;

    try {
      const result = await submitBugReport(payload, {
        idempotencyKey: saveIdempotencyKeyRef.current,
      });

      // Discard stale responses
      if (requestSeqRef.current !== currentSeq) {
        return;
      }

      if (result.success) {
        const targetInvId = result.data.investigationId;
        if (targetInvId) {
          // Authoritatively retain the investigation ID and update URL for durable recovery
          setSavedInvestigationId(targetInvId);
          if (typeof window !== 'undefined' && window.history?.replaceState) {
            window.history.replaceState(null, '', `?investigationId=${encodeURIComponent(targetInvId)}&targetId=${encodeURIComponent(formData.targetId)}`);
          }

          // Release submitting lock for the save phase so planning phase can proceed cleanly
          submittingRef.current = false;
          setIsSubmitting(false);

          // Proceed to separate planning phase
          await handleRequestPlanningForInvestigation(targetInvId);
        } else {
          setIsSubmitting(false);
          submittingRef.current = false;
          router.push(`/investigations/${result.data.id}`);
        }
      } else {
        // PRESERVE formData so user input is never wiped on error
        setIsSubmitting(false);
        submittingRef.current = false;
        setPlanningPhase('idle');

        if (result.error.code === 'IDEMPOTENCY_REQUEST_IN_PROGRESS') {
          setSubmissionError('A report submission with identical details is currently being processed. Please wait a moment.');
        } else if (result.error.code === 'AUTHENTICATION_REQUIRED' || result.status === 401) {
          setSubmissionError('Your session has expired. Please sign in to save your bug report.');
        } else {
          setSubmissionError(`Submission failed (${result.error.code}): ${result.error.message}`);
        }
      }
    } catch (err: unknown) {
      if (requestSeqRef.current === currentSeq) {
        setIsSubmitting(false);
        submittingRef.current = false;
        setPlanningPhase('idle');
        setSubmissionError(
          err instanceof Error ? err.message : 'Network failure during report save. Your entered inputs are preserved; please retry.'
        );
      }
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-navy tracking-tight">
            Submit Bug Report
          </h2>
        </div>
      </div>

      {/* Target Warning Callout */}
      {targetWarning && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{targetWarning}</span>
          </div>
          <button
            onClick={() => setTargetWarning(null)}
            className="text-amber-800 font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Client Validation Error Callout */}
      {validationError && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-control bg-status-confirmedBg border border-red-200 text-xs text-status-confirmed flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="text-status-confirmed font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* REQUIREMENT 3: "Report saved; preparing a plan." Banner */}
      {savedInvestigationId && planningPhase === 'planning' && (
        <div
          role="status"
          aria-live="polite"
          className="p-5 rounded-control bg-cobalt-action/10 border border-cobalt-action/30 text-brand-navy space-y-2 shadow-sm animate-pulse"
        >
          <div className="flex items-center space-x-3">
            <Loader2 className="w-5 h-5 text-cobalt-action animate-spin shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-brand-navy">
                Report saved; preparing a plan.
              </h3>
              <p className="text-xs text-brand-muted mt-0.5 leading-relaxed">
                Investigation <span className="font-mono font-medium text-cobalt-action">{savedInvestigationId}</span> has been confirmed. Autonomous planning is analyzing reported defect symptoms to establish deterministic preconditions and reproduction steps.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PLANNING ERROR: Report is saved, planning failed */}
      {savedInvestigationId && planningPhase === 'planning_error' && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-3"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-semibold text-amber-900">
                Report saved (Investigation: {savedInvestigationId.slice(0, 8)}...), but experiment planning encountered an issue.
              </span>
            </div>
          </div>
          <p className="text-amber-800 leading-relaxed">
            {submissionError || 'The planning service was unable to complete proposal generation.'}
          </p>
          <div className="pt-2 border-t border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] text-amber-700">
              Your report is safely stored. Retrying planning will not duplicate your report.
            </span>
            <div className="flex items-center space-x-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => handleRequestPlanningForInvestigation(savedInvestigationId)}
                disabled={isSubmitting}
                className="text-xs shrink-0 space-x-1.5"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Retry Planning</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* UNABLE TO PROCEED: Report is saved, planning blocked on preconditions */}
      {savedInvestigationId && planningPhase === 'unable_to_proceed' && (
        <div
          role="alert"
          aria-live="polite"
          className="p-4 rounded-control bg-neutral-surface border border-neutral-divider text-xs text-brand-navy space-y-3"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 text-brand-muted shrink-0" />
              <span className="font-semibold">Autonomous Planning Blocked</span>
            </div>
          </div>
          <p className="text-brand-muted leading-relaxed">
            Autonomous planning was unable to construct an experiment: {unableToProceedDetails?.reason || 'Required preconditions could not be verified.'}
          </p>
          {unableToProceedDetails?.missingPrerequisites && unableToProceedDetails.missingPrerequisites.length > 0 && (
            <div className="p-2.5 rounded bg-white border border-neutral-divider text-[11px] space-y-1">
              <strong className="font-medium text-brand-navy">Missing Prerequisites:</strong>
              <ul className="list-disc list-inside space-y-0.5 text-brand-muted">
                {unableToProceedDetails.missingPrerequisites.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="pt-2 border-t border-neutral-divider flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] text-brand-muted">
              Report {savedInvestigationId.slice(0, 8)}... is preserved. You can edit details or retry planning.
            </span>
            <div className="flex items-center space-x-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => handleRequestPlanningForInvestigation(savedInvestigationId)}
                disabled={isSubmitting}
                className="text-xs shrink-0 space-x-1.5"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Retry Planning</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE ERROR: Report could not be persisted */}
      {!savedInvestigationId && submissionError && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-control bg-status-confirmedBg border border-red-300 text-xs text-status-confirmed space-y-3"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{submissionError}</span>
            </div>
            <button
              onClick={() => setSubmissionError(null)}
              className="text-status-confirmed font-semibold hover:underline"
            >
              Dismiss
            </button>
          </div>
          <div className="pt-2 border-t border-red-200 flex items-center justify-between text-neutral-800">
            <span className="text-xs">
              Check your connection and ensure you are signed in. Your entered values have been preserved.
            </span>
          </div>
        </div>
      )}

      {/* 3-Stage Autonomous Defect Reproduction Workflow Indicator (Matches user sketch with top-right corner badge) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div
          id="workflow-step-intake"
          className="relative overflow-hidden rounded-2xl bg-white border-2 border-cobalt-action shadow-xs flex items-center p-3.5 pr-4 space-x-3 transition-all min-h-[74px]"
        >
          {/* Top-Right Corner Badge: Bluish Purplish with Whitish Text */}
          <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-cobalt-action to-brand-deepPurple text-white rounded-bl-xl text-[9.5px] font-bold uppercase tracking-wider select-none shadow-xs">
            Stage 1 • Active
          </div>

          <div className="w-9 h-9 rounded-full bg-cobalt-action text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
            1
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h4 className="text-xs font-bold text-brand-navy leading-tight">Report Intake</h4>
            <p className="text-[11px] text-brand-muted mt-0.5 leading-snug">Provide defect symptoms</p>
          </div>
        </div>

        <div
          id="workflow-step-approval"
          className="relative overflow-hidden rounded-2xl bg-white/95 border border-neutral-divider/80 shadow-xs flex items-center p-3.5 pr-4 space-x-3 transition-all min-h-[74px]"
        >
          {/* Top-Right Corner Badge: Bluish Purplish with Whitish Text */}
          <div className="absolute top-0 right-0 px-3 py-1 bg-brand-deepPurple text-white rounded-bl-xl text-[9.5px] font-bold uppercase tracking-wider select-none shadow-xs">
            Stage 2 • Human Gate
          </div>

          <div className="w-9 h-9 rounded-full bg-neutral-100 text-brand-muted font-bold text-xs flex items-center justify-center shrink-0 border border-neutral-divider">
            2
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h4 className="text-xs font-bold text-brand-navy leading-tight">Plan Approval</h4>
            <p className="text-[11px] text-brand-muted mt-0.5 leading-snug">Inspect before browser runs</p>
          </div>
        </div>

        <div
          id="workflow-step-evidence"
          className="relative overflow-hidden rounded-2xl bg-white/95 border border-neutral-divider/80 shadow-xs flex items-center p-3.5 pr-4 space-x-3 transition-all min-h-[74px]"
        >
          {/* Top-Right Corner Badge: Bluish Purplish with Whitish Text */}
          <div className="absolute top-0 right-0 px-3 py-1 bg-brand-deepPurple text-white rounded-bl-xl text-[9.5px] font-bold uppercase tracking-wider select-none shadow-xs">
            Stage 3 • Verified
          </div>

          <div className="w-9 h-9 rounded-full bg-neutral-100 text-brand-muted font-bold text-xs flex items-center justify-center shrink-0 border border-neutral-divider">
            3
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h4 className="text-xs font-bold text-brand-navy leading-tight">Autonomous Verification</h4>
            <p className="text-[11px] text-brand-muted mt-0.5 leading-snug">2x repro with video & traces</p>
          </div>
        </div>
      </div>

      <Card id="report-intake-card">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-brand-navy flex items-center space-x-2">
                <Bug className="w-4 h-4 text-cobalt-action" />
                <span>Report Intake Details</span>
              </CardTitle>
              {savedInvestigationId ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Report Persisted ({savedInvestigationId.slice(0, 8)}...)</span>
                </span>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Target Application Selection & Identity Display */}
            <div id="target-select-container">
              <label htmlFor="target-select" className="block text-sm font-medium text-brand-navy mb-1.5">
                Target Application *
              </label>

              {targets.length === 0 ? (
                <div className="p-4 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
                  <div className="flex items-center space-x-2 font-semibold text-amber-900">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>No Registered Targets Available</span>
                  </div>
                  <p className="leading-relaxed">
                    TraceCase requires an authorized target environment before creating a bug report. Add your target once, then choose it whenever you file reports.
                  </p>
                  <div className="pt-1">
                    <Link
                      href="/targets?returnTo=/investigations/new"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-cobalt-action text-white font-medium text-xs shadow-sm hover:bg-cobalt-hover transition-colors"
                    >
                      <span>Register a Target Application →</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <select
                    id="target-select"
                    value={formData.targetId}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, targetId: e.target.value }));
                      if (targetWarning) setTargetWarning(null);
                    }}
                    disabled={isSubmitting || Boolean(savedInvestigationId)}
                    className="w-full h-11 rounded-control border border-neutral-divider bg-white px-3.5 py-2 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-cobalt-action disabled:bg-neutral-surface disabled:text-brand-muted"
                  >
                    <option value="">
                      {targets.length === 1
                        ? 'Select target application'
                        : `Select a registered target (${targets.length} available)...`}
                    </option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.baseUrl}) — {t.environment.toUpperCase()} ({t.isSandboxVerified ? 'Sandbox' : 'Protected'})
                      </option>
                    ))}
                  </select>

                  {/* Selected Target Identity Card */}
                  {selectedTarget && (
                    <div className="p-3 rounded-control bg-neutral-surface border border-neutral-divider text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-brand-navy">{selectedTarget.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          selectedTarget.isSandboxVerified
                            ? 'bg-status-reproducedBg text-status-reproduced'
                            : 'bg-neutral-200 text-brand-navy'
                        }`}>
                          {selectedTarget.isSandboxVerified ? 'Sandbox Verified' : 'Protected Scope'}
                        </span>
                      </div>
                      <div className="text-brand-muted font-mono text-[11px] truncate">
                        Base URL: {selectedTarget.baseUrl}
                      </div>
                      <div className="text-[11px] text-brand-muted flex items-center space-x-3">
                        <span>Environment: <strong className="text-brand-navy">{selectedTarget.environment}</strong></span>
                        <span>•</span>
                        <span>Reset Capability: <strong className="text-brand-navy">{selectedTarget.hasResetCapability ? 'Configured' : 'None'}</strong></span>
                        <span>•</span>
                        <span>Test Account: <strong className="text-brand-navy">{selectedTarget.hasTestAccountConfigured ? 'Referenced' : 'None'}</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bug Summary / Short Title */}
            <div>
              <label htmlFor="report-title" className="block text-sm font-medium text-brand-navy mb-1.5">
                Bug Summary / Short Title *
              </label>
              <Input
                id="report-title"
                placeholder="e.g. Task deletion button fails silently on Active filter"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                disabled={isSubmitting || Boolean(savedInvestigationId)}
              />
              <p className="text-xs text-brand-muted mt-1">
                A brief description of the defect symptom (minimum 3 characters).
              </p>
            </div>

            {/* Problem Description */}
            <div>
              <label htmlFor="report-desc" className="block text-sm font-medium text-brand-navy mb-1.5">
                Description of What Went Wrong *
              </label>
              <Textarea
                id="report-desc"
                rows={4}
                placeholder="Describe what occurred, what went wrong, or what unexpected behavior you noticed. Uncertainty is completely fine."
                value={formData.bugDescription}
                onChange={(e) => setFormData((prev) => ({ ...prev, bugDescription: e.target.value }))}
                disabled={isSubmitting || Boolean(savedInvestigationId)}
              />
              <p className="text-xs text-brand-muted mt-1">
                State what went wrong (minimum 5 characters).
              </p>
            </div>

            {/* "Uncertainty is Okay" Callout */}
            <div className="p-3.5 rounded-control bg-lavender-surface/60 border border-cobalt-action/20 text-xs text-brand-navy flex items-start space-x-2.5">
              <Info className="w-4 h-4 text-cobalt-action shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="font-semibold text-brand-deepPurple">Uncertainty is completely okay:</strong> You do not need to know exact reproduction steps or technical selectors. If you already know the user actions (e.g. click Active filter, then delete Task B), include them in your description so TraceCase can formulate a testable plan directly without clarification questions.
              </div>
            </div>

            {/* Additional Context & Diagnostics (Optional) */}
            <div className="pt-4 border-t border-neutral-divider space-y-4">
              <h3 className="text-sm font-semibold text-brand-navy">
                Additional Context & Diagnostics (Optional)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="report-expected" className="block text-sm font-medium text-brand-navy mb-1.5">
                    Expected Correct Behavior (Optional)
                  </label>
                  <Textarea
                    id="report-expected"
                    rows={2}
                    placeholder="What should have occurred instead?"
                    value={formData.expectedBehavior}
                    onChange={(e) => setFormData((prev) => ({ ...prev, expectedBehavior: e.target.value }))}
                    disabled={isSubmitting || Boolean(savedInvestigationId)}
                  />
                </div>

                <div>
                  <label htmlFor="report-observed" className="block text-sm font-medium text-brand-navy mb-1.5">
                    Observed Erroneous Behavior (Optional)
                  </label>
                  <Textarea
                    id="report-observed"
                    rows={2}
                    placeholder="What specific erroneous behavior was observed?"
                    value={formData.observedBehavior}
                    onChange={(e) => setFormData((prev) => ({ ...prev, observedBehavior: e.target.value }))}
                    disabled={isSubmitting || Boolean(savedInvestigationId)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="report-steps" className="block text-sm font-medium text-brand-navy mb-1.5">
                  Suspected Steps to Reproduce (Optional)
                </label>
                <Textarea
                  id="report-steps"
                  rows={3}
                  placeholder={"1. Navigate to /tasks\n2. Click filter Active\n3. Click delete on first item"}
                  value={formData.suspectedSteps}
                  onChange={(e) => setFormData((prev) => ({ ...prev, suspectedSteps: e.target.value }))}
                  disabled={isSubmitting || Boolean(savedInvestigationId)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="report-env" className="block text-sm font-medium text-brand-navy mb-1.5">
                    Reported Browser Environment (Optional)
                  </label>
                  <Input
                    id="report-env"
                    placeholder="e.g. Chrome 130 / macOS Sequoia"
                    value={formData.browserEnvironment}
                    onChange={(e) => setFormData((prev) => ({ ...prev, browserEnvironment: e.target.value }))}
                    disabled={isSubmitting || Boolean(savedInvestigationId)}
                  />
                </div>

                <div>
                  <label htmlFor="report-build" className="block text-sm font-medium text-brand-navy mb-1.5">
                    Reported Build / Release Version (Optional)
                  </label>
                  <Input
                    id="report-build"
                    placeholder="e.g. v2.4.1 or staging-sha-7a8b9c"
                    value={formData.buildVersion}
                    onChange={(e) => setFormData((prev) => ({ ...prev, buildVersion: e.target.value }))}
                    disabled={isSubmitting || Boolean(savedInvestigationId)}
                  />
                </div>
              </div>

              {/* Paste Diagnostics Textarea */}
              <div>
                <label htmlFor="report-diagnostics" className="block text-sm font-medium text-brand-navy mb-1.5">
                  Paste Diagnostic Logs or Stack Traces (Optional)
                </label>
                <Textarea
                  id="report-diagnostics"
                  rows={3}
                  placeholder="Paste terminal errors, console logs, or HTTP response details here..."
                  value={formData.diagnosticLogs}
                  onChange={(e) => setFormData((prev) => ({ ...prev, diagnosticLogs: e.target.value }))}
                  disabled={isSubmitting || Boolean(savedInvestigationId)}
                />
                <p className="text-xs text-brand-muted mt-1">
                  File uploads are not supported. If you have terminal output, error logs, or stack traces, paste them directly here.
                </p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between items-center bg-neutral-surface/20">
            <div>
              {savedInvestigationId && (
                <span className="text-xs text-brand-muted">
                  Investigation <strong className="text-brand-navy font-mono">{savedInvestigationId.slice(0, 8)}...</strong> is saved.
                </span>
              )}
            </div>

            <Button
              id="submit-report-btn"
              type="submit"
              variant="primary"
              className="space-x-1.5 text-sm"
              disabled={isSubmitting || targets.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{planningPhase === 'saving_report' ? 'Saving Report...' : 'Preparing Plan...'}</span>
                </>
              ) : savedInvestigationId ? (
                <>
                  <span>Retry Planning</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Submit & Generate Plan</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
