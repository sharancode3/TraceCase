import type { ExperimentPlan, PlanApprovalRecord, AuthoritativeExperimentPlan, AuthoritativeApprovalRecord } from '@/contracts/planning';
import type { ActionTier } from '@/contracts/status';
import { calculatePlanFingerprint, calculateAuthoritativePlanFingerprint } from './plan-fingerprint';

export interface ApprovalCompatibilityResult {
  isCompatible: boolean;
  reason?: string;
  calculatedHash: string;
  recordedHash?: string;
}

const ACTION_TIER_HIERARCHY: Record<ActionTier, number> = {
  TIER_1_READ_ONLY: 1,
  TIER_2_SAFE_INTERACTION: 2,
  TIER_3_MUTATING_INTERACTION: 3,
  TIER_4_DESTRUCTIVE: 4,
};

/**
 * Authoritative approval guard for live execution (TC-INV-003, TC-INV-004).
 * Enforces cryptographic plan binding, investigation scope, target matching,
 * actor authorization, action tier ceiling, revocation status, and valid expiration.
 */
export function verifyAuthoritativeApprovalCompatibility(params: {
  plan: AuthoritativeExperimentPlan;
  approval: AuthoritativeApprovalRecord | null;
  trustedContext: {
    targetId: string;
    actorId?: string;
    currentTimestamp?: string;
  };
}): ApprovalCompatibilityResult {
  const { plan, approval, trustedContext } = params;

  let calculatedHash = '';
  try {
    calculatedHash = calculateAuthoritativePlanFingerprint(plan);
  } catch (err) {
    return {
      isCompatible: false,
      reason: `Plan payload failed authoritative canonicalization: ${err instanceof Error ? err.message : 'Unknown validation error'}`,
      calculatedHash: '',
    };
  }

  if (!approval) {
    return {
      isCompatible: false,
      reason: 'No approval record exists for this investigation (TC-INV-003).',
      calculatedHash,
    };
  }

  // Actor verification: if caller supplies actorId, must strictly match approval's authorized actor
  if (trustedContext.actorId && approval.authorizedActorId !== trustedContext.actorId) {
    return {
      isCompatible: false,
      reason: `Approval actor mismatch: approved by '${approval.authorizedActorId}', but action requested by '${trustedContext.actorId}'.`,
      calculatedHash,
      recordedHash: approval.planHash,
    };
  }

  // Cross-investigation isolation
  if (approval.investigationId !== plan.investigationId) {
    return {
      isCompatible: false,
      reason: `Cross-investigation approval reuse rejected: approved for '${approval.investigationId}', but plan belongs to '${plan.investigationId}'.`,
      calculatedHash,
      recordedHash: approval.planHash,
    };
  }

  // Target binding
  if (approval.targetId !== plan.targetId || approval.targetId !== trustedContext.targetId) {
    return {
      isCompatible: false,
      reason: `Target scope mismatch: approved target '${approval.targetId}' differs from trusted target '${trustedContext.targetId}'.`,
      calculatedHash,
      recordedHash: approval.planHash,
    };
  }

  // Action Tier Enforcement: Ensure plan steps do not exceed the approved maxActionTierPermitted
  const maxPermittedLevel = ACTION_TIER_HIERARCHY[approval.maxActionTierPermitted] ?? 0;
  for (const step of plan.steps) {
    const stepLevel = ACTION_TIER_HIERARCHY[step.tier] ?? 999;
    if (stepLevel > maxPermittedLevel) {
      return {
        isCompatible: false,
        reason: `Plan step ${step.stepIndex} requires tier '${step.tier}', which exceeds approved maximum tier '${approval.maxActionTierPermitted}'.`,
        calculatedHash,
        recordedHash: approval.planHash,
      };
    }
  }

  // Version matching
  if (approval.planVersion !== plan.version) {
    return {
      isCompatible: false,
      reason: `Plan version mismatch: approved version is v${approval.planVersion}, but current plan is v${plan.version}.`,
      calculatedHash,
      recordedHash: approval.planHash,
    };
  }

  // Revocation check
  if (approval.revokedAt) {
    return {
      isCompatible: false,
      reason: `Approval authorization was explicitly revoked at ${approval.revokedAt}.`,
      calculatedHash,
      recordedHash: approval.planHash,
    };
  }

  // Expiration check with strict timestamp validation
  if (approval.expiresAt) {
    const expiry = new Date(approval.expiresAt).getTime();
    if (Number.isNaN(expiry)) {
      return {
        isCompatible: false,
        reason: `Invalid expiration timestamp in approval record: '${approval.expiresAt}'.`,
        calculatedHash,
        recordedHash: approval.planHash,
      };
    }

    let now = Date.now();
    if (trustedContext.currentTimestamp) {
      now = new Date(trustedContext.currentTimestamp).getTime();
      if (Number.isNaN(now)) {
        return {
          isCompatible: false,
          reason: `Invalid currentTimestamp in trusted context: '${trustedContext.currentTimestamp}'.`,
          calculatedHash,
          recordedHash: approval.planHash,
        };
      }
    }

    if (now > expiry) {
      return {
        isCompatible: false,
        reason: `Approval expired at ${approval.expiresAt}.`,
        calculatedHash,
        recordedHash: approval.planHash,
      };
    }
  }

  // Cryptographic hash comparison
  if (approval.planHash.toLowerCase() !== calculatedHash.toLowerCase()) {
    return {
      isCompatible: false,
      reason: 'Plan content or execution scope has been modified since approval was recorded. Approval invalid (TC-INV-004).',
      calculatedHash,
      recordedHash: approval.planHash,
    };
  }

  return {
    isCompatible: true,
    calculatedHash,
    recordedHash: approval.planHash,
  };
}

/**
 * Legacy check: verifies whether an operator approval record covers the target execution plan.
 * Preserved for preview fixtures.
 */
export function verifyApprovalCompatibility(
  plan: ExperimentPlan,
  approval: PlanApprovalRecord | null
): ApprovalCompatibilityResult {
  const calculatedHash = calculatePlanFingerprint(plan);

  if (!approval) {
    return {
      isCompatible: false,
      reason: 'No approval record exists for this investigation (TC-INV-003).',
      calculatedHash,
    };
  }

  if (approval.planVersion !== plan.version) {
    return {
      isCompatible: false,
      reason: `Plan version mismatch: approved version is v${approval.planVersion}, but current plan is v${plan.version}.`,
      calculatedHash,
      recordedHash: approval.planHash,
    };
  }

  if (approval.planHash.toLowerCase() !== calculatedHash.toLowerCase()) {
    return {
      isCompatible: false,
      reason: 'Plan content has been modified since approval was recorded. Approval revoked (TC-INV-004).',
      calculatedHash,
      recordedHash: approval.planHash,
    };
  }

  return {
    isCompatible: true,
    calculatedHash,
    recordedHash: approval.planHash,
  };
}
