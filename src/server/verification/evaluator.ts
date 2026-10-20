import type { TypedAssertion } from '@/contracts/planning';
import type { CapturedAssertionObservation, AssertionEvaluation } from './types';

export class DeterministicAssertionEvaluator {
  /**
   * Evaluates a single frozen assertion against its authoritative captured observation.
   * Pure deterministic function without I/O, external network calls, or AI inference.
   */
  public static evaluateAssertion(
    assertion: TypedAssertion,
    observation: CapturedAssertionObservation
  ): AssertionEvaluation {
    const evaluatedAt = new Date().toISOString();
    const expected = assertion.expectedValue;

    // Check observation availability
    const isUnavailable =
      observation.status === 'UNAVAILABLE' ||
      observation.status === 'TIMEOUT' ||
      observation.acquisitionStatus === 'ACQUISITION_FAILED' ||
      observation.isAvailable === false;

    if (isUnavailable) {
      return {
        assertionId: assertion.id,
        kind: assertion.kind,
        purpose: assertion.purpose,
        result: 'OBSERVATION_UNAVAILABLE',
        expectedValue: expected !== undefined ? String(expected) : undefined,
        observedValue: undefined,
        details:
          observation.errorDetails ||
          observation.errorReason ||
          `Observation acquisition failed.`,
        evaluatedAt,
      };
    }

    const observedStr =
      observation.observedValue !== undefined && observation.observedValue !== null
        ? String(observation.observedValue)
        : undefined;

    switch (assertion.kind) {
      case 'ENTITY_PRESENCE': {
        let count = observation.elementCount;
        if (count === undefined && typeof observation.observedValue === 'object' && observation.observedValue !== null) {
          const obsRecord = observation.observedValue as Record<string, unknown>;
          if (typeof obsRecord.elementCount === 'number') {
            count = obsRecord.elementCount;
          } else if (typeof obsRecord.exists === 'boolean') {
            count = obsRecord.exists ? 1 : 0;
          }
        }
        if (count === undefined) {
          count = observation.status === 'AVAILABLE' || observation.isAvailable ? 1 : 0;
        }

        if (assertion.operator === 'EXISTS') {
          const satisfied = count > 0;
          return {
            assertionId: assertion.id,
            kind: assertion.kind,
            purpose: assertion.purpose,
            result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
            expectedValue: '> 0 elements',
            observedValue: `${count} elements`,
            details: satisfied ? 'Target element is present in DOM.' : 'Target element is absent.',
            evaluatedAt,
          };
        }

        if (assertion.operator === 'NOT_EXISTS') {
          // NOT_EXISTS only succeeds if observation was successfully acquired and count is 0
          const satisfied = count === 0;
          return {
            assertionId: assertion.id,
            kind: assertion.kind,
            purpose: assertion.purpose,
            result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
            expectedValue: '0 elements',
            observedValue: `${count} elements`,
            details: satisfied ? 'Target element is confirmed absent.' : 'Target element unexpectedly exists.',
            evaluatedAt,
          };
        }

        return {
          assertionId: assertion.id,
          kind: assertion.kind,
          purpose: assertion.purpose,
          result: 'UNSUPPORTED',
          expectedValue: expected !== undefined ? String(expected) : undefined,
          observedValue: observedStr,
          details: `Operator '${assertion.operator}' is unsupported for ENTITY_PRESENCE.`,
          evaluatedAt,
        };
      }

      case 'VALUE_COMPARISON':
      case 'READBACK_STATE': {
        let observedVal = observation.observedValue;
        if (typeof observedVal === 'object' && observedVal !== null && assertion.subjectRef) {
          const parts = assertion.subjectRef.split('.');
          let current: unknown = observedVal;
          for (const part of parts) {
            if (current !== undefined && current !== null && typeof current === 'object' && part in current) {
              current = (current as Record<string, unknown>)[part];
            } else {
              current = undefined;
              break;
            }
          }
          observedVal = current;
        }

        if (observedVal === undefined || observedVal === null) {
          if (assertion.operator === 'NOT_EXISTS') {
            return {
              assertionId: assertion.id,
              kind: assertion.kind,
              purpose: assertion.purpose,
              result: 'SATISFIED',
              expectedValue: 'absent/null',
              observedValue: 'null',
              evaluatedAt,
            };
          }
          return {
            assertionId: assertion.id,
            kind: assertion.kind,
            purpose: assertion.purpose,
            result: 'NOT_SATISFIED',
            expectedValue: expected !== undefined ? String(expected) : undefined,
            observedValue: 'null',
            details: 'Target value was null or undefined.',
            evaluatedAt,
          };
        }

        switch (assertion.operator) {
          case 'EQUALS': {
            const satisfied = String(observedVal) === String(expected ?? '');
            return {
              assertionId: assertion.id,
              kind: assertion.kind,
              purpose: assertion.purpose,
              result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
              expectedValue: expected !== undefined ? String(expected) : undefined,
              observedValue: String(observedVal),
              details: satisfied ? 'Values match exactly.' : 'Values do not match.',
              evaluatedAt,
            };
          }

          case 'NOT_EQUALS': {
            const satisfied = String(observedVal) !== String(expected ?? '');
            return {
              assertionId: assertion.id,
              kind: assertion.kind,
              purpose: assertion.purpose,
              result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
              expectedValue: `!= ${expected}`,
              observedValue: String(observedVal),
              details: satisfied ? 'Values are not equal.' : 'Values are unexpectedly equal.',
              evaluatedAt,
            };
          }

          case 'CONTAINS': {
            const needle = String(expected ?? '');
            const satisfied = String(observedVal).includes(needle);
            return {
              assertionId: assertion.id,
              kind: assertion.kind,
              purpose: assertion.purpose,
              result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
              expectedValue: `contains "${needle}"`,
              observedValue: String(observedVal),
              details: satisfied ? 'Substring found.' : 'Substring not found.',
              evaluatedAt,
            };
          }

          case 'NOT_CONTAINS': {
            const needle = String(expected ?? '');
            const satisfied = !String(observedVal).includes(needle);
            return {
              assertionId: assertion.id,
              kind: assertion.kind,
              purpose: assertion.purpose,
              result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
              expectedValue: `not contains "${needle}"`,
              observedValue: String(observedVal),
              details: satisfied ? 'Substring absent.' : 'Substring unexpectedly present.',
              evaluatedAt,
            };
          }

          case 'GREATER_THAN': {
            if (typeof observedVal === 'string' && observedVal.trim() === '') {
              return {
                assertionId: assertion.id,
                kind: assertion.kind,
                purpose: assertion.purpose,
                result: 'INVALID_EVALUATION',
                expectedValue: expected !== undefined ? String(expected) : undefined,
                observedValue: '""',
                details: 'Cannot perform numeric comparison on empty string.',
                evaluatedAt,
              };
            }
            const numObs = Number(observedVal);
            const numExp = Number(expected);
            if (Number.isNaN(numObs) || Number.isNaN(numExp)) {
              return {
                assertionId: assertion.id,
                kind: assertion.kind,
                purpose: assertion.purpose,
                result: 'INVALID_EVALUATION',
                expectedValue: expected !== undefined ? String(expected) : undefined,
                observedValue: String(observedVal),
                details: 'Operands cannot be parsed as valid numbers.',
                evaluatedAt,
              };
            }
            const satisfied = numObs > numExp;
            return {
              assertionId: assertion.id,
              kind: assertion.kind,
              purpose: assertion.purpose,
              result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
              expectedValue: `> ${numExp}`,
              observedValue: String(numObs),
              evaluatedAt,
            };
          }

          case 'LESS_THAN': {
            if (typeof observedVal === 'string' && observedVal.trim() === '') {
              return {
                assertionId: assertion.id,
                kind: assertion.kind,
                purpose: assertion.purpose,
                result: 'INVALID_EVALUATION',
                expectedValue: expected !== undefined ? String(expected) : undefined,
                observedValue: '""',
                details: 'Cannot perform numeric comparison on empty string.',
                evaluatedAt,
              };
            }
            const numObs = Number(observedVal);
            const numExp = Number(expected);
            if (Number.isNaN(numObs) || Number.isNaN(numExp)) {
              return {
                assertionId: assertion.id,
                kind: assertion.kind,
                purpose: assertion.purpose,
                result: 'INVALID_EVALUATION',
                expectedValue: expected !== undefined ? String(expected) : undefined,
                observedValue: String(observedVal),
                details: 'Operands cannot be parsed as valid numbers.',
                evaluatedAt,
              };
            }
            const satisfied = numObs < numExp;
            return {
              assertionId: assertion.id,
              kind: assertion.kind,
              purpose: assertion.purpose,
              result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
              expectedValue: `< ${numExp}`,
              observedValue: String(numObs),
              evaluatedAt,
            };
          }

          case 'MATCHES_REGEX': {
            try {
              const regexStr = String(expected ?? '');
              if (regexStr.length > 200) {
                return {
                  assertionId: assertion.id,
                  kind: assertion.kind,
                  purpose: assertion.purpose,
                  result: 'INVALID_EVALUATION',
                  expectedValue: expected !== undefined ? String(expected) : undefined,
                  observedValue: String(observedVal),
                  details: 'Regular expression pattern exceeds safety limit of 200 characters.',
                  evaluatedAt,
                };
              }

              // Reject catastrophic backtracking (ReDoS) nested quantifier constructs
              const hasNestedQuantifier =
                /\([^)]*(\+|\*|\{\d+,?\d*\})[^)]*\)(\+|\*|\{\d+,?\d*\})/.test(regexStr) ||
                /(\+|\*|\{\d+,?\d*\})(\+|\*|\{\d+,?\d*\})/.test(regexStr);

              if (hasNestedQuantifier) {
                return {
                  assertionId: assertion.id,
                  kind: assertion.kind,
                  purpose: assertion.purpose,
                  result: 'INVALID_EVALUATION',
                  expectedValue: expected !== undefined ? String(expected) : undefined,
                  observedValue: String(observedVal),
                  details: 'Regular expression rejected: potential catastrophic backtracking pattern detected.',
                  evaluatedAt,
                };
              }

              const textToTest = String(observedVal);
              if (textToTest.length > 5000) {
                return {
                  assertionId: assertion.id,
                  kind: assertion.kind,
                  purpose: assertion.purpose,
                  result: 'INVALID_EVALUATION',
                  expectedValue: expected !== undefined ? String(expected) : undefined,
                  observedValue: textToTest.slice(0, 100) + '...',
                  details: 'Observed text exceeds regex evaluation safety limit of 5000 characters.',
                  evaluatedAt,
                };
              }

              const regex = new RegExp(regexStr);
              const satisfied = regex.test(textToTest);
              return {
                assertionId: assertion.id,
                kind: assertion.kind,
                purpose: assertion.purpose,
                result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
                expectedValue: `matches /${expected}/`,
                observedValue: String(observedVal),
                evaluatedAt,
              };
            } catch (err: unknown) {
              return {
                assertionId: assertion.id,
                kind: assertion.kind,
                purpose: assertion.purpose,
                result: 'INVALID_EVALUATION',
                expectedValue: expected !== undefined ? String(expected) : undefined,
                observedValue: String(observedVal),
                details: `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`,
                evaluatedAt,
              };
            }
          }

          default:
            return {
              assertionId: assertion.id,
              kind: assertion.kind,
              purpose: assertion.purpose,
              result: 'UNSUPPORTED',
              expectedValue: expected !== undefined ? String(expected) : undefined,
              observedValue: String(observedVal),
              details: `Operator '${assertion.operator}' is unsupported for ${assertion.kind}.`,
              evaluatedAt,
            };
        }
      }

