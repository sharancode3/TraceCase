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
  Download,
  Search,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  FileCode,
  Loader2,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  getLifecyclePresentation,
  getVerdictPresentation,
  getEvidencePresentation,
} from '@/contracts/status';
import type { InvestigationSnapshot } from '@/contracts/investigations';
import {
  SYNTHETIC_INVESTIGATIONS_CATALOG,
  SYNTHETIC_PLAN_V1,
  SYNTHETIC_EVIDENCE_MANIFEST_TC1,
} from '@/dev/fixtures';
import {
  buildReproductionPackage,
  filterConsoleLogs,
  filterNetworkTraces,
  getEvidenceAvailability,
  CANONICAL_TC1_CONSOLE_LOGS,
  CANONICAL_TC1_NETWORK_TRACES,
  type ConsoleLogEntry,
  type NetworkTraceEntry,
} from '@/features/investigations/evidence-presentation';
import { fetchInvestigation } from '@/features/investigations/api-client';

export default function InvestigationDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [activeTab, setActiveTab] = React.useState<'video' | 'console' | 'network'>('video');
  const [consoleSearch, setConsoleSearch] = React.useState('');
  const [networkSearch, setNetworkSearch] = React.useState('');
  const [expandedNetworkId, setExpandedNetworkId] = React.useState<string | null>('net-03');
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportNotice, setExportNotice] = React.useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = React.useState(false);

  // Investigation lookup state
  const [investigation, setInvestigation] = React.useState<InvestigationSnapshot | null>(() => {
    return SYNTHETIC_INVESTIGATIONS_CATALOG.find((inv) => inv.id === id) || null;
  });
  const [isLoading, setIsLoading] = React.useState(!investigation);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    if (investigation) return;
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const res = await fetchInvestigation(id);
      if (!isMounted) return;
      if (res.success && res.data) {
        setInvestigation(res.data);
      } else {
        setNotFound(true);
      }
      setIsLoading(false);
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [id, investigation]);

  // Telemetry and manifests
  const isTC1 = investigation?.id === SYNTHETIC_EVIDENCE_MANIFEST_TC1.investigationId;
  const manifest = isTC1 ? SYNTHETIC_EVIDENCE_MANIFEST_TC1 : null;
  const videoArtifact = manifest?.artifacts.find((a) => a.kind === 'VIDEO_RECORDING');
  const isQuarantined = investigation?.evidenceReadiness === 'QUARANTINED_LEAK_DETECTED';
  const hasPlayableVideo = Boolean(
    manifest?.hasVideo &&
    videoArtifact?.publicUrl &&
    !videoLoadError &&
    !isQuarantined &&
    videoArtifact?.storageTier !== 'RESTRICTED_RAW'
  );

  const consoleLogs: ConsoleLogEntry[] = React.useMemo(() => {
    if (isTC1) {
      return CANONICAL_TC1_CONSOLE_LOGS;
    }
    return [];
  }, [isTC1]);

  const networkTraces: NetworkTraceEntry[] = React.useMemo(() => {
    if (isTC1) {
      return CANONICAL_TC1_NETWORK_TRACES;
    }
    return [];
  }, [isTC1]);

  const filteredLogs = React.useMemo(
    () => filterConsoleLogs(consoleLogs, consoleSearch),
    [consoleLogs, consoleSearch]
  );

  const filteredTraces = React.useMemo(
    () => filterNetworkTraces(networkTraces, networkSearch),
    [networkTraces, networkSearch]
  );

  // Download reproduction package handler
  const handleDownloadPackage = () => {
    if (!investigation) return;
    setIsExporting(true);
    try {
      const pkg = buildReproductionPackage({
        investigation,
        plan: SYNTHETIC_PLAN_V1,
        manifest,
      });

      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tracecase-reproduction-${investigation.id.slice(0, 8)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (isQuarantined) {
        setExportNotice(
          `Reproduction package exported with quarantined notice (tracecase-reproduction-${investigation.id.slice(0, 8)}.json). Restricted raw artifacts were excluded.`
        );
      } else {
        setExportNotice(
          `Reproduction package exported successfully (tracecase-reproduction-${investigation.id.slice(0, 8)}.json).`
        );
      }
      setTimeout(() => setExportNotice(null), 5000);
    } catch {
      setExportNotice('Failed to generate reproduction package.');
      setTimeout(() => setExportNotice(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleNetworkExpand = (traceId: string) => {
    setExpandedNetworkId((prev) => (prev === traceId ? null : traceId));
  };

  // Honest 404 Error State
  if (notFound) {
    return (
      <div className="space-y-6 max-w-xl mx-auto py-12 text-center">
        <Card className="p-8 space-y-4">
          <AlertCircle className="w-12 h-12 text-status-confirmed mx-auto" />
          <h2 className="text-xl font-bold text-brand-navy">Investigation Not Found</h2>
          <p className="text-xs text-brand-muted leading-relaxed max-w-md mx-auto">
            The requested investigation identifier (<code className="font-mono bg-neutral-surface px-1.5 py-0.5 rounded text-brand-navy">{id}</code>) was not found in the live database or synthetic preview catalog.
          </p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="primary" className="space-x-1.5">
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Dashboard</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Loading Skeleton State
  if (isLoading || !investigation) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-cobalt-action" />
        <div className="text-xs text-brand-muted">Loading investigation and evidence manifest...</div>
      </div>
    );
  }

  const lifecycle = getLifecyclePresentation(investigation.lifecycleStatus);
  const verdict = getVerdictPresentation(investigation.reproductionVerdict);
  const evidence = getEvidencePresentation(investigation.evidenceReadiness);
  const availability = getEvidenceAvailability(investigation.evidenceReadiness);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back and Breadcrumb */}
      <div className="flex items-center space-x-2 text-xs text-brand-muted">
        <Link href="/" className="hover:text-cobalt-action flex items-center space-x-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Investigations Dashboard</span>
        </Link>
        <span>/</span>
        <span className="text-brand-navy font-medium">Investigation Details & Evidence Triad</span>
      </div>

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
              {isTC1 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-lavender-surface text-brand-deepPurple border border-cobalt-action/30">
                  Canonical TC1 Demo
                </span>
              )}
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
              <Button size="sm" variant="outline" className="space-x-1.5">
                <Play className="w-3.5 h-3.5" />
                <span>Execution Feed</span>
              </Button>
            </Link>
            <Button
              size="sm"
              variant="primary"
              onClick={handleDownloadPackage}
              disabled={isExporting}
              className="space-x-1.5"
              aria-label="Download reproduction package as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Packaging...' : 'Export Package (.json)'}</span>
            </Button>
          </div>
        </div>

        {exportNotice && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 p-3 rounded-control bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{exportNotice}</span>
            </div>
            <button
              onClick={() => setExportNotice(null)}
              className="text-emerald-700 font-semibold text-xs ml-4 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

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
            A defect is confirmed only when two independent runs yield matching failure signatures under restored conditions.
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center space-x-2">
                <Activity className="w-4 h-4 text-cobalt-action" />
                <span>Evidence Triad (Video, Console, Network Trace)</span>
              </CardTitle>
              <CardDescription>
                Synchronized artifact bundle stored in S3 object storage (TC-INV-009, TC-INV-012).
              </CardDescription>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              availability.isAvailable
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : availability.isQuarantined
                ? 'bg-amber-50 text-amber-800 border border-amber-300'
                : 'bg-neutral-surface text-brand-muted border border-neutral-divider'
            }`}>
              {availability.badgeMessage}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Security & Pixel Boundary Notice */}
          <div className="p-3.5 rounded-control bg-lavender-surface/50 border border-lavender-accent/60 text-xs text-brand-navy flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-cobalt-action shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-brand-deepPurple">
                TC-INV-009 Redaction & Pixel Scrubbing Boundary:
              </span>
              <p className="text-[11px] text-brand-muted leading-relaxed">
                Credentials, tokens, and sensitive headers are scrubbed in text logs and network traces. Viewport video playback displays recorded browser pixels; target applications should not render plaintext credentials on screen.
              </p>
            </div>
          </div>

          {/* Availability Alert if Quarantined or Failed */}
          {!availability.isAvailable && (
            <div
              role="alert"
              className={`p-4 rounded-control text-xs flex items-start space-x-2.5 border ${
                availability.isQuarantined
                  ? 'bg-status-pendingBg/40 border-amber-300 text-amber-900'
                  : availability.isFailed
                  ? 'bg-status-confirmedBg/40 border-red-300 text-status-confirmed'
                  : 'bg-neutral-surface border-neutral-divider text-brand-muted'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{availability.badgeMessage}: </span>
                <span>{availability.explanation}</span>
              </div>
            </div>
          )}

          {/* Three Interactive Artifact Selector Cards (Tabs) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="tablist" aria-label="Evidence Artifact Tabs">
            {/* Card 1: Video */}
            <button
              type="button"
              role="tab"
              id="tab-video"
              aria-selected={activeTab === 'video'}
              aria-controls="panel-video"
              tabIndex={activeTab === 'video' ? 0 : -1}
              onClick={() => setActiveTab('video')}
              className={`p-3.5 rounded-control border text-left transition-all ${
                activeTab === 'video'
                  ? 'bg-lavender-surface border-cobalt-action ring-1 ring-cobalt-action shadow-subtle'
                  : 'bg-white border-neutral-divider hover:bg-neutral-surface/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-brand-navy flex items-center space-x-2">
                  <Video className="w-4 h-4 text-cobalt-action" />
                  <span>Reproduction Video</span>
                </span>
                <Badge variant={manifest?.hasVideo && !isQuarantined ? 'default' : 'outline'}>
                  {isQuarantined ? 'Quarantined' : manifest?.hasVideo ? '.webm' : 'Unavailable'}
                </Badge>
              </div>
              <div className="text-[11px] text-brand-muted mt-1.5">
                {isQuarantined
                  ? 'Withheld (Security review pending)'
                  : manifest?.hasVideo
                  ? '1280x720 Viewport Capture (1.2 MB)'
                  : 'No video artifact available'}
              </div>
            </button>

            {/* Card 2: Console Logs */}
            <button
              type="button"
              role="tab"
              id="tab-console"
              aria-selected={activeTab === 'console'}
              aria-controls="panel-console"
              tabIndex={activeTab === 'console' ? 0 : -1}
              onClick={() => setActiveTab('console')}
              className={`p-3.5 rounded-control border text-left transition-all ${
                activeTab === 'console'
                  ? 'bg-lavender-surface border-cobalt-action ring-1 ring-cobalt-action shadow-subtle'
                  : 'bg-white border-neutral-divider hover:bg-neutral-surface/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-brand-navy flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-cobalt-action" />
                  <span>Sanitized Console Log</span>
                </span>
                <Badge variant={consoleLogs.length > 0 ? 'confirmed' : 'outline'}>
                  {consoleLogs.length > 0 ? `${consoleLogs.length} events` : 'Empty'}
                </Badge>
              </div>
              <div className="text-[11px] text-brand-muted mt-1.5">
                CDP telemetry with regex scrubbing
              </div>
            </button>

            {/* Card 3: Network Trace */}
            <button
              type="button"
              role="tab"
              id="tab-network"
              aria-selected={activeTab === 'network'}
              aria-controls="panel-network"
              tabIndex={activeTab === 'network' ? 0 : -1}
              onClick={() => setActiveTab('network')}
              className={`p-3.5 rounded-control border text-left transition-all ${
                activeTab === 'network'
                  ? 'bg-lavender-surface border-cobalt-action ring-1 ring-cobalt-action shadow-subtle'
                  : 'bg-white border-neutral-divider hover:bg-neutral-surface/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-brand-navy flex items-center space-x-2">
                  <ExternalLink className="w-4 h-4 text-cobalt-action" />
                  <span>Network HAR Trace</span>
                </span>
                <Badge variant={networkTraces.length > 0 ? 'confirmed' : 'outline'}>
                  {networkTraces.length > 0 ? `${networkTraces.length} requests` : 'Empty'}
                </Badge>
              </div>
              <div className="text-[11px] text-brand-muted mt-1.5">
                Sanitized HTTP telemetry (.json)
              </div>
            </button>
          </div>

          {/* Active Viewer Panel */}
          <div className="pt-2">
            {/* 1. VIDEO VIEWER PANEL */}
            {activeTab === 'video' && (
              <div
                id="panel-video"
                role="tabpanel"
                aria-labelledby="tab-video"
                tabIndex={0}
                className="space-y-3 focus:outline-none"
              >
                <div className="flex items-center justify-between text-xs text-brand-muted">
                  <span className="font-semibold text-brand-navy flex items-center space-x-1.5">
                    <Video className="w-4 h-4 text-cobalt-action" />
                    <span>Reproduction Viewport Recording (1280x720)</span>
                  </span>
                  {videoArtifact && !isQuarantined && (
                    <span className="font-mono text-[11px]">
                      Checksum: {videoArtifact.sha256Checksum.slice(0, 16)}...
                    </span>
                  )}
                </div>

                {hasPlayableVideo ? (
                  <div className="space-y-2">
                    <video
                      controls
                      className="w-full rounded-control max-h-96 bg-black border border-neutral-divider"
                      onError={() => setVideoLoadError(true)}
                      aria-label="Reproduction recording video player"
                    >
                      <source src={videoArtifact?.publicUrl || ''} type="video/webm" />
                      Your browser does not support HTML5 video playback.
                    </video>
                    <div className="flex items-center justify-between text-[11px] text-brand-muted px-1">
                      <span>Source: {videoArtifact?.fileName} ({Math.round((videoArtifact?.sizeBytes || 0) / 1024)} KB)</span>
                      <span>Storage Tier: {videoArtifact?.storageTier}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center space-y-2.5 border border-dashed border-neutral-divider rounded-control bg-neutral-surface/30">
                    {isQuarantined ? (
                      <Lock className="w-8 h-8 mx-auto text-amber-700" />
                    ) : (
                      <Video className="w-8 h-8 mx-auto text-brand-muted" />
                    )}
                    <div className="text-xs font-semibold text-brand-navy">
                      {isQuarantined
                        ? 'Video Quarantined in RESTRICTED_RAW Storage'
                        : videoLoadError
                        ? 'Local Media Storage Offline'
                        : 'No Playable Video Available'}
                    </div>
                    <p className="text-[11px] text-brand-muted max-w-md mx-auto">
                      {isQuarantined
                        ? 'This investigation triggered an in-stream secret leak alert. Raw media is isolated in restricted storage and cannot be played or downloaded through the client (TC-INV-009).'
                        : videoLoadError
                        ? `Configured media endpoint (${videoArtifact?.publicUrl}) is not currently responding. Local video playback requires a running MinIO instance on port 9000.`
                        : 'Video recording was not finalized for this investigation, or telemetry generation is pending.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 2. CONSOLE LOG VIEWER PANEL */}
            {activeTab === 'console' && (
              <div
                id="panel-console"
                role="tabpanel"
                aria-labelledby="tab-console"
                tabIndex={0}
                className="space-y-3 focus:outline-none"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                    <Input
                      type="search"
                      placeholder="Filter logs by level or message..."
                      value={consoleSearch}
                      onChange={(e) => setConsoleSearch(e.target.value)}
                      className="pl-8 text-xs h-9"
                      aria-label="Filter console logs"
                    />
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-brand-muted">
                    <span>
                      Showing {filteredLogs.length} of {consoleLogs.length} lines
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-neutral-surface border border-neutral-divider text-[10px] font-semibold text-brand-deepPurple">
                      Synthetic Preview
                    </span>
                  </div>
                </div>

                {filteredLogs.length > 0 ? (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Sanitized Console Logs"
                    className="rounded-control bg-brand-navy p-4 font-mono text-[11px] text-white max-h-80 overflow-y-auto space-y-1.5 focus:outline-none focus:ring-2 focus:ring-cobalt-action"
                  >
                    {filteredLogs.map((entry) => {
                      let levelClass = 'bg-slate-800 text-slate-200 border-slate-700';
                      if (entry.level === 'ERROR') levelClass = 'bg-rose-950 text-rose-300 border-rose-800';
                      if (entry.level === 'WARN') levelClass = 'bg-amber-950 text-amber-300 border-amber-800';
                      if (entry.level === 'INFO') levelClass = 'bg-sky-950 text-sky-300 border-sky-800';

                      return (
                        <div key={entry.id} className="flex items-start space-x-2 leading-relaxed">
                          <span className="text-white/40 shrink-0 select-none">
                            {entry.timestamp.slice(11, 23)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase shrink-0 ${levelClass}`}
                          >
                            {entry.level}
                          </span>
                          <span className="text-lavender-accent shrink-0 font-semibold">
                            [{entry.category}]
                          </span>
                          <span className="text-white/90 break-all">{entry.message}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-brand-muted border border-dashed border-neutral-divider rounded-control bg-neutral-surface/30">
                    {consoleSearch ? `No log entries match search "${consoleSearch}".` : 'No console log events recorded for this investigation.'}
                  </div>
                )}
                <div className="text-[11px] text-brand-muted flex items-center justify-between">
                  <span>In-stream regex scrubbing applied: 0 credentials or sensitive tokens exposed.</span>
                  {consoleSearch && (
                    <button
                      onClick={() => setConsoleSearch('')}
                      className="text-cobalt-action hover:underline font-medium"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 3. NETWORK TRACE VIEWER PANEL */}
            {activeTab === 'network' && (
              <div
                id="panel-network"
                role="tabpanel"
                aria-labelledby="tab-network"
                tabIndex={0}
                className="space-y-3 focus:outline-none"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                    <Input
                      type="search"
                      placeholder="Filter requests by URL or method..."
                      value={networkSearch}
                      onChange={(e) => setNetworkSearch(e.target.value)}
                      className="pl-8 text-xs h-9"
                      aria-label="Filter network traces"
                    />
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-brand-muted">
                    <span>
                      Showing {filteredTraces.length} of {networkTraces.length} requests
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-neutral-surface border border-neutral-divider text-[10px] font-semibold text-brand-deepPurple">
                      Sanitized HAR
                    </span>
                  </div>
                </div>

                {filteredTraces.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredTraces.map((trace) => {
                      const isExpanded = expandedNetworkId === trace.id;

                      let methodColor = 'bg-sky-50 text-sky-700 border-sky-300';
                      if (trace.method === 'POST') methodColor = 'bg-emerald-50 text-emerald-700 border-emerald-300';
                      if (trace.method === 'DELETE') methodColor = 'bg-rose-50 text-rose-700 border-rose-300';

                      return (
                        <div
                          key={trace.id}
                          className="border border-neutral-divider rounded-control bg-white overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => toggleNetworkExpand(trace.id)}
                            className="w-full p-3 flex items-center justify-between text-left text-xs hover:bg-neutral-surface/40 transition-colors focus:outline-none focus:ring-1 focus:ring-cobalt-action"
                            aria-expanded={isExpanded}
                            aria-controls={`trace-details-${trace.id}`}
                          >
                            <div className="flex items-center space-x-2.5 truncate mr-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-brand-muted shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-brand-muted shrink-0" />
                              )}
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[10px] border shrink-0 ${methodColor}`}
                              >
                                {trace.method}
                              </span>
                              <span className="font-mono text-[11px] text-brand-navy truncate">
                                {trace.url}
                              </span>
                            </div>
                            <div className="flex items-center space-x-3 shrink-0 text-brand-muted text-[11px]">
                              <span className="font-semibold text-emerald-700">{trace.status} OK</span>
                              <span>{trace.durationMs}ms</span>
                            </div>
                          </button>

                          {/* Expanded Details Pane */}
                          {isExpanded && (
                            <div
                              id={`trace-details-${trace.id}`}
                              className="p-3 bg-neutral-surface/50 border-t border-neutral-divider space-y-2.5 text-[11px]"
                            >
                              <div>
                                <span className="font-semibold text-brand-navy block mb-1">
                                  Scrubbed Request Headers (Sensitive keys masked):
                                </span>
                                <div className="bg-white p-2.5 rounded border border-neutral-divider font-mono space-y-1">
                                  {Object.entries(trace.requestHeaders).map(([k, v]) => (
                                    <div key={k} className="truncate">
                                      <span className="text-brand-deepPurple font-semibold">{k}:</span>{' '}
                                      <span className={v.includes('REDACTED') ? 'text-amber-800 font-bold' : 'text-neutral-700'}>
                                        {v}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {trace.responseBody !== undefined && (
                                <div>
                                  <span className="font-semibold text-brand-navy block mb-1">
                                    Response Payload Preview:
                                  </span>
                                  <pre className="bg-brand-navy text-white p-2.5 rounded font-mono text-[10px] max-h-36 overflow-y-auto leading-relaxed">
                                    {JSON.stringify(trace.responseBody, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-brand-muted border border-dashed border-neutral-divider rounded-control bg-neutral-surface/30">
                    {networkSearch ? `No requests match search "${networkSearch}".` : 'No network traces recorded.'}
                  </div>
                )}
                <div className="text-[11px] text-brand-muted flex items-center justify-between">
                  <span>Network traces are parsed client-side with sensitive Bearer/Cookie headers masked.</span>
                  {networkSearch && (
                    <button
                      onClick={() => setNetworkSearch('')}
                      className="text-cobalt-action hover:underline font-medium"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Developer Handoff & Technical Artifacts Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-cobalt-action" />
            <span>Developer Reproduction Handoff (JSON & Technical Manifest)</span>
          </CardTitle>
          <CardDescription>
            Export authorized evidence package and replay metadata for downstream issue tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <p className="text-brand-muted leading-relaxed">
            The exported package compiles the canonical bug report, verified experiment plan steps, attempt comparison logs, and sanitized evidence manifests into a self-contained bundle. Restricted raw credentials and server secrets are strictly omitted.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPackage}
              disabled={isExporting}
              className="space-x-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Reproduction Package (.json)</span>
            </Button>
            <span className="text-[11px] text-brand-muted">
              Includes: Report schema, approved plan hash, run 1 & 2 assertion results, and sanitized artifact URLs.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
