'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
  FileText,
  Loader2,
  AlertCircle,
  Lock,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  getLifecyclePresentation,
  getVerdictPresentation,
  getEvidencePresentation,
  getNextPermittedAction,
  type EvidenceReadinessStatus,
} from '@/contracts/status';
import type { InvestigationSnapshot } from '@/contracts/investigations';
import type { EvidenceManifest, ArtifactKind, StorageTier } from '@/contracts/evidence';
import {
  buildReproductionPackage,
  filterConsoleLogs,
  filterNetworkTraces,
  getEvidenceAvailability,
  type ConsoleLogEntry,
  type NetworkTraceEntry,
} from '@/features/investigations/evidence-presentation';
import {
  fetchInvestigation,
  fetchInvestigationResults,
  fetchPlan,
  fetchArtifacts,
  requestPlanning,
  type ArtifactItem,
} from '@/features/investigations/api-client';
import { executePlanningTransition } from '@/features/investigations/planning-orchestration';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';

export default function InvestigationDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const [planning, setPlanning] = React.useState(false);
  const [planningError, setPlanningError] = React.useState<string | null>(null);
  const [explanation, setExplanation] = React.useState<{summary: string; verifiedFacts: string; limitations: unknown; observationsVsHypotheses: unknown} | null>(null);
  const [restrictedRecordingCount, setRestrictedRecordingCount] = React.useState(0);
  const [reviewing, setReviewing] = React.useState(false);
  const retryExplanation = async () => {
    setReviewing(true);
    try {
      const response = await fetch(`/api/v1/investigations/${encodeURIComponent(id)}/explanation`, { method: 'POST' });
      const body = await response.json();
      if (response.ok) setExplanation(body.data);
      else setPlanningError(body.error?.message || 'Evidence explanation could not be generated.');
    } catch { setPlanningError('Evidence review service unavailable.'); }
    finally { setReviewing(false); }
  };
  const generatePlan = async () => {
    setPlanning(true);
    setPlanningError(null);
    try {
      const transition = await executePlanningTransition({ investigationId: id });
      if (transition.outcome === 'PROPOSAL_READY') {
        router.push(transition.navigationTarget);
        return;
      }
      if (transition.outcome === 'CLARIFICATION_NEEDED') {
        router.push(transition.navigationTarget);
        return;
      }
      if (transition.outcome === 'UNABLE_TO_PROCEED') {
        setPlanningError(transition.reason || 'Unable to plan this report.');
        return;
      }
      if (transition.outcome === 'ERROR') {
        setPlanningError(transition.message);
        return;
      }
    } finally {
      setPlanning(false);
    }
  };

  const [activeTab, setActiveTab] = React.useState<'video' | 'console' | 'network'>('video');
  const [consoleSearch, setConsoleSearch] = React.useState('');
  const [networkSearch, setNetworkSearch] = React.useState('');
  const [expandedNetworkId, setExpandedNetworkId] = React.useState<string | null>('net-03');
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportNotice, setExportNotice] = React.useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = React.useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState(false);
  const [pdfNotice, setPdfNotice] = React.useState<string | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [showReportPreview, setShowReportPreview] = React.useState(false);

  const handleDownloadPdf = async () => {
    if (!investigation) return;
    setIsDownloadingPdf(true);
    setPdfError(null);
    setPdfNotice(null);
    try {
      const res = await fetch(`/api/v1/investigations/${investigation.id}/report/pdf?download=true`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`PDF generation returned HTTP ${res.status}: ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tracecase-report-${investigation.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setPdfNotice(`PDF report downloaded successfully (tracecase-report-${investigation.id.slice(0, 8)}.pdf).`);
    } catch (err) {
      setPdfError(`Failed to download PDF report: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Investigation lookup state
  const [investigation, setInvestigation] = React.useState<InvestigationSnapshot | null>(null);
  const [realPlan, setRealPlan] = React.useState<AuthoritativeExperimentPlan | null>(null);
  const [realArtifacts, setRealArtifacts] = React.useState<ArtifactItem[]>([]);
  const [realConsoleLogs, setRealConsoleLogs] = React.useState<ConsoleLogEntry[]>([]);
  const [realNetworkTraces, setRealNetworkTraces] = React.useState<NetworkTraceEntry[]>([]);
  const [selectedAttempt, setSelectedAttempt] = React.useState<number>(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  // Distinct Telemetry Retrieval States
  const [consoleFetchState, setConsoleFetchState] = React.useState<'IDLE' | 'LOADING' | 'READY' | 'EMPTY' | 'FAILED' | 'RESTRICTED'>('IDLE');
  const [consoleFetchError, setConsoleFetchError] = React.useState<string | null>(null);

  const [networkFetchState, setNetworkFetchState] = React.useState<'IDLE' | 'LOADING' | 'READY' | 'EMPTY' | 'FAILED' | 'RESTRICTED'>('IDLE');
  const [networkFetchError, setNetworkFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const [resRes, planRes, artRes] = await Promise.all([
        fetchInvestigationResults(id),
        fetchPlan(id),
        fetchArtifacts(id),
      ]);
      if (!isMounted) return;

      if (resRes.success && resRes.data) {
        setInvestigation(resRes.data.snapshot);
        try {
          const response = await fetch(`/api/v1/investigations/${encodeURIComponent(id)}/explanation`);
          if (response.ok && isMounted) setExplanation((await response.json()).data);
        } catch { /* Explanation availability never blocks factual results. */ }
      } else {
        const invRes = await fetchInvestigation(id);
        if (invRes.success && invRes.data) {
          setInvestigation(invRes.data);
        } else {
          setNotFound(true);
        }
      }

      if (planRes.success && planRes.data?.data) {
        setRealPlan(planRes.data.data);
      }

      if (artRes.success && artRes.data?.artifacts) {
        setRestrictedRecordingCount(artRes.data.restrictedRecordingCount || 0);
        setRealArtifacts(artRes.data.artifacts);
      }

      setIsLoading(false);
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  // Load attempt-specific console and network artifacts whenever selectedAttempt or realArtifacts updates
  React.useEffect(() => {
    if (realArtifacts.length === 0) return;
    let isCancelled = false;

    async function loadAttemptEvidence() {
      // 1. Console log artifact for selected attempt
      const consoleArtifact =
        realArtifacts.find((a) => a.kind === 'CONSOLE_LOG' && a.attemptNumber === selectedAttempt) ||
        realArtifacts.find((a) => a.kind === 'CONSOLE_LOG' && (a.attemptNumber === null || a.attemptNumber === undefined));

      if (!consoleArtifact) {
        setRealConsoleLogs([]);
        setConsoleFetchError(null);
        if (investigation?.evidenceReadiness === 'PENDING_GENERATION' || investigation?.evidenceReadiness === 'PACKAGING_IN_PROGRESS') {
          setConsoleFetchState('LOADING');
        } else {
          setConsoleFetchState('EMPTY');
        }
      } else if (consoleArtifact.storageTier === 'RESTRICTED_RAW' || investigation?.evidenceReadiness === 'QUARANTINED_LEAK_DETECTED') {
        setRealConsoleLogs([]);
        setConsoleFetchError(null);
        setConsoleFetchState('RESTRICTED');
      } else if (consoleArtifact.url) {
        setConsoleFetchState('LOADING');
        setConsoleFetchError(null);
        try {
          const resp = await fetch(consoleArtifact.url, { credentials: 'include' });
          if (!resp.ok) {
            if (!isCancelled) {
              setRealConsoleLogs([]);
              setConsoleFetchState('FAILED');
              setConsoleFetchError(`Server returned HTTP ${resp.status} (${resp.statusText || 'Error'}). Telemetry could not be retrieved from storage.`);
            }
            return;
          }
          const text = await resp.text();
          let entries: ConsoleLogEntry[] = [];
          try {
            const parsed = JSON.parse(text);
            const targetData = parsed?.safeContent !== undefined ? parsed.safeContent : parsed;
            if (Array.isArray(targetData)) {
              entries = targetData.map((item: Record<string, unknown>, idx: number) => ({
                id: (item.id as string) || `log-${idx}`,
                timestamp: (item.timestamp as string) || '',
                level: ((item.level as string) || 'INFO').toUpperCase() as ConsoleLogEntry['level'],
                category: (item.category as string) || (item.pageId as string) || 'console',
                message: (item.text as string) || (item.message as string) || JSON.stringify(item),
              }));
            } else if (typeof targetData === 'string') {
              const lines = targetData.split('\n').filter((l) => l.trim().length > 0);
              entries = lines.map((line, idx) => ({
                id: `log-${idx}`,
                timestamp: '',
                level: line.includes('ERROR') ? 'ERROR' : line.includes('WARN') ? 'WARN' : 'INFO',
                category: 'console',
                message: line,
              }));
            }
          } catch {
            const lines = text.split('\n').filter((l) => l.trim().length > 0);
            entries = lines.map((line, idx) => ({
              id: `log-${idx}`,
              timestamp: '',
              level: line.includes('ERROR') || line.includes('ERR') ? 'ERROR' : line.includes('WARN') ? 'WARN' : 'INFO',
              category: 'console',
              message: line,
            }));
          }
          if (!isCancelled) {
            setRealConsoleLogs(entries);
            setConsoleFetchState(entries.length === 0 ? 'EMPTY' : 'READY');
          }
        } catch (err) {
          if (!isCancelled) {
            setRealConsoleLogs([]);
            setConsoleFetchState('FAILED');
            setConsoleFetchError(`Network error while retrieving console logs: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // 2. Network trace artifact for selected attempt
      const networkArtifact =
        realArtifacts.find((a) => a.kind === 'NETWORK_TRACE' && a.attemptNumber === selectedAttempt) ||
        realArtifacts.find((a) => a.kind === 'NETWORK_TRACE' && (a.attemptNumber === null || a.attemptNumber === undefined));

      if (!networkArtifact) {
        setRealNetworkTraces([]);
        setNetworkFetchError(null);
        if (investigation?.evidenceReadiness === 'PENDING_GENERATION' || investigation?.evidenceReadiness === 'PACKAGING_IN_PROGRESS') {
          setNetworkFetchState('LOADING');
        } else {
          setNetworkFetchState('EMPTY');
        }
      } else if (networkArtifact.storageTier === 'RESTRICTED_RAW' || investigation?.evidenceReadiness === 'QUARANTINED_LEAK_DETECTED') {
        setRealNetworkTraces([]);
        setNetworkFetchError(null);
        setNetworkFetchState('RESTRICTED');
      } else if (networkArtifact.url) {
        setNetworkFetchState('LOADING');
        setNetworkFetchError(null);
        try {
          const resp = await fetch(networkArtifact.url, { credentials: 'include' });
          if (!resp.ok) {
            if (!isCancelled) {
              setRealNetworkTraces([]);
              setNetworkFetchState('FAILED');
              setNetworkFetchError(`Server returned HTTP ${resp.status} (${resp.statusText || 'Error'}). Telemetry could not be retrieved from storage.`);
            }
            return;
          }
          const text = await resp.text();
          const parsed = JSON.parse(text);
          const targetData = parsed?.safeContent !== undefined ? parsed.safeContent : parsed;
          const rawList = Array.isArray(targetData)
            ? targetData
            : Array.isArray(targetData?.entries)
            ? targetData.entries
            : Array.isArray(targetData?.requests)
            ? targetData.requests
            : [];
          const entries: NetworkTraceEntry[] = rawList.map((item: Record<string, unknown>, idx: number) => ({
            id: (item.requestId as string) || (item.id as string) || `net-${idx}`,
            timestamp: (item.startedAt as string) || (item.timestamp as string) || undefined,
            method: ((item.method as string) || 'GET').toUpperCase(),
            url: (item.url as string) || '/',
            resourceType: item.resourceType as string | undefined,
            status: typeof item.status === 'number' ? item.status : undefined,
            isTransportFailure: Boolean(item.isTransportFailure),
            failureText: item.failureText as string | undefined,
            startedAt: item.startedAt as string | undefined,
            completedAt: item.completedAt as string | undefined,
            durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
            mimeType: item.mimeType as string | undefined,
            requestHeaders: (item.requestHeaders || item.headers || undefined) as Record<string, string> | undefined,
            responseHeaders: (item.responseHeaders || undefined) as Record<string, string> | undefined,
            responseBody: item.responseBody,
          }));
          if (!isCancelled) {
            setRealNetworkTraces(entries);
            setNetworkFetchState(entries.length === 0 ? 'EMPTY' : 'READY');
          }
        } catch (err) {
          if (!isCancelled) {
            setRealNetworkTraces([]);
            setNetworkFetchState('FAILED');
            setNetworkFetchError(`Network error while retrieving network traces: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    loadAttemptEvidence();
    return () => {
      isCancelled = true;
    };
  }, [realArtifacts, selectedAttempt, investigation?.evidenceReadiness]);

  // Telemetry and manifests
  const manifest: EvidenceManifest | null = null;

  const videoArtifacts = React.useMemo(() => {
    return realArtifacts.filter((a) => a.kind === 'VIDEO_RECORDING');
  }, [realArtifacts]);

  const activeRealVideo = React.useMemo(() => {
    if (videoArtifacts.length === 0) return null;
    const match = videoArtifacts.find((a) => a.attemptNumber === selectedAttempt);
    return match || videoArtifacts.find((a) => a.attemptNumber === null || a.attemptNumber === undefined) || null;
  }, [videoArtifacts, selectedAttempt]);

  const videoArtifact = activeRealVideo
    ? {
        id: activeRealVideo.id,
        kind: activeRealVideo.kind,
        storageTier: activeRealVideo.storageTier,
        publicUrl: activeRealVideo.url,
        fileName: `recording-run${activeRealVideo.attemptNumber || 1}-${activeRealVideo.id.slice(0, 8)}.webm`,
        sizeBytes: activeRealVideo.sizeBytes,
        sha256Checksum: activeRealVideo.sha256Checksum,
        isEligibleForSharing: activeRealVideo.isEligibleForSharing,
      }
    : undefined;
  const hasAnyVideo = videoArtifacts.length > 0;

  const isQuarantined = investigation?.evidenceReadiness === 'QUARANTINED_LEAK_DETECTED';
  const hasPlayableVideo = Boolean(
    videoArtifact?.publicUrl &&
    !videoLoadError &&
    !isQuarantined &&
    videoArtifact.storageTier !== 'RESTRICTED_RAW' &&
    investigation?.evidenceReadiness !== 'PENDING_GENERATION' &&
    investigation?.evidenceReadiness !== 'PACKAGING_IN_PROGRESS'
  );

  const consoleLogs: ConsoleLogEntry[] = React.useMemo(() => {
    if (realConsoleLogs.length > 0) return realConsoleLogs;
    return [];
  }, [realConsoleLogs]);

  const networkTraces: NetworkTraceEntry[] = React.useMemo(() => {
    if (realNetworkTraces.length > 0) return realNetworkTraces;
    return [];
  }, [realNetworkTraces]);

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
      const planToUse = realPlan;
      const manifestToUse: EvidenceManifest | null = realArtifacts.length > 0 ? {
        investigationId: id,
        readinessStatus: (investigation.evidenceReadiness || 'PUBLIC_SAFE_READY') as EvidenceReadinessStatus,
        triadComplete: realArtifacts.some((a) => a.kind === 'VIDEO_RECORDING') &&
                       realArtifacts.some((a) => a.kind === 'CONSOLE_LOG') &&
                       realArtifacts.some((a) => a.kind === 'NETWORK_TRACE'),
        hasVideo: realArtifacts.some((a) => a.kind === 'VIDEO_RECORDING'),
        hasConsoleLog: realArtifacts.some((a) => a.kind === 'CONSOLE_LOG'),
        hasNetworkTrace: realArtifacts.some((a) => a.kind === 'NETWORK_TRACE'),
        secretScrubbingVerified: realArtifacts.every((a) => a.isEligibleForSharing),
        generatedAt: new Date().toISOString(),
        artifacts: realArtifacts.map((a) => ({
          id: a.id,
          investigationId: id,
          attemptNumber: a.attemptNumber ?? 1,
          kind: a.kind as ArtifactKind,
          storageTier: a.storageTier as StorageTier,
          fileName: `artifact-${a.id.slice(0, 8)}`,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          sha256Checksum: a.sha256Checksum,
          redactionApplied: Boolean(a.redactionApplied),
          publicUrl: a.url,
          createdAt: a.createdAt,
        })),
      } : manifest;

      const pkg = buildReproductionPackage({
        investigation,
        plan: planToUse,
        manifest: manifestToUse,
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
  const nextAction = getNextPermittedAction({
    id: investigation.id,
    lifecycleStatus: investigation.lifecycleStatus,
    reviewStatus: investigation.reviewStatus,
    reproductionVerdict: investigation.reproductionVerdict,
    evidenceReadiness: investigation.evidenceReadiness,
    planVersion: investigation.planVersion,
    isApproved: investigation.isApproved,
  });

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
            </div>
            <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
              {investigation.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-brand-muted">
              <span>Target: <a href={investigation.targetUrl} target="_blank" rel="noreferrer" className="text-cobalt-action hover:underline">{investigation.targetUrl}</a></span>
              {investigation.targetEnvironment && (
                <span className="inline-flex items-center space-x-1">
                  <span>•</span>
                  <span>Env:</span>
                  <strong className="text-brand-navy font-semibold">{investigation.targetEnvironment}</strong>
                </span>
              )}
              {investigation.targetBuildVersion && (
                <span className="inline-flex items-center space-x-1">
                  <span>•</span>
                  <span>Build:</span>
                  <strong className="font-mono text-brand-navy">{investigation.targetBuildVersion}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!realPlan && investigation.lifecycleStatus === 'DRAFT' && (
              <Button size="sm" onClick={generatePlan} disabled={planning}>
                {planning ? 'Generating Plan...' : 'Generate Plan'}
              </Button>
            )}
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
              id="preview-report-btn"
              size="sm"
              variant="outline"
              onClick={() => setShowReportPreview(true)}
              className="space-x-1.5"
              aria-label="Preview investigation report"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Preview Report</span>
            </Button>
            <Button
              id="download-pdf-btn"
              size="sm"
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="space-x-1.5"
              aria-label="Download investigation report as PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
            </Button>
            <Button
              id="export-package-btn"
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

        {planningError && <p role="alert" className="mt-4 text-sm text-red-700">{planningError}</p>}
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
        {pdfNotice && (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 p-3 rounded-control bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{pdfNotice}</span>
            </div>
            <button
              onClick={() => setPdfNotice(null)}
              className="text-emerald-700 font-semibold text-xs ml-4 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {pdfError && (
          <div
            role="alert"
            className="mt-3 p-3 rounded-control bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{pdfError}</span>
            </div>
            <button
              onClick={() => setPdfError(null)}
              className="text-rose-700 font-semibold text-xs ml-4 hover:underline"
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

        {/* Next Permitted Action Banner */}
        <div className="mt-4 p-3.5 rounded-control bg-white border border-lavender-accent/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cobalt-subtle text-cobalt-action">
                Next Permitted Action
              </span>
              <span className="font-semibold text-xs text-brand-navy">
                {nextAction.label}
              </span>
            </div>
            <p className="text-xs text-brand-muted">
              {nextAction.description}
            </p>
          </div>
          {nextAction.href && (
            <Link href={nextAction.href}>
              <Button size="sm" variant={nextAction.isActionable ? 'primary' : 'outline'} className="text-xs shrink-0 space-x-1.5">
                <span>{nextAction.label}</span>
                <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {explanation ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Evidence Explanation (AI-Synthesized Hypotheses)</span>
              <Badge variant="outline">AI Synthesized</Badge>
            </CardTitle>
            <CardDescription>
              AI-synthesized narrative and causal hypotheses (TC-INV-008). Deterministic execution measurements and assertion verdicts are presented separately below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-brand-navy">
            <div className="p-3 bg-lavender-surface rounded-control border border-lavender-accent/50 text-xs leading-relaxed">
              <span className="font-semibold text-brand-deepPurple block mb-1">Executive Summary:</span>
              <p>{explanation.summary}</p>
            </div>
            {explanation.verifiedFacts && (
              <div className="space-y-1">
                <span className="font-semibold text-xs text-brand-navy">Verified Execution Facts:</span>
                <div className="p-3 bg-white rounded border border-neutral-divider text-xs whitespace-pre-wrap font-mono text-neutral-800 leading-relaxed">
                  {explanation.verifiedFacts}
                </div>
              </div>
            )}
            {Array.isArray(explanation.observationsVsHypotheses) && explanation.observationsVsHypotheses.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="font-semibold text-xs text-brand-navy">Observations vs Hypotheses:</span>
                <div className="grid grid-cols-1 gap-2">
                  {explanation.observationsVsHypotheses.map((entry: {observation?: string; hypothesis?: string}, i: number) => (
                    <div key={i} className="p-2.5 rounded bg-white border border-neutral-divider text-xs space-y-1">
                      <p><span className="font-semibold text-brand-navy">Observation:</span> {entry.observation}</p>
                      <p><span className="font-semibold text-brand-deepPurple">Hypothesis:</span> {entry.hypothesis}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(explanation.limitations) && explanation.limitations.length > 0 && (
              <div className="space-y-1 pt-1 text-xs text-brand-muted">
                <span className="font-semibold text-brand-navy">Recorded Limitations and Gaps:</span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {explanation.limitations.map((gap: string, i: number) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pt-2 flex items-center space-x-3">
              <Button size="sm" variant="outline" onClick={retryExplanation} disabled={reviewing}>
                {reviewing ? 'Reviewing Evidence...' : 'Review Evidence Again'}
              </Button>
              <span className="text-[11px] text-brand-muted">
                Synthesizes factual observations through Evidence Review Agent.
              </span>
            </div>
          </CardContent>
        </Card>
      ) : investigation?.lifecycleStatus === 'COMPLETED' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Evidence Explanation (AI-Synthesized Hypotheses)</span>
              <Badge variant="outline">AI Narrative</Badge>
            </CardTitle>
            <CardDescription>
              Synthesize a natural language review from recorded verification facts. Deterministic execution measurements remain separate below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-brand-navy">
            <p className="text-xs text-brand-muted">
              Factual results are locked. You can synthesize a narrative explanation analyzing the recorded attempt observations.
            </p>
            <Button size="sm" onClick={retryExplanation} disabled={reviewing}>
              {reviewing ? 'Reviewing Evidence...' : 'Generate Evidence Explanation'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {restrictedRecordingCount > 0 && (
        <div role="status" className="p-4 rounded-card border border-neutral-divider bg-lavender-surface text-sm text-brand-navy">
          {restrictedRecordingCount} browser recordings captured. Playback and sharing are withheld pending privacy review. Sanitized logs are available separately below.
        </div>
      )}
      {/* Two-Run Attempt Comparison Section (TC-INV-002) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Two-Run Deterministic Confirmation Record (TC-INV-002)</span>
            <Badge variant="outline">Reset validation required for confirmation</Badge>
          </CardTitle>
          <CardDescription>
            A defect is confirmed only when two independent runs yield matching failure signatures under restored conditions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Run 1 Summary */}
            <div className="p-4 rounded-control border border-neutral-divider bg-white space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-brand-navy">Attempt 1 (Initial Run)</span>
                {investigation.attempt1 ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                    investigation.attempt1.validity === 'VALID_DEFECT_DETECTED'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : investigation.attempt1.validity === 'VALID_CLEAN_RUN'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {investigation.attempt1.validity === 'VALID_DEFECT_DETECTED'
                      ? 'Defect Detected'
                      : investigation.attempt1.validity === 'VALID_CLEAN_RUN'
                      ? 'Clean Run'
                      : investigation.attempt1.validity === 'VALID_UNEXPECTED_OUTCOME'
                      ? 'Unexpected Outcome'
                      : investigation.attempt1.validity}
                  </span>
                ) : (
                  <span className="text-xs text-brand-muted">Not Executed</span>
                )}
              </div>
              <div className="text-xs text-brand-muted space-y-1">
                <div>Actions: <strong className="text-brand-navy">{investigation.attempt1?.actionsExecuted ?? 0}</strong> steps executed</div>
                <div>Last Observed Step: <span className="font-mono">{investigation.attempt1?.lastObservedStep !== null && investigation.attempt1?.lastObservedStep !== undefined ? `Step #${investigation.attempt1.lastObservedStep}` : 'Not recorded'}</span></div>
                <div>Duration: <span className="font-mono">{typeof investigation.attempt1?.durationMs === 'number' ? `${investigation.attempt1.durationMs / 1000}s` : 'Not recorded'}</span></div>
                <div>Mutation State: <strong className="text-brand-navy">{investigation.attempt1?.mutationState || 'NONE'}</strong></div>
                {investigation.attempt1?.buildId && (
                  <div>Build ID: <span className="font-mono text-brand-navy">{investigation.attempt1.buildId}</span></div>
                )}
                {investigation.attempt1?.failureMessage && (
                  <div className="pt-1 text-rose-800 font-mono text-[11px] break-all">
                    Message: {investigation.attempt1.failureMessage}
                  </div>
                )}
              </div>
              {/* Attempt 1 Assertion Observations */}
              {Array.isArray(investigation.assertionEvaluations) &&
                investigation.assertionEvaluations.some((a) => a.attemptNumber === 1) && (
                  <div className="pt-2 border-t border-neutral-divider space-y-1.5">
                    <span className="text-[11px] font-bold text-brand-navy uppercase tracking-wider block">
                      Assertion Observations
                    </span>
                    <div className="space-y-1">
                      {investigation.assertionEvaluations
                        .filter((a) => a.attemptNumber === 1)
                        .map((assertion, idx) => (
                          <div
                            key={assertion.id || idx}
                            className={`p-2 rounded text-[11px] border flex items-center justify-between ${
                              assertion.result === 'PASSED'
                                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                                : 'bg-rose-50/60 border-rose-200 text-rose-900'
                            }`}
                          >
                            <div>
                              <span className="font-semibold">{assertion.purpose || assertion.assertionId}</span>
                              {assertion.expectedValue && (
                                <div className="text-[10px] text-neutral-600 font-mono">
                                  Exp: {assertion.expectedValue} | Obs: {assertion.observedValue ?? 'None'}
                                </div>
                              )}
                            </div>
                            <span className="font-bold text-[10px] uppercase ml-2 shrink-0">
                              {assertion.result}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Run 2 Summary */}
            <div className="p-4 rounded-control border border-neutral-divider bg-white space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-brand-navy">Attempt 2 (Confirmation Run)</span>
                {investigation.attempt2 ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                    investigation.attempt2.validity === 'VALID_DEFECT_DETECTED'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : investigation.attempt2.validity === 'VALID_CLEAN_RUN'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {investigation.attempt2.validity === 'VALID_DEFECT_DETECTED'
                      ? 'Defect Detected'
                      : investigation.attempt2.validity === 'VALID_CLEAN_RUN'
                      ? 'Clean Run'
                      : investigation.attempt2.validity === 'VALID_UNEXPECTED_OUTCOME'
                      ? 'Unexpected Outcome'
                      : investigation.attempt2.validity}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-neutral-surface text-brand-muted border border-neutral-divider">
                    Not Executed
                  </span>
                )}
              </div>
              {investigation.attempt2 ? (
                <div className="text-xs text-brand-muted space-y-1">
                  <div>Actions: <strong className="text-brand-navy">{investigation.attempt2.actionsExecuted}</strong> steps executed</div>
                  <div>Last Observed Step: <span className="font-mono">{investigation.attempt2.lastObservedStep !== null && investigation.attempt2.lastObservedStep !== undefined ? `Step #${investigation.attempt2.lastObservedStep}` : 'Not recorded'}</span></div>
                  <div>Duration: <span className="font-mono">{typeof investigation.attempt2.durationMs === 'number' ? `${investigation.attempt2.durationMs / 1000}s` : 'Not recorded'}</span></div>
                  <div>Mutation State: <strong className="text-brand-navy">{investigation.attempt2.mutationState}</strong></div>
                  {investigation.attempt2.buildId && (
                    <div>Build ID: <span className="font-mono text-brand-navy">{investigation.attempt2.buildId}</span></div>
                  )}
                  {investigation.attempt2.failureMessage && (
                    <div className="pt-1 text-rose-800 font-mono text-[11px] break-all">
                      Message: {investigation.attempt2.failureMessage}
                    </div>
                  )}
                  {/* Attempt 2 Assertion Observations */}
                  {Array.isArray(investigation.assertionEvaluations) &&
                    investigation.assertionEvaluations.some((a) => a.attemptNumber === 2) && (
                      <div className="pt-2 border-t border-neutral-divider space-y-1.5">
                        <span className="text-[11px] font-bold text-brand-navy uppercase tracking-wider block">
                          Assertion Observations
                        </span>
                        <div className="space-y-1">
                          {investigation.assertionEvaluations
                            .filter((a) => a.attemptNumber === 2)
                            .map((assertion, idx) => (
                              <div
                                key={assertion.id || idx}
                                className={`p-2 rounded text-[11px] border flex items-center justify-between ${
                                  assertion.result === 'PASSED'
                                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                                    : 'bg-rose-50/60 border-rose-200 text-rose-900'
                                }`}
                              >
                                <div>
                                  <span className="font-semibold">{assertion.purpose || assertion.assertionId}</span>
                                  {assertion.expectedValue && (
                                    <div className="text-[10px] text-neutral-600 font-mono">
                                      Exp: {assertion.expectedValue} | Obs: {assertion.observedValue ?? 'None'}
                                    </div>
                                  )}
                                </div>
                                <span className="font-bold text-[10px] uppercase ml-2 shrink-0">
                                  {assertion.result}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="p-3 bg-neutral-surface/60 rounded border border-neutral-divider text-xs space-y-2">
                  <div className="font-semibold text-brand-navy flex items-center space-x-1.5">
                    <AlertCircle className="w-4 h-4 text-brand-muted shrink-0" />
                    <span>Second Attempt Status: Not Executed</span>
                  </div>
                  <p className="text-brand-muted leading-relaxed">
                    {investigation.resetReceipt && !investigation.resetReceipt.isVerifiedRestored
                      ? 'Attempt 2 was blocked: Target reset verification failed. Execution was halted to prevent non-deterministic testing on dirty state.'
                      : investigation.attempt1?.validity === 'VALID_CLEAN_RUN'
                      ? 'Attempt 2 was not executed: Defect was not observed in Attempt 1 (clean run). Second confirmation run was unnecessary.'
                      : investigation.attempt1?.mutationState === 'MUTATION_UNCERTAIN'
                      ? 'Attempt 2 was blocked: Target mutation state could not be verified as restored.'
                      : investigation.attempt1
                      ? 'Attempt 2 was not executed: Second run was blocked because Attempt 1 did not detect a defect, encountered mutation uncertainty, or target reset could not be verified.'
                      : 'Awaiting Attempt 1 completion and reset verification.'}
                  </p>
                  <p className="text-[11px] text-brand-deepPurple font-medium">
                    TraceCase never manufactures artificial confirmation attempts or receipts.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Target Reset & Baseline Readback Receipt Banner */}
          <div className="p-4 rounded-control border bg-neutral-surface/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 text-cobalt-action" />
                <span className="font-bold text-sm text-brand-navy">Target Reset & Baseline Readback Receipt</span>
              </div>
              {investigation.resetReceipt ? (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                  investigation.resetReceipt.isVerifiedRestored
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {investigation.resetReceipt.isVerifiedRestored ? 'Restoration Verified' : 'Restoration Failed'}
                </span>
              ) : (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-white text-brand-muted border border-neutral-divider">
                  Receipt Pending / Not Issued
                </span>
              )}
            </div>
            {investigation.resetReceipt ? (
              <div className="text-xs space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-white border border-neutral-divider">
                    <span className="text-[10px] uppercase font-bold text-brand-muted block">Transport</span>
                    <span className={`font-semibold ${investigation.resetReceipt.transportSuccess ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {investigation.resetReceipt.transportSuccess ? 'Success (200 OK)' : 'Transport Failure'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-white border border-neutral-divider">
                    <span className="text-[10px] uppercase font-bold text-brand-muted block">Baseline Equivalence</span>
                    <span className={`font-semibold ${investigation.resetReceipt.baselineEquivalent ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {investigation.resetReceipt.baselineEquivalent ? 'Equivalent (State Clean)' : 'State Discrepancy'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-white border border-neutral-divider">
                    <span className="text-[10px] uppercase font-bold text-brand-muted block">Verified At</span>
                    <span className="font-mono text-[11px] text-brand-navy">
                      {new Date(investigation.resetReceipt.verifiedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                <div className="p-2.5 rounded bg-white border border-neutral-divider font-mono text-[11px] space-y-1">
                  <div><span className="text-brand-muted">Expected State Hash:</span> {investigation.resetReceipt.readback?.expectedStateHash || 'None'}</div>
                  <div><span className="text-brand-muted">Observed State Hash:</span> {investigation.resetReceipt.readback?.observedStateHash || 'None'}</div>
                  {investigation.resetReceipt.targetBuildId && (
                    <div><span className="text-brand-muted">Target Build:</span> <span className="font-semibold text-brand-navy">{investigation.resetReceipt.targetBuildId}</span></div>
                  )}
                </div>
                {Array.isArray(investigation.resetReceipt.readback?.discrepancies) && investigation.resetReceipt.readback.discrepancies.length > 0 && (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                    <span className="font-bold">Observed Discrepancies:</span>
                    <ul className="list-disc pl-4 space-y-0.5 mt-1">
                      {investigation.resetReceipt.readback.discrepancies.map((d: string, i: number) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-brand-muted">
                Target reset receipt has not been recorded. Reset and readback verification is required before initiating Attempt 2 (TC-INV-002).
              </p>
            )}
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
            Captured artifacts from this investigation. Availability and sharing eligibility are shown separately.
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
          {/* Attempt Selector for Evidence Triad */}
          {(investigation?.attempt1 || investigation?.attempt2) && (
            <div className="flex items-center space-x-2 pb-1 border-b border-neutral-divider pb-3">
              <span className="text-xs font-semibold text-brand-navy">Inspect Attempt:</span>
              <button
                type="button"
                onClick={() => setSelectedAttempt(1)}
                className={`px-3 py-1 rounded-control text-xs font-semibold transition-all ${
                  selectedAttempt === 1
                    ? 'bg-brand-deepPurple text-white shadow-subtle'
                    : 'bg-white text-brand-navy hover:bg-neutral-surface border border-neutral-divider'
                }`}
              >
                Attempt 1 (Initial Run)
              </button>
              {investigation?.attempt2 && (
                <button
                  type="button"
                  onClick={() => setSelectedAttempt(2)}
                  className={`px-3 py-1 rounded-control text-xs font-semibold transition-all ${
                    selectedAttempt === 2
                      ? 'bg-brand-deepPurple text-white shadow-subtle'
                      : 'bg-white text-brand-navy hover:bg-neutral-surface border border-neutral-divider'
                  }`}
                >
                  Attempt 2 (Confirmation Run)
                </button>
              )}
            </div>
          )}

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
                <Badge variant={hasAnyVideo && !isQuarantined ? 'default' : 'outline'}>
                  {isQuarantined
                    ? 'Quarantined'
                    : hasAnyVideo
                    ? (activeRealVideo?.storageTier === 'RESTRICTED_RAW'
                        ? 'Restricted Viewport'
                        : videoArtifacts.length > 1
                        ? `${videoArtifacts.length} Runs (.webm)`
                        : '.webm')
                    : 'Unavailable'}
                </Badge>
              </div>
              <div className="text-[11px] text-brand-muted mt-1.5">
                {isQuarantined
                  ? 'Withheld (Security review pending)'
                  : hasAnyVideo
                  ? (activeRealVideo?.storageTier === 'RESTRICTED_RAW'
                      ? 'Captured — access restricted to authorized tier'
                      : videoArtifacts.length > 1
                      ? 'Both attempt recordings captured'
                      : '1280x720 Viewport Capture')
                  : 'No video artifact captured'}
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
                <Badge
                  variant={
                    consoleFetchState === 'FAILED'
                      ? 'outline'
                      : consoleFetchState === 'RESTRICTED'
                      ? 'outline'
                      : consoleFetchState === 'LOADING'
                      ? 'outline'
                      : realConsoleLogs.length > 0
                      ? 'confirmed'
                      : 'outline'
                  }
                  className={
                    consoleFetchState === 'FAILED'
                      ? 'border-rose-400 text-rose-700 bg-rose-50'
                      : consoleFetchState === 'RESTRICTED'
                      ? 'border-amber-400 text-amber-800 bg-amber-50'
                      : undefined
                  }
                >
                  {consoleFetchState === 'LOADING'
                    ? 'Loading...'
                    : consoleFetchState === 'FAILED'
                    ? 'Retrieval Failed'
                    : consoleFetchState === 'RESTRICTED'
                    ? 'Restricted'
                    : realConsoleLogs.length > 0
                    ? `${realConsoleLogs.length} events`
                    : 'Empty'}
                </Badge>
              </div>
              <div className="text-[11px] text-brand-muted mt-1.5">
                {consoleFetchState === 'FAILED'
                  ? 'Telemetry endpoint failed - see details'
                  : consoleFetchState === 'RESTRICTED'
                  ? 'Raw output withheld (privacy controls)'
                  : 'CDP telemetry with regex scrubbing'}
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
                <Badge
                  variant={
                    networkFetchState === 'FAILED'
                      ? 'outline'
                      : networkFetchState === 'RESTRICTED'
                      ? 'outline'
                      : networkFetchState === 'LOADING'
                      ? 'outline'
                      : realNetworkTraces.length > 0
                      ? 'confirmed'
                      : 'outline'
                  }
                  className={
                    networkFetchState === 'FAILED'
                      ? 'border-rose-400 text-rose-700 bg-rose-50'
                      : networkFetchState === 'RESTRICTED'
                      ? 'border-amber-400 text-amber-800 bg-amber-50'
                      : undefined
                  }
                >
                  {networkFetchState === 'LOADING'
                    ? 'Loading...'
                    : networkFetchState === 'FAILED'
                    ? 'Retrieval Failed'
                    : networkFetchState === 'RESTRICTED'
                    ? 'Restricted'
                    : realNetworkTraces.length > 0
                    ? `${realNetworkTraces.length} requests`
                    : 'Empty'}
                </Badge>
              </div>
              <div className="text-[11px] text-brand-muted mt-1.5">
                {networkFetchState === 'FAILED'
                  ? 'Network telemetry failed - see details'
                  : networkFetchState === 'RESTRICTED'
                  ? 'Raw trace withheld (privacy controls)'
                  : 'Sanitized HTTP telemetry (.json)'}
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

                {videoArtifacts.length > 1 && (
                  <div className="flex items-center space-x-2 pb-1">
                    <span className="text-[11px] font-semibold text-brand-muted">Select Run:</span>
                    {videoArtifacts.map((va) => {
                      const attNum = va.attemptNumber || 1;
                      const isSelected = selectedAttempt === attNum;
                      return (
                        <button
                          key={va.id}
                          type="button"
                          onClick={() => setSelectedAttempt(attNum)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                            isSelected
                              ? 'bg-brand-deepPurple text-white shadow-sm'
                              : 'bg-neutral-surface text-brand-navy hover:bg-neutral-divider/40 border border-neutral-divider'
                          }`}
                        >
                          Attempt {attNum} Recording
                        </button>
                      );
                    })}
                  </div>
                )}
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
                    ) : restrictedRecordingCount > 0 ? (
                      <Lock className="w-8 h-8 mx-auto text-brand-deepPurple" />
                    ) : (
                      <Video className="w-8 h-8 mx-auto text-brand-muted" />
                    )}
                    <div className="text-xs font-semibold text-brand-navy">
                      {isQuarantined
                        ? 'Video Quarantined in RESTRICTED_RAW Storage'
                        : restrictedRecordingCount > 0
                        ? 'Captured — access restricted'
                        : videoLoadError
                        ? 'Local Media Storage Offline'
                        : 'No Playable Video Available'}
                    </div>
                    <p className="text-[11px] text-brand-muted max-w-md mx-auto">
                      {isQuarantined
                        ? 'This investigation triggered an in-stream secret leak alert. Raw media is isolated in restricted storage and cannot be played or downloaded through the client (TC-INV-009).'
                        : restrictedRecordingCount > 0
                        ? `Attempt ${selectedAttempt} viewport recording was captured and secured in restricted raw storage. Video playback and sharing are withheld pending privacy review (TC-INV-009 / VES-EVD-001). Sanitized console logs and network traces are available below.`
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
                      {realConsoleLogs.length > 0 ? 'Live Captured Logs' : 'No Logs'}
                    </span>
                  </div>
                </div>

                {consoleFetchState === 'LOADING' ? (
                  <div className="p-8 text-center text-xs text-brand-muted border border-dashed border-neutral-divider rounded-control bg-neutral-surface/30">
                    <RefreshCw className="w-5 h-5 mx-auto mb-2 text-cobalt-action animate-spin" />
                    <p>Fetching sanitized console telemetry from storage...</p>
                  </div>
                ) : consoleFetchState === 'FAILED' ? (
                  <div role="alert" className="p-4 rounded-control border border-rose-300 bg-rose-50 text-xs text-rose-900 space-y-2">
                    <div className="flex items-center space-x-2 font-bold text-rose-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
                      <span>Console Telemetry Retrieval Failed</span>
                    </div>
                    <p>{consoleFetchError || 'The server or storage endpoint encountered an error while retrieving the sanitized console log artifact.'}</p>
                    <div className="p-2.5 rounded bg-white/80 border border-rose-200 text-[11px] text-rose-950 font-medium">
                      <strong>Honest Status Guarantee:</strong> A retrieval failure does not imply no console errors occurred. Telemetry was inaccessible.
                    </div>
                  </div>
                ) : consoleFetchState === 'RESTRICTED' ? (
                  <div role="status" className="p-6 text-center space-y-2 border border-neutral-divider rounded-control bg-lavender-surface text-xs text-brand-navy">
                    <Lock className="w-6 h-6 mx-auto text-brand-deepPurple" />
                    <span className="font-bold">Console Log Classified as RESTRICTED_RAW</span>
                    <p className="text-[11px] text-brand-muted max-w-md mx-auto">
                      Raw console output is quarantined or held in restricted storage pending automated redactor processing (TC-INV-009).
                    </p>
                  </div>
                ) : filteredLogs.length > 0 ? (
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
                    {consoleSearch ? `No log entries match search "${consoleSearch}".` : 'No console entries captured for this run.'}
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
                      {realNetworkTraces.length > 0 ? 'Live Telemetry HAR' : 'No Traces'}
                    </span>
                  </div>
                </div>

                {networkFetchState === 'LOADING' ? (
                  <div className="p-8 text-center text-xs text-brand-muted border border-dashed border-neutral-divider rounded-control bg-neutral-surface/30">
                    <RefreshCw className="w-5 h-5 mx-auto mb-2 text-cobalt-action animate-spin" />
                    <p>Fetching sanitized network trace telemetry from storage...</p>
                  </div>
                ) : networkFetchState === 'FAILED' ? (
                  <div role="alert" className="p-4 rounded-control border border-rose-300 bg-rose-50 text-xs text-rose-900 space-y-2">
                    <div className="flex items-center space-x-2 font-bold text-rose-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
                      <span>Network Trace Retrieval Failed</span>
                    </div>
                    <p>{networkFetchError || 'The server or storage endpoint encountered an error while retrieving the sanitized network trace artifact.'}</p>
                    <div className="p-2.5 rounded bg-white/80 border border-rose-200 text-[11px] text-rose-950 font-medium">
                      <strong>Honest Status Guarantee:</strong> A retrieval failure does not imply no network requests or errors occurred. Telemetry was inaccessible.
                    </div>
                  </div>
                ) : networkFetchState === 'RESTRICTED' ? (
                  <div role="status" className="p-6 text-center space-y-2 border border-neutral-divider rounded-control bg-lavender-surface text-xs text-brand-navy">
                    <Lock className="w-6 h-6 mx-auto text-brand-deepPurple" />
                    <span className="font-bold">Network Trace Classified as RESTRICTED_RAW</span>
                    <p className="text-[11px] text-brand-muted max-w-md mx-auto">
                      Raw network trace is quarantined or held in restricted storage pending automated redactor processing (TC-INV-009).
                    </p>
                  </div>
                ) : filteredTraces.length > 0 ? (
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
                              {trace.resourceType && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-neutral-surface text-brand-muted border border-neutral-divider shrink-0">
                                  {trace.resourceType}
                                </span>
                              )}
                              <span className="font-mono text-[11px] text-brand-navy truncate">
                                {trace.url}
                              </span>
                            </div>
                            <div className="flex items-center space-x-3 shrink-0 text-brand-muted text-[11px]">
                              {trace.isTransportFailure ? (
                                <span className="font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                  {trace.failureText || 'Transport Failure'}
                                </span>
                              ) : typeof trace.status === 'number' ? (
                                <span
                                  className={`font-semibold ${
                                    trace.status >= 400
                                      ? 'text-rose-700'
                                      : trace.status >= 300
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {trace.status} {trace.status >= 400 ? 'Error' : trace.status >= 300 ? 'Redirect' : 'OK'}
                                </span>
                              ) : (
                                <span className="font-semibold text-brand-muted">Unknown</span>
                              )}
                              {trace.durationMs !== undefined && (
                                <span>{trace.durationMs}ms</span>
                              )}
                            </div>
                          </button>

                          {/* Expanded Details Pane */}
                          {isExpanded && (
                            <div
                              id={`trace-details-${trace.id}`}
                              className="p-3 bg-neutral-surface/50 border-t border-neutral-divider space-y-2.5 text-[11px]"
                            >
                              {trace.requestHeaders && Object.keys(trace.requestHeaders).length > 0 && (
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
                              )}

                              {trace.responseHeaders && Object.keys(trace.responseHeaders).length > 0 && (
                                <div>
                                  <span className="font-semibold text-brand-navy block mb-1">
                                    Response Headers:
                                  </span>
                                  <div className="bg-white p-2.5 rounded border border-neutral-divider font-mono space-y-1">
                                    {Object.entries(trace.responseHeaders).map(([k, v]) => (
                                      <div key={k} className="truncate">
                                        <span className="text-brand-deepPurple font-semibold">{k}:</span>{' '}
                                        <span className={v.includes('REDACTED') ? 'text-amber-800 font-bold' : 'text-neutral-700'}>
                                          {v}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {trace.isTransportFailure && trace.failureText && (
                                <div>
                                  <span className="font-semibold text-rose-700 block mb-1">
                                    Transport Failure Detail:
                                  </span>
                                  <div className="bg-rose-50 text-rose-800 p-2.5 rounded border border-rose-200 font-mono text-[10px]">
                                    {trace.failureText}
                                  </div>
                                </div>
                              )}

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
                    {networkSearch ? `No requests match search "${networkSearch}".` : 'No network traces recorded for this run.'}
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

      {/* Report Preview Modal */}
      {showReportPreview && investigation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-preview-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-neutral-divider">
            <div className="p-4 border-b border-neutral-divider flex items-center justify-between bg-neutral-surface">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-cobalt-action" />
                <h3 id="report-preview-title" className="font-bold text-sm text-brand-navy">
                  Investigation Report Preview &bull; {investigation.title}
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={`/api/v1/investigations/${investigation.id}/report/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cobalt-action font-semibold hover:underline px-2.5 py-1 border border-cobalt-action rounded flex items-center space-x-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open PDF in New Tab</span>
                </a>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  className="space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isDownloadingPdf ? 'Downloading...' : 'Download PDF'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowReportPreview(false)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 bg-slate-100">
              <iframe
                src={`/api/v1/investigations/${investigation.id}/report/pdf`}
                className="w-full h-[70vh] rounded border border-neutral-divider bg-white"
                title="Investigation Report PDF Preview"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
