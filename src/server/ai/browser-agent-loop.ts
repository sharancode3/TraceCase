import type { Page } from 'playwright';
import crypto from 'node:crypto';
import type { ActionReceipt } from '@/contracts/observations';
import type { AuthoritativeExperimentPlan, PlanStep } from '@/contracts/planning';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { BrowserInvestigationAgentPort } from '@/server/services/ports';
import type { ActionDispatcher } from '@/server/browser/action-dispatcher';
import type { ObservationManager } from '@/server/browser/observation-manager';
import type { TargetNetworkGuard } from '@/server/browser/target-network-guard';
import { ActionTier } from '@/contracts/status';

export interface AgentLoopOptions {
  maxSteps?: number;
  maxConsecutiveNoProgress?: number;
  screenshotDir?: string;
  onHeartbeat?: () => Promise<void>;
  onStepDispatched?: (step: PlanStep) => Promise<void>;
  onStepCompleted?: (receipt: ActionReceipt) => Promise<void>;
}

export interface AgentLoopResult {
  outcome: 'READY_FOR_VERIFICATION' | 'REQUEST_MANUAL_HELP' | 'STOP_NO_PROGRESS' | 'MAX_STEPS_REACHED' | 'HALTED_ON_UNCERTAINTY';
  actionsExecuted: ActionReceipt[];
  totalDurationMs: number;
  finalReason?: string;
  consecutiveNoProgressCount: number;
}

const ACTION_TIER_HIERARCHY: Record<ActionTier, number> = {
  TIER_1_READ_ONLY: 1,
  TIER_2_SAFE_INTERACTION: 2,
  TIER_3_MUTATING_INTERACTION: 3,
  TIER_4_DESTRUCTIVE: 4,
};

