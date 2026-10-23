import type { Page, Locator } from 'playwright';
import { ElementReference } from './types';
import { SanitizedBrowserObservation } from '@/contracts/observations';
import type { PlanStep } from '@/contracts/planning';

export class ObservationResolutionError extends Error {
  constructor(
    public readonly elementRef: string,
    public readonly code: 'NOT_FOUND' | 'STALE_REFERENCE' | 'AMBIGUOUS_LOCATOR' | 'ENTITY_MISMATCH',
    public readonly message: string
  ) {
    super(`[ObservationManager] Error resolving element '${elementRef}': ${message} (${code})`);
    this.name = 'ObservationResolutionError';
  }
}

export class ObservationManager {
  private elementMap = new Map<string, ElementReference>();
  private refCounter = 0;
  private documentGeneration = 1;
  private currentPageId: string = 'page-1';

  constructor(private attemptNumber: 1 | 2) {}

  /**
   * Resets element references upon document navigation or replacement.
   */
  notifyNavigation(newPageId?: string): void {
    this.documentGeneration++;
    if (newPageId) {
      this.currentPageId = newPageId;
    }
    this.elementMap.clear();
  }

  getCurrentGeneration(): number {
    return this.documentGeneration;
  }

  /**
   * Extracts sanitized structured observation of the page and populates the fresh reference map.
   */
  async captureFreshObservation(
    page: Page,
    stepIndex: number,
    recentConsole: Array<{ level: 'log' | 'warn' | 'error' | 'info'; text: string; timestamp: string }> = [],
    recentNetworkFailures: Array<{ url: string; method: string; status: number; timestamp: string }> = []
  ): Promise<SanitizedBrowserObservation> {
    const currentUrl = page.url();
    const pageTitle = await page.title().catch(() => 'Untitled');

    // Extract interactive elements using fixed developer-authored query without evaluating dynamic scripts
    const rawElements = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"]')
      ).slice(0, 100);

      return candidates.map((el, idx) => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
        const tagName = el.tagName.toLowerCase();
        const ariaRole = el.getAttribute('role') || undefined;
        const textContent = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 150);
        const ariaLabel = el.getAttribute('aria-label')?.trim();
        const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
        const accessibleName = (ariaLabel || labelledBy || textContent).replace(/\s+/g, ' ').slice(0, 150);
        const itemId = el.getAttribute('data-item-id') || el.getAttribute('data-task-id') || el.closest('[data-item-id]')?.getAttribute('data-item-id') || el.closest('[data-task-id]')?.getAttribute('data-task-id');
        const nameAttr = el.getAttribute('name') || '';
        const idAttr = el.id ? `#${el.id}` : '';
        const testId = el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : '';

        // Derive stable locator description
        let selector = '';
        if (testId) selector = testId;
        else if (idAttr) selector = idAttr;
        else if (el.getAttribute('data-item-id') && el.getAttribute('data-action')) selector = `${tagName}[data-action="${el.getAttribute('data-action')}"][data-item-id="${el.getAttribute('data-item-id')}"]`;
        else if (ariaLabel) selector = `${tagName}[aria-label=${JSON.stringify(ariaLabel)}]`;
        else if (nameAttr) selector = `${tagName}[name="${nameAttr}"]`;
        else if (textContent) selector = `${tagName}:has-text("${textContent.slice(0, 30)}")`;
        else selector = `${tagName}:nth-of-type(${idx + 1})`;

