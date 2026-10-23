import type { AttemptAssessment, PairAssessmentResult } from './types';
import type { VerifiedResetReceipt } from '@/contracts/reset';

export interface AssessPairParams {
  investigationId: string;
  attempt1: AttemptAssessment;
  attempt2?: AttemptAssessment;
  resetReceipt?: VerifiedResetReceipt;
  targetBuildIdAttempt1?: string;
  targetBuildIdAttempt2?: string;
  allowUnattestedTargetBuild?: boolean;
  isCancelled?: boolean;
}

export class PairAssessor {
  /**
   * Evaluates the master pair decision table across two attempts.
   * Completely deterministic rule engine satisfying PS-REQ-001, PS-REQ-002, TC1, and TC2.
   */
  public static assessPair(params: AssessPairParams): PairAssessmentResult {
    const assessedAt = new Date().toISOString();
    const limitations: string[] = [];

    // Cancellation check
    if (params.isCancelled) {
      return {
        investigationId: params.investigationId,
        verdict: 'INCONCLUSIVE',
        validAttemptCount: params.attempt1.validity === 'VALID' ? 1 : 0,
        matchingAttemptCount: params.attempt1.finding === 'REPORTED_FAILURE' ? 1 : 0,
        isComparable: false,
        attempt1Assessment: params.attempt1,
        attempt2Assessment: params.attempt2,
        resetReceipt: params.resetReceipt,
        summary: 'Investigation was cancelled by user operator.',
        limitations: ['Execution aborted prior to normal completion.'],
        assessedAt,
      };
    }

    const att1 = params.attempt1;
    const att2 = params.attempt2;

    const validAttemptCount =
      (att1.validity === 'VALID' ? 1 : 0) + (att2?.validity === 'VALID' ? 1 : 0);

    const matchingAttemptCount =
      (att1.finding === 'REPORTED_FAILURE' && att1.validity === 'VALID' ? 1 : 0) +
      (att2?.finding === 'REPORTED_FAILURE' && att2?.validity === 'VALID' ? 1 : 0);

    // Check reset gate between Attempt 1 and Attempt 2
    const resetSucceeded = params.resetReceipt?.isVerifiedRestored ?? false;
    if (att2 && params.resetReceipt && !resetSucceeded) {
      limitations.push('Target fixture reset failed or could not be verified by independent readback.');
    }

    // Check build comparability
    let isComparable = false;
    if (att1 && att2) {
      let buildsMatch = false;

      if (params.targetBuildIdAttempt1 && params.targetBuildIdAttempt2) {
        buildsMatch = params.targetBuildIdAttempt1 === params.targetBuildIdAttempt2;
        if (!buildsMatch) {
          limitations.push(
            `Target build identity changed between Attempt 1 ('${params.targetBuildIdAttempt1}') and Attempt 2 ('${params.targetBuildIdAttempt2}').`
          );
        }
      } else if (params.allowUnattestedTargetBuild === false) {
        buildsMatch = false;
        limitations.push('Target build identity was not attested; environment comparability cannot be proven.');
      } else {
        buildsMatch = true;
        limitations.push('Target build identity was not attested; comparability assumes stable deployment.');
      }

      isComparable =
        att1.validity === 'VALID' &&
        att2.validity === 'VALID' &&
        resetSucceeded &&
        buildsMatch;
    }

    // Branch 1: Two valid, comparable attempts both exhibit the reported failure signature (TC1)
    if (
      isComparable &&
      att1.finding === 'REPORTED_FAILURE' &&
      att2?.finding === 'REPORTED_FAILURE'
    ) {
      return {
        investigationId: params.investigationId,
        verdict: 'CONFIRMED_REPRODUCED',
        validAttemptCount,
        matchingAttemptCount,
        isComparable: true,
        attempt1Assessment: att1,
        attempt2Assessment: att2,
        resetReceipt: params.resetReceipt,
        summary:
          'Defect confirmed: The reported failure signature was observed in 2 independent, valid reproduction runs under verified equivalent baseline conditions.',
        limitations,
        assessedAt,
      };
    }

    // Branch 2: Two valid, comparable attempts both exhibit intended correct behavior (TC2)
    if (
      isComparable &&
      att1.finding === 'EXPECTED_BEHAVIOR' &&
      att2?.finding === 'EXPECTED_BEHAVIOR'
    ) {
      return {
        investigationId: params.investigationId,
        verdict: 'NOT_REPRODUCED',
        validAttemptCount,
        matchingAttemptCount,
        isComparable: true,
        attempt1Assessment: att1,
        attempt2Assessment: att2,
        resetReceipt: params.resetReceipt,
        summary:
          'Bug not reproduced: Intended correct behavior was observed in 2 independent, valid reproduction runs under verified equivalent baseline conditions.',
        limitations,
        assessedAt,
      };
    }

    // Branch 3: Conflicting findings (Failure in Run 1, Correct in Run 2, or vice versa)
    if (
      isComparable &&
      ((att1.finding === 'REPORTED_FAILURE' && att2?.finding === 'EXPECTED_BEHAVIOR') ||
        (att1.finding === 'EXPECTED_BEHAVIOR' && att2?.finding === 'REPORTED_FAILURE'))
    ) {
      limitations.push('Intermittent behavior: defect was observed in only one of the two runs.');
      return {
        investigationId: params.investigationId,
        verdict: 'INCONSISTENT_OBSERVATIONS',
        validAttemptCount,
        matchingAttemptCount,
        isComparable: true,
        attempt1Assessment: att1,
        attempt2Assessment: att2,
        resetReceipt: params.resetReceipt,
        summary:
          'Inconsistent observations: Failure signature was observed once, but could not be reliably confirmed in both runs.',
        limitations,
        assessedAt,
      };
    }

    // Branch 4: Both runs produced unexpected outcomes (locator grounding failure or unexpected state)
    if (
      isComparable &&
      att1.finding === 'UNEXPECTED_OUTCOME' &&
      att2?.finding === 'UNEXPECTED_OUTCOME'
    ) {
      limitations.push('Neither expected behavior nor the reported failure was confirmed; ungrounded locator or unexpected outcome observed.');
      return {
        investigationId: params.investigationId,
        verdict: 'INCONCLUSIVE',
        validAttemptCount,
        matchingAttemptCount,
        isComparable: true,
        attempt1Assessment: att1,
        attempt2Assessment: att2,
        resetReceipt: params.resetReceipt,
        summary:
          'Inconclusive execution: Both runs produced identical unexpected outcomes distinct from the reported defect. The test could not reliably identify or measure the reported entities.',
        limitations,
        assessedAt,
      };
    }

    // Branch 5: Contradictory observations (both expected and reported predicates matched)
    if (att1.finding === 'CONTRADICTORY' || att2?.finding === 'CONTRADICTORY') {
      limitations.push('Contradictory oracle evaluation: both expected behavior and failure signature evaluated as satisfied.');
      return {
        investigationId: params.investigationId,
        verdict: 'INCONCLUSIVE',
        validAttemptCount,
        matchingAttemptCount,
        isComparable: false,
        attempt1Assessment: att1,
        attempt2Assessment: att2,
        resetReceipt: params.resetReceipt,
        summary: 'Inconclusive: Oracle predicates generated contradictory results.',
        limitations,
        assessedAt,
      };
    }

    // Branch 6: Only one attempt was executed, or attempt 2 was blocked/invalid
    if (!att2 || att2.validity === 'INVALID') {
      const reason = att2?.invalidityReason || (params.resetReceipt && !resetSucceeded ? 'Blocked by fixture reset failure' : 'Second attempt not executed');
      limitations.push(`Second attempt was incomplete or blocked: ${reason}.`);

      if (att1.finding === 'REPORTED_FAILURE' && att1.validity === 'VALID') {
        limitations.push('Reported defect was observed once in Attempt 1, but cannot be confirmed without a valid second run (TC-INV-002).');
      }

      return {
        investigationId: params.investigationId,
        verdict: 'INCONCLUSIVE',
        validAttemptCount,
        matchingAttemptCount,
        isComparable: false,
        attempt1Assessment: att1,
        attempt2Assessment: att2,
        resetReceipt: params.resetReceipt,
        summary: `Inconclusive: Experiment did not complete two valid runs (${reason}).`,
        limitations,
        assessedAt,
      };
    }

    // Branch 7: Attempt 1 was invalid
    if (att1.validity === 'INVALID') {
      limitations.push(`Attempt 1 was invalid: ${att1.invalidityReason || 'Runner error'}.`);
      return {
        investigationId: params.investigationId,
        verdict: 'INCONCLUSIVE',
        validAttemptCount,
        matchingAttemptCount,
        isComparable: false,
        attempt1Assessment: att1,
        attempt2Assessment: att2,
        resetReceipt: params.resetReceipt,
        summary: `Inconclusive: First attempt failed validity requirements (${att1.invalidityReason}).`,
        limitations,
        assessedAt,
      };
    }

    // Fallback: Default to INCONCLUSIVE, preserving facts
    limitations.push('Observations did not satisfy conditions for confirmation or clean nonreproduction.');
    return {
      investigationId: params.investigationId,
      verdict: 'INCONCLUSIVE',
      validAttemptCount,
      matchingAttemptCount,
      isComparable: false,
      attempt1Assessment: att1,
      attempt2Assessment: att2,
      resetReceipt: params.resetReceipt,
      summary: 'Inconclusive: Reproduction could not be conclusively determined under the tested conditions.',
      limitations,
      assessedAt,
    };
  }
}
