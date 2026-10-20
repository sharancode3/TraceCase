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

  return {
    clarificationAgent: unavailableReportClarificationAgent,
    browserAgent: unavailableBrowserInvestigationAgent,
    evidenceReviewAgent: unavailableEvidenceReviewAgent,
    browserWorker,
    targetReset: unavailableTargetReset,
    evidenceStorage: unavailableEvidenceStorage,
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
export async function getSystemReadiness(): Promise<SystemReadinessReport> {
  const timestamp = new Date().toISOString();
  let isPreview = false;
  try {
    const env = getServerEnv();
    isPreview = env.DEV_PREVIEW_MODE;
  } catch {
    // Default to false if env parse fails
  }

  // 1. Probe OpenAI (GPT-6 Luna)
  const openAiConfigured = defaultOpenAiClient.isConfigured();
  const openAiStatus: ComponentReadiness = openAiConfigured
    ? {
        status: 'AVAILABLE',
        metadata: { model: 'gpt-6-luna', role: 'ADVISOR_ONLY' },
      }
    : {
        status: 'UNAVAILABLE',
        details: 'OPENAI_API_KEY environment variable is not configured.',
      };

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
  } else if (!openAiConfigured || !storageAvailable || !browserAvailable || workerStatus.status !== 'AVAILABLE') {
    overallStatus = 'DEGRADED';
  }

  return {
    timestamp,
    overallStatus,
    mode: isPreview ? 'preview_synthetic' : 'live',
    components: {
      openai: openAiStatus,
      browserRuntime: browserStatus,
      database: dbStatus,
      queue: queueStatus,
      worker: workerStatus,
      evidenceStorage: storageStatus,
    },
  };
}
