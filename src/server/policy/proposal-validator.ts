import { ModelExperimentProposal } from '@/contracts/planning';
import { ActionTier } from '@/contracts/status';
import { SafeModelTargetContext } from '@/contracts/targets';

export interface ValidationOutcome {
  isValid: boolean;
  errors: string[];
  maxActionTierRequired: ActionTier;
}

const ACTION_TIER_ORDER: Record<ActionTier, number> = {
  TIER_1_READ_ONLY: 1,
  TIER_2_SAFE_INTERACTION: 2,
  TIER_3_MUTATING_INTERACTION: 3,
  TIER_4_DESTRUCTIVE: 4,
};

const SUPPORTED_EXECUTABLE_TOOLS = new Set([
  'navigate',
  'click_button',
  'click_link',
  'fill_input',
  'select_option',
  'set_checkbox',
  'press_key',
  'hover_element',
  'scroll_page',
  'inspect_dom',
  'get_text',
  'screenshot',
]);

const FORBIDDEN_UNSUPPORTED_TOOLS = new Map<string, string>([
  ['delete_element', 'DOM element deletion does not reproduce backend data mutations (delete_element is unsupported for executable plans).'],
  ['clear_storage', 'Uncontrolled storage clearing outside target reset lifecycle is unsupported.'],
]);

// Valid combinations: [kind, source, allowed_operators]
const COMPATIBILITY_RULES: Record<string, { sources: string[]; operators: string[]; requiresExpectedValue: boolean }> = {
  ENTITY_PRESENCE: {
    sources: ['DOM_ELEMENT'],
    operators: ['EXISTS', 'NOT_EXISTS'],
    requiresExpectedValue: false,
  },
  VALUE_COMPARISON: {
    sources: ['DOM_TEXT', 'DOM_ATTRIBUTE'],
    operators: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'GREATER_THAN', 'LESS_THAN'],
    requiresExpectedValue: true,
  },
  READBACK_STATE: {
    sources: ['TARGET_READBACK_API'],
    operators: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'EXISTS', 'NOT_EXISTS'],
    requiresExpectedValue: false,
  },
  NETWORK_OBSERVATION: {
    sources: ['NETWORK_RESPONSE'],
    operators: ['EQUALS', 'CONTAINS', 'EXISTS', 'NOT_EXISTS'],
    requiresExpectedValue: false,
  },
  CONSOLE_LOG_OBSERVATION: {
    sources: ['CONSOLE_LOG'],
    operators: ['CONTAINS', 'NOT_CONTAINS', 'EXISTS', 'NOT_EXISTS'],
    requiresExpectedValue: false,
  },
};

/**
 * Validates a model-proposed experiment plan for semantic validity,
 * tool capability support, typed assertion compatibility, and sandbox authorization.
 */
