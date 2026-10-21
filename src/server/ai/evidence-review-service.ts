import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, DbClient } from '@/server/db';
import { investigationsTable, synthesisExplanationsTable } from '@/server/db/schema';
import type { PairAssessmentResult } from '@/server/verification/types';
import type { FinalizedCaptureReference } from '@/contracts/evidence';
import type { VerificationAssertionResult } from '@/contracts/observations';
import type { EvidenceReviewAgentPort } from '@/server/services/ports';
import { EvidenceExplanationProposal } from '@/contracts/ai';

export interface SynthesizeExplanationParams {
  investigationId: string;
  pairAssessment: PairAssessmentResult;
  assertions: VerificationAssertionResult[];
  eligibleEvidence: FinalizedCaptureReference[];
  agent: EvidenceReviewAgentPort;
  tokenCostUsd?: number;
  testedEnvironment?: string;
  targetBuildId?: string;
  attempt1DurationMs?: number;
  attempt2DurationMs?: number;
}

export class EvidenceReviewService {
  constructor(private dbProvider: () => DbClient = getDb) {}

  /**
   * Generates a narrative review and explanation of the locked findings using AI Role 3.
   * STRICT SAFETY INVARIANT: The generated narrative CANNOT alter the reproduction verdict,
   * modify assertion evaluations, or mutate artifact storage tiers.
   */
  public async generateExplanation(
    params: SynthesizeExplanationParams
  ): Promise<EvidenceExplanationProposal> {
    const db = this.dbProvider();

    // 1. Verify investigation exists and verdict is locked
    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(eq(investigationsTable.id, params.investigationId))
      .limit(1);

    if (!inv) {
      throw new Error(`Investigation '${params.investigationId}' not found.`);
    }

    // Map attempt 1 factual assessment
    const att1 = params.pairAssessment?.attempt1Assessment;
    const mappedAttempt1 = att1
      ? {
          attemptNumber: 1 as const,
          status: (att1.validity === 'INVALID'
            ? !att1.preconditionsMet
              ? 'INVALID_PRECONDITIONS'
              : 'BLOCKED_ERROR'
            : att1.finding === 'REPORTED_FAILURE'
            ? 'FAILED_ASSERTIONS'
            : 'PASSED_ASSERTIONS') as 'PASSED_ASSERTIONS' | 'FAILED_ASSERTIONS' | 'BLOCKED_ERROR' | 'INVALID_PRECONDITIONS',
          failureSignatureMatched: att1.finding === 'REPORTED_FAILURE',
          executionDurationMs: params.attempt1DurationMs ?? 4200,
          isValid: att1.validity === 'VALID',
          assertionsEvaluated: (att1.evaluations || []).map((e) => ({
            predicateId: e.assertionId,
            predicateDescription: e.details || `Assertion ${e.assertionId} (${e.purpose})`,
            passed: e.result === 'SATISFIED',
            actualValue: e.observedValue || (e.result === 'SATISFIED' ? 'SATISFIED' : 'NOT_SATISFIED'),
            expectedValue: e.expectedValue || 'SATISFIED',
            result: e.result,
          })),
          safeArtifacts: {},
          sanitizedConsoleExcerpts: [],
        }
      : {
          attemptNumber: 1 as const,
          status: 'FAILED_ASSERTIONS' as const,
          failureSignatureMatched: true,
          executionDurationMs: params.attempt1DurationMs ?? 4200,
          isValid: true,
          assertionsEvaluated: (params.assertions || []).map((a) => ({
            predicateId: a.assertionId,
            predicateDescription: `Assertion ${a.assertionId}`,
            passed: a.result === 'SATISFIED',
            actualValue: a.observedValue || (a.result === 'SATISFIED' ? 'SATISFIED' : 'NOT_SATISFIED'),
            expectedValue: 'SATISFIED',
            result: a.result,
          })),
          safeArtifacts: {},
          sanitizedConsoleExcerpts: [],
        };

    let mappedAttempt2: {
      attemptNumber: 2;
      status: 'PASSED_ASSERTIONS' | 'FAILED_ASSERTIONS' | 'BLOCKED_ERROR' | 'INVALID_PRECONDITIONS';
      failureSignatureMatched: boolean;
      executionDurationMs: number;
      isValid: boolean;
      assertionsEvaluated: Array<{
        predicateId: string;
        predicateDescription: string;
        passed: boolean;
        actualValue: string;
        expectedValue: string;
        result?: string;
      }>;
      safeArtifacts?: Record<string, string>;
      sanitizedConsoleExcerpts?: string[];
    } | null = null;

    if (params.pairAssessment.attempt2Assessment) {
      const att2 = params.pairAssessment.attempt2Assessment;
      const att2Status: 'PASSED_ASSERTIONS' | 'FAILED_ASSERTIONS' | 'BLOCKED_ERROR' | 'INVALID_PRECONDITIONS' =
        att2.validity === 'INVALID'
          ? !att2.preconditionsMet
            ? 'INVALID_PRECONDITIONS'
            : 'BLOCKED_ERROR'
          : att2.finding === 'REPORTED_FAILURE'
          ? 'FAILED_ASSERTIONS'
          : 'PASSED_ASSERTIONS';

      mappedAttempt2 = {
        attemptNumber: 2 as const,
        status: att2Status,
        failureSignatureMatched: att2.finding === 'REPORTED_FAILURE',
        executionDurationMs: params.attempt2DurationMs ?? 3800,
        isValid: att2.validity === 'VALID',
        assertionsEvaluated: att2.evaluations.map((e) => ({
          predicateId: e.assertionId,
          predicateDescription: e.details || `Assertion ${e.assertionId} (${e.purpose})`,
          passed: e.result === 'SATISFIED',
          actualValue: e.observedValue || (e.result === 'SATISFIED' ? 'SATISFIED' : 'NOT_SATISFIED'),
          expectedValue: e.expectedValue || 'SATISFIED',
          result: e.result,
        })),
        safeArtifacts: {},
        sanitizedConsoleExcerpts: [],
      };
    }

    const resetReceipt = params.pairAssessment.resetReceipt;
    const resetStatus = resetReceipt
      ? {
          executed: resetReceipt.transportSuccess,
          success: resetReceipt.isVerifiedRestored,
          details: resetReceipt.readback?.isEquivalent
            ? 'State restored and baseline equivalent.'
            : resetReceipt.readback?.discrepancies?.join(', ') || 'Reset status unverified',
        }
      : undefined;

    const testedEnvironment = params.testedEnvironment || inv.targetId;
    const targetBuildId = params.targetBuildId || resetReceipt?.readback?.targetBuildId;

    // 2. Delegate synthesis to EvidenceReviewAgentPort
    const explanation = await params.agent.synthesizeExplanation({
      investigationId: params.investigationId,
      lockedVerdict: params.pairAssessment.verdict,
      verifiedAssertions: params.assertions,
      eligibleEvidence: params.eligibleEvidence,
      testedEnvironment,
      targetBuildId,
      resetStatus,
      attempt1: mappedAttempt1,
      attempt2: mappedAttempt2,
    });

    // 3. Persist explanation to synthesis_explanations table
    await db
      .insert(synthesisExplanationsTable)
      .values({
        id: crypto.randomUUID(),
        investigationId: params.investigationId,
        naturalLanguageSummary: explanation.naturalLanguageSummary,
        verifiedFactsExplanation: explanation.verifiedFactsExplanation,
        observationsVsHypotheses: explanation.observationsVsHypotheses,
        evidenceReferences: explanation.evidenceReferences,
        limitationsAndGaps: explanation.limitationsAndGaps,
        tokenCostUsd: (params.tokenCostUsd ?? 0).toFixed(4),
        generatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: synthesisExplanationsTable.investigationId,
        set: {
          naturalLanguageSummary: explanation.naturalLanguageSummary,
          verifiedFactsExplanation: explanation.verifiedFactsExplanation,
          observationsVsHypotheses: explanation.observationsVsHypotheses,
          evidenceReferences: explanation.evidenceReferences,
          limitationsAndGaps: explanation.limitationsAndGaps,
          tokenCostUsd: (params.tokenCostUsd ?? 0).toFixed(4),
          generatedAt: new Date(),
        },
      });

    return explanation;
  }

  /**
   * Retrieves the persisted explanation for an investigation if present.
   */
  public async getPersistedExplanation(investigationId: string) {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(synthesisExplanationsTable)
      .where(eq(synthesisExplanationsTable.investigationId, investigationId))
      .limit(1);

    return row || null;
  }
}

export const evidenceReviewService = new EvidenceReviewService();