      case 'NETWORK_OBSERVATION': {
        let actualStatus = observation.statusCode;
        if (actualStatus === undefined && typeof observation.observedValue === 'object' && observation.observedValue !== null) {
          const statusVal = (observation.observedValue as Record<string, unknown>).status;
          if (typeof statusVal === 'number') {
            actualStatus = statusVal;
          }
        }

        if (actualStatus === undefined) {
          return {
            assertionId: assertion.id,
            kind: assertion.kind,
            purpose: assertion.purpose,
            result: 'OBSERVATION_UNAVAILABLE',
            expectedValue: expected !== undefined ? String(expected) : undefined,
            details: 'No HTTP response matching the specified pattern was intercepted.',
            evaluatedAt,
          };
        }

        const expectedStatus = Number(expected);
        if (Number.isNaN(expectedStatus)) {
          return {
            assertionId: assertion.id,
            kind: assertion.kind,
            purpose: assertion.purpose,
            result: 'INVALID_EVALUATION',
            expectedValue: expected !== undefined ? String(expected) : undefined,
            observedValue: String(actualStatus),
            details: `Expected status code '${expected}' is not a valid number.`,
            evaluatedAt,
          };
        }

        const satisfied = actualStatus === expectedStatus;
        return {
          assertionId: assertion.id,
          kind: assertion.kind,
          purpose: assertion.purpose,
          result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
          expectedValue: `HTTP ${expectedStatus}`,
          observedValue: `HTTP ${actualStatus}`,
          details: satisfied ? 'HTTP status matches expected.' : 'HTTP status mismatch.',
          evaluatedAt,
        };
      }