        return {
          tagName,
          ariaRole,
          textSnippet: (itemId && !accessibleName.includes(itemId) ? `${accessibleName} [${itemId}]` : accessibleName) || undefined,
          isInteractive: isVisible,
          selector,
        };
      });
    }).catch(() => []);

    const visibleElements = [];

    for (const raw of rawElements) {
      if (!raw.isInteractive) continue;

      const refId = `ref-${this.refCounter++}`;
      const fingerprint = `${raw.tagName}:${raw.ariaRole || ''}:${raw.textSnippet || ''}`;

      const refRecord: ElementReference = {
        elementRef: refId,
        pageId: this.currentPageId,
        frameId: 'main',
        documentGeneration: this.documentGeneration,
        tagName: raw.tagName,
        textSnippet: raw.textSnippet,
        ariaRole: raw.ariaRole,
        selector: raw.selector,
        fingerprint,
        createdAt: new Date().toISOString(),
      };

      this.elementMap.set(refId, refRecord);

      visibleElements.push({
        elementRef: refId,
        tagName: raw.tagName,
        textSnippet: raw.textSnippet,
        ariaRole: raw.ariaRole,
        isInteractive: true,
      });
    }

    return {
      attemptNumber: this.attemptNumber,
      stepIndex,
      currentUrl,
      pageTitle: pageTitle.slice(0, 200),
      visibleDomElements: visibleElements.slice(0, 100),
      recentConsoleEntries: recentConsole.slice(-20),
      recentNetworkFailures: recentNetworkFailures.slice(-10),
      freshnessTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Resolves an element reference to a live Playwright Locator with strict staleness and ambiguity guards.
   */
  async resolveElementLocator(
    page: Page,
    elementRef: string
  ): Promise<{ locator: Locator; reference: ElementReference }> {
    const record = this.elementMap.get(elementRef);
    if (!record) {
      throw new ObservationResolutionError(
        elementRef,
        'NOT_FOUND',
        `Element reference '${elementRef}' does not exist in observation map.`
      );
    }

    // Staleness check against document generation
    if (record.documentGeneration !== this.documentGeneration) {
      throw new ObservationResolutionError(
        elementRef,
        'STALE_REFERENCE',
        `Element reference '${elementRef}' was captured in generation ${record.documentGeneration}, but current document generation is ${this.documentGeneration}.`
      );
    }

    const locator = page.locator(record.selector);
    const count = await locator.count().catch(() => 0);

    if (count === 0) {
      throw new ObservationResolutionError(
        elementRef,
        'NOT_FOUND',
        `No DOM element matched selector '${record.selector}'.`
      );
    }

    // Strict ambiguity check (do NOT blindly pick first() or last())
    if (count > 1) {
      throw new ObservationResolutionError(
        elementRef,
        'AMBIGUOUS_LOCATOR',
        `Selector '${record.selector}' matched ${count} elements. Ambiguous entity targeting is prohibited.`
      );
    }

    return { locator, reference: record };
  }

  /**
   * Resolves a raw CSS / text selector with strict ambiguity and existence checks.
   */
  async resolveSelector(page: Page, selector: string): Promise<Locator> {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    if (count === 0) {
      throw new ObservationResolutionError(
        selector,
        'NOT_FOUND',
        `No DOM element matched selector '${selector}'.`
      );
    }

    if (count > 1) {
      throw new ObservationResolutionError(
        selector,
        'AMBIGUOUS_LOCATOR',
        `Selector '${selector}' matched ${count} elements. Ambiguous entity targeting is prohibited.`
      );
    }

    return locator;
  }

  /**
   * Resolves a target for an action step safely without passing raw accessible names to CSS querySelectorAll.
   */
  async resolveTarget(page: Page, step: PlanStep): Promise<Locator> {
    if (step.elementRef) {
      const res = await this.resolveElementLocator(page, step.elementRef);
      return res.locator;
    }

    if (step.targetRole && step.targetAccessibleName) {
      const roleLocator = page.getByRole(step.targetRole.toLowerCase() as Parameters<Page['getByRole']>[0], {
        name: step.targetAccessibleName,
        exact: false,
      });
      const count = await roleLocator.count().catch(() => 0);
      if (count === 1) return roleLocator;
      if (count > 1) {
        const exact = page.getByRole(step.targetRole.toLowerCase() as Parameters<Page['getByRole']>[0], {
          name: step.targetAccessibleName,
          exact: true,
        });
        const exactCount = await exact.count().catch(() => 0);
        if (exactCount === 1) return exact;
        throw new ObservationResolutionError(
          step.targetAccessibleName,
          'AMBIGUOUS_LOCATOR',
          `Accessible role locator (${step.targetRole} "${step.targetAccessibleName}") matched ${count} elements.`
        );
      }
    }

    if (step.targetAccessibleName) {
      const textLocator = page.getByText(step.targetAccessibleName, { exact: false });
      const count = await textLocator.count().catch(() => 0);
      if (count === 1) return textLocator;
      if (count > 1) {
        const exact = page.getByText(step.targetAccessibleName, { exact: true });
        const exactCount = await exact.count().catch(() => 0);
        if (exactCount === 1) return exact;
        throw new ObservationResolutionError(
          step.targetAccessibleName,
          'AMBIGUOUS_LOCATOR',
          `Text locator "${step.targetAccessibleName}" matched ${count} elements.`
        );
      }
    }

    if (step.selector) {
      // Determine if selector is a valid CSS selector or plain text description
      const isLikelyCss = /^[a-zA-Z0-9_\-\.\#\[\]\:\>\+\~\*\s\=\"\']+$/.test(step.selector) &&
        !step.selector.includes('\n') &&
        (step.selector.startsWith('#') ||
         step.selector.startsWith('.') ||
         step.selector.startsWith('[') ||
         /^(button|a|input|select|textarea|div|span|p|li|ul|ol|h[1-6]|form|label|table|tr|td|th)\b/i.test(step.selector));

      if (isLikelyCss) {
        try {
          return await this.resolveSelector(page, step.selector);
        } catch (err) {
          if (err instanceof ObservationResolutionError && err.code === 'AMBIGUOUS_LOCATOR') {
            throw err;
          }
        }
      }

      // Fallback: try getByText
      const textLocator = page.getByText(step.selector, { exact: false });
      const count = await textLocator.count().catch(() => 0);
      if (count === 1) return textLocator;
      if (count > 1) {
        const exact = page.getByText(step.selector, { exact: true });
        const exactCount = await exact.count().catch(() => 0);
        if (exactCount === 1) return exact;
        throw new ObservationResolutionError(
          step.selector,
          'AMBIGUOUS_LOCATOR',
          `Selector/text '${step.selector}' matched ${count} elements.`
        );
      }

      return this.resolveSelector(page, step.selector);
    }

    throw new Error(
      `Step ${step.stepIndex} (${step.toolKind}) requires a target element selector, targetAccessibleName, or elementRef.`
    );
  }
}
