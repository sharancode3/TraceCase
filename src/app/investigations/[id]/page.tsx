'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Video,
  Terminal,
  Activity,
  ExternalLink,
  Play,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getLifecyclePresentation,
  getVerdictPresentation,
  getEvidencePresentation,
} from '@/contracts/status';
import { SYNTHETIC_INVESTIGATIONS_CATALOG } from '@/dev/fixtures';

export default function InvestigationDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const investigation = React.useMemo(() => {
    return (
      SYNTHETIC_INVESTIGATIONS_CATALOG.find((inv) => inv.id === id) ||
      SYNTHETIC_INVESTIGATIONS_CATALOG[8] // Default to Canonical TC1 if not found
    );
  }, [id]);

  const lifecycle = getLifecyclePresentation(investigation.lifecycleStatus);
  const verdict = getVerdictPresentation(investigation.reproductionVerdict);
  const evidence = getEvidencePresentation(investigation.evidenceReadiness);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-cobalt-action uppercase tracking-wider">
                Investigation #{investigation.id.slice(0, 8)}
              </span>
              <span>•</span>
              <span className="text-xs text-brand-muted">{investigation.targetName}</span>
            </div>
            <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
              {investigation.title}
            </h2>
            <div className="text-xs text-brand-muted">
              Target: <a href={investigation.targetUrl} target="_blank" rel="noreferrer" className="text-cobalt-action hover:underline">{investigation.targetUrl}</a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/investigations/${investigation.id}/approve`}>
              <Button size="sm" variant="outline">
                <span>View Plan</span>
              </Button>
            </Link>
            <Link href={`/investigations/${investigation.id}/live`}>
              <Button size="sm" variant="primary" className="space-x-1.5">
                <Play className="w-3.5 h-3.5" />
                <span>Simulate Execution</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Tri-Dimensional Status Metric Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-neutral-divider/60">
          <div className="p-3.5 rounded-control bg-lavender-surface/50 border border-lavender-accent/40">
            <div className="text-[11px] font-semibold text-brand-deepPurple uppercase tracking-wider mb-1">
              Dimension 1: Lifecycle State
            </div>
            <div className="font-bold text-sm text-brand-navy">{lifecycle.label}</div>
            <div className="text-[11px] text-brand-muted mt-0.5">{lifecycle.description}</div>
          </div>

          <div className="p-3.5 rounded-control bg-neutral-surface border border-neutral-divider/80">
            <div className="text-[11px] font-semibold text-brand-deepPurple uppercase tracking-wider mb-1">
              Dimension 2: Reproduction Verdict
            </div>
            <div className="font-bold text-sm text-brand-navy">{verdict.label}</div>
            <div className="text-[11px] text-brand-muted mt-0.5">{verdict.description}</div>
          </div>

          <div className="p-3.5 rounded-control bg-lavender-surface/50 border border-lavender-accent/40">
            <div className="text-[11px] font-semibold text-brand-deepPurple uppercase tracking-wider mb-1">
              Dimension 3: Evidence Readiness
            </div>
            <div className="font-bold text-sm text-brand-navy">{evidence.label}</div>
            <div className="text-[11px] text-brand-muted mt-0.5">{evidence.description}</div>
          </div>
        </div>
      </Card>

      {/* Two-Run Attempt Comparison Section (TC-INV-002) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Two-Run Deterministic Confirmation Record (TC-INV-002)</span>
            <Badge variant="outline">Target Baseline Restored</Badge>
          </CardTitle>
          <CardDescription>
            A defect is verified only when two independent runs yield matching failure signatures under restored conditions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Run 1 Summary */}
            <div className="p-4 rounded-control border border-neutral-divider bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-brand-navy">Attempt 1 (Initial Run)</span>
                {investigation.attempt1 ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                    Defect Detected
                  </span>
                ) : (
                  <span className="text-xs text-brand-muted">Not Executed</span>
                )}
              </div>
              <div className="text-xs text-brand-muted space-y-1 pt-1">
                <div>Actions: {investigation.attempt1?.actionsExecuted || 0} steps executed</div>
                <div>Duration: {investigation.attempt1?.durationMs ? `${investigation.attempt1.durationMs / 1000}s` : 'N/A'}</div>
                <div>Mutation State: {investigation.attempt1?.mutationState || 'NONE'}</div>
              </div>
            </div>

            {/* Run 2 Summary */}
            <div className="p-4 rounded-control border border-neutral-divider bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-brand-navy">Attempt 2 (Confirmation Run)</span>
                {investigation.attempt2 ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                    Defect Detected (Signature Matched)
                  </span>
                ) : (
                  <span className="text-xs text-brand-muted">Awaiting Attempt 1 / Reset</span>
                )}
              </div>
              <div className="text-xs text-brand-muted space-y-1 pt-1">
                <div>Actions: {investigation.attempt2?.actionsExecuted || 0} steps executed</div>
                <div>Duration: {investigation.attempt2?.durationMs ? `${investigation.attempt2.durationMs / 1000}s` : 'N/A'}</div>
                <div>Mutation State: {investigation.attempt2?.mutationState || 'NONE'}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Evidence Triad Viewer (Video, Console, Network) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-cobalt-action" />
              <span>Evidence Triad (Video, Console, Network Trace)</span>
            </span>
            <span className="text-xs text-emerald-700 font-medium">In-Stream Redaction Verified (0 Secrets Leaked)</span>
          </CardTitle>
          <CardDescription>
            Synchronized artifact bundle stored in S3 object storage (TC-INV-009, TC-INV-012).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Video Box */}
            <div className="p-4 rounded-control bg-neutral-surface border border-neutral-divider text-center space-y-3">
              <Video className="w-6 h-6 mx-auto text-cobalt-action" />
              <div className="font-semibold text-xs text-brand-navy">Reproduction Video (.webm)</div>
              <p className="text-[11px] text-brand-muted">
                1280x720 Chromium headless viewport capture with audio track.
              </p>
              <div className="pt-2">
                <Button size="sm" variant="outline" className="w-full text-xs" disabled>
                  <span>Video Preview (Synthetic)</span>
                </Button>
              </div>
            </div>

            {/* Console Log Box */}
            <div className="p-4 rounded-control bg-neutral-surface border border-neutral-divider text-center space-y-3">
              <Terminal className="w-6 h-6 mx-auto text-cobalt-action" />
              <div className="font-semibold text-xs text-brand-navy">Sanitized Console Log (.log)</div>
              <p className="text-[11px] text-brand-muted">
                CDP console events with in-stream regex token scrubbing.
              </p>
              <div className="pt-2">
                <Button size="sm" variant="outline" className="w-full text-xs" disabled>
                  <span>Inspect Logs (Synthetic)</span>
                </Button>
              </div>
            </div>

            {/* Network Trace Box */}
            <div className="p-4 rounded-control bg-neutral-surface border border-neutral-divider text-center space-y-3">
              <ExternalLink className="w-6 h-6 mx-auto text-cobalt-action" />
              <div className="font-semibold text-xs text-brand-navy">Network Trace (.json)</div>
              <p className="text-[11px] text-brand-muted">
                Sanitized HTTP HAR trace detailing requests, headers, and status codes.
              </p>
              <div className="pt-2">
                <Button size="sm" variant="outline" className="w-full text-xs" disabled>
                  <span>Inspect Network (Synthetic)</span>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