      case 'CONSOLE_LOG_OBSERVATION': {
        const needle = String(expected ?? '');
        const logContent = observation.observedValue ? String(observation.observedValue) : '';

        if (assertion.operator === 'CONTAINS' || assertion.operator === 'EXISTS') {
          const satisfied = logContent.includes(needle);
          return {
            assertionId: assertion.id,
            kind: assertion.kind,
            purpose: assertion.purpose,
            result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
            expectedValue: `contains "${needle}"`,
            observedValue: logContent ? logContent.slice(0, 200) : 'none',
            details: satisfied ? 'Console message observed.' : 'Console message not observed.',
            evaluatedAt,
          };
        }

        if (assertion.operator === 'NOT_CONTAINS' || assertion.operator === 'NOT_EXISTS') {
          const satisfied = !logContent.includes(needle);
          return {
            assertionId: assertion.id,
            kind: assertion.kind,
            purpose: assertion.purpose,
            result: satisfied ? 'SATISFIED' : 'NOT_SATISFIED',
            expectedValue: `not contains "${needle}"`,
            observedValue: logContent ? logContent.slice(0, 200) : 'none',
            details: satisfied ? 'Console message confirmed absent.' : 'Console message was logged.',
            evaluatedAt,
          };
        }

        return {
          assertionId: assertion.id,
          kind: assertion.kind,
          purpose: assertion.purpose,
          result: 'UNSUPPORTED',
          expectedValue: expected !== undefined ? String(expected) : undefined,
          details: `Operator '${assertion.operator}' unsupported for CONSOLE_LOG_OBSERVATION.`,
          evaluatedAt,
        };
      }

      default:
        return {
          assertionId: assertion.id,
          kind: assertion.kind,
          purpose: assertion.purpose,
          result: 'UNSUPPORTED',
          expectedValue: expected !== undefined ? String(expected) : undefined,
          details: `Assertion kind '${assertion.kind}' is unsupported by the deterministic verifier.`,
          evaluatedAt,
        };
    }
  }

  public static evaluate = DeterministicAssertionEvaluator.evaluateAssertion;

  /**
   * Evaluates all assertions for a given attempt.
   */
  public static evaluateAll(
    assertions: TypedAssertion[],
    observationsMap: Map<string, CapturedAssertionObservation>
  ): AssertionEvaluation[] {
    return assertions.map((assertion) => {
      const observation = observationsMap.get(assertion.id) || {
        assertionId: assertion.id,
        source: assertion.source,
        status: 'UNAVAILABLE',
        pageUrl: 'unknown',
        observedAt: new Date().toISOString(),
        errorDetails: 'No observation was captured for this assertion.',
      };

      return DeterministicAssertionEvaluator.evaluateAssertion(assertion, observation);
    });
  }
}
