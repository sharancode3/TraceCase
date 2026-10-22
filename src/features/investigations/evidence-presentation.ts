import type { InvestigationSnapshot } from '@/contracts/investigations';
import type { ExperimentPlan, AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { EvidenceManifest } from '@/contracts/evidence';
import type { EvidenceReadinessStatus } from '@/contracts/status';

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'LOG' | 'WARN' | 'ERROR';
  category: string;
  message: string;
}

export interface NetworkTraceEntry {
  id: string;
  timestamp?: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | string;
  url: string;
  resourceType?: string;
  status?: number;
  isTransportFailure?: boolean;
  failureText?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  mimeType?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
}

export interface ReproductionPackage {
  traceCasePackageVersion: '1.0.0';
  exportedAt: string;
  sourceEnvironment: 'development-preview' | 'live-engine';
  securityNotice: string;
  investigation: {
    id: string;
    reportId: string;
    title: string;
    target: {
      id: string;
      name: string;
      baseUrl: string;
      isSandbox: boolean;
    };
    lifecycleStatus: string;
    reproductionVerdict: string;
    evidenceReadiness: string;
    tokenCostUsd: number;
    createdAt: string;
    completedAt: string | null;
  };
  attempts: {
    attempt1: InvestigationSnapshot['attempt1'];
    attempt2: InvestigationSnapshot['attempt2'];
  };
  approvedPlan: {
    version: number | null;
    planHash: string | null;
    isApproved: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
    targetUrl?: string;
    steps?: Array<{
      stepIndex: number;
      semanticAction: string;
      toolKind: string;
      selector?: string;
      tier: string;
      timeoutMs: number;
    }>;
    expectedCorrectBehavior?: string;
    reportedFailureSignature?: string;
    verificationCriteria?: string[];
  };
  evidenceManifest: {
    readinessStatus: string;
    triadComplete: boolean;
    hasVideo: boolean;
    hasConsoleLog: boolean;
    hasNetworkTrace: boolean;
    secretScrubbingVerified: boolean;
    artifacts: Array<{
      id: string;
      attemptNumber: number | null;
      kind: string;
      storageTier: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      sha256Checksum: string;
      redactionApplied: boolean;
      publicUrl: string | null;
      createdAt: string;
    }>;
  };
}

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-access-token',
  'x-auth-token',
  'proxy-authorization',
  'bearer',
  'token',
  'api-key',
  'secret',
  'session',
  'x-csrf-token',
  'x-xsrf-token',
  'private-token',
]);

const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'access_token',
  'auth_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'password',
  'signature',
  'sig',
]);

/**
 * Sanitizes a URL string by masking sensitive query parameters (e.g. ?token=... or ?apiKey=...).
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    let changed = false;
    for (const param of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_PARAMS.has(param.toLowerCase())) {
        parsed.searchParams.set(param, '[REDACTED]');
        changed = true;
      }
    }
    return changed ? parsed.toString() : rawUrl;
  } catch {
    return rawUrl;
  }
}

/**
 * Sanitizes an HTTP headers object by masking known sensitive authorization and session headers.
 */
export function sanitizeNetworkHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const scrubbed: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase().trim())) {
      scrubbed[key] = '[REDACTED_HEADER]';
    } else {
      scrubbed[key] = val;
    }
  }
  return scrubbed;
}

/**
 * Filters console log entries by search text matching message, level, or category.
 */
export function filterConsoleLogs(
  logs: ConsoleLogEntry[],
  searchQuery: string
): ConsoleLogEntry[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return logs;

  return logs.filter((log) => {
    return (
      log.message.toLowerCase().includes(query) ||
      log.level.toLowerCase().includes(query) ||
      log.category.toLowerCase().includes(query)
    );
  });
}

/**
 * Filters network trace entries by method, URL, or status code.
 * Ensures all displayed trace URLs and headers are sanitized.
 */