const ALLOWED_TOOLS = new Set([
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

export class BrowserAgentLoop {
  /**
   * Executes a bounded browser investigation loop driven by AI proposals.
   * Enforces tool allowlists, action tier constraints, scope guarding,
   * no-progress cycle detection, and authoritative termination conditions.
   */
  public static async run(params: {
    page: Page;
    investigationId: string;
    approvedIntent: string;
    plan: AuthoritativeExperimentPlan;
    target: SafeTargetProfile;
    agent: BrowserInvestigationAgentPort;
    actionDispatcher: ActionDispatcher;
    observationManager: ObservationManager;
    networkGuard: TargetNetworkGuard;
    maxPermittedTier: ActionTier;
    options?: AgentLoopOptions;
  }): Promise<AgentLoopResult> {
    const startedAtMs = Date.now();
    const maxSteps = params.options?.maxSteps ?? 15;
    const maxConsecutiveNoProgress = params.options?.maxConsecutiveNoProgress ?? 3;
    const actionsExecuted: ActionReceipt[] = [];

    const allowedTiers = Object.keys(ACTION_TIER_HIERARCHY).filter(
      (tier) =>
        ACTION_TIER_HIERARCHY[tier as ActionTier] <=
        ACTION_TIER_HIERARCHY[params.maxPermittedTier]
    );

    let consecutiveNoProgress = 0;
    let previousStateSignature: string | null = null;

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
      if (params.options?.onHeartbeat) {
        await params.options.onHeartbeat();
      }

      // 1. Capture fresh sanitized observation
      const observation = await params.observationManager.captureFreshObservation(
        params.page,
        stepIndex + 1
      );

      // Compute observation state signature for cycle detection
      const interactiveTokens = (observation.visibleDomElements || [])
        .map((el) => `${el.ariaRole || el.tagName}:${el.textSnippet || ''}:${el.elementRef}`)
        .join('|');
      const currentStateSignature = crypto
        .createHash('sha256')
        .update(`${observation.currentUrl}::${interactiveTokens}`)
        .digest('hex');

      if (previousStateSignature && previousStateSignature === currentStateSignature) {
        consecutiveNoProgress++;
      } else {
        consecutiveNoProgress = 0;
      }
      previousStateSignature = currentStateSignature;

      if (consecutiveNoProgress >= maxConsecutiveNoProgress) {
        return {
          outcome: 'STOP_NO_PROGRESS',
          actionsExecuted,
          totalDurationMs: Math.max(0, Date.now() - startedAtMs),
          finalReason: `No state change observed across ${consecutiveNoProgress} consecutive steps.`,
          consecutiveNoProgressCount: consecutiveNoProgress,
        };
      }

      // 2. Request next action proposal from AI agent
      const proposal = await params.agent.proposeNextAction({
        investigationId: params.investigationId,
        approvedIntent: params.approvedIntent,
        currentObservation: observation,
        remainingAllowedTiers: allowedTiers,
      });

      // 3. Handle non-execution terminal proposals
      if (proposal.kind === 'READY_FOR_VERIFICATION') {
        return {
          outcome: 'READY_FOR_VERIFICATION',
          actionsExecuted,
          totalDurationMs: Math.max(0, Date.now() - startedAtMs),
          finalReason: proposal.rationale,
          consecutiveNoProgressCount: consecutiveNoProgress,
        };
      }

      if (proposal.kind === 'REQUEST_MANUAL_HELP') {
        return {
          outcome: 'REQUEST_MANUAL_HELP',
          actionsExecuted,
          totalDurationMs: Math.max(0, Date.now() - startedAtMs),
          finalReason: `[${proposal.reason}] ${proposal.userPrompt}`,
          consecutiveNoProgressCount: consecutiveNoProgress,
        };
      }

      if (proposal.kind === 'STOP_NO_PROGRESS') {
        return {
          outcome: 'STOP_NO_PROGRESS',
          actionsExecuted,
          totalDurationMs: Math.max(0, Date.now() - startedAtMs),
          finalReason: proposal.reason,
          consecutiveNoProgressCount: consecutiveNoProgress,
        };
      }

      // 4. Validate proposed action strictly before execution
      const action = proposal.action;

      // Tool allowlist check
      if (!ALLOWED_TOOLS.has(action.toolKind)) {
        const receipt: ActionReceipt = {
          stepIndex: stepIndex + 1,
          action,
          tier: action.tier,
          status: 'FAILED',
          durationMs: 0,
          uncertainty: 'NONE',
          errorDetails: `Tool kind '${action.toolKind}' is rejected by execution policy.`,
          dispatchedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        actionsExecuted.push(receipt);
        break;
      }

      // Action tier constraint check
      const actionTierLevel = ACTION_TIER_HIERARCHY[action.tier];
      const maxTierLevel = ACTION_TIER_HIERARCHY[params.maxPermittedTier];
      if (actionTierLevel > maxTierLevel) {
        const receipt: ActionReceipt = {
          stepIndex: stepIndex + 1,
          action,
          tier: action.tier,
          status: 'FAILED',
          durationMs: 0,
          uncertainty: 'NONE',
          errorDetails: `Proposed action tier '${action.tier}' exceeds permitted maximum '${params.maxPermittedTier}' (BLOCKED_BY_POLICY).`,
          dispatchedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        actionsExecuted.push(receipt);
        break;
      }

      // Destination URL scope check for navigation
      if (action.toolKind === 'navigate') {
        const targetUrl = action.value || action.selector || '';
        const urlCheck = params.networkGuard.validateUrl(targetUrl);
        if (!urlCheck.isAllowed) {
          const receipt: ActionReceipt = {
            stepIndex: stepIndex + 1,
            action,
            tier: action.tier,
            status: 'FAILED',
            durationMs: 0,
            uncertainty: 'NONE',
            errorDetails: `Navigation destination '${targetUrl}' blocked by policy: ${urlCheck.reason}`,
            dispatchedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
          actionsExecuted.push(receipt);
          break;
        }
      }

      // 5. Dispatch validated action
      if (params.options?.onStepDispatched) {
        await params.options.onStepDispatched(action);
      }

      const receipt = await params.actionDispatcher.executeStep(params.page, action, {
        screenshotDir: params.options?.screenshotDir,
      });

      actionsExecuted.push(receipt);

      if (params.options?.onStepCompleted) {
        await params.options.onStepCompleted(receipt);
      }

      // Halt on mutation uncertainty to prevent compounding corrupt state
      if (receipt.uncertainty === 'MUTATION_UNCERTAIN') {
        return {
          outcome: 'HALTED_ON_UNCERTAINTY',
          actionsExecuted,
          totalDurationMs: Math.max(0, Date.now() - startedAtMs),
          finalReason: 'Mutating action resulted in MUTATION_UNCERTAIN.',
          consecutiveNoProgressCount: consecutiveNoProgress,
        };
      }

      // Halt if step failed
      if (receipt.status !== 'SUCCESS') {
        break;
      }
    }

    return {
      outcome: 'MAX_STEPS_REACHED',
      actionsExecuted,
      totalDurationMs: Math.max(0, Date.now() - startedAtMs),
      finalReason: `Maximum step budget (${maxSteps}) reached.`,
      consecutiveNoProgressCount: consecutiveNoProgress,
    };
  }
}
