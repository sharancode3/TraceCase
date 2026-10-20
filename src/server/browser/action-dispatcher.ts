import type { Page, Locator } from 'playwright';
import { PlanStep } from '@/contracts/planning';
import { ActionReceipt } from '@/contracts/observations';
import { MutationUncertainty } from '@/contracts/status';
import { TargetNetworkGuard } from './target-network-guard';
import { ObservationManager } from './observation-manager';

export interface ActionDispatcherOptions {
  stagingDir?: string;
  defaultTimeoutMs?: number;
}

export class ActionDispatcher {
  private defaultTimeoutMs: number;

  constructor(
    private networkGuard: TargetNetworkGuard,
    private observationManager: ObservationManager,
    options: ActionDispatcherOptions = {}
  ) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000;
  }

  /**
   * Determines if a tool or action tier carries state mutation risk.
   */
  private isMutating(step: PlanStep): boolean {
    if (step.tier === 'TIER_3_MUTATING_INTERACTION' || step.tier === 'TIER_4_DESTRUCTIVE') {
      return true;
    }
    const mutatingTools = [
      'click_button',
      'click_link',
      'fill_input',
      'select_option',
      'set_checkbox',
      'delete_element',
      'clear_storage',
    ];
    return mutatingTools.includes(step.toolKind);
  }

  /**
   * Resolves a locator for a step either via opaque elementRef or direct CSS selector.
   */
  private async resolveLocator(
    page: Page,
    step: PlanStep,
    elementRef?: string
  ): Promise<Locator> {
    if (elementRef) {
      const res = await this.observationManager.resolveElementLocator(page, elementRef);
      return res.locator;
    }

    if (!step.selector) {
      throw new Error(`Step ${step.stepIndex} (${step.toolKind}) requires a target element selector or elementRef.`);
    }

    return this.observationManager.resolveSelector(page, step.selector);
  }

  /**
   * Dispatches an individual plan step against the Playwright page.
   * Produces an immutable ActionReceipt recording status, monotonic duration, and mutation uncertainty.
   */
  async executeStep(
    page: Page,
    step: PlanStep,
    options?: { elementRef?: string; screenshotDir?: string }
  ): Promise<ActionReceipt> {
    const dispatchedAt = new Date().toISOString();
    const startMs = Date.now();
    const timeoutMs = step.timeoutMs || this.defaultTimeoutMs;
    const isMutatingAction = this.isMutating(step);

    try {
      switch (step.toolKind) {
        case 'navigate': {
          const targetUrl = step.value || step.selector;
          if (!targetUrl) {
            throw new Error(`Navigation step requires a destination URL.`);
          }
          this.networkGuard.assertUrlAllowed(targetUrl);
          this.observationManager.notifyNavigation();
          await page.goto(targetUrl, {
            timeout: timeoutMs,
            waitUntil: 'load',
          });
          break;
        }

        case 'click_button':
        case 'click_link': {
          const locator = await this.resolveLocator(page, step, options?.elementRef);
          await locator.click({ timeout: timeoutMs });
          break;
        }

        case 'fill_input': {
          const locator = await this.resolveLocator(page, step, options?.elementRef);
          await locator.fill(step.value ?? '', { timeout: timeoutMs });
          break;
        }

        case 'select_option': {
          const locator = await this.resolveLocator(page, step, options?.elementRef);
          await locator.selectOption(step.value ?? '', { timeout: timeoutMs });
          break;
        }

        case 'set_checkbox': {
          const locator = await this.resolveLocator(page, step, options?.elementRef);
          const checked = step.value === 'true' || step.value === '1' || step.value === 'checked';
          await locator.setChecked(checked, { timeout: timeoutMs });
          break;
        }

        case 'press_key': {
          const key = step.value || 'Enter';
          await page.keyboard.press(key);
          break;
        }

        case 'hover_element': {
          const locator = await this.resolveLocator(page, step, options?.elementRef);
          await locator.hover({ timeout: timeoutMs });
          break;
        }

        case 'scroll_page': {
          const distance = step.value ? parseInt(step.value, 10) : 400;
          await page.mouse.wheel(0, Number.isNaN(distance) ? 400 : distance);
          break;
        }

        case 'get_text':
        case 'inspect_dom': {
          const locator = await this.resolveLocator(page, step, options?.elementRef);
          await locator.innerText({ timeout: timeoutMs });
          break;
        }

        case 'screenshot': {
          const shotPath = options?.screenshotDir
            ? `${options.screenshotDir}/step-${step.stepIndex}.png`
            : undefined;
          await page.screenshot({ path: shotPath, fullPage: false });
          break;
        }

        case 'clear_storage':
        case 'delete_element': {
          throw new Error(`Tool '${step.toolKind}' is rejected at dispatch: destructive actions are disallowed.`);
        }

        default:
          throw new Error(`Unsupported toolKind '${(step as PlanStep).toolKind}'.`);
      }

      const durationMs = Math.max(0, Date.now() - startMs);
      const completedAt = new Date().toISOString();

      return {
        stepIndex: step.stepIndex,
        action: step,
        tier: step.tier,
        status: 'SUCCESS',
        durationMs,
        uncertainty: 'NONE',
        dispatchedAt,
        completedAt,
      };
    } catch (err: unknown) {
      const durationMs = Math.max(0, Date.now() - startMs);
      const completedAt = new Date().toISOString();
      const errObj = err as { name?: string; message?: string };
      const isTimeout =
        errObj?.name === 'TimeoutError' ||
        errObj?.message?.toLowerCase().includes('timeout') ||
        durationMs >= timeoutMs;

      // If a mutating action timed out or crashed midway, we preserve uncertainty
      const uncertainty: MutationUncertainty = isMutatingAction
        ? 'MUTATION_UNCERTAIN'
        : 'NONE';

      return {
        stepIndex: step.stepIndex,
        action: step,
        tier: step.tier,
        status: isTimeout ? 'TIMED_OUT' : 'FAILED',
        durationMs,
        uncertainty,
        errorDetails: (errObj?.message || String(err)).slice(0, 500),
        dispatchedAt,
        completedAt,
      };
    }
  }
}