export function filterNetworkTraces(
  traces: NetworkTraceEntry[],
  searchQuery: string
): NetworkTraceEntry[] {
  const query = searchQuery.trim().toLowerCase();
  const sanitized = traces.map((trace) => ({
    ...trace,
    url: trace.url ? sanitizeUrl(trace.url) : '',
    requestHeaders: trace.requestHeaders ? sanitizeNetworkHeaders(trace.requestHeaders) : undefined,
    responseHeaders: trace.responseHeaders ? sanitizeNetworkHeaders(trace.responseHeaders) : undefined,
  }));

  if (!query) return sanitized;

  return sanitized.filter((trace) => {
    return (
      (trace.url && trace.url.toLowerCase().includes(query)) ||
      (trace.method && trace.method.toLowerCase().includes(query)) ||
      (trace.status !== undefined && String(trace.status).includes(query)) ||
      (trace.failureText && trace.failureText.toLowerCase().includes(query)) ||
      (trace.resourceType && trace.resourceType.toLowerCase().includes(query))
    );
  });
}

export interface EvidenceAvailability {
  isAvailable: boolean;
  isQuarantined: boolean;
  isFailed: boolean;
  isPending: boolean;
  badgeMessage: string;
  explanation: string;
}

/**
 * Evaluates the availability and quarantine status of evidence based on EvidenceReadinessStatus.
 */
export function getEvidenceAvailability(
  readiness: EvidenceReadinessStatus
): EvidenceAvailability {
  switch (readiness) {
    case 'PUBLIC_SAFE_READY':
      return {
        isAvailable: true,
        isQuarantined: false,
        isFailed: false,
        isPending: false,
        badgeMessage: 'In-Stream Redaction Verified (0 Secrets Leaked)',
        explanation: 'All telemetry artifacts have been scrubbed and verified safe for developer review.',
      };
    case 'QUARANTINED_LEAK_DETECTED':
      return {
        isAvailable: false,
        isQuarantined: true,
        isFailed: false,
        isPending: false,
        badgeMessage: 'Quarantined (Sensitive Leak Detected)',
        explanation:
          'In-stream inspection detected sensitive credentials. Raw artifacts are isolated in RESTRICTED_RAW storage and withheld from developer exposure (TC-INV-009).',
      };
    case 'STORAGE_SYNC_FAILED':
      return {
        isAvailable: false,
        isQuarantined: false,
        isFailed: true,
        isPending: false,
        badgeMessage: 'Storage Synchronization Failed',
        explanation:
          'Artifact upload to object storage failed or was rolled back. Evidence triad files are unavailable.',
      };
    case 'PENDING_GENERATION':
    case 'PACKAGING_IN_PROGRESS':
    default:
      return {
        isAvailable: false,
        isQuarantined: false,
        isFailed: false,
        isPending: true,
        badgeMessage: 'Evidence Pending Generation',
        explanation:
          'Reproduction has not completed or telemetry artifacts are currently being processed.',
      };
  }
}

/**
 * Constructs a self-contained, sanitized Reproduction Package for developer export.
 * Strictly excludes credentials, reset secrets, and restricted raw artifacts.
 */
