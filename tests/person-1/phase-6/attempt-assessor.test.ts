import { describe, it, expect } from 'vitest';
import { AttemptAssessor } from '@/server/verification/attempt-assessor';
import type { AssertionEvaluation } from '@/server/verification/types';

describe('P1-06: Attempt Assessor (Findings and Scientific Validity)', () => {
  const createEval = (
    id: string,
    purpose: 'EXPECTED_CORRECT_BEHAVIOR' | 'REPORTED_FAILURE_SIGNATURE' | 'PRECONDITION',
    result: 'SATISFIED' | 'NOT_SATISFIED' | 'OBSERVATION_UNAVAILABLE' | 'INVALID_EVALUATION'
  ): AssertionEvaluation => ({
    assertionId: id,
    kind: 'ENTITY_PRESENCE',
    purpose,
    result,
    evaluatedAt: new Date().toISOString(),
  });

  describe('Finding Determination (5 Findings)', () => {
    it('determines REPORTED_FAILURE when reported signature is satisfied and expected is not satisfied', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'NOT_SATISFIED'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: true,
        procedureCompleted: true,
        scopeAdhered: true,
      });

      expect(assessment.finding).toBe('REPORTED_FAILURE');
      expect(assessment.validity).toBe('VALID');
      expect(assessment.requiredObservationsAvailable).toBe(true);
    });

    it('determines EXPECTED_BEHAVIOR when expected condition is satisfied and reported signature is not satisfied', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'SATISFIED'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'NOT_SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: true,
        procedureCompleted: true,
        scopeAdhered: true,
      });

      expect(assessment.finding).toBe('EXPECTED_BEHAVIOR');
      expect(assessment.validity).toBe('VALID');
    });

    it('determines CONTRADICTORY when both expected and reported conditions are satisfied simultaneously', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'SATISFIED'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: true,
        procedureCompleted: true,
        scopeAdhered: true,
      });

      expect(assessment.finding).toBe('CONTRADICTORY');
      // Contradictory oracle results in INVALID attempt
      expect(assessment.validity).toBe('INVALID');
      expect(assessment.invalidityReason).toContain('Contradictory');
    });

    it('determines UNEXPECTED_OUTCOME when neither expected nor reported conditions match', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'NOT_SATISFIED'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'NOT_SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: true,
        procedureCompleted: true,
        scopeAdhered: true,
      });

      expect(assessment.finding).toBe('UNEXPECTED_OUTCOME');
      expect(assessment.validity).toBe('VALID');
    });

    it('determines UNRESOLVED when required observation is unavailable or evaluation is invalid', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'OBSERVATION_UNAVAILABLE'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'NOT_SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: true,
        procedureCompleted: true,
        scopeAdhered: true,
      });

      expect(assessment.finding).toBe('UNRESOLVED');
      expect(assessment.validity).toBe('INVALID');
      expect(assessment.requiredObservationsAvailable).toBe(false);
      expect(assessment.invalidityReason).toContain('Required oracle observations were unavailable');
    });
  });

  describe('4-Point Attempt Validity Guard', () => {
    it('invalidates attempt when preconditions are not met', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'NOT_SATISFIED'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: false, // Preconditions failed!
        procedureCompleted: true,
        scopeAdhered: true,
      });

      expect(assessment.finding).toBe('REPORTED_FAILURE');
      expect(assessment.validity).toBe('INVALID');
      expect(assessment.invalidityReason).toContain('Preconditions or initial baseline');
    });

    it('invalidates attempt when mutation uncertainty occurred', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'NOT_SATISFIED'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: true,
        procedureCompleted: false,
        scopeAdhered: true,
        hasMutationUncertainty: true,
      });

      expect(assessment.validity).toBe('INVALID');
      expect(assessment.invalidityReason).toContain('mutation uncertainty');
    });

    it('invalidates attempt when browser execution procedure did not complete cleanly', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'NOT_SATISFIED'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: true,
        procedureCompleted: false, // crashed step or runner timeout
        scopeAdhered: true,
        runnerError: 'Playwright locator timed out after 5000ms',
      });

      expect(assessment.validity).toBe('INVALID');
      expect(assessment.invalidityReason).toContain('Playwright locator timed out');
    });

    it('invalidates attempt when target scope was violated during execution', () => {
      const evaluations = [
        createEval('exp-1', 'EXPECTED_CORRECT_BEHAVIOR', 'NOT_SATISFIED'),
        createEval('rep-1', 'REPORTED_FAILURE_SIGNATURE', 'SATISFIED'),
      ];

      const assessment = AttemptAssessor.assessAttempt({
        attemptNumber: 1,
        evaluations,
        preconditionsMet: true,
        procedureCompleted: true,
        scopeAdhered: false, // navigated outside allowedOrigins
      });

      expect(assessment.validity).toBe('INVALID');
      expect(assessment.invalidityReason).toContain('Target scope violation');
    });
  });
});
