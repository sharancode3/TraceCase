import type { BrowserAgentInput, BrowserDecisionOutput, PrunedAXTreeNode } from './contracts';
import { BrowserDecisionOutputSchema, stripModelAuthorityFields } from './contracts';
import type { ModelProviderPort, AiUsageReport } from './provider';
import { pruneObservationAXTree, type PrunedObservationResult } from './observation-pruner';
import {
  BROWSER_SYSTEM_PROMPT,
  assembleBrowserUserPrompt,
  BROWSER_PROMPT_VERSION,
} from './prompts/browser-prompt';

/**
 * ============================================================================
 * TRACECASE PERSON 2: BROWSER INVESTIGATION AGENT (AT-ROLE-002)
 * ============================================================================
 * 
 * Grounds approved semantic steps into resilient, concrete DOM interactions.
 * Strictly bounded: never invokes Playwright directly, never approves scope,
 * never declares reproduction, and stops safely upon ambiguity or mutation timeout.
 */

export interface BrowserExecutionResult {
  output: BrowserDecisionOutput;
  usage: AiUsageReport;
  pruning: PrunedObservationResult;
}

export class BrowserActorError extends Error {
  constructor(message: string) {
    super(`[TraceCase Browser Actor] ${message}`);
    this.name = 'BrowserActorError';
  }
}

export class BrowserInteractionAgent {
  private provider: ModelProviderPort;

  constructor(provider: ModelProviderPort) {
    this.provider = provider;
  }

