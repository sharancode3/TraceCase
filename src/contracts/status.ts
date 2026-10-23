import { z } from 'zod';

/**
 * Dimension 1: Investigation Execution Lifecycle State
 * Represents the current operational step of the workflow orchestrator.
 */
export const InvestigationLifecycleStatusSchema = z.enum([
  'DRAFT',
  'PLANNING',
  'AWAITING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'RUNNING_ATTEMPT_1',
  'RESETTING_TARGET',
  'RUNNING_ATTEMPT_2',
  'FINALIZING_EVIDENCE',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type InvestigationLifecycleStatus = z.infer<typeof InvestigationLifecycleStatusSchema>;

/**
 * Dimension 2: Reproduction Finding / Verdict
 * Represents the scientific outcome of the two-run reproduction comparison.
 * Must NEVER be conflated with execution state (TC-INV-007).
 */
export const ReproductionVerdictSchema = z.enum([
  'PENDING',
  'CONFIRMED_REPRODUCED',
  'NOT_REPRODUCED',
  'INCONSISTENT_OBSERVATIONS',
  'INCONCLUSIVE',
]);
export type ReproductionVerdict = z.infer<typeof ReproductionVerdictSchema>;

/**
 * Dimension 3: Evidence Readiness & Sanitization State
 * Represents the availability and quarantine status of the Evidence Triad.
 */
export const EvidenceReadinessStatusSchema = z.enum([
  'PENDING_GENERATION',
  'PACKAGING_IN_PROGRESS',
  'PUBLIC_SAFE_READY',
  'QUARANTINED_LEAK_DETECTED',
  'STORAGE_SYNC_FAILED',
]);
export type EvidenceReadinessStatus = z.infer<typeof EvidenceReadinessStatusSchema>;

/**
 * Execution Attempt Validity
 * Characterizes an individual browser run (Run 1 or Run 2).
 */
export const AttemptValiditySchema = z.enum([
  'PENDING',
  'VALID_DEFECT_DETECTED',
  'VALID_CLEAN_RUN',
  'INVALID_TIMEOUT',
  'INVALID_CRASH',
  'INVALID_BLOCKED',
]);
export type AttemptValidity = z.infer<typeof AttemptValiditySchema>;

/**
 * Safety Action Tier
 * Governs permission boundaries for browser automation tools.
 */
export const ActionTierSchema = z.enum([
  'TIER_1_READ_ONLY',
  'TIER_2_SAFE_INTERACTION',
  'TIER_3_MUTATING_INTERACTION',
  'TIER_4_DESTRUCTIVE',
]);
export type ActionTier = z.infer<typeof ActionTierSchema>;

/**
 * Mutation Uncertainty Status (TC-INV-013)
 */
export const MutationUncertaintySchema = z.enum([
  'NONE',
  'MUTATION_CONFIRMED',
  'MUTATION_UNCERTAIN',
]);
export type MutationUncertainty = z.infer<typeof MutationUncertaintySchema>;

// Presentation Mapping Helpers

export interface StatusPresentation {
  label: string;
  description: string;
  badgeClass: string;
}

export function getLifecyclePresentation(status: InvestigationLifecycleStatus): StatusPresentation {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', description: 'Intake draft initialized', badgeClass: 'bg-neutral-surface text-brand-navy border-neutral-divider' };
    case 'PLANNING':
      return { label: 'Planning', description: 'Generating structured experiment plan', badgeClass: 'bg-lavender-surface text-cobalt-action border-lavender-accent' };
    case 'AWAITING_APPROVAL':
      return { label: 'Awaiting Approval', description: 'Plan requires human operator sign-off', badgeClass: 'bg-status-pendingBg text-status-pending border-amber-300' };
    case 'APPROVED':
      return { label: 'Approved', description: 'Plan cryptographically approved for execution', badgeClass: 'bg-lavender-surface text-cobalt-action border-cobalt-action' };
    case 'QUEUED':
      return { label: 'Queued', description: 'Waiting for worker process lease', badgeClass: 'bg-lavender-surface text-brand-deepPurple border-lavender-accent' };
    case 'RUNNING_ATTEMPT_1':
      return { label: 'Attempt 1 Running', description: 'Executing initial browser reproduction run', badgeClass: 'bg-cobalt-subtle text-cobalt-action border-cobalt-action animate-pulse' };
    case 'RESETTING_TARGET':
      return { label: 'Resetting Target', description: 'Restoring target fixture baseline via reset hook', badgeClass: 'bg-lavender-surface text-brand-deepPurple border-lavender-accent' };
    case 'RUNNING_ATTEMPT_2':
      return { label: 'Attempt 2 Running', description: 'Executing confirmation run under fresh context', badgeClass: 'bg-cobalt-subtle text-cobalt-action border-cobalt-action animate-pulse' };
    case 'FINALIZING_EVIDENCE':
      return { label: 'Finalizing Evidence', description: 'Scrubbing secrets and packaging evidence triad', badgeClass: 'bg-lavender-surface text-brand-deepPurple border-lavender-accent' };
    case 'COMPLETED':
      return { label: 'Completed', description: 'Investigation run completed', badgeClass: 'bg-neutral-surface text-brand-navy border-neutral-divider' };
    case 'FAILED':
      return { label: 'Execution Failed', description: 'Fatal runner or environment error', badgeClass: 'bg-status-confirmedBg text-status-confirmed border-red-300' };
    case 'CANCELLED':
      return { label: 'Cancelled', description: 'Aborted by human operator', badgeClass: 'bg-neutral-surface text-brand-muted border-neutral-divider' };
  }
}

export function getVerdictPresentation(verdict: ReproductionVerdict): StatusPresentation {
  switch (verdict) {
    case 'PENDING':
      return { label: 'Verdict Pending', description: 'Awaiting completion of both runs', badgeClass: 'bg-neutral-surface text-brand-muted border-neutral-divider' };
    case 'CONFIRMED_REPRODUCED':
      return { label: 'Confirmed Reproduced', description: 'Defect signature confirmed on two consecutive runs', badgeClass: 'bg-status-confirmedBg text-status-confirmed border-red-300 font-semibold' };
    case 'NOT_REPRODUCED':
      return { label: 'Not Reproduced (Clean)', description: 'Target application executed without defect; baseline preserved', badgeClass: 'bg-status-notReproducedBg text-status-notReproduced border-emerald-300 font-semibold' };
    case 'INCONSISTENT_OBSERVATIONS':
      return { label: 'Inconsistent Runs', description: 'Observations between Run 1 and Run 2 differed (potential flakiness)', badgeClass: 'bg-status-pendingBg text-status-pending border-amber-300 font-semibold' };
    case 'INCONCLUSIVE':
      return { label: 'Inconclusive', description: 'Execution blocked by policy or environmental failure', badgeClass: 'bg-status-inconclusiveBg text-status-inconclusive border-gray-300' };
  }
}

export function getEvidencePresentation(status: EvidenceReadinessStatus): StatusPresentation {
  switch (status) {
    case 'PENDING_GENERATION':
      return { label: 'Evidence Pending', description: 'Artifacts not yet captured', badgeClass: 'bg-neutral-surface text-brand-muted border-neutral-divider' };
    case 'PACKAGING_IN_PROGRESS':
      return { label: 'Evidence Review Pending', description: 'Some artifacts are still processing or awaiting sharing clearance', badgeClass: 'bg-lavender-surface text-cobalt-action border-lavender-accent' };
    case 'PUBLIC_SAFE_READY':
      return { label: 'Public Safe Evidence Ready', description: 'Sanitized video, console, and network logs ready for download', badgeClass: 'bg-status-notReproducedBg text-status-notReproduced border-emerald-300' };
    case 'QUARANTINED_LEAK_DETECTED':
      return { label: 'Quarantined (Leak Detected)', description: 'Sensitive raw tokens detected; quarantined for security review', badgeClass: 'bg-status-confirmedBg text-status-confirmed border-red-400 font-bold' };
    case 'STORAGE_SYNC_FAILED':
      return { label: 'Storage Sync Failed', description: 'Failed to upload artifacts to object storage', badgeClass: 'bg-status-confirmedBg text-status-confirmed border-red-300' };
  }
}

/**
 * Checks whether an investigation's reproduction verdict is confirmed reproduced.
 * Enforces TC-INV-007: Lifecycle completion ("COMPLETED") must NEVER be equated with "CONFIRMED_REPRODUCED".
 */
export function isReproductionConfirmed(verdict?: ReproductionVerdict | string | null): boolean {
  return verdict === 'CONFIRMED_REPRODUCED';
}

export interface NextPermittedAction {
  actionKind:
    | 'GENERATE_PLAN'
    | 'CLARIFY_DETAILS'
    | 'REVIEW_AND_APPROVE'
    | 'START_EXECUTION'
    | 'MONITOR_RUN'
    | 'AWAIT_EVIDENCE'
    | 'INSPECT_RESULTS'
    | 'REVISE_OR_RETRY';
  label: string;
  description: string;
  href?: string;
  isActionable: boolean;
  badgeClass: string;
}

/**
 * Computes the truthful, contract-driven next permitted action across any investigation state.
 */
export function getNextPermittedAction(params: {
  id: string;
  lifecycleStatus: InvestigationLifecycleStatus;
  reviewStatus?: string | null;
  reproductionVerdict?: ReproductionVerdict;
  evidenceReadiness?: EvidenceReadinessStatus;
  planVersion?: number | null;
  isApproved?: boolean;
}): NextPermittedAction {
  const { id, lifecycleStatus, reviewStatus, reproductionVerdict, evidenceReadiness, isApproved } = params;

  // 1. Terminal / Completed States
  if (lifecycleStatus === 'COMPLETED') {
    if (evidenceReadiness === 'PACKAGING_IN_PROGRESS' || evidenceReadiness === 'PENDING_GENERATION') {
      return {
        actionKind: 'AWAIT_EVIDENCE',
        label: 'Packaging Evidence',
        description: 'Investigation run completed; artifacts packaging in progress',
        href: `/investigations/${id}`,
        isActionable: false,
        badgeClass: 'bg-lavender-surface text-cobalt-action border-lavender-accent',
      };
    }
    if (reproductionVerdict === 'INCONCLUSIVE') {
      return {
        actionKind: 'INSPECT_RESULTS',
        label: 'Inspect Inconclusive Run',
        description: 'Execution completed with inconclusive verdict; inspect attempt logs and decide if target or report need revision',
        href: `/investigations/${id}`,
        isActionable: true,
        badgeClass: 'bg-amber-soft text-amber-contrast border-amber-soft',
      };
    }
    if (reproductionVerdict === 'CONFIRMED_REPRODUCED') {
      return {
        actionKind: 'INSPECT_RESULTS',
        label: 'Inspect Confirmed Evidence',
        description: 'Defect confirmed reproduced across attempts; review packaged evidence bundle',
        href: `/investigations/${id}`,
        isActionable: true,
        badgeClass: 'bg-emerald-soft text-emerald-contrast border-emerald-soft',
      };
    }
    return {
      actionKind: 'INSPECT_RESULTS',
      label: 'Inspect Results',
      description: 'Review two-attempt verdict, assertion outcomes, and evidence bundle',
      href: `/investigations/${id}`,
      isActionable: true,
      badgeClass: 'bg-neutral-surface text-brand-navy border-neutral-divider',
    };
  }

  if (lifecycleStatus === 'FAILED' || lifecycleStatus === 'CANCELLED') {
    return {
      actionKind: 'INSPECT_RESULTS',
      label: lifecycleStatus === 'CANCELLED' ? 'Cancelled — View Details' : 'Failed — View Diagnostics',
      description: lifecycleStatus === 'CANCELLED' ? 'Investigation cancelled by operator' : 'Execution halted due to runner or policy failure',
      href: `/investigations/${id}`,
      isActionable: true,
      badgeClass: 'bg-neutral-surface text-brand-muted border-neutral-divider',
    };
  }

  // 2. Running States
  if (
    lifecycleStatus === 'QUEUED' ||
    lifecycleStatus === 'RUNNING_ATTEMPT_1' ||
    lifecycleStatus === 'RESETTING_TARGET' ||
    lifecycleStatus === 'RUNNING_ATTEMPT_2' ||
    lifecycleStatus === 'FINALIZING_EVIDENCE'
  ) {
    return {
      actionKind: 'MONITOR_RUN',
      label: 'Monitor Execution',
      description: 'Browser worker is executing reproduction runs in container sandbox',
      href: `/investigations/${id}/live`,
      isActionable: true,
      badgeClass: 'bg-cobalt-subtle text-cobalt-action border-cobalt-action animate-pulse',
    };
  }

  // 3. Approved State -> Ready for Start
  if (
    lifecycleStatus === 'APPROVED' ||
    (reviewStatus === 'APPROVED' && (lifecycleStatus === 'DRAFT' || lifecycleStatus === 'AWAITING_APPROVAL')) ||
    (isApproved && (lifecycleStatus === 'DRAFT' || lifecycleStatus === 'AWAITING_APPROVAL'))
  ) {
    return {
      actionKind: 'START_EXECUTION',
      label: 'Start Execution',
      description: 'Plan approved; click to admit investigation to worker execution queue',
      href: `/investigations/${id}/approve`,
      isActionable: true,
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold',
    };
  }

  // 4. Planning in Progress
  if (lifecycleStatus === 'PLANNING') {
    return {
      actionKind: 'GENERATE_PLAN',
      label: 'Planning in Progress',
      description: 'Synthesizing structured experiment plan via Luna',
      href: `/investigations/${id}`,
      isActionable: false,
      badgeClass: 'bg-lavender-surface text-cobalt-action border-lavender-accent',
    };
  }

  // 5. Review Status Overrides for Draft / Awaiting Approval
  if (reviewStatus === 'CLARIFICATION_PENDING') {
    return {
      actionKind: 'CLARIFY_DETAILS',
      label: 'Clarify Details',
      description: 'Answer grounded questions to resolve missing report preconditions',
      href: `/investigations/${id}/clarify`,
      isActionable: true,
      badgeClass: 'bg-lavender-subtle text-cobalt-action border-cobalt-action font-semibold',
    };
  }

  if (reviewStatus === 'REJECTED') {
    return {
      actionKind: 'REVISE_OR_RETRY',
      label: 'Plan Rejected',
      description: 'Operator rejected previous plan revision; edit details or replan',
      href: `/investigations/${id}/approve`,
      isActionable: true,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    };
  }

  if (reviewStatus === 'REVOKED') {
    return {
      actionKind: 'REVIEW_AND_APPROVE',
      label: 'Re-authorize Plan',
      description: 'Previous approval was revoked; re-authorization required before execution',
      href: `/investigations/${id}/approve`,
      isActionable: true,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 font-semibold',
    };
  }

  if (reviewStatus === 'BLOCKED') {
    return {
      actionKind: 'REVISE_OR_RETRY',
      label: 'Planning Blocked',
      description: 'Clarification limit reached or preconditions missing',
      href: `/investigations/${id}/clarify`,
      isActionable: true,
      badgeClass: 'bg-red-50 text-red-700 border-red-300',
    };
  }

  if (lifecycleStatus === 'AWAITING_APPROVAL' || reviewStatus === 'PROPOSAL_READY' || params.planVersion) {
    return {
      actionKind: 'REVIEW_AND_APPROVE',
      label: 'Review & Approve Plan',
      description: 'Inspect semantic browser actions and grant explicit authorization',
      href: `/investigations/${id}/approve`,
      isActionable: true,
      badgeClass: 'bg-status-pendingBg text-status-pending border-amber-300 font-semibold',
    };
  }

  // 6. Default Draft
  return {
    actionKind: 'GENERATE_PLAN',
    label: 'Generate Plan',
    description: 'Initial intake saved; request autonomous experiment proposal',
    href: `/investigations/${id}`,
    isActionable: true,
    badgeClass: 'bg-neutral-surface text-brand-navy border-neutral-divider',
  };
}