export function buildReproductionPackage(params: {
  investigation: InvestigationSnapshot;
  plan?: ExperimentPlan | AuthoritativeExperimentPlan | null;
  manifest?: EvidenceManifest | null;
}): ReproductionPackage {
  const { investigation, plan, manifest } = params;
  const isQuarantined =
    investigation.evidenceReadiness === 'QUARANTINED_LEAK_DETECTED' ||
    manifest?.readinessStatus === 'QUARANTINED_LEAK_DETECTED';

  return {
    traceCasePackageVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    sourceEnvironment: 'development-preview',
    securityNotice: isQuarantined
      ? 'SECURITY NOTICE: Evidence is quarantined due to detected sensitive tokens or credentials (TC-INV-009). Raw restricted media and authorization headers are excluded from this export bundle.'
      : 'Text logs and network traces are scrubbed via in-stream redaction (TC-INV-009). Recorded video displays raw browser viewport pixels. Restricted raw artifacts and credentials are excluded from this package.',
    investigation: {
      id: investigation.id,
      reportId: investigation.reportId,
      title: investigation.title,
      target: {
        id: investigation.targetId,
        name: investigation.targetName,
        baseUrl: sanitizeUrl(investigation.targetUrl),
        isSandbox: investigation.isSandbox,
      },
      lifecycleStatus: investigation.lifecycleStatus,
      reproductionVerdict: investigation.reproductionVerdict,
      evidenceReadiness: investigation.evidenceReadiness,
      tokenCostUsd: investigation.tokenCostUsd,
      createdAt: investigation.createdAt,
      completedAt: investigation.completedAt,
    },
    attempts: {
      attempt1: investigation.attempt1,
      attempt2: investigation.attempt2,
    },
    approvedPlan: {
      version: investigation.planVersion ?? plan?.version ?? null,
      planHash: investigation.planHash ?? plan?.planHash ?? null,
      isApproved: investigation.isApproved,
      approvedBy: investigation.approvedBy,
      approvedAt: investigation.approvedAt,
      targetUrl: plan?.targetUrl ? sanitizeUrl(plan.targetUrl) : undefined,
      steps: plan?.steps?.map((s) => ({
        stepIndex: s.stepIndex,
        semanticAction: s.semanticAction,
        toolKind: s.toolKind,
        selector: s.selector,
        tier: s.tier,
        timeoutMs: s.timeoutMs,
      })),
      expectedCorrectBehavior: plan?.expectedCorrectBehavior,
      reportedFailureSignature: plan?.reportedFailureSignature,
      verificationCriteria: (plan && 'verificationCriteria' in plan)
        ? plan.verificationCriteria
        : (plan && 'assertions' in plan)
        ? (plan.assertions as Array<{ kind?: string; targetRole?: string; predicateId?: string; details?: string; description?: string }>).map(
            (a) => `${a.kind || 'ASSERTION'}: ${a.description || a.targetRole || a.predicateId || a.details || ''}`
          )
        : undefined,
    },
    evidenceManifest: {
      readinessStatus: manifest?.readinessStatus ?? investigation.evidenceReadiness,
      triadComplete: isQuarantined ? false : (manifest?.triadComplete ?? false),
      hasVideo: isQuarantined ? false : (manifest?.hasVideo ?? false),
      hasConsoleLog: manifest?.hasConsoleLog ?? false,
      hasNetworkTrace: manifest?.hasNetworkTrace ?? false,
      secretScrubbingVerified: manifest?.secretScrubbingVerified ?? false,
      artifacts:
        manifest?.artifacts?.map((a) => {
          const isRestricted = a.storageTier === 'RESTRICTED_RAW' || isQuarantined;
          return {
            id: a.id,
            attemptNumber: a.attemptNumber,
            kind: a.kind,
            storageTier: a.storageTier,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            sha256Checksum: a.sha256Checksum,
            redactionApplied: a.redactionApplied,
            // Quarantined or restricted artifacts must NEVER expose a downloadable publicUrl
            publicUrl: isRestricted ? null : a.publicUrl,
            createdAt: a.createdAt,
          };
        }) ?? [],
    },
  };
}

/**
 * Realistic sanitized console logs for Canonical TC1 (Array index offset on active filter deletion).
 */
