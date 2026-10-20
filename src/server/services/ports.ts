import type { ExperimentPlan } from '@/contracts/planning';
import type { TargetProfile } from '@/contracts/targets';
import type { EvidenceManifest } from '@/contracts/evidence';
import { createSafeError, type SafeErrorEnvelope } from '@/contracts/errors';

export class ServiceUnavailableError extends Error {
  public readonly envelope: SafeErrorEnvelope;
  constructor(serviceName: string, reason: string = 'Service integration not implemented in Stage 0 foundation.') {
    super(`[TraceCase] Service '${serviceName}' unavailable: ${reason}`);
    this.name = 'ServiceUnavailableError';
    this.envelope = createSafeError('SERVICE_NOT_CONFIGURED', 'SERVICE_UNAVAILABLE', this.message, { serviceName });
  }
}

/**
 * Port 1: AI Model Adapter (GPT-6 Luna Integration)
 * Side-effect: Read-only external API invocation (consumes token quota).
 */
export interface AiPlannerPort {
  generateExperimentPlan(params: {
    target: TargetProfile;
    bugTitle: string;
    description: string;
    expected: string;
    observed: string;
  }): Promise<ExperimentPlan>;
}

export const unavailableAiPlanner: AiPlannerPort = {
  async generateExperimentPlan(): Promise<ExperimentPlan> {
    throw new ServiceUnavailableError('AiPlannerPort', 'GPT-6 Luna client integration is scheduled for Stage 3.');
  },
};

/**
 * Port 2: Browser Execution Worker Port (Playwright Automation)
 * Side-effect: Outbound HTTP/CDP network mutation on target sandbox.
 */
export interface BrowserWorkerPort {
  executeAttempt(params: {
    investigationId: string;
    attemptNumber: 1 | 2;
    plan: ExperimentPlan;
    target: TargetProfile;
  }): Promise<{ attemptId: string; defectDetected: boolean; logCount: number }>;
}

export const unavailableBrowserWorker: BrowserWorkerPort = {
  async executeAttempt() {
    throw new ServiceUnavailableError('BrowserWorkerPort', 'Playwright worker execution is scheduled for Stage 2.');
  },
};

/**
 * Port 3: Target Environment Management & Reset Port
 * Side-effect: Invokes target reset fixture endpoint (mutates target sandbox database).
 */
export interface TargetResetPort {
  triggerFixtureReset(params: {
    target: TargetProfile;
    secret: string;
  }): Promise<{ success: boolean; itemsRestored?: number; timestamp: string }>;
}

export const unavailableTargetReset: TargetResetPort = {
  async triggerFixtureReset() {
    throw new ServiceUnavailableError('TargetResetPort', 'Target reset hook execution is scheduled for Stage 5.');
  },
};

/**
 * Port 4: Object Storage & Evidence Port (MinIO / S3)
 * Side-effect: Encrypted file upload to public/restricted S3 buckets.
 */
export interface EvidenceStoragePort {
  publishEvidenceTriad(params: {
    investigationId: string;
    videoBuffer: Buffer;
    consoleLog: string;
    networkHar: string;
  }): Promise<EvidenceManifest>;
}

export const unavailableEvidenceStorage: EvidenceStoragePort = {
  async publishEvidenceTriad() {
    throw new ServiceUnavailableError('EvidenceStoragePort', 'Dual-bucket S3 storage pipeline is scheduled for Stage 6.');
  },
};

/**
 * Port 5: Queue Admission & Dispatcher Port (pg-boss)
 * Side-effect: Enqueues background reproduction job in PostgreSQL.
 */
export interface QueueDispatcherPort {
  enqueueInvestigation(params: {
    investigationId: string;
    priority?: number;
  }): Promise<{ jobId: string; queuedAt: string }>;
}

export const unavailableQueueDispatcher: QueueDispatcherPort = {
  async enqueueInvestigation() {
    throw new ServiceUnavailableError('QueueDispatcherPort', 'pg-boss job queue scheduling is scheduled for Stage 4.');
  },
};
