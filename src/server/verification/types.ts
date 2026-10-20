import type {
  TypedAssertionKind,
  ObservationSource,
  AssertionPurpose,
  AssertionEvaluationResult,
} from '@/contracts/planning';
import type { ReproductionVerdict } from '@/contracts/status';
import type { VerifiedResetReceipt } from '@/contracts/reset';

export interface CapturedAssertionObservation {
  assertionId: string;
  source: ObservationSource;
  kind?: TypedAssertionKind;
  subjectRef?: string;
  status?: 'AVAILABLE' | 'NOT_FOUND' | 'UNAVAILABLE' | 'TIMEOUT';
  isAvailable?: boolean;
  acquisitionStatus?: 'ACQUIRED' | 'ACQUISITION_FAILED';
  observedValue?: unknown;
  elementCount?: number;
  statusCode?: number;
  pageUrl?: string;
  observedAt: string;
  errorDetails?: string;
  errorReason?: string;
}

export interface AssertionEvaluation {
  assertionId: string;
  kind: TypedAssertionKind;
  purpose: AssertionPurpose;
  result: AssertionEvaluationResult;
  expectedValue?: string;
  observedValue?: string;
  details?: string;
  evaluatedAt: string;
}

export type AttemptFinding =
  | 'EXPECTED_BEHAVIOR'
  | 'REPORTED_FAILURE'
  | 'CONTRADICTORY'
  | 'UNEXPECTED_OUTCOME'
  | 'UNRESOLVED';

export interface AttemptAssessment {
  attemptNumber: 1 | 2;
  validity: 'VALID' | 'INVALID';
  finding: AttemptFinding;
  invalidityReason?: string;
  preconditionsMet: boolean;
  procedureCompleted: boolean;
  scopeAdhered: boolean;
  requiredObservationsAvailable: boolean;
  evaluations: AssertionEvaluation[];
  assessedAt: string;
}

export interface PairAssessmentResult {
  investigationId: string;
  verdict: ReproductionVerdict;
  validAttemptCount: number;
  matchingAttemptCount: number;
  isComparable: boolean;
  attempt1Assessment: AttemptAssessment;
  attempt2Assessment?: AttemptAssessment;
  resetReceipt?: VerifiedResetReceipt;
  summary: string;
  limitations: string[];
  assessedAt: string;
}
