import type { Page } from 'playwright';
import type { TypedAssertion } from '@/contracts/planning';
import type { EvidenceCollector } from '@/server/browser/evidence-collector';
import type { CapturedAssertionObservation } from './types';

export class ObservationCollector {
  /**
   * Acquires authoritative, immutable observation records for all plan assertions
   * while the browser context and page are ALIVE, before teardown.
   */
  public static async collectObservations(params: {
    page: Page;
    assertions: TypedAssertion[];
    evidenceCollector: EvidenceCollector;
    readbackState?: Record<string, unknown>;
  }): Promise<Map<string, CapturedAssertionObservation>> {
    const observations = new Map<string, CapturedAssertionObservation>();
    const page = params.page;
    const currentUrl = page.url();

    for (const assertion of params.assertions) {
      const observedAt = new Date().toISOString();

      try {
        // 1. Enforce Settling Rules
        if (assertion.settlingPoint === 'AFTER_NETWORK_IDLE') {
          await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        } else if (assertion.settlingPoint === 'AFTER_DOM_STABLE') {
          await page.waitForTimeout(400).catch(() => {});
        }

        switch (assertion.source) {
          case 'DOM_ELEMENT': {
            try {
              const locator = page.locator(assertion.subjectRef);
              const count = await locator.count();

              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: count > 0 ? 'AVAILABLE' : 'NOT_FOUND',
                elementCount: count,
                observedValue: count,
                pageUrl: currentUrl,
                observedAt,
              });
            } catch (err: unknown) {
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: 'UNAVAILABLE',
                acquisitionStatus: 'ACQUISITION_FAILED',
                isAvailable: false,
                elementCount: undefined,
                observedValue: undefined,
                pageUrl: currentUrl,
                observedAt,
                errorDetails: `Locator acquisition exception for '${assertion.subjectRef}': ${err instanceof Error ? err.message : String(err)}`,
              });
            }
            break;
          }

          case 'DOM_TEXT': {
            try {
              const locator = page.locator(assertion.subjectRef);
              const count = await locator.count();

              if (count === 0) {
                observations.set(assertion.id, {
                  assertionId: assertion.id,
                  source: assertion.source,
                  status: 'NOT_FOUND',
                  elementCount: 0,
                  pageUrl: currentUrl,
                  observedAt,
                  errorDetails: `Element '${assertion.subjectRef}' was not found in DOM.`,
                });
              } else if (count > 1) {
                // Strict ambiguity rejection: cannot unambiguously determine text
                observations.set(assertion.id, {
                  assertionId: assertion.id,
                  source: assertion.source,
                  status: 'UNAVAILABLE',
                  acquisitionStatus: 'ACQUISITION_FAILED',
                  isAvailable: false,
                  elementCount: count,
                  pageUrl: currentUrl,
                  observedAt,
                  errorDetails: `Ambiguous selector '${assertion.subjectRef}' matched ${count} elements.`,
                });
              } else {
                const text = await locator.innerText({ timeout: 5000 }).catch(() => null);
                observations.set(assertion.id, {
                  assertionId: assertion.id,
                  source: assertion.source,
                  status: text !== null ? 'AVAILABLE' : 'UNAVAILABLE',
                  acquisitionStatus: text !== null ? 'ACQUIRED' : 'ACQUISITION_FAILED',
                  isAvailable: text !== null,
                  elementCount: 1,
                  observedValue: text,
                  pageUrl: currentUrl,
                  observedAt,
                  errorDetails: text === null ? `Failed to extract innerText for '${assertion.subjectRef}'.` : undefined,
                });
              }
            } catch (err: unknown) {
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: 'UNAVAILABLE',
                acquisitionStatus: 'ACQUISITION_FAILED',
                isAvailable: false,
                elementCount: undefined,
                observedValue: undefined,
                pageUrl: currentUrl,
                observedAt,
                errorDetails: `Locator acquisition exception for '${assertion.subjectRef}': ${err instanceof Error ? err.message : String(err)}`,
              });
            }
            break;
          }

          case 'DOM_ATTRIBUTE': {
            // subjectRef format: selector@attributeName or JSON
            const [selector, attrName] = assertion.subjectRef.split('@');
            if (!selector || !attrName) {
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: 'UNAVAILABLE',
                pageUrl: currentUrl,
                observedAt,
                errorDetails: `Invalid subjectRef format '${assertion.subjectRef}'. Expected 'selector@attribute'.`,
              });
              break;
            }

            const locator = page.locator(selector);
            const count = await locator.count().catch(() => 0);
            if (count === 0) {
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: 'NOT_FOUND',
                elementCount: 0,
                pageUrl: currentUrl,
                observedAt,
              });
            } else if (count > 1) {
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: 'UNAVAILABLE',
                elementCount: count,
                pageUrl: currentUrl,
                observedAt,
                errorDetails: `Ambiguous selector '${selector}' matched ${count} elements.`,
              });
            } else {
              const attrVal = await locator.getAttribute(attrName, { timeout: 5000 }).catch(() => null);
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: attrVal !== null ? 'AVAILABLE' : 'NOT_FOUND',
                elementCount: 1,
                observedValue: attrVal,
                pageUrl: currentUrl,
                observedAt,
              });
            }
            break;
          }

          case 'NETWORK_RESPONSE': {
            // assertion.subjectRef is the URL pattern to match
            const entry = params.evidenceCollector.findNetworkEntry(assertion.subjectRef);
            if (!entry) {
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: 'NOT_FOUND',
                pageUrl: currentUrl,
                observedAt,
                errorDetails: `No network request matching '${assertion.subjectRef}' was recorded.`,
              });
            } else {
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: 'AVAILABLE',
                statusCode: entry.status,
                observedValue: entry.status,
                pageUrl: currentUrl,
                observedAt,
              });
            }
            break;
          }

          case 'CONSOLE_LOG': {
            const allLogs = params.evidenceCollector.getAllConsoleEntries();
            const logTexts = allLogs.map((l) => l.text).join('\n');
            observations.set(assertion.id, {
              assertionId: assertion.id,
              source: assertion.source,
              status: 'AVAILABLE',
              observedValue: logTexts,
              pageUrl: currentUrl,
              observedAt,
            });
            break;
          }

          case 'TARGET_READBACK_API': {
            const readback = params.readbackState;
            if (!readback) {
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: 'UNAVAILABLE',
                pageUrl: currentUrl,
                observedAt,
                errorDetails: 'Target readback state was not provided or target has no readback capability.',
              });
            } else {
              const val = (readback as Record<string, unknown>)[assertion.subjectRef];
              observations.set(assertion.id, {
                assertionId: assertion.id,
                source: assertion.source,
                status: val !== undefined ? 'AVAILABLE' : 'NOT_FOUND',
                observedValue: val,
                pageUrl: currentUrl,
                observedAt,
              });
            }
            break;
          }

          default:
            observations.set(assertion.id, {
              assertionId: assertion.id,
              source: assertion.source,
              status: 'UNAVAILABLE',
              pageUrl: currentUrl,
              observedAt,
              errorDetails: `Unsupported observation source '${assertion.source}'.`,
            });
        }
      } catch (err: unknown) {
        observations.set(assertion.id, {
          assertionId: assertion.id,
          source: assertion.source,
          status: 'UNAVAILABLE',
          pageUrl: currentUrl,
          observedAt,
          errorDetails: `Observation acquisition exception: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return observations;
  }
}
