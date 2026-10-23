'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Play,
  Hash,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  AlertCircle,
  XCircle,
  RotateCcw,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { InvestigationSnapshot } from '@/contracts/investigations';
import {
  approveInvestigationPlan,
  rejectInvestigationPlan,
  revokeInvestigationPlan,
  startInvestigationExecution,
  fetchInvestigation,
  fetchPlan,
} from '@/features/investigations/api-client';

export default function PlanApprovalPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [investigation, setInvestigation] = React.useState<InvestigationSnapshot | null>(null);
  const [plan, setPlan] = React.useState<AuthoritativeExperimentPlan | null>(null);
  const [isPlanLoading, setIsPlanLoading] = React.useState(true);
  const [planLoadError, setPlanLoadError] = React.useState<string | null>(null);
  const [authError, setAuthError] = React.useState<string | null>(null);

  const [operatorNotes, setOperatorNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);

  // Rejection state
  const [showRejectForm, setShowRejectForm] = React.useState(false);
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [isRejecting, setIsRejecting] = React.useState(false);

  // Revocation state
  const [showRevokeForm, setShowRevokeForm] = React.useState(false);
  const [revocationReason, setRevocationReason] = React.useState('');
  const [isRevoking, setIsRevoking] = React.useState(false);

  // Action status feedback
  const [approvalError, setApprovalError] = React.useState<string | null>(null);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [approvalSuccessMessage, setApprovalSuccessMessage] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setIsPlanLoading(true);
    setPlanLoadError(null);
    setAuthError(null);

    const [invRes, planRes] = await Promise.all([
      fetchInvestigation(id),
      fetchPlan(id),
    ]);

    if (invRes.success && invRes.data) {
      setInvestigation(invRes.data);
    } else {
      const status = !invRes.success ? invRes.status : undefined;
      if (status === 401 || status === 403) {
        setAuthError('Permission denied: You do not have permission to view or approve this investigation.');
      } else {
        setPlanLoadError(!invRes.success ? invRes.error.message : 'Investigation not found.');
      }
    }

    if (planRes.success && planRes.data?.data) {
      setPlan(planRes.data.data);
    } else {
      setPlan(null);
      if (!authError) {
        const pStatus = !planRes.success ? planRes.status : undefined;
        setPlanLoadError(
          planRes.success
            ? 'No experiment plan found.'
            : pStatus === 404
            ? 'No experiment plan revision has been generated yet for this investigation.'
            : `Plan retrieval failed (${planRes.error.code}): ${planRes.error.message}`
        );
      }
    }
    setIsPlanLoading(false);
  }, [id, authError]);

  React.useEffect(() => {
    let isMounted = true;
    loadData().catch(() => {
      if (isMounted) setIsPlanLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [loadData]);

  // Evaluate authoritative approval validity bound strictly to displayed revision
  const isApproved = React.useMemo(() => {
    if (!investigation || !plan) return false;
    return Boolean(
      investigation.reviewStatus === 'APPROVED' &&
      investigation.planVersion === plan.version &&
      investigation.planHash &&
      plan.planHash &&
      investigation.planHash.toLowerCase() === plan.planHash.toLowerCase()
    );
  }, [investigation, plan]);

  // Detect obsolete approval: prior approval exists but is for a different version/hash
  const isObsoleteApproval = React.useMemo(() => {
    if (!investigation || !plan) return false;
    if (investigation.isApproved || investigation.reviewStatus === 'APPROVED') {
      return (
        investigation.planVersion !== plan.version ||
        (Boolean(investigation.planHash) &&
          Boolean(plan.planHash) &&
          investigation.planHash?.toLowerCase() !== plan.planHash.toLowerCase())
      );
    }
    return false;
  }, [investigation, plan]);

  const isRejected = investigation?.reviewStatus === 'REJECTED';
  const isRevoked = investigation?.reviewStatus === 'REVOKED';

  // Action tier inspection & mutation checks
  const hasMutatingSteps = React.useMemo(() => {
    return plan?.steps.some(
      (s) => s.tier === 'TIER_3_MUTATING_INTERACTION' || s.tier === 'TIER_4_DESTRUCTIVE'
    );
  }, [plan]);

  const hasDestructiveSteps = React.useMemo(() => {
    return plan?.steps.some((s) => s.tier === 'TIER_4_DESTRUCTIVE');
  }, [plan]);

  const isBlockedBySandbox = Boolean(hasDestructiveSteps && investigation && !investigation.isSandbox);

  // Approval handler: binds strictly to displayed revision and hash
  const handleApprove = async () => {
    if (!plan || isBlockedBySandbox || isSubmitting) return;
    setIsSubmitting(true);
    setApprovalError(null);
    setApprovalSuccessMessage(null);

    const command = {
      investigationId: id,
      planVersion: plan.version,
      approvedPlanHash: plan.planHash,
      operatorNotes: operatorNotes.trim() || undefined,
      expectedWorkflowRevision: investigation?.workflowRevision,
    };

    const result = await approveInvestigationPlan(id, command);
    setIsSubmitting(false);

    if (result.success) {
      setApprovalSuccessMessage(
        result.message ||
        `Cryptographic authorization verified. Bound to plan version v${plan.version} (SHA-256: ${plan.planHash.substring(0, 16)}...). Execution start is now enabled as a separate action.`
      );
      // Reload investigation state to reflect authoritative approval record
      const invRes = await fetchInvestigation(id);
      if (invRes.success && invRes.data) {
        setInvestigation(invRes.data);
      }
    } else {
      setApprovalError(`Approval failed (${result.error.code}): ${result.error.message}`);
    }
  };

  // Rejection handler: operator rejects proposed plan with required reason
  const handleReject = async () => {
    if (!plan || !rejectionReason.trim() || isRejecting) return;
    setIsRejecting(true);
    setApprovalError(null);

    const result = await rejectInvestigationPlan(id, {
      investigationId: id,
      planVersion: plan.version,
      rejectionReason: rejectionReason.trim(),
      expectedWorkflowRevision: investigation?.workflowRevision,
    });
    setIsRejecting(false);

    if (result.success) {
      setShowRejectForm(false);
      setApprovalSuccessMessage(
        `Plan rejected: "${rejectionReason.trim()}". You may revise report details or answer clarifications to propose a new plan.`
      );
      const invRes = await fetchInvestigation(id);
      if (invRes.success && invRes.data) {
        setInvestigation(invRes.data);
      }
    } else {
      setApprovalError(`Rejection failed (${result.error.code}): ${result.error.message}`);
    }
  };

  // Revocation handler: operator revokes previously granted approval
  const handleRevoke = async () => {
    if (!plan || !revocationReason.trim() || isRevoking) return;
    setIsRevoking(true);
    setApprovalError(null);

    const result = await revokeInvestigationPlan(id, {
      investigationId: id,
      planVersion: plan.version,
      revocationReason: revocationReason.trim(),
      expectedWorkflowRevision: investigation?.workflowRevision,
    });
    setIsRevoking(false);

    if (result.success) {
      setShowRevokeForm(false);
      setApprovalSuccessMessage(
        `Approval revoked: "${revocationReason.trim()}". Execution start is locked until a plan revision is explicitly re-authorized.`
      );
      const invRes = await fetchInvestigation(id);
      if (invRes.success && invRes.data) {
        setInvestigation(invRes.data);
      }
    } else {
      setApprovalError(`Revocation failed (${result.error.code}): ${result.error.message}`);
    }
  };

  // Execution Start handler: separate guarded action
  const handleStartReproduction = async () => {
    if (!plan || !isApproved || isStarting) return;
    setIsStarting(true);
    setStartError(null);

    const result = await startInvestigationExecution(id, {
      investigationId: id,
      planVersion: plan.version,
      approvedPlanHash: plan.planHash,
      expectedWorkflowRevision: investigation?.workflowRevision,
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
      ) : authError ? (
        <Card className="p-8 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-status-confirmed mx-auto" />
          <h3 className="text-base font-bold text-brand-navy">Permission Denied</h3>
          <p className="text-xs text-brand-muted max-w-md mx-auto">{authError}</p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="primary" className="text-xs">
                Back to Dashboard
              </Button>
            </Link>
          </div>
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
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs text-brand-muted mb-1">
                <span>Target:</span>
                <span className="font-semibold text-brand-navy">{investigation?.targetName || 'Registered Target'}</span>
                <span>•</span>
                <a
                  href={plan.targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cobalt-action hover:underline font-mono"
                >
                  {plan.targetUrl}
                </a>
              </div>
              <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
                Experiment Plan Review (Revision v{plan.version})
              </h2>
              <p className="text-sm text-brand-muted mt-0.5">
                Human approval gate (TC-INV-003). Review semantic browser actions, assertions, and cryptographic plan binding.
              </p>
            </div>

            {/* Current Approval Badge */}
            {isApproved ? (
              <span className="px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold text-xs flex items-center space-x-1.5 shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Plan Approved (v{plan.version})</span>
              </span>
            ) : isRejected ? (
              <span className="px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-xs flex items-center space-x-1.5 shrink-0">
                <XCircle className="w-4 h-4 text-amber-700" />
                <span>Plan Rejected</span>
              </span>
            ) : isRevoked ? (
              <span className="px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-xs flex items-center space-x-1.5 shrink-0">
                <RotateCcw className="w-4 h-4 text-amber-700" />
                <span>Approval Revoked</span>
              </span>
            ) : (
              <span className="px-3.5 py-1.5 rounded-full bg-status-pendingBg text-status-pending border border-amber-300 font-semibold text-xs flex items-center space-x-1.5 shrink-0">
                <AlertTriangle className="w-4 h-4 text-status-pending" />
                <span>Awaiting Operator Authorization</span>
              </span>
            )}
          </div>

          {/* Obsolete Approval Warning */}
          {isObsoleteApproval && (
            <div
              role="alert"
              className="p-4 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start space-x-3"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block text-amber-950">Obsolete Plan Approval Detected (TC-INV-004):</strong>
                <span>
                  This investigation was previously approved for revision v{investigation?.planVersion}, but the active plan has changed to v{plan.version}.
                  In accordance with cryptographic plan immutability, prior approvals are invalidated. You must explicitly re-authorize this current revision before starting execution.
                </span>
              </div>
            </div>
          )}

          {/* Rejection Notice */}
          {isRejected && investigation?.rejectionReason && (
            <div
              role="status"
              className="p-4 rounded-control bg-amber-50/80 border border-amber-300 text-xs text-amber-900 flex items-start space-x-3"
            >
              <XCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block text-amber-950">Operator Rejection Notice:</strong>
                <span>&ldquo;{investigation.rejectionReason}&rdquo;</span>
                <p className="mt-1 text-brand-muted">
                  You can clarify details or revise the report to synthesize an updated proposal.
                </p>
              </div>
            </div>
          )}

          {/* Success Notification */}
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

          {/* Error Notification */}
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

          {/* Target & Sandbox Authorization Warning */}
          {isBlockedBySandbox ? (
            <div
              role="alert"
              className="p-4 rounded-control bg-red-50 border border-red-300 text-xs text-red-900 flex items-start space-x-3"
            >
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block text-red-950">Destructive Actions Prohibited on Unverified Target:</strong>
                <span>
                  This plan requires Tier 4 Destructive interactions (e.g. deletion, truncation). The target{' '}
                  <code className="font-mono bg-red-100 px-1 py-0.5 rounded">{plan.targetUrl}</code> is not sandbox-verified.
                  Approval is blocked fail-closed under TC-INV-009 to protect production targets.
                </span>
              </div>
            </div>
          ) : hasMutatingSteps ? (
            <div className="p-3.5 rounded-control bg-lavender-surface/70 border border-lavender-accent text-xs text-brand-navy flex items-start space-x-3">
              <Info className="w-4 h-4 text-cobalt-action shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold text-cobalt-action block">Mutating Interactions Required:</strong>
                <span>
                  This plan contains mutating interaction steps. Deterministic dual-run verification will execute these actions twice across an authenticated baseline reset.
                </span>
              </div>
            </div>
          ) : null}

          {/* Preconditions & Verification Scope Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preconditions & Verification Scope</CardTitle>
              <CardDescription>
                Authorized Target: {investigation?.targetName || 'Registered Target'} ({plan.targetUrl})
                {investigation?.isSandbox ? (
                  <span className="ml-2 text-emerald-700 font-semibold">• Verified Sandbox</span>
                ) : (
                  <span className="ml-2 text-amber-700 font-semibold">• Protected Non-Sandbox Target</span>
                )}
              </CardDescription>
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

          {/* Semantic Browser Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Planned Semantic Browser Steps ({plan.steps.length} Actions)</CardTitle>
              <CardDescription>
                Each action is classified into an operational safety tier to prevent unauthorized destructive operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.steps.map((step) => {
                const isDestructive = step.tier === 'TIER_4_DESTRUCTIVE';
                const isMutating = step.tier === 'TIER_3_MUTATING_INTERACTION';
                return (
                  <div
                    key={step.stepIndex}
                    className={`p-3.5 rounded-control border flex items-start justify-between gap-4 ${
                      isDestructive
                        ? 'bg-status-pendingBg/40 border-amber-300'
                        : isMutating
                        ? 'bg-lavender-subtle/40 border-lavender-accent/60'
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
                      ) : isMutating ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-lavender-surface text-brand-deepPurple border border-lavender-accent">
                          Tier 3 Mutating
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

          {/* Deterministic Assertions */}
          {plan.assertions && plan.assertions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deterministic Verification Assertions ({plan.assertions.length})</CardTitle>
                <CardDescription>
                  Evaluated independently across both reproduction runs to compute the definitive verdict.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs">
                {plan.assertions.map((a, idx) => (
                  <div
                    key={a.id || idx}
                    className="p-3 rounded-control bg-neutral-surface/60 border border-neutral-divider flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-brand-navy flex items-center space-x-2">
                        <span className="font-mono text-cobalt-action">[{a.purpose}]</span>
                        <span>{a.description}</span>
                      </div>
                      <div className="font-mono text-[11px] text-brand-muted">
                        Subject: <span className="text-neutral-800">{a.subjectRef}</span> | Operator:{' '}
                        <span className="text-neutral-800">{a.operator}</span>
                        {a.expectedValue && (
                          <span> | Expected: <code className="bg-white px-1 rounded border">{a.expectedValue}</code></span>
                        )}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white border border-neutral-divider text-brand-muted shrink-0">
                      {a.settlingPoint || 'AFTER_NETWORK_IDLE'}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Cryptographic Hash Details */}
          <details className="p-4 rounded-card bg-neutral-surface/60 border border-neutral-divider text-xs text-brand-navy cursor-pointer">
            <summary className="font-semibold flex items-center space-x-2 select-none">
              <Hash className="w-4 h-4 text-cobalt-action" />
              <span>Expand Technical Plan Fingerprint (SHA-256)</span>
            </summary>
            <div className="mt-3 pt-3 border-t border-neutral-divider/60 font-mono text-[11px] space-y-2 text-brand-muted break-all">
              <div>
                <span className="text-brand-navy font-semibold">Plan Hash:</span> {plan.planHash}
              </div>
              <div>
                <span className="text-brand-navy font-semibold">Plan Version:</span> v{plan.version}
              </div>
              <p className="text-[10px] text-brand-muted">
                In accordance with TC-INV-004, human authorization is cryptographically bound to this exact hash. If any step or assertion is modified, the approval is invalidated.
              </p>
            </div>
          </details>

          {/* Operator Action Gate Card */}
          <Card className="bg-lavender-surface/30 border-lavender-accent/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-cobalt-action" />
                <span>Operator Authorization Gate</span>
              </CardTitle>
              <CardDescription>
                {isApproved
                  ? 'Plan is cryptographically authorized. Execution start is a separate explicit action.'
                  : 'Approving authorizes the Browser Worker to execute Playwright commands on the registered target.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isApproved ? (
                <div className="p-3.5 rounded-control bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center space-x-2 font-bold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Cryptographic Approval Verified</span>
                  </div>
                  <div className="text-[11px] text-emerald-800 font-mono">
                    Approved by: <span className="font-semibold">{investigation?.approvedBy || 'Operator'}</span>
                    {investigation?.approvedAt && <span> at {new Date(investigation.approvedAt).toLocaleString()}</span>}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-mono truncate">
                    Bound SHA-256: {plan.planHash}
                  </div>
                </div>
              ) : (
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
                    disabled={isSubmitting || isBlockedBySandbox}
                    className="w-full px-3.5 py-2 text-xs rounded-control border border-neutral-divider bg-white text-brand-navy focus:outline-none focus:ring-2 focus:ring-cobalt-action disabled:bg-neutral-100"
                  />
                </div>
              )}

              {/* Collapsible Reject Form */}
              {showRejectForm && (
                <div className="p-3.5 rounded-control bg-amber-50 border border-amber-300 space-y-3 text-xs">
                  <div className="font-semibold text-amber-900">Provide Plan Rejection Reason</div>
                  <textarea
                    rows={2}
                    placeholder="State reason for rejecting this plan (minimum 3 characters)..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full p-2.5 text-xs rounded border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-brand-navy"
                  />
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleReject}
                      disabled={isRejecting || rejectionReason.trim().length < 3}
                      className="bg-amber-700 hover:bg-amber-800 text-white text-xs"
                    >
                      {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowRejectForm(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Collapsible Revoke Form */}
              {showRevokeForm && (
                <div className="p-3.5 rounded-control bg-amber-50 border border-amber-300 space-y-3 text-xs">
                  <div className="font-semibold text-amber-900">Provide Approval Revocation Reason</div>
                  <textarea
                    rows={2}
                    placeholder="State reason for revoking approval (minimum 3 characters)..."
                    value={revocationReason}
                    onChange={(e) => setRevocationReason(e.target.value)}
                    className="w-full p-2.5 text-xs rounded border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-brand-navy"
                  />
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleRevoke}
                      disabled={isRevoking || revocationReason.trim().length < 3}
                      className="bg-amber-700 hover:bg-amber-800 text-white text-xs"
                    >
                      {isRevoking ? 'Revoking...' : 'Confirm Revocation'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowRevokeForm(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {startError && (
                <div role="alert" className="p-3 rounded-control bg-status-confirmedBg text-status-confirmed text-xs">
                  {startError}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-brand-muted">
                {isApproved
                  ? 'Separate execution gate: starting admits the job to the queue under lease fencing (TC-INV-004).'
                  : 'Submits authorization signature to POST /api/v1/investigations/[id]/approve (TC-INV-003).'}
              </span>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                {isApproved ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRevokeForm(!showRevokeForm)}
                      className="text-xs text-amber-800 border-amber-300 hover:bg-amber-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      <span>Revoke Approval</span>
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleStartReproduction}
                      disabled={isStarting}
                      className="space-x-1.5 w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
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
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRejectForm(!showRejectForm)}
                      disabled={isSubmitting}
                      className="text-xs text-amber-800 border-amber-300 hover:bg-amber-50"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                      <span>Reject Plan</span>
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleApprove}
                      disabled={isSubmitting || isBlockedBySandbox}
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
                  </>
                )}
              </div>
            </CardFooter>
          </Card>
        </>
      )}
    </div>
  );
}
