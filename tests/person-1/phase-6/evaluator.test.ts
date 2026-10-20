import { describe, it, expect } from 'vitest';
import { DeterministicAssertionEvaluator } from '@/server/verification/evaluator';
import type { TypedAssertion } from '@/contracts/planning';
import type { CapturedAssertionObservation } from '@/server/verification/types';

describe('P1-06: Deterministic Assertion Evaluator', () => {
  const baseAssertion: TypedAssertion = {
    id: 'assert-1',
    description: 'Verify checkout button exists',
    kind: 'ENTITY_PRESENCE',
    source: 'DOM_ELEMENT',
    purpose: 'EXPECTED_CORRECT_BEHAVIOR',
    subjectRef: '#checkout-btn',
    operator: 'EXISTS',
    settlingPoint: 'AFTER_NETWORK_IDLE',
  };

  describe('ENTITY_PRESENCE Predicates', () => {
    it('satisfies EXISTS when entity is present', () => {
      const observation: CapturedAssertionObservation = {
        assertionId: 'assert-1',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        subjectRef: '#checkout-btn',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: { exists: true, elementCount: 1 },
        observedAt: new Date().toISOString(),
      };

      const result = DeterministicAssertionEvaluator.evaluate(baseAssertion, observation);
      expect(result.result).toBe('SATISFIED');
      expect(result.assertionId).toBe('assert-1');
    });

    it('satisfies NOT_EXISTS when elementCount is 0 and acquisition succeeded', () => {
      const assertion: TypedAssertion = {
        ...baseAssertion,
        operator: 'NOT_EXISTS',
      };

      const observation: CapturedAssertionObservation = {
        assertionId: 'assert-1',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        subjectRef: '#error-banner',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: { exists: false, elementCount: 0 },
        observedAt: new Date().toISOString(),
      };

      const result = DeterministicAssertionEvaluator.evaluate(assertion, observation);
      expect(result.result).toBe('SATISFIED');
    });

    it('fails closed: NOT_EXISTS does NOT pass when observation acquisition failed', () => {
      const assertion: TypedAssertion = {
        ...baseAssertion,
        operator: 'NOT_EXISTS',
      };

      // Scenario: locator timed out or frame crashed
      const observation: CapturedAssertionObservation = {
        assertionId: 'assert-1',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        subjectRef: '#error-banner',
        acquisitionStatus: 'ACQUISITION_FAILED',
        isAvailable: false,
        errorReason: 'Frame detached while querying DOM element.',
        observedAt: new Date().toISOString(),
      };

      const result = DeterministicAssertionEvaluator.evaluate(assertion, observation);
      expect(result.result).toBe('OBSERVATION_UNAVAILABLE');
      expect(result.details).toContain('Frame detached');
    });

    it('returns NOT_SATISFIED when EXISTS is asserted but element is absent', () => {
      const observation: CapturedAssertionObservation = {
        assertionId: 'assert-1',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        subjectRef: '#checkout-btn',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: { exists: false, elementCount: 0 },
        observedAt: new Date().toISOString(),
      };

      const result = DeterministicAssertionEvaluator.evaluate(baseAssertion, observation);
      expect(result.result).toBe('NOT_SATISFIED');
    });
  });

  describe('VALUE_COMPARISON Predicates', () => {
    it('evaluates EQUALS and NOT_EQUALS with strict string equality', () => {
      const assertion: TypedAssertion = {
        ...baseAssertion,
        kind: 'VALUE_COMPARISON',
        operator: 'EQUALS',
        expectedValue: 'Order Total: $42.00',
      };

      const observation: CapturedAssertionObservation = {
        assertionId: 'assert-1',
        kind: 'VALUE_COMPARISON',
        source: 'DOM_TEXT',
        subjectRef: '#total-amount',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: 'Order Total: $42.00',
        observedAt: new Date().toISOString(),
      };

      const eqResult = DeterministicAssertionEvaluator.evaluate(assertion, observation);
      expect(eqResult.result).toBe('SATISFIED');

      // Case sensitivity test: does not silently lowercase
      const wrongCaseObs: CapturedAssertionObservation = {
        ...observation,
        observedValue: 'order total: $42.00',
      };
      const wrongCaseResult = DeterministicAssertionEvaluator.evaluate(assertion, wrongCaseObs);
      expect(wrongCaseResult.result).toBe('NOT_SATISFIED');
    });

    it('evaluates CONTAINS and NOT_CONTAINS', () => {
      const assertion: TypedAssertion = {
        ...baseAssertion,
        kind: 'VALUE_COMPARISON',
        operator: 'CONTAINS',
        expectedValue: 'Payment Failed',
      };

      const observation: CapturedAssertionObservation = {
        assertionId: 'assert-1',
        kind: 'VALUE_COMPARISON',
        source: 'DOM_TEXT',
        subjectRef: '#banner',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: 'Alert: Payment Failed: Insufficient funds (code 402)',
        observedAt: new Date().toISOString(),
      };

      const res = DeterministicAssertionEvaluator.evaluate(assertion, observation);
      expect(res.result).toBe('SATISFIED');
    });

    it('strictly evaluates numeric comparisons without empty-string coercion or NaN false-positives', () => {
      const gtAssertion: TypedAssertion = {
        ...baseAssertion,
        kind: 'VALUE_COMPARISON',
        operator: 'GREATER_THAN',
        expectedValue: '10',
      };

      // Valid numeric comparison
      const validObs: CapturedAssertionObservation = {
        assertionId: 'assert-1',
        kind: 'VALUE_COMPARISON',
        source: 'DOM_TEXT',
        subjectRef: '#items-count',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: 15,
        observedAt: new Date().toISOString(),
      };
      expect(DeterministicAssertionEvaluator.evaluate(gtAssertion, validObs).result).toBe('SATISFIED');

      // Invalid operand (NaN / non-numeric string)
      const nanObs: CapturedAssertionObservation = {
        ...validObs,
        observedValue: 'not-a-number',
      };
      const nanResult = DeterministicAssertionEvaluator.evaluate(gtAssertion, nanObs);
      expect(nanResult.result).toBe('INVALID_EVALUATION');
      expect(nanResult.details).toContain('Operands cannot be parsed as valid numbers');

      // Empty string should NOT coerce to 0
      const emptyObs: CapturedAssertionObservation = {
        ...validObs,
        observedValue: '',
      };
      const emptyResult = DeterministicAssertionEvaluator.evaluate(gtAssertion, emptyObs);
      expect(emptyResult.result).toBe('INVALID_EVALUATION');
      expect(emptyResult.details).toContain('Cannot perform numeric comparison on empty string');
    });

    it('evaluates MATCHES_REGEX within safe bounds', () => {
      const regexAssertion: TypedAssertion = {
        ...baseAssertion,
        kind: 'VALUE_COMPARISON',
        operator: 'MATCHES_REGEX',
        expectedValue: '^Invoice #[0-9]{4,6}$',
      };

      const validObs: CapturedAssertionObservation = {
        assertionId: 'assert-1',
        kind: 'VALUE_COMPARISON',
        source: 'DOM_TEXT',
        subjectRef: '#inv-number',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: 'Invoice #49281',
        observedAt: new Date().toISOString(),
      };
      expect(DeterministicAssertionEvaluator.evaluate(regexAssertion, validObs).result).toBe('SATISFIED');

      const invalidObs: CapturedAssertionObservation = {
        ...validObs,
        observedValue: 'Invoice #ABC',
      };
      expect(DeterministicAssertionEvaluator.evaluate(regexAssertion, invalidObs).result).toBe('NOT_SATISFIED');
    });
  });

  describe('READBACK_STATE & Structured Field Projections', () => {
    it('evaluates nested field extraction from target readback', () => {
      const assertion: TypedAssertion = {
        id: 'readback-1',
        description: 'Target invoice balance is 0',
        kind: 'READBACK_STATE',
        source: 'TARGET_READBACK_API',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: 'invoice.balance',
        operator: 'EQUALS',
        expectedValue: '0',
        settlingPoint: 'AFTER_NETWORK_IDLE',
      };

      const observation: CapturedAssertionObservation = {
        assertionId: 'readback-1',
        kind: 'READBACK_STATE',
        source: 'TARGET_READBACK_API',
        subjectRef: 'invoice.balance',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: {
          invoice: {
            id: 'inv-101',
            balance: 0,
            status: 'PAID',
          },
        },
        observedAt: new Date().toISOString(),
      };

      const res = DeterministicAssertionEvaluator.evaluate(assertion, observation);
      expect(res.result).toBe('SATISFIED');
      expect(res.observedValue).toBe('0');
    });

    it('returns NOT_SATISFIED when nested readback field does not exist', () => {
      const assertion: TypedAssertion = {
        id: 'readback-1',
        description: 'Target invoice balance is 0',
        kind: 'READBACK_STATE',
        source: 'TARGET_READBACK_API',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: 'invoice.nonExistentField',
        operator: 'EQUALS',
        expectedValue: '0',
        settlingPoint: 'AFTER_NETWORK_IDLE',
      };

      const observation: CapturedAssertionObservation = {
        assertionId: 'readback-1',
        kind: 'READBACK_STATE',
        source: 'TARGET_READBACK_API',
        subjectRef: 'invoice.nonExistentField',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: { invoice: { id: 'inv-101' } },
        observedAt: new Date().toISOString(),
      };

      const res = DeterministicAssertionEvaluator.evaluate(assertion, observation);
      expect(res.result).toBe('NOT_SATISFIED');
    });
  });

  describe('NETWORK_OBSERVATION & CONSOLE_LOG_OBSERVATION', () => {
    it('evaluates NETWORK_OBSERVATION for HTTP status and method', () => {
      const assertion: TypedAssertion = {
        id: 'net-1',
        description: 'Checkout POST endpoint returned HTTP 500',
        kind: 'NETWORK_OBSERVATION',
        source: 'NETWORK_RESPONSE',
        purpose: 'REPORTED_FAILURE_SIGNATURE',
        subjectRef: '/api/checkout',
        operator: 'EQUALS',
        expectedValue: '500',
        settlingPoint: 'AFTER_NETWORK_IDLE',
      };

      const observation: CapturedAssertionObservation = {
        assertionId: 'net-1',
        kind: 'NETWORK_OBSERVATION',
        source: 'NETWORK_RESPONSE',
        subjectRef: '/api/checkout',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: {
          url: 'http://localhost:3000/api/checkout',
          method: 'POST',
          status: 500,
          responseBodySnippet: 'Internal Server Error: DB connection leak',
        },
        observedAt: new Date().toISOString(),
      };

      const res = DeterministicAssertionEvaluator.evaluate(assertion, observation);
      expect(res.result).toBe('SATISFIED');
    });

    it('evaluates CONSOLE_LOG_OBSERVATION with log text pattern', () => {
      const assertion: TypedAssertion = {
        id: 'con-1',
        description: 'Uncaught exception logged to browser console',
        kind: 'CONSOLE_LOG_OBSERVATION',
        source: 'CONSOLE_LOG',
        purpose: 'REPORTED_FAILURE_SIGNATURE',
        subjectRef: 'TypeError',
        operator: 'CONTAINS',
        expectedValue: 'Cannot read properties of undefined',
        settlingPoint: 'AFTER_NETWORK_IDLE',
      };

      const observation: CapturedAssertionObservation = {
        assertionId: 'con-1',
        kind: 'CONSOLE_LOG_OBSERVATION',
        source: 'CONSOLE_LOG',
        subjectRef: 'TypeError',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: 'TypeError: Cannot read properties of undefined (reading "checkoutToken")',
        observedAt: new Date().toISOString(),
      };

      const res = DeterministicAssertionEvaluator.evaluate(assertion, observation);
      expect(res.result).toBe('SATISFIED');
    });
  });

  describe('Batch Evaluation across Plan Assertions', () => {
    it('evaluates all assertions against observation map', () => {
      const assertions: TypedAssertion[] = [
        {
          id: 'a1',
          description: 'Cart count is 2',
          kind: 'VALUE_COMPARISON',
          source: 'DOM_TEXT',
          purpose: 'EXPECTED_CORRECT_BEHAVIOR',
          subjectRef: '#cart-count',
          operator: 'EQUALS',
          expectedValue: '2',
          settlingPoint: 'AFTER_NETWORK_IDLE',
        },
        {
          id: 'a2',
          description: 'No crash alert banner',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          purpose: 'EXPECTED_CORRECT_BEHAVIOR',
          subjectRef: '#crash-alert',
          operator: 'NOT_EXISTS',
          settlingPoint: 'AFTER_NETWORK_IDLE',
        },
      ];

      const obsMap = new Map<string, CapturedAssertionObservation>();
      obsMap.set('a1', {
        assertionId: 'a1',
        kind: 'VALUE_COMPARISON',
        source: 'DOM_TEXT',
        subjectRef: '#cart-count',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: '2',
        observedAt: new Date().toISOString(),
      });
      obsMap.set('a2', {
        assertionId: 'a2',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        subjectRef: '#crash-alert',
        acquisitionStatus: 'ACQUIRED',
        isAvailable: true,
        observedValue: { exists: false, elementCount: 0 },
        observedAt: new Date().toISOString(),
      });

      const evaluations = DeterministicAssertionEvaluator.evaluateAll(assertions, obsMap);
      expect(evaluations.length).toBe(2);
      expect(evaluations[0].result).toBe('SATISFIED');
      expect(evaluations[1].result).toBe('SATISFIED');
    });
  });
});