export function validateExperimentProposal(
  proposal: ModelExperimentProposal,
  targetContext: SafeModelTargetContext
): ValidationOutcome {
  const errors: string[] = [];
  let maxTierLevel = 1;
  let maxActionTierRequired: ActionTier = 'TIER_1_READ_ONLY';

  // 1. Behavior Description Distinctness
  if (!proposal.expectedCorrectBehavior || proposal.expectedCorrectBehavior.trim().length < 5) {
    errors.push('expectedCorrectBehavior must be at least 5 characters.');
  }
  if (!proposal.reportedFailureSignature || proposal.reportedFailureSignature.trim().length < 5) {
    errors.push('reportedFailureSignature must be at least 5 characters.');
  }
  if (
    proposal.expectedCorrectBehavior &&
    proposal.reportedFailureSignature &&
    proposal.expectedCorrectBehavior.trim().toLowerCase() === proposal.reportedFailureSignature.trim().toLowerCase()
  ) {
    errors.push('expectedCorrectBehavior and reportedFailureSignature must describe distinct states.');
  }

  // 2. Preconditions Check
  if (!proposal.preconditions || proposal.preconditions.length === 0) {
    errors.push('At least one explicit precondition is required.');
  }

  // 3. Step Validation & Sequencing
  if (!proposal.steps || proposal.steps.length === 0) {
    errors.push('Experiment plan must contain at least one step.');
  } else {
    for (let i = 0; i < proposal.steps.length; i++) {
      const step = proposal.steps[i];

      // Strict sequential indexing check
      if (step.stepIndex !== i) {
        errors.push(`Step index mismatch at position ${i}: expected stepIndex ${i}, found ${step.stepIndex}. Duplicate or unordered steps are rejected.`);
      }

      // Check tool capability
      if (FORBIDDEN_UNSUPPORTED_TOOLS.has(step.toolKind)) {
        errors.push(`Step ${i} uses unsupported tool '${step.toolKind}': ${FORBIDDEN_UNSUPPORTED_TOOLS.get(step.toolKind)}`);
      } else if (!SUPPORTED_EXECUTABLE_TOOLS.has(step.toolKind)) {
        errors.push(`Step ${i} uses unverified tool kind '${step.toolKind}'.`);
      }

      // Tool parameter checks
      if (step.toolKind === 'navigate' && (!step.value || step.value.trim() === '')) {
        errors.push(`Step ${i} (navigate) requires a target URL or relative path in 'value'.`);
      }
      if ((step.toolKind === 'click_button' || step.toolKind === 'click_link' || step.toolKind === 'hover_element') && (!step.selector || step.selector.trim() === '')) {
        errors.push(`Step ${i} (${step.toolKind}) requires a target element 'selector'.`);
      }
      if (step.toolKind === 'fill_input') {
        if (!step.selector || step.selector.trim() === '') {
          errors.push(`Step ${i} (fill_input) requires a target element 'selector'.`);
        }
        if (step.value === undefined || step.value.trim() === '') {
          errors.push(`Step ${i} (fill_input) requires a non-empty value.`);
        }
      }

      // Timeout bounds
      if (step.timeoutMs < 1000 || step.timeoutMs > 60000) {
        errors.push(`Step ${i} timeoutMs (${step.timeoutMs}) must be between 1000 and 60000 ms.`);
      }

      // Track maximum action tier required
      const tierLevel = ACTION_TIER_ORDER[step.tier] ?? 999;
      if (tierLevel > maxTierLevel) {
        maxTierLevel = tierLevel;
        maxActionTierRequired = step.tier;
      }
    }
  }

  // 4. Assertions Validation against Compatibility Table
  if (!proposal.assertions || proposal.assertions.length === 0) {
    errors.push('Plan must contain at least one assertion.');
  } else {
    let hasExpectedCorrectAssertion = false;
    let hasReportedFailureAssertion = false;

    for (let j = 0; j < proposal.assertions.length; j++) {
      const assertion = proposal.assertions[j];

      if (assertion.purpose === 'EXPECTED_CORRECT_BEHAVIOR') {
        hasExpectedCorrectAssertion = true;
      }
      if (assertion.purpose === 'REPORTED_FAILURE_SIGNATURE') {
        hasReportedFailureAssertion = true;
      }

      // Check against compatibility table
      const rule = COMPATIBILITY_RULES[assertion.kind];
      if (!rule) {
        errors.push(`Assertion ${j} has unsupported kind '${assertion.kind}'.`);
        continue;
      }

      if (!rule.sources.includes(assertion.source)) {
        errors.push(`Assertion ${j} kind '${assertion.kind}' cannot be observed from source '${assertion.source}'. Allowed sources: [${rule.sources.join(', ')}].`);
      }

      if (assertion.operator === 'MATCHES_REGEX') {
        errors.push(`Assertion ${j} operator 'MATCHES_REGEX' is rejected: arbitrary regular expressions are unsupported due to unbounded evaluation risk.`);
      } else if (!rule.operators.includes(assertion.operator)) {
        errors.push(`Assertion ${j} kind '${assertion.kind}' does not support operator '${assertion.operator}'. Allowed operators: [${rule.operators.join(', ')}].`);
      }

      if (rule.requiresExpectedValue && (!assertion.expectedValue || assertion.expectedValue.trim() === '')) {
        errors.push(`Assertion ${j} (${assertion.kind} with ${assertion.operator}) requires a non-empty expectedValue.`);
      }

      // Disallow code execution vectors or dangerous inputs
      if (assertion.subjectRef && /^(javascript:|eval|data:|file:)/i.test(assertion.subjectRef)) {
        errors.push(`Assertion ${j} contains illegal subjectRef execution prefix.`);
      }
      if (assertion.expectedValue && /^(javascript:|eval|data:|file:)/i.test(assertion.expectedValue)) {
        errors.push(`Assertion ${j} contains hazardous execution prefix in expectedValue.`);
      }
    }

    if (!hasExpectedCorrectAssertion) {
      errors.push('Plan lacks a typed assertion with purpose EXPECTED_CORRECT_BEHAVIOR.');
    }
    if (!hasReportedFailureAssertion) {
      errors.push('Plan lacks a typed assertion with purpose REPORTED_FAILURE_SIGNATURE.');
    }
  }

  // 5. Target Sandbox Authority Enforcement (TC-INV-008, TC-INV-004)
  if (maxActionTierRequired === 'TIER_4_DESTRUCTIVE') {
    if (!targetContext.isSandboxVerified) {
      errors.push('Destructive action tier TIER_4_DESTRUCTIVE is strictly prohibited against non-verified targets (TC-INV-008). Target sandbox authority is unverified.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    maxActionTierRequired,
  };
}
