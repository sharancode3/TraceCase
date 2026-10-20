import type { AssertionEvaluation, AttemptAssessment, AttemptFinding } from './types';

export interface AssessAttemptParams {
  attemptNumber: 1 | 2;
  evaluations: AssertionEvaluation[];
  preconditionsMet: boolean;
  procedureCompleted: boolean;
  scopeAdhered: boolean;
  hasMutationUncertainty?: boolean;
  runnerError?: string;
}

export class AttemptAssessor {
  /**
   * Assesses a single attempt's validity and finding.
   * Completely deterministic calculation based on evaluated assertions and execution facts.
   */
  public static assessAttempt(params: AssessAttemptParams): AttemptAssessment {
    const assessedAt = new Date().toISOString();

    const preconditionEvaluations = params.evaluations.filter(
      (e) => e.purpose === 'PRECONDITION'
    );
    const expectedEvaluations = params.evaluations.filter(
      (e) => e.purpose === 'EXPECTED_CORRECT_BEHAVIOR'
    );
    const reportedEvaluations = params.evaluations.filter(
      (e) => e.purpose === 'REPORTED_FAILURE_SIGNATURE'
    );

    // 1. Check Observation Availability
    const anyRequiredUnavailable = params.evaluations.some(
      (e) => e.result === 'OBSERVATION_UNAVAILABLE' || e.result === 'INVALID_EVALUATION'
    );

    // 2. Evaluate Preconditions
    const preconditionsPassed =
      params.preconditionsMet &&
      (preconditionEvaluations.length === 0 ||
        preconditionEvaluations.every((e) => e.result === 'SATISFIED'));

    // 3. Evaluate Expected Condition
    let expectedConditionPassed: boolean | 'UNAVAILABLE' = 'UNAVAILABLE';
    if (expectedEvaluations.length > 0) {
      const hasUnavailable = expectedEvaluations.some(
        (e) => e.result === 'OBSERVATION_UNAVAILABLE' || e.result === 'INVALID_EVALUATION'
      );
      if (hasUnavailable) {
        expectedConditionPassed = 'UNAVAILABLE';
      } else {
        expectedConditionPassed = expectedEvaluations.every((e) => e.result === 'SATISFIED');
      }
    } else {
      expectedConditionPassed = false;
    }

    // 4. Evaluate Reported Failure Condition
    let reportedConditionPassed: boolean | 'UNAVAILABLE' = 'UNAVAILABLE';
    if (reportedEvaluations.length > 0) {
      const hasUnavailable = reportedEvaluations.some(
        (e) => e.result === 'OBSERVATION_UNAVAILABLE' || e.result === 'INVALID_EVALUATION'
      );
      if (hasUnavailable) {
        reportedConditionPassed = 'UNAVAILABLE';
      } else {
        reportedConditionPassed = reportedEvaluations.every((e) => e.result === 'SATISFIED');
      }
    } else {
      reportedConditionPassed = false;
    }

    // 5. Determine Finding from Master Decision Logic
    let finding: AttemptFinding = 'UNRESOLVED';

    if (
      expectedConditionPassed === 'UNAVAILABLE' ||
      reportedConditionPassed === 'UNAVAILABLE'
    ) {
      finding = 'UNRESOLVED';
    } else if (expectedConditionPassed === true && reportedConditionPassed === false) {
      finding = 'EXPECTED_BEHAVIOR';
    } else if (expectedConditionPassed === false && reportedConditionPassed === true) {
      finding = 'REPORTED_FAILURE';
    } else if (expectedConditionPassed === true && reportedConditionPassed === true) {
      finding = 'CONTRADICTORY';
    } else if (expectedConditionPassed === false && reportedConditionPassed === false) {
      finding = 'UNEXPECTED_OUTCOME';
    }

    // 6. Assess Attempt Scientific Validity
    let validity: 'VALID' | 'INVALID' = 'VALID';
    let invalidityReason: string | undefined;

    if (!preconditionsPassed) {
      validity = 'INVALID';
      invalidityReason = 'Preconditions or initial baseline check failed.';
    } else if (params.hasMutationUncertainty) {
      validity = 'INVALID';
      invalidityReason = 'Attempt halted due to mutation uncertainty (timed-out mutating action).';
    } else if (!params.scopeAdhered) {
      validity = 'INVALID';
      invalidityReason = 'Target scope violation: attempted navigation/resource outside allowed origins.';
    } else if (!params.procedureCompleted) {
      validity = 'INVALID';
      invalidityReason = params.runnerError || 'Procedure failed to complete all steps.';
    } else if (anyRequiredUnavailable) {
      validity = 'INVALID';
      invalidityReason = 'Required oracle observations were unavailable or evaluation was invalid.';
    } else if (finding === 'CONTRADICTORY') {
      validity = 'INVALID';
      invalidityReason =
        'Contradictory observations: both expected behavior and reported failure conditions satisfied simultaneously.';
    }

    return {
      attemptNumber: params.attemptNumber,
      validity,
      finding,
      invalidityReason,
      preconditionsMet: preconditionsPassed,
      procedureCompleted: params.procedureCompleted,
      scopeAdhered: params.scopeAdhered,
      requiredObservationsAvailable: !anyRequiredUnavailable,
      evaluations: params.evaluations,
      assessedAt,
    };
  }
}
