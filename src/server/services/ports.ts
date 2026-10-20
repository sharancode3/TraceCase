import type { ExperimentPlan, AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { SafeTargetProfile, SafeModelTargetContext } from '@/contracts/targets';
import type { DraftReportIntake, ClarifiedReportContext } from '@/contracts/reports';
import type { ReportPlannerOutput, BrowserActionProposal, EvidenceExplanationProposal } from '@/contracts/ai';
import type { SanitizedBrowserObservation, AttemptExecutionReceipt, VerificationAssertionResult } from '@/contracts/observations';
import type { ResetTransportResponse } from '@/contracts/reset';
import type {
  CaptureRegistrationCommand,
  FinalizedCaptureReference,
  ArtifactProcessingResult,
  ArtifactAccessGrant,
} from '@/contracts/evidence';
import { createSafeError, type SafeErrorEnvelope } from '@/contracts/errors';

export class ServiceUnavailableError extends Error {
  public readonly envelope: SafeErrorEnvelope;
  constructor(serviceName: string, reason: string = 'Service integration not implemented in this phase.') {
    super(`[TraceCase] Service '${serviceName}' unavailable: ${reason}`);
    this.name = 'ServiceUnavailableError';
    this.envelope = createSafeError('SERVICE_NOT_CONFIGURED', 'SERVICE_UNAVAILABLE', this.message, { serviceName });
  }
}

/* -------------------------------------------------------------------------- */
/* AI Role Ports (GPT-6 Luna Integration)                                     */
/* -------------------------------------------------------------------------- */

/**
 * AI Role 1: Report Normalization & Experiment Proposal Port
 */
export interface ReportClarificationAgentPort {
  generateProposal(params: {
    report: DraftReportIntake | ClarifiedReportContext;
    target: SafeModelTargetContext;
  }): Promise<ReportPlannerOutput>;
}

export const unavailableReportClarificationAgent: ReportClarificationAgentPort = {
  async generateProposal(): Promise<ReportPlannerOutput> {
    throw new ServiceUnavailableError('ReportClarificationAgentPort', 'GPT-6 Luna Role 1 integration is scheduled for Stage 3.');
  },
};

/**
 * AI Role 2: Browser Investigation Agent Port
 * Proposes the next scoped action given fresh sanitized observations.
 * CANNOT return a final reproduction verdict.
 */
export interface BrowserInvestigationAgentPort {
  proposeNextAction(params: {
    investigationId: string;
    approvedIntent: string;
    currentObservation: SanitizedBrowserObservation;
    remainingAllowedTiers: string[];
  }): Promise<BrowserActionProposal>;
}

export const unavailableBrowserInvestigationAgent: BrowserInvestigationAgentPort = {
  async proposeNextAction(): Promise<BrowserActionProposal> {
    throw new ServiceUnavailableError('BrowserInvestigationAgentPort', 'GPT-6 Luna Role 2 integration is scheduled for Stage 3.');
  },
};

/**
 * AI Role 3: Evidence Review Agent Port
 * Explains locked verification facts and sanitized evidence.
 * CANNOT modify verification findings or storage tiers.
 */
export interface EvidenceReviewAgentPort {
  synthesizeExplanation(params: {
    investigationId: string;
    lockedVerdict: string;
    verifiedAssertions: VerificationAssertionResult[];
    eligibleEvidence: FinalizedCaptureReference[];
  }): Promise<EvidenceExplanationProposal>;
}

export const unavailableEvidenceReviewAgent: EvidenceReviewAgentPort = {
  async synthesizeExplanation(): Promise<EvidenceExplanationProposal> {
    throw new ServiceUnavailableError('EvidenceReviewAgentPort', 'GPT-6 Luna Role 3 integration is scheduled for Stage 3.');
  },
};

// Legacy planner port alias for backward compatibility
export interface AiPlannerPort extends ReportClarificationAgentPort {
  generateExperimentPlan(params: {
    target: unknown;
    bugTitle: string;
    description: string;
    expected: string;
    observed: string;
  }): Promise<ExperimentPlan>;
}

export const unavailableAiPlanner: AiPlannerPort = {
  async generateProposal(): Promise<ReportPlannerOutput> {
    throw new ServiceUnavailableError('ReportClarificationAgentPort', 'GPT-6 Luna Role 1 integration is scheduled for Stage 3.');
  },
  async generateExperimentPlan(): Promise<ExperimentPlan> {
    throw new ServiceUnavailableError('AiPlannerPort', 'GPT-6 Luna client integration is scheduled for Stage 3.');
  },
};

/* -------------------------------------------------------------------------- */
/* Browser Execution Worker Port                                              */
/* -------------------------------------------------------------------------- */

/**
 * Browser Execution Worker Port (Playwright Automation)
 * Returns execution facts and capture receipts. DOES NOT judge final defect verdict.
 */
export interface BrowserWorkerPort {
  executeAttempt(params: {
    investigationId: string;
    attemptNumber: 1 | 2;
    plan: AuthoritativeExperimentPlan | ExperimentPlan;
    target: SafeTargetProfile;
    onHeartbeat?: () => Promise<void>;
  }): Promise<AttemptExecutionReceipt>;
}

export const unavailableBrowserWorker: BrowserWorkerPort = {
  async executeAttempt(): Promise<AttemptExecutionReceipt> {
    throw new ServiceUnavailableError('BrowserWorkerPort', 'Playwright worker execution is scheduled for Stage 2.');
  },
};

/* -------------------------------------------------------------------------- */
/* Target Environment Management & Reset Port                                 */
/* -------------------------------------------------------------------------- */

export interface TargetResetPort {
  triggerFixtureReset(params: {
    targetId: string;
    resetEndpoint: string;
    resetAuthSecret: string;
    fixtureScope: string;
  }): Promise<ResetTransportResponse>;
}

export const unavailableTargetReset: TargetResetPort = {
  async triggerFixtureReset(): Promise<ResetTransportResponse> {
    throw new ServiceUnavailableError('TargetResetPort', 'Target reset hook execution is scheduled for Stage 5.');
  },
};

/* -------------------------------------------------------------------------- */
/* Object Storage & Evidence Pipeline Port (Owned by Person 3)                */
/* -------------------------------------------------------------------------- */

export interface EvidenceStoragePort {
  registerCapture(command: CaptureRegistrationCommand): Promise<FinalizedCaptureReference>;
  processArtifacts(params: {
    investigationId: string;
    captureRefs: FinalizedCaptureReference[];
  }): Promise<ArtifactProcessingResult[]>;
  createAccessGrant(params: {
    artifactId: string;
    userId: string;
    tier: string;
  }): Promise<ArtifactAccessGrant>;
}

export const unavailableEvidenceStorage: EvidenceStoragePort = {
  async registerCapture(): Promise<FinalizedCaptureReference> {
    throw new ServiceUnavailableError('EvidenceStoragePort', 'Artifact capture registration is scheduled for Stage 6.');
  },
  async processArtifacts(): Promise<ArtifactProcessingResult[]> {
    throw new ServiceUnavailableError('EvidenceStoragePort', 'Sanitization and dual-bucket storage is scheduled for Stage 6.');
  },
  async createAccessGrant(): Promise<ArtifactAccessGrant> {
    throw new ServiceUnavailableError('EvidenceStoragePort', 'Signed artifact access grant is scheduled for Stage 6.');
  },
};

/* -------------------------------------------------------------------------- */
/* Queue Admission & Dispatcher Port (pg-boss)                                */
/* -------------------------------------------------------------------------- */

export interface QueueDispatcherPort {
  enqueueInvestigation(params: {
    investigationId: string;
    planVersion: number;
    priority?: number;
  }): Promise<{ jobId: string; queuedAt: string }>;
}

export const unavailableQueueDispatcher: QueueDispatcherPort = {
  async enqueueInvestigation(): Promise<{ jobId: string; queuedAt: string }> {
    throw new ServiceUnavailableError('QueueDispatcherPort', 'pg-boss job queue scheduling is scheduled for Stage 4.');
  },
};
