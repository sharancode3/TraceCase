import {
  ReportClarificationAgentPort,
  BrowserInvestigationAgentPort,
  EvidenceReviewAgentPort,
  BrowserWorkerPort,
  TargetResetPort,
  EvidenceStoragePort,
  QueueDispatcherPort,
  unavailableReportClarificationAgent,
  unavailableBrowserInvestigationAgent,
  unavailableEvidenceReviewAgent,
  unavailableBrowserWorker,
  unavailableTargetReset,
  unavailableEvidenceStorage,
  unavailableQueueDispatcher,
} from './ports';
import { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import { TransactionalOutboxDispatcher } from '@/server/queue/outbox-dispatcher';
import { workerHeartbeatService } from '@/server/queue/worker-heartbeat.service';
import { defaultOpenAiClient } from '@/server/ai/openai-client';
import { checkDbConnectivity } from '@/server/db';
import { getServerEnv } from '@/server/config/env';
import {
  IntegratedReportClarificationAgent,
  IntegratedBrowserInvestigationAgent,
  IntegratedEvidenceReviewAgent,
} from '@/server/ai/integrated-adapters';
import { IntegratedEvidenceStorageAdapter } from '@/server/evidence/evidence-storage-adapter';

export interface ServiceContainer {
  clarificationAgent: ReportClarificationAgentPort;
  browserAgent: BrowserInvestigationAgentPort;
  evidenceReviewAgent: EvidenceReviewAgentPort;
  browserWorker: BrowserWorkerPort;
  targetReset: TargetResetPort;
  evidenceStorage: EvidenceStoragePort;
  queueDispatcher: QueueDispatcherPort;
}

export interface ComponentReadiness {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'OFFLINE';
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemReadinessReport {
  timestamp: string;
  overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'NOT_READY';
  mode: 'live' | 'preview_synthetic';
  components: {
    openai: ComponentReadiness;
    browserRuntime: ComponentReadiness;
    database: ComponentReadiness;
    queue: ComponentReadiness;
    worker: ComponentReadiness;
    evidenceStorage: ComponentReadiness;
    localAi?: ComponentReadiness;
  };
}

let activeContainerInstance: ServiceContainer | null = null;

export function createDefaultServiceContainer(): ServiceContainer {
  let browserWorker: BrowserWorkerPort;
  try {
    browserWorker = new PlaywrightBrowserWorker();
  } catch {
    browserWorker = unavailableBrowserWorker;
  }

  let queueDispatcher: QueueDispatcherPort;
  try {
    queueDispatcher = new TransactionalOutboxDispatcher();
  } catch {
    queueDispatcher = unavailableQueueDispatcher;
  }

  let clarificationAgent: ReportClarificationAgentPort;
  try {
    clarificationAgent = new IntegratedReportClarificationAgent();
  } catch {
    clarificationAgent = unavailableReportClarificationAgent;
  }

  let browserAgent: BrowserInvestigationAgentPort;
  try {
    browserAgent = new IntegratedBrowserInvestigationAgent();
  } catch {
    browserAgent = unavailableBrowserInvestigationAgent;
  }

  let evidenceReviewAgent: EvidenceReviewAgentPort;
  try {
    evidenceReviewAgent = new IntegratedEvidenceReviewAgent();
  } catch {
    evidenceReviewAgent = unavailableEvidenceReviewAgent;
  }

  let evidenceStorage: EvidenceStoragePort;
  try {
    evidenceStorage = new IntegratedEvidenceStorageAdapter();
  } catch {
    evidenceStorage = unavailableEvidenceStorage;
  }

  return {
    clarificationAgent,
    browserAgent,
    evidenceReviewAgent,
    browserWorker,
    targetReset: unavailableTargetReset,
    evidenceStorage,
    queueDispatcher,
  };
}

export function getServiceContainer(): ServiceContainer {
  if (!activeContainerInstance) {
    activeContainerInstance = createDefaultServiceContainer();
  }
  return activeContainerInstance;
}

export function setServiceContainerForTesting(container: ServiceContainer | null): void {
  activeContainerInstance = container;
}

/**
 * Probes all system ports and runtime environments to generate a truthful,
 * fact-based readiness report. Does not pretend missing modules are functional.
 */
let cachedOpenAiProbe: {
  status: 'AVAILABLE' | 'UNAVAILABLE';
  details?: string;
  reachability: string;
  timestamp: number;
} | null = null;

let inferenceCapabilityVerified = false;

export function markOpenAiInferenceVerified(): void {
  inferenceCapabilityVerified = true;
}

export function resetOpenAiProbeCacheForTesting(): void {
  cachedOpenAiProbe = null;
  inferenceCapabilityVerified = false;
}

export async function getSystemReadiness(): Promise<SystemReadinessReport> {
  const timestamp = new Date().toISOString();
  let isPreview = false;
  try {
    const env = getServerEnv();
    isPreview = env.DEV_PREVIEW_MODE;
  } catch {
    // Default to false if env parse fails
  }

  // 1. Probe configured AI Providers (OpenAI Luna and Local Ollama)
  const openAiConfigured = defaultOpenAiClient.isConfigured();
  let openAiStatus: ComponentReadiness;

  if (!openAiConfigured) {
    openAiStatus = {
      status: 'UNAVAILABLE',
      details: 'OPENAI_API_KEY environment variable is not configured.',
    };
  } else {
    // Distinguish configured from verified reachable via lightweight, non-generating cached probe (zero generation tokens)
    const now = Date.now();
    if (cachedOpenAiProbe && now - cachedOpenAiProbe.timestamp < 60_000) {
      openAiStatus = {
        status: cachedOpenAiProbe.status,
        details: cachedOpenAiProbe.details,
        metadata: {
          provider: 'openai_luna',
          model: 'gpt-6-luna',
          role: 'ADVISOR_ONLY',
          reachability: cachedOpenAiProbe.reachability,
          inferenceCapability: inferenceCapabilityVerified ? 'verified_active' : 'untested',
        },
      };
    } else {
      try {
        const env = getServerEnv();
        const probeRes = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, '')}/models/${env.OPENAI_MODEL_ID}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          signal: AbortSignal.timeout(3000),
        });

        if (probeRes.ok) {
          cachedOpenAiProbe = {
            status: 'AVAILABLE',
            reachability: 'verified_reachable',
            timestamp: now,
          };
          openAiStatus = {
            status: 'AVAILABLE',
            metadata: {
              provider: 'openai_luna',
              model: 'gpt-6-luna',
              role: 'ADVISOR_ONLY',
              reachability: 'verified_reachable',
              inferenceCapability: inferenceCapabilityVerified ? 'verified_active' : 'untested',
            },
          };
        } else if (probeRes.status === 401) {
          cachedOpenAiProbe = {
            status: 'UNAVAILABLE',
            details: 'OpenAI API key authentication failed (HTTP 401).',
            reachability: 'unauthorized',
            timestamp: now,
          };
          openAiStatus = {
            status: 'UNAVAILABLE',
            details: 'OpenAI API key authentication failed (HTTP 401). Check OPENAI_API_KEY in .env.local.',
          };
        } else {
          cachedOpenAiProbe = {
            status: 'UNAVAILABLE',
            details: `OpenAI model probe returned HTTP ${probeRes.status}.`,
            reachability: 'permission_denied_or_missing',
            timestamp: now,
          };
          openAiStatus = {
            status: 'UNAVAILABLE',
            details: `OpenAI model probe returned HTTP ${probeRes.status}.`,
          };
        }
      } catch (probeErr: unknown) {
        // Fall back to configured but mark unreachable
        openAiStatus = {
          status: 'UNAVAILABLE',
          details: `OpenAI endpoint unreachable: ${probeErr instanceof Error ? probeErr.message : String(probeErr)}`,
          metadata: {
            provider: 'openai_luna',
            model: 'gpt-6-luna',
            role: 'ADVISOR_ONLY',
            reachability: 'unreachable',
            inferenceCapability: 'untested',
          },
        };
      }
    }
  }

  let localAiStatus: ComponentReadiness | undefined;
  let localAiAvailable = false;
  try {
    const env = getServerEnv();
    if (env.AI_PROVIDER === 'local_ollama' || env.ENABLE_DEV_AUTH) {
      try {
        const probeRes = await fetch(`${env.LOCAL_AI_ENDPOINT.replace(/\/$/, '')}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
        if (probeRes.ok) {
          const tagsData = (await probeRes.json()) as { models?: Array<{ name?: string; model?: string }> };
          const hasModel = tagsData.models?.some((m) => m.name === env.LOCAL_AI_MODEL || m.model === env.LOCAL_AI_MODEL);
          if (hasModel) {
            localAiAvailable = true;
            localAiStatus = {
              status: 'AVAILABLE',
              metadata: {
                provider: 'local_ollama',
                model: env.LOCAL_AI_MODEL,
                endpoint: env.LOCAL_AI_ENDPOINT,
                inferenceCostUsd: '0.0000',
              },
            };
          } else {
            localAiStatus = {
              status: 'UNAVAILABLE',
              details: `Ollama is running but model '${env.LOCAL_AI_MODEL}' was not found.`,
            };
          }
        } else {
          localAiStatus = {
            status: 'UNAVAILABLE',
            details: `Local Ollama endpoint returned HTTP ${probeRes.status}.`,
          };
        }
      } catch (err: unknown) {
        localAiStatus = {
          status: 'UNAVAILABLE',
          details: `Local Ollama at ${env.LOCAL_AI_ENDPOINT} is unreachable: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  } catch {
    // env parse failed
  }

  let aiAvailable = false;
  try {
    const env = getServerEnv();
    aiAvailable = env.AI_PROVIDER === 'local_ollama' ? localAiAvailable : openAiConfigured;
  } catch {
    aiAvailable = openAiConfigured || localAiAvailable;
  }

  // 2. Probe Browser Automation Runtime (Playwright Chromium)
  const container = getServiceContainer();
  const browserAvailable = container.browserWorker !== unavailableBrowserWorker;
  const browserStatus: ComponentReadiness = browserAvailable
    ? {
        status: 'AVAILABLE',
        metadata: { engine: 'Chromium', headless: true, isolatedPerAttempt: true },
      }
    : {
        status: 'UNAVAILABLE',
        details: 'Playwright browser worker is not initialized.',
      };

  // 3. Probe Database Connectivity
  const dbConnected = await checkDbConnectivity();
  const dbStatus: ComponentReadiness = dbConnected
    ? {
        status: 'AVAILABLE',
        metadata: { engine: 'PostgreSQL', orm: 'Drizzle' },
      }
    : {
        status: 'OFFLINE',
        details: 'PostgreSQL connection could not be established.',
      };

  // 4. Probe Queue Dispatcher
  const queueAvailable = container.queueDispatcher !== unavailableQueueDispatcher;
  const queueStatus: ComponentReadiness = queueAvailable
    ? {
        status: 'AVAILABLE',
        metadata: { mechanism: 'TransactionalOutbox_pg-boss' },
      }
    : {
        status: 'UNAVAILABLE',
        details: 'Queue dispatcher is unconfigured.',
      };

  // 5. Probe Persistent Background Worker Daemon Liveness
  let workerStatus: ComponentReadiness;
  try {
    const workerProbe = await workerHeartbeatService.isAnyWorkerActive(60_000);
    workerStatus = workerProbe.active
      ? {
          status: 'AVAILABLE',
          metadata: {
            activeWorkers: workerProbe.activeWorkerCount,
            drainingWorkers: workerProbe.drainingWorkerCount,
            heartbeatAgeMs: workerProbe.freshestHeartbeatAgeMs,
          },
        }
      : {
          status: 'UNAVAILABLE',
          details: 'No active worker daemon reported a recent heartbeat (within 60s).',
        };
  } catch {
    workerStatus = {
      status: 'UNAVAILABLE',
      details: 'Unable to query worker heartbeat state.',
    };
  }

  // 6. Probe Evidence Storage & Sanitization (Person 3 Port)
  const storageAvailable = container.evidenceStorage !== unavailableEvidenceStorage;
  const storageStatus: ComponentReadiness = storageAvailable
    ? {
        status: 'AVAILABLE',
        metadata: { dualTierReady: true, owner: 'Person 3' },
      }
    : {
        status: 'UNAVAILABLE',
        details: 'Person 3 evidence sanitization and storage service is scheduled for Stage 6.',
      };

  // Determine overall system operational status
  let overallStatus: SystemReadinessReport['overallStatus'] = 'OPERATIONAL';
  if (!dbConnected) {
    overallStatus = 'NOT_READY';
  } else if (!aiAvailable || !storageAvailable || !browserAvailable || workerStatus.status !== 'AVAILABLE') {
    overallStatus = 'DEGRADED';
  }

  return {
    timestamp,
    overallStatus,
    mode: isPreview ? 'preview_synthetic' : 'live',
    components: {
      openai: openAiStatus,
      localAi: localAiStatus,
      browserRuntime: browserStatus,
      database: dbStatus,
      queue: queueStatus,
      worker: workerStatus,
      evidenceStorage: storageStatus,
    },
  };
}
