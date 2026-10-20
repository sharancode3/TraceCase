import { z } from 'zod';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { ActionTier } from '@/contracts/status';

export const BrowserActionKindSchema = z.enum([
  'NAVIGATE',
  'CLICK',
  'FILL',
  'SELECT_OPTION',
  'SET_CHECKBOX',
  'PRESS_KEY',
  'HOVER',
  'SCROLL',
  'DOM_INSPECT',
  'READ_TEXT',
  'SCREENSHOT',
]);
export type BrowserActionKind = z.infer<typeof BrowserActionKindSchema>;

export const ActionIntentStatusSchema = z.enum([
  'INTENDED',
  'DISPATCHED',
  'OBSERVED_COMPLETED',
  'REJECTED_PRE_DISPATCH',
  'TIMED_OUT',
  'MUTATION_UNCERTAIN',
  'CRASHED',
]);
export type ActionIntentStatus = z.infer<typeof ActionIntentStatusSchema>;

export interface ExecutionBudgets {
  maxDurationMs: number;
  maxActions: number;
  maxPages: number;
  maxCaptureBytes: number;
  actionTimeoutMs: number;
}

export const DEFAULT_EXECUTION_BUDGETS: ExecutionBudgets = {
  maxDurationMs: 120_000, // 2 minutes max per attempt
  maxActions: 25,
  maxPages: 3,
  maxCaptureBytes: 50 * 1024 * 1024, // 50MB capture cap
  actionTimeoutMs: 15_000, // 15 seconds per action
};

export interface LiveExecutionContext {
  executionRequestId: string;
  investigationId: string;
  attemptNumber: 1 | 2;
  plan: AuthoritativeExperimentPlan;
  planHash: string;
  approvalId: string;
  authorizedActorId: string;
  target: SafeTargetProfile;
  workerInstanceId: string;
  ownershipEpoch: number;
  budgets: ExecutionBudgets;
}

export interface ElementReference {
  elementRef: string;
  pageId: string;
  frameId: string;
  documentGeneration: number;
  tagName: string;
  textSnippet?: string;
  ariaRole?: string;
  selector: string;
  fingerprint: string;
  createdAt: string;
}

export interface BrowserActionCommand {
  stepIndex: number;
  kind: BrowserActionKind;
  tier: ActionTier;
  semanticAction: string;
  url?: string;
  elementRef?: string;
  selector?: string;
  value?: string;
  checked?: boolean;
  key?: string;
  direction?: 'UP' | 'DOWN';
  distancePx?: number;
  timeoutMs?: number;
}

export interface ActionDispatchResult {
  stepIndex: number;
  kind: BrowserActionKind;
  tier: ActionTier;
  status: 'SUCCESS' | 'FAILED' | 'TIMED_OUT' | 'REJECTED';
  durationMs: number;
  mutationUncertainty: 'NONE' | 'DETERMINISTIC_REVERSIBLE' | 'SAFE_SIDE_EFFECT' | 'MUTATION_UNCERTAIN';
  observedUrl: string;
  pageTitle: string;
  errorDetails?: string;
  dispatchedAt: string;
  completedAt: string;
}
