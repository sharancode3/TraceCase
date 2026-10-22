'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert, CheckCircle2, Play, Hash, AlertTriangle, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import {
  approveInvestigationPlan,
  startInvestigationExecution,
  fetchInvestigation,
  fetchPlan,
} from '@/features/investigations/api-client';

export default function PlanApprovalPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [plan, setPlan] = React.useState<AuthoritativeExperimentPlan | null>(null);
  const [isPlanLoading, setIsPlanLoading] = React.useState(true);
  const [planLoadError, setPlanLoadError] = React.useState<string | null>(null);
  const [isApproved, setIsApproved] = React.useState(false);
  const [operatorNotes, setOperatorNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const [approvalError, setApprovalError] = React.useState<string | null>(null);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [approvalSuccessMessage, setApprovalSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsPlanLoading(true);
      const [invRes, planRes] = await Promise.all([
        fetchInvestigation(id),
        fetchPlan(id),
      ]);
      if (!isMounted) return;

      if (invRes.success && invRes.data) {
        const st = invRes.data.lifecycleStatus as string;
        if (
          st === 'APPROVED' ||
          st === 'QUEUED' ||
          st === 'RUNNING_ATTEMPT_1' ||
          st === 'RESETTING_TARGET' ||
          st === 'RUNNING_ATTEMPT_2' ||
          st === 'FINALIZING_EVIDENCE' ||
          st === 'COMPLETED'
        ) {
          setIsApproved(true);
        }
      }

      if (planRes.success && planRes.data?.data) {
        setPlan(planRes.data.data);
      } else {
        setPlanLoadError(
          planRes.success ? 'No experiment plan found.' : planRes.error.message
        );
      }
      setIsPlanLoading(false);
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleApprove = async () => {
    if (!plan) return;
    setIsSubmitting(true);
    setApprovalError(null);
    setApprovalSuccessMessage(null);

    const command = {
      investigationId: id,
      planVersion: plan.version,
      approvedPlanHash: plan.planHash,
      operatorNotes: operatorNotes.trim() || undefined,
    };

    const result = await approveInvestigationPlan(id, command);
    setIsSubmitting(false);

    if (result.success) {
      setIsApproved(true);
      setApprovalSuccessMessage(
        result.message ||
        `Cryptographic authorization verified. Bound to plan SHA-256: ${plan.planHash.substring(0, 16)}...`
      );
    } else {
      setIsApproved(false);
      setApprovalError(
        `Approval failed (${result.error.code}): ${result.error.message}`
      );
    }
  };

  const handleStartReproduction = async () => {
    if (!plan) return;
    setIsStarting(true);
    setStartError(null);
    const result = await startInvestigationExecution(id, {
      investigationId: id,
      planVersion: plan.version,
      approvedPlanHash: plan.planHash,
    });
    setIsStarting(false);

    if (result.success) {
      router.push(`/investigations/${id}/live`);
    } else {
      setStartError(`Execution start failed (${result.error.code}): ${result.error.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back and Breadcrumb */}
      <div className="flex items-center space-x-2 text-xs text-brand-muted">
        <Link href={`/investigations/${id}`} className="hover:text-cobalt-action flex items-center space-x-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Investigation</span>
        </Link>
        <span>/</span>
        <span className="text-brand-navy font-medium">Plan Review & Cryptographic Authorization</span>
      </div>

      {isPlanLoading ? (
        <Card className="p-12 text-center text-xs text-brand-muted flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-cobalt-action" />
          <span>Loading authoritative experiment plan...</span>
        </Card>
      ) : !plan ? (
        <Card className="p-8 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-status-confirmed mx-auto" />
          <h3 className="text-base font-bold text-brand-navy">Plan Not Available</h3>
          <p className="text-xs text-brand-muted max-w-md mx-auto">
            {planLoadError || 'No experiment plan revision has been generated yet for this investigation.'}
          </p>
          <div className="pt-2 flex justify-center space-x-3">
            <Link href={`/investigations/${id}/clarify`}>
              <Button variant="outline" className="text-xs">
                Check Clarifications
              </Button>
            </Link>
            <Link href={`/investigations/${id}`}>
              <Button variant="primary" className="text-xs">
                Back to Investigation
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
                Experiment Plan Review (Version v{plan.version})
              </h2>
              <p className="text-sm text-brand-muted mt-1">
                Human approval gate (TC-INV-003). Review semantic browser actions and cryptographic plan binding.
              </p>
            </div>

            {isApproved ? (
              <span className="px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold text-xs flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Plan Approved</span>
              </span>
            ) : (
              <span className="px-3.5 py-1.5 rounded-full bg-status-pendingBg text-status-pending border border-amber-300 font-semibold text-xs flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-status-pending" />
                <span>Awaiting Operator Authorization</span>
              </span>
            )}
          </div>

          {/* Notifications */}
          {approvalSuccessMessage && (
            <div
              role="status"
              aria-live="polite"
              className="p-4 rounded-control bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center justify-between"
            >
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{approvalSuccessMessage}</span>
              </div>
              <button
                onClick={() => setApprovalSuccessMessage(null)}
                className="text-emerald-700 font-semibold ml-4 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {approvalError && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-4 rounded-control bg-status-confirmedBg border border-red-200 text-xs text-status-confirmed flex items-center justify-between"
            >
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-status-confirmed shrink-0" />
                <span>{approvalError}</span>
              </div>
              <button
                onClick={() => setApprovalError(null)}
                className="text-status-confirmed font-semibold ml-4 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Plan Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preconditions & Verification Scope</CardTitle>
              <CardDescription>Target: {plan.targetUrl}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div>
                <div className="font-semibold text-brand-navy mb-1.5">Preconditions:</div>
                <ul className="list-disc list-inside space-y-1 text-brand-muted">
                  {plan.preconditions.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-3 rounded-control bg-neutral-surface border border-neutral-divider space-y-1">
                  <div className="font-semibold text-brand-navy">Expected Correct Behavior:</div>
                  <div className="text-brand-muted">{plan.expectedCorrectBehavior}</div>
                </div>
                <div className="p-3 rounded-control bg-neutral-surface border border-neutral-divider space-y-1">
                  <div className="font-semibold text-brand-navy">Reported Failure Signature:</div>
                  <div className="text-brand-muted">{plan.reportedFailureSignature}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Semantic Action Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Planned Semantic Browser Steps</CardTitle>
              <CardDescription>
                Each interaction is classified into a safety tier to prevent unauthorized destructive operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.steps.map((step) => {
                const isDestructive = step.tier === 'TIER_4_DESTRUCTIVE';
                return (
                  <div
                    key={step.stepIndex}
                    className={`p-3.5 rounded-control border flex items-start justify-between gap-4 ${
                      isDestructive
                        ? 'bg-status-pendingBg/40 border-amber-300'
                        : 'bg-white border-neutral-divider'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-brand-deepPurple">Step {step.stepIndex + 1}:</span>
                        <span className="font-semibold text-xs text-brand-navy">{step.semanticAction}</span>
                      </div>
                      <div className="text-[11px] text-brand-muted font-mono">
                        Tool: <span className="text-cobalt-action font-semibold">{step.toolKind}</span>
                        {step.selector && <span> | Selector: {step.selector}</span>}
                        {step.value && <span> | Value: {step.value}</span>}
                      </div>
                      {step.rationale && (
                        <div className="text-[11px] text-brand-muted italic">{step.rationale}</div>
                      )}
                    </div>

                    <div className="shrink-0">
                      {isDestructive ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center space-x-1">
                          <ShieldAlert className="w-3 h-3 text-amber-700" />
                          <span>Tier 4 Destructive</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-neutral-surface text-brand-navy border border-neutral-divider">
                          {step.tier}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Cryptographic Hash Details (Expandable) */}
          <details className="p-4 rounded-card bg-neutral-surface/60 border border-neutral-divider text-xs text-brand-navy cursor-pointer">
            <summary className="font-semibold flex items-center space-x-2">
              <Hash className="w-4 h-4 text-cobalt-action" />
              <span>Expand Technical Plan Fingerprint (SHA-256)</span>
            </summary>
            <div className="mt-3 pt-3 border-t border-neutral-divider/60 font-mono text-[11px] space-y-2 text-brand-muted break-all">
              <div><span className="text-brand-navy font-semibold">Plan Hash:</span> {plan.planHash}</div>
              <p className="text-[10px] text-brand-muted">
                In accordance with TC-INV-004, human approval is bound to this exact hash. If any step is modified, this approval is automatically revoked.
              </p>
            </div>
          </details>

          {/* Operator Sign-off Card */}
          <Card className="bg-lavender-surface/30 border-lavender-accent/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-cobalt-action" />
                <span>Operator Authorization Gate</span>
              </CardTitle>
              <CardDescription>
                Approving authorizes the Browser Worker to dispatch Playwright commands on the target sandbox.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label htmlFor="operator-notes" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Operator Sign-off Notes (Optional)
                </label>
                <input
                  id="operator-notes"
                  type="text"
                  placeholder="e.g. Verified target is staging demo sandbox. Approved for two-run reproduction."
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                  disabled={isSubmitting || isApproved}
                  className="w-full px-3.5 py-2 text-xs rounded-control border border-neutral-divider bg-white text-brand-navy focus:outline-none focus:ring-2 focus:ring-cobalt-action disabled:bg-neutral-100"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[11px] text-brand-muted">
                Submits authorization signature to POST /api/v1/investigations/{id}/approve (TC-INV-003).
              </span>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                {startError && (
                  <span className="text-xs text-status-confirmed font-medium">{startError}</span>
                )}
                {isApproved ? (
                  <Button
                    variant="primary"
                    onClick={handleStartReproduction}
                    disabled={isStarting}
                    className="space-x-1.5 w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800"
                  >
                    {isStarting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Admitting Execution to Queue...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Start Reproduction Run</span>
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleApprove}
                    disabled={isSubmitting}
                    className="space-x-1.5 w-full sm:w-auto"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying Cryptographic Approval...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Authorize & Approve Plan</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        </>
      )}
    </div>
  );
}
