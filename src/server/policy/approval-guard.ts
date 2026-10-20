import type { ExperimentPlan, PlanApprovalRecord } from '@/contracts/planning';
import { calculatePlanFingerprint } from './plan-fingerprint';

export interface ApprovalCompatibilityResult {
  isCompatible: boolean;
  reason?: string;
  calculatedHash: string;
  recordedHash?: string;
}

/**
 * Checks whether an operator approval record cryptographically covers the target execution plan.
 * Fails closed if approval is missing, version mismatches, or plan hash differs (TC-INV-004).
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