  /**
   * Main entrypoint: Proposes next browser action grounded in live observation
   */
  public async proposeNextAction(
    input: BrowserAgentInput,
    options?: { abortSignal?: AbortSignal }
  ): Promise<BrowserExecutionResult> {
    const dummyPruning: PrunedObservationResult = {
      prunedNodes: input.observation.axTree,
      isTruncated: false,
      truncatedNodeCount: 0,
      originalNodeCount: input.observation.axTree.length,
      prunedNodeCount: input.observation.axTree.length,
      estimatedTokens: 0,
      hasAmbiguousDuplicateLabels: false,
      ambiguousLabels: [],
    };

    const emptyUsage: AiUsageReport = {
      correlationId: input.investigationId,
      providerType: 'mock_test_double',
      modelIdentifier: this.provider.config.modelIdentifier,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      tokenCostUsd: '0.0000',
      durationMs: 0,
      retriesAttempted: 0,
      isLocalInference: true,
    };

    // 1. Guard: Revocation / Cancellation
    if (input.isRevokedOrCancelled || options?.abortSignal?.aborted) {
      return {
        output: {
          variant: 'STOP_BLOCKED',
          errorCode: 'EXECUTION_CANCELLED_OR_REVOKED',
          errorDescription: 'Execution approval has been revoked or session was cancelled.',
        },
        usage: emptyUsage,
        pruning: dummyPruning,
      };
    }

    // 2. Guard: Mutation timeout uncertainty
    if (input.lastActionMutationUncertain) {
      return {
        output: {
          variant: 'STOP_BLOCKED',
          errorCode: 'MUTATION_UNCERTAIN_TIMEOUT',
          errorDescription:
            'Previous mutation action timed out with uncertain state. Refusing to repeat deletion blindly; returning control for Person 1 reconciliation.',
        },
        usage: emptyUsage,
        pruning: dummyPruning,
      };
    }

    // 3. Guard: Step budget exhaustion
    if (input.remainingStepBudget !== undefined && input.remainingStepBudget <= 0) {
      return {
        output: {
          variant: 'STOP_BLOCKED',
          errorCode: 'EXHAUSTED_LIMITS',
          errorDescription: 'Execution step budget has been completely exhausted.',
        },
        usage: emptyUsage,
        pruning: dummyPruning,
      };
    }

    // 4. Guard: Origin validation
    if (input.allowedOrigins && input.allowedOrigins.length > 0) {
      try {
        const pageOrigin = new URL(input.observation.pageUrl).origin;
        const isAllowed = input.allowedOrigins.some((allowed) => {
          try {
            return new URL(allowed).origin === pageOrigin;
          } catch {
            return input.observation.pageUrl.startsWith(allowed);
          }
        });

        if (!isAllowed) {
          return {
            output: {
              variant: 'STOP_BLOCKED',
              errorCode: 'DISALLOWED_ORIGIN',
              errorDescription: `Current page origin '${pageOrigin}' is outside approved target origins.`,
            },
            usage: emptyUsage,
            pruning: dummyPruning,
          };
        }
      } catch {
        return {
          output: {
            variant: 'STOP_BLOCKED',
            errorCode: 'INVALID_URL',
            errorDescription: `Observed page URL '${input.observation.pageUrl}' is invalid.`,
          },
          usage: emptyUsage,
          pruning: dummyPruning,
        };
      }
    }

    // 5. Guard: CAPTCHA and OTP challenge detection
    const lowerTitle = input.observation.pageTitle.toLowerCase();
    const hasCaptcha =
      lowerTitle.includes('captcha') ||
      input.observation.axTree.some((n) => n.name.toLowerCase().includes('captcha'));

    if (hasCaptcha) {
      return {
        output: {
          variant: 'REQUEST_HUMAN_HELP',
          blockerType: 'CAPTCHA_DETECTED',
          blockerDescription: 'CAPTCHA challenge detected on target page.',
          suggestedUserAction: 'Please solve the CAPTCHA in the target browser window.',
        },
        usage: emptyUsage,
        pruning: dummyPruning,
      };
    }

    const hasOtp =
      lowerTitle.includes('otp') ||
      lowerTitle.includes('two-factor') ||
      input.observation.axTree.some(
        (n) =>
          n.name.toLowerCase().includes('one-time password') ||
          n.name.toLowerCase().includes('enter code') ||
          n.name.toLowerCase().includes('authenticator')
      );

    if (hasOtp) {
      return {
        output: {
          variant: 'REQUEST_HUMAN_HELP',
          blockerType: 'OTP_REQUIRED',
          blockerDescription: 'Two-factor or OTP verification required on target page.',
          suggestedUserAction: 'Please provide the OTP authentication code.',
        },
        usage: emptyUsage,
        pruning: dummyPruning,
      };
    }

    // 6. Guard: No-progress loop detection
    if (input.priorActionHistory.length >= 3) {
      const recent = input.priorActionHistory.slice(-3);
      const allSameStep = recent.every((h) => h.stepNumber === input.currentStep.stepNumber);
      const allFailed = recent.every((h) => !h.executedSuccessfully);
      if (allSameStep && allFailed) {
        return {
          output: {
            variant: 'STOP_BLOCKED',
            errorCode: 'NO_PROGRESS_LOOP',
            errorDescription: `Step ${input.currentStep.stepNumber} has failed 3 consecutive times without progress.`,
          },
          usage: emptyUsage,
          pruning: dummyPruning,
        };
      }
    }

    // 7. Prune AXTree and inspect for ambiguous duplicate labels
    const pruningResult = pruneObservationAXTree(input.observation.axTree, {
      targetEntityHint: input.currentStep.targetDescription,
    });

    if (pruningResult.hasAmbiguousDuplicateLabels) {
      const targetLower = input.currentStep.targetDescription.toLowerCase();
      // If the action targets a button and ambiguous buttons exist without distinguishing context
      const isTargetAmbiguous = pruningResult.ambiguousLabels.some((label) =>
        label.includes('button') && (targetLower.includes('delete') || targetLower.includes('button'))
      );

      if (isTargetAmbiguous) {
        return {
          output: {
            variant: 'STOP_BLOCKED',
            errorCode: 'AMBIGUOUS_ENTITY',
            errorDescription:
              'Multiple identical controls observed without entity distinction (e.g. identical unlabelled delete buttons). Refusing to guess.',
          },
          usage: emptyUsage,
          pruning: pruningResult,
        };
      }
    }

    // 8. Assemble prompt and query model
    const userPrompt = assembleBrowserUserPrompt(input, pruningResult.prunedNodes);

    const completion = await this.provider.generateStructuredCompletion<BrowserDecisionOutput>(
      {
        correlationId: input.investigationId,
        roleId: 'AT-ROLE-002',
        promptVersion: BROWSER_PROMPT_VERSION,
        systemPrompt: BROWSER_SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.0,
        maxTokens: 512,
        abortSignal: options?.abortSignal,
      },
      BrowserDecisionOutputSchema
    );

    // 9. Sanitize authority tampering
    const sanitizedOutput = stripModelAuthorityFields(
      completion.data as unknown as Record<string, unknown>
    ) as unknown as BrowserDecisionOutput;

    // 10. Post-inference semantic invariants validation
    const validatedOutput = this.validateDecisionInvariants(
      sanitizedOutput,
      input,
      pruningResult.prunedNodes
    );

    return {
      output: validatedOutput,
      usage: completion.usage,
      pruning: pruningResult,
    };
  }

