'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert, CheckCircle2, Play, Hash, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SYNTHETIC_PLAN_V1 } from '@/dev/fixtures';

export default function PlanApprovalPage() {
  const params = useParams();
  const id = params?.id as string;

  const [isApproved, setIsApproved] = React.useState(false);
  const [operatorNotes, setOperatorNotes] = React.useState('');
  const [isSimulating, setIsSimulating] = React.useState(false);

  const plan = SYNTHETIC_PLAN_V1;

  const handleApprove = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsApproved(true);
      setIsSimulating(false);
    }, 600);
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
            <span>Plan Approved (Simulated)</span>
          </span>
        ) : (
          <span className="px-3.5 py-1.5 rounded-full bg-status-pendingBg text-status-pending border border-amber-300 font-semibold text-xs flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 text-status-pending" />
            <span>Awaiting Operator Authorization</span>
          </span>
        )}
      </div>

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
            <label className="block text-xs font-semibold text-brand-navy mb-1.5">
              Operator Sign-off Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Verified target is staging demo sandbox. Approved for two-run reproduction."
              value={operatorNotes}
              onChange={(e) => setOperatorNotes(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-control border border-neutral-divider bg-white text-brand-navy focus:outline-none focus:ring-2 focus:ring-cobalt-action"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[11px] text-brand-muted">
            Development Preview: This simulates cryptographic approval without triggering live browser jobs.
          </span>
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            {isApproved ? (
              <Link href={`/investigations/${id}/live`} className="w-full sm:w-auto">
                <Button variant="primary" className="space-x-1.5 w-full sm:w-auto">
                  <Play className="w-4 h-4" />
                  <span>Launch Live Simulation</span>
                </Button>
              </Link>
            ) : (
              <Button
                variant="primary"
                onClick={handleApprove}
                disabled={isSimulating}
                className="space-x-1.5 w-full sm:w-auto"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSimulating ? 'Recording Signature...' : 'Authorize & Approve Plan'}</span>
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