export const CANONICAL_TC1_CONSOLE_LOGS: ConsoleLogEntry[] = [
  {
    id: 'log-01',
    timestamp: '2026-10-20T08:22:00.120Z',
    level: 'INFO',
    category: 'Playwright',
    message: 'Navigating to target entrypoint: http://localhost:3005/tasks',
  },
  {
    id: 'log-02',
    timestamp: '2026-10-20T08:22:01.045Z',
    level: 'LOG',
    category: 'TargetApp',
    message: 'React 19 root mounted on #root with 4 initial tasks loaded',
  },
  {
    id: 'log-03',
    timestamp: '2026-10-20T08:22:01.350Z',
    level: 'LOG',
    category: 'TargetApp',
    message: 'Loaded task catalog: [task-001, task-002, task-003, task-004]',
  },
  {
    id: 'log-04',
    timestamp: '2026-10-20T08:22:03.210Z',
    level: 'INFO',
    category: 'Playwright',
    message: "Clicking filter element: button[data-testid='filter-active']",
  },
  {
    id: 'log-05',
    timestamp: '2026-10-20T08:22:03.450Z',
    level: 'LOG',
    category: 'TargetApp',
    message: 'Filter updated: ACTIVE. 2 tasks visible in DOM [task-002, task-004]',
  },
  {
    id: 'log-06',
    timestamp: '2026-10-20T08:22:05.100Z',
    level: 'INFO',
    category: 'Playwright',
    message: "Clicking delete element on active task: button[data-testid='delete-task-002']",
  },
  {
    id: 'log-07',
    timestamp: '2026-10-20T08:22:05.320Z',
    level: 'WARN',
    category: 'TargetApp',
    message:
      'Array index offset triggered: handleDeleteIndex(0) removed items[0] ("Setup repository", id: task-001) instead of active item (id: task-002)',
  },
  {
    id: 'log-08',
    timestamp: '2026-10-20T08:22:05.410Z',
    level: 'ERROR',
    category: 'TargetApp',
    message: 'State inconsistency: completed task removed while view was filtered to active items',
  },
  {
    id: 'log-09',
    timestamp: '2026-10-20T08:22:06.010Z',
    level: 'INFO',
    category: 'Verifier',
    message: 'Assertion evaluated: task-001 deleted. Failure signature MATCHED.',
  },
];

/**
 * Realistic sanitized HTTP network trace for Canonical TC1.
 */
export const CANONICAL_TC1_NETWORK_TRACES: NetworkTraceEntry[] = [
  {
    id: 'net-01',
    timestamp: '2026-10-20T08:22:00.500Z',
    method: 'GET',
    url: 'http://localhost:3005/tasks',
    status: 200,
    durationMs: 45,
    mimeType: 'text/html',
    requestHeaders: sanitizeNetworkHeaders({
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (TraceCase-HeadlessChromium)',
    }),
    responseHeaders: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': '1420',
    },
  },
  {
    id: 'net-02',
    timestamp: '2026-10-20T08:22:01.200Z',
    method: 'GET',
    url: 'http://localhost:3005/api/tasks',
    status: 200,
    durationMs: 28,
    mimeType: 'application/json',
    requestHeaders: sanitizeNetworkHeaders({
      Accept: 'application/json',
      Authorization: 'Bearer test-secret-token-should-be-masked',
    }),
    responseHeaders: {
      'Content-Type': 'application/json',
      'X-Total-Count': '4',
    },
    responseBody: {
      tasks: [
        { id: 'task-001', title: 'Setup repository', status: 'completed' },
        { id: 'task-002', title: 'Configure CI pipeline', status: 'active' },
        { id: 'task-003', title: 'Implement auth middleware', status: 'completed' },
        { id: 'task-004', title: 'Dockerize staging target', status: 'active' },
      ],
    },
  },
  {
    id: 'net-03',
    timestamp: '2026-10-20T08:22:05.250Z',
    method: 'DELETE',
    url: 'http://localhost:3005/api/tasks/task-001',
    status: 200,
    durationMs: 35,
    mimeType: 'application/json',
    requestHeaders: sanitizeNetworkHeaders({
      Accept: 'application/json',
      Authorization: 'Bearer test-secret-token-should-be-masked',
    }),
    responseHeaders: {
      'Content-Type': 'application/json',
    },
    responseBody: {
      deletedTaskId: 'task-001',
      success: true,
      message: 'Task successfully removed',
    },
  },
];