  private validateDecisionInvariants(
    output: BrowserDecisionOutput,
    input: BrowserAgentInput,
    observedNodes: PrunedAXTreeNode[]
  ): BrowserDecisionOutput {
    if (output.variant === 'PROPOSE_ACTION') {
      // 1. Invariant: Reject stale correlation (do not rewrite mismatched IDs)
      if (
        output.echoedStepNumber !== input.currentStep.stepNumber ||
        output.echoedObservationId !== input.observation.observationId
      ) {
        return {
          variant: 'REQUEST_OBSERVATION',
          reason: `Stale correlation rejected: echoed step ${output.echoedStepNumber} (expected ${input.currentStep.stepNumber}) or observation ID ${output.echoedObservationId} (expected ${input.observation.observationId}). Fresh observation required.`,
          waitForTimeoutMs: 1000,
        };
      }

      // 2. Invariant: Action type alignment with approved step intent
      if (input.currentStep.actionType && output.action.actionType !== input.currentStep.actionType) {
        return {
          variant: 'STOP_BLOCKED',
          errorCode: 'ACTION_TYPE_MISMATCH',
          errorDescription: `Proposed action type '${output.action.actionType}' does not match approved step action '${input.currentStep.actionType}'.`,
        };
      }

      // 3. Invariant: NAVIGATE origin validation
      const targetNavUrl = output.action.primarySelector || output.action.inputValue;
      if (output.action.actionType === 'NAVIGATE' && targetNavUrl) {
        try {
          const navUrl = new URL(targetNavUrl);
          const allowed = input.allowedOrigins || [];
          const isAllowed = allowed.some((origin) => {
            try {
              return new URL(origin).origin === navUrl.origin;
            } catch {
              return false;
            }
          });
          if (!isAllowed) {
            return {
              variant: 'STOP_BLOCKED',
              errorCode: 'FORBIDDEN_ORIGIN_NAVIGATION',
              errorDescription: `Navigation target '${targetNavUrl}' is outside permitted origins: ${allowed.join(', ')}.`,
            };
          }
        } catch {
          return {
            variant: 'STOP_BLOCKED',
            errorCode: 'INVALID_NAVIGATION_URL',
            errorDescription: `Navigation target '${targetNavUrl}' is not a valid absolute URL.`,
          };
        }
      }

      // 4. Invariant: Element action grounding (CLICK, FILL, SELECT)
      const isElementAction = ['CLICK', 'FILL', 'SELECT'].includes(output.action.actionType);
      if (isElementAction) {
        // Must specify targetNodeId; no guessing or fuzzy substring matching
        if (!output.action.targetNodeId) {
          return {
            variant: 'REQUEST_OBSERVATION',
            reason: `Element action '${output.action.actionType}' with selector '${output.action.primarySelector}' is not grounded in any observed interactive node. Must specify targetNodeId.`,
            waitForTimeoutMs: 1000,
          };
        }

        const matchedNode = observedNodes.find((n) => n.nodeId === output.action.targetNodeId);
        if (!matchedNode) {
          return {
            variant: 'REQUEST_OBSERVATION',
            reason: `Target node '${output.action.targetNodeId}' not found in current observation snapshot.`,
            waitForTimeoutMs: 1000,
          };
        }

        // Interactivity check: StaticText, alert, status cannot be clicked/filled/selected
        const NON_INTERACTIVE_ROLES = new Set(['StaticText', 'alert', 'status']);
        if (NON_INTERACTIVE_ROLES.has(matchedNode.role)) {
          return {
            variant: 'STOP_BLOCKED',
            errorCode: 'TARGET_NOT_INTERACTIVE',
            errorDescription: `Target node '${matchedNode.nodeId}' has non-interactive role '${matchedNode.role}'. Action requires an interactive element.`,
          };
        }

        // Helper to extract explicit IDs and attributes from selectors
        const extractSelectorExplicitIds = (selector: string): string[] => {
          const ids: string[] = [];
          const idMatches = selector.matchAll(/#([a-zA-Z0-9_-]+)/g);
          for (const m of idMatches) {
            ids.push(m[1].toLowerCase());
          }
          const attrMatches = selector.matchAll(
            /\[(?:[a-zA-Z0-9_-]*(?:id|name|item|task|entity|key|scope|ref))\s*=\s*["']?([a-zA-Z0-9_-]+)["']?\]/gi
          );
          for (const m of attrMatches) {
            ids.push(m[1].toLowerCase());
          }
          const dataAttrMatches = selector.matchAll(/\[data-[a-zA-Z0-9_-]+\s*=\s*["']?([a-zA-Z0-9_-]+)["']?\]/gi);
          for (const m of dataAttrMatches) {
            ids.push(m[1].toLowerCase());
          }
          return ids;
        };

        // Helper to extract distinct entity phrases using sliding window over meaningful tokens
        const extractEntityPhrases = (text: string): string[] => {
          const stopWords = new Set([
            'delete', 'click', 'select', 'fill', 'wait', 'button', 'link', 'input', 'for', 'the', 'of', 'in', 'on', 'to',
            'archive', 'create', 'remove', 'add', 'edit', 'open', 'close', 'item', 'press', 'tap',
          ]);
          const words = text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 0 && !stopWords.has(w));

          if (words.length <= 1) {
            return words;
          }

          const phrases: string[] = [];
          for (let i = 0; i < words.length - 1; i++) {
            phrases.push(`${words[i]}${words[i + 1]}`);
          }
          return phrases;
        };

        const normalizeId = (s: string) => s.toLowerCase().replace(/[-_ ]+/g, '');
        const nodeText = `${matchedNode.name} ${matchedNode.description || ''} ${matchedNode.nodeId}`;
        const normNodeText = normalizeId(nodeText);

        // Disabled control guard (must run before entity/scope checks)
        if (matchedNode.disabled) {
          return {
            variant: 'STOP_BLOCKED',
            errorCode: 'TARGET_CONTROL_DISABLED',
            errorDescription: `Target control '${matchedNode.name}' (${matchedNode.nodeId}) is disabled in current UI state.`,
          };
        }

        // Comprehensive positional selector pseudo-class regex
        const POSITIONAL_SELECTOR_REGEX = /:(?:last-child|first-child|nth-child|nth-of-type|last-of-type|first-of-type|only-child|only-of-type)\b/i;

        // Canonical observed mapping validator (applied equally to primarySelector and cssFallback)
        const validateSelectorMapping = (
          selector: string,
          selectorType: 'primary' | 'fallback'
        ): { isValid: boolean; errorCode?: string; errorDescription?: string } => {
          if (!selector || selector.trim().length === 0) {
            return {
              isValid: false,
              errorCode: 'SELECTOR_ENTITY_MISMATCH',
              errorDescription: `${selectorType === 'primary' ? 'Primary selector' : 'Fallback selector'} is empty.`,
            };
          }

          // A. Positional pseudo-classes are ungrounded
          if (POSITIONAL_SELECTOR_REGEX.test(selector)) {
            return {
              isValid: false,
              errorCode: 'SELECTOR_ENTITY_MISMATCH',
              errorDescription: `${selectorType === 'primary' ? 'Selector' : 'Fallback selector'} '${selector}' uses positional pseudo-class which does not canonically map to target node '${matchedNode.nodeId}' (${matchedNode.name}). Positional selectors cannot independently expand executable scope.`,
            };
          }

          // B. Explicit selector IDs / attributes must be present on target node
          const explicitIds = extractSelectorExplicitIds(selector);
          for (const selectorId of explicitIds) {
            if (!normNodeText.includes(normalizeId(selectorId))) {
              return {
                isValid: false,
                errorCode: 'SELECTOR_ENTITY_MISMATCH',
                errorDescription: `${selectorType === 'primary' ? 'Selector' : 'Fallback selector'} '${selector}' references explicit identifier '${selectorId}' which is not present on target node '${matchedNode.nodeId}' (${matchedNode.name}). Entity scope mismatch.`,
              };
            }
          }

          // C. Canonical observed mapping requirement:
          // A selector must not be an arbitrary unanchored tag, class, or compound selector (e.g. "button", "button.delete-btn", "div > button", ".btn")
          // It must contain a canonical anchor:
          // 1. direct node ID reference (e.g. matchedNode.nodeId)
          // 2. an explicit identifier matching the target node (e.g. [data-task-id="..."], #id, [data-testid="..."])
          // 3. exact text/name locator matching the target node accessible name (:has-text("..."))
          const hasNodeIdRef = selector.includes(matchedNode.nodeId);
          const hasExplicitNodeToken = explicitIds.some((id) => normNodeText.includes(normalizeId(id)));
          const textLocatorMatch = /:(?:has-text|contains)\(["']?([^"')]+)["']?\)/i.exec(selector);
          const nodeEntityPhrases = extractEntityPhrases(`${matchedNode.name} ${matchedNode.description || ''}`);
          const textMatches = textLocatorMatch && (
            normNodeText.includes(normalizeId(textLocatorMatch[1])) ||
            nodeEntityPhrases.some((p) => normalizeId(textLocatorMatch[1]).includes(p))
          );

          // Check if selector is an unanchored compound/class/tag without matching identifier
          const isUnanchoredCompoundOrClass = /^([a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+|>\s*[a-zA-Z0-9_-]+|\s+)+$/.test(selector.trim()) && !hasExplicitNodeToken && !hasNodeIdRef;

          const hasCanonicalMapping = (hasNodeIdRef || hasExplicitNodeToken || textMatches) && !isUnanchoredCompoundOrClass;

          if (!hasCanonicalMapping) {
            return {
              isValid: false,
              errorCode: 'SELECTOR_ENTITY_MISMATCH',
              errorDescription: `${selectorType === 'primary' ? 'Selector' : 'Fallback selector'} '${selector}' does not canonically map to target node '${matchedNode.nodeId}' (${matchedNode.name}). Arbitrary positional, class, or compound selectors cannot independently expand executable scope.`,
            };
          }

          return { isValid: true };
        };

        // 1. Validate primary selector
        if (output.action.primarySelector) {
          const primaryCheck = validateSelectorMapping(output.action.primarySelector, 'primary');
          if (!primaryCheck.isValid) {
            return {
              variant: 'STOP_BLOCKED',
              errorCode: primaryCheck.errorCode || 'SELECTOR_ENTITY_MISMATCH',
              errorDescription: primaryCheck.errorDescription || '',
            };
          }
        }

        // 2. Validate fallback selector equally
        if (output.action.cssFallback) {
          const fallbackCheck = validateSelectorMapping(output.action.cssFallback, 'fallback');
          if (!fallbackCheck.isValid) {
            return {
              variant: 'STOP_BLOCKED',
              errorCode: fallbackCheck.errorCode || 'SELECTOR_ENTITY_MISMATCH',
              errorDescription: fallbackCheck.errorDescription || '',
            };
          }
        }

        // 3. Generic structured scope check against approved current step
        const stepScope = (input.currentStep as { affectedDataScope?: string }).affectedDataScope;
        if (typeof stepScope === 'string' && stepScope.trim().length > 0) {
          const normScope = normalizeId(stepScope);
          if (!normNodeText.includes(normScope)) {
            return {
              variant: 'STOP_BLOCKED',
              errorCode: 'APPROVED_SCOPE_VIOLATION',
              errorDescription: `Target node '${matchedNode.nodeId}' (${matchedNode.name}) does not match approved step data scope '${stepScope}'.`,
            };
          }
        }

        // Generic entity phrase check against approved current step target description
        const stepPhrases = extractEntityPhrases(input.currentStep.targetDescription || '');
        const nodePhrases = extractEntityPhrases(`${matchedNode.name} ${matchedNode.description || ''}`);
        if (stepPhrases.length > 0 && nodePhrases.length > 0) {
          const hasMatchingPhrase = stepPhrases.some((sp) => nodePhrases.includes(sp));
          if (!hasMatchingPhrase) {
            return {
              variant: 'STOP_BLOCKED',
              errorCode: 'APPROVED_SCOPE_VIOLATION',
              errorDescription: `Target node '${matchedNode.nodeId}' (${matchedNode.name}) does not match approved step scope '${input.currentStep.targetDescription}'.`,
            };
          }
        }

        // Strict value check for FILL / SELECT: must provide approved value if specified
        if (output.action.actionType === 'FILL' || output.action.actionType === 'SELECT') {
          if (input.currentStep.approvedValue !== undefined) {
            if (output.action.inputValue === undefined || output.action.inputValue.trim() === '') {
              return {
                variant: 'STOP_BLOCKED',
                errorCode: 'MISSING_ACTION_VALUE',
                errorDescription: `Action '${output.action.actionType}' requires approved value '${input.currentStep.approvedValue}', but proposed action omitted it.`,
              };
            }
            if (output.action.inputValue !== input.currentStep.approvedValue) {
              return {
                variant: 'STOP_BLOCKED',
                errorCode: 'ACTION_VALUE_MISMATCH',
                errorDescription: `Proposed action value '${output.action.inputValue}' does not match approved input value '${input.currentStep.approvedValue}'.`,
              };
            }
          }
        }
      }

      // WAIT_FOR_SELECTOR semantics
      if (output.action.actionType === 'WAIT_FOR_SELECTOR') {
        if (!output.action.primarySelector || output.action.primarySelector.trim() === '') {
          return {
            variant: 'STOP_BLOCKED',
            errorCode: 'INVALID_WAIT_SELECTOR',
            errorDescription: 'WAIT_FOR_SELECTOR requires a valid target selector.',
          };
        }
      }
    }

    if (output.variant === 'WAIT_FOR_STATE') {
      if (!output.waitForSelector || output.waitForSelector.trim() === '') {
        return {
          variant: 'STOP_BLOCKED',
          errorCode: 'INVALID_WAIT_SELECTOR',
          errorDescription: 'WAIT_FOR_STATE requires a non-empty waitForSelector.',
        };
      }
      if (output.timeoutMs < 500 || output.timeoutMs > 10000) {
        return {
          variant: 'STOP_BLOCKED',
          errorCode: 'INVALID_WAIT_TIMEOUT',
          errorDescription: `WAIT_FOR_STATE timeout '${output.timeoutMs}ms' must be between 500ms and 10000ms.`,
        };
      }
    }

    return output;
  }
}
