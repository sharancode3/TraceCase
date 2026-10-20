export const QUEUE_INVESTIGATION_EXECUTION = 'investigation-execution';
export const QUEUE_SYSTEM_DIAGNOSTIC = 'system-diagnostic';

export interface InvestigationExecutionJobData {
  executionRequestId: string;
  investigationId: string;
  planVersion: number;
  planHash: string;
  requestedBy?: string;
}

export interface DiagnosticJobData {
  diagnosticId: string;
  submittedAt: string;
  requestedBy?: string;
}

export interface QueueJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  singletonKey?: string;
}

export interface QueueSendOptions {
  singletonKey?: string;
  retryLimit?: number;
  expireInSeconds?: number;
}

export interface QueueAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  send<T>(name: string, data: T, options?: QueueSendOptions): Promise<string | null>;
  work<T>(name: string, handler: (job: QueueJob<T>) => Promise<void>): Promise<void>;
  isHealthy(): boolean;
}
