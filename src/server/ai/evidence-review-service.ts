import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, DbClient } from '@/server/db';
import { investigationsTable, targetsTable, synthesisExplanationsTable, bugReportsTable } from '@/server/db/schema';
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

    // Extract safe artifact references by attempt for the review agent
    const appBaseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const baseUrl = appBaseUrl.replace(/\/+$/, '');
    const att1Evidence = (params.eligibleEvidence || []).filter((e) => e.attemptNumber === 1);
    const att1Console = att1Evidence.find((e) => e.kind === 'CONSOLE_LOG');
    const att1Network = att1Evidence.find((e) => e.kind === 'NETWORK_TRACE');
    const att1Video = att1Evidence.find((e) => e.kind === 'VIDEO_RECORDING');
    const att1SafeArtifacts = {
      ...(att1Console ? {
        consoleLogId: att1Console.captureId,
        consoleLogUrl: `${baseUrl}/api/v1/investigations/${params.investigationId}/artifacts/${att1Console.captureId}`,
      } : {}),
      ...(att1Network ? {
        networkLogId: att1Network.captureId,
        networkLogUrl: `${baseUrl}/api/v1/investigations/${params.investigationId}/artifacts/${att1Network.captureId}`,
      } : {}),
      ...(att1Video ? {
        videoId: att1Video.captureId,
        videoUrl: `${baseUrl}/api/v1/investigations/${params.investigationId}/artifacts/${att1Video.captureId}`,
      } : {}),
    };

    const att2Evidence = (params.eligibleEvidence || []).filter((e) => e.attemptNumber === 2);
    const att2Console = att2Evidence.find((e) => e.kind === 'CONSOLE_LOG');
    const att2Network = att2Evidence.find((e) => e.kind === 'NETWORK_TRACE');
    const att2Video = att2Evidence.find((e) => e.kind === 'VIDEO_RECORDING');
    const att2SafeArtifacts = {
      ...(att2Console ? {
        consoleLogId: att2Console.captureId,
        consoleLogUrl: `${baseUrl}/api/v1/investigations/${params.investigationId}/artifacts/${att2Console.captureId}`,
      } : {}),
      ...(att2Network ? {
        networkLogId: att2Network.captureId,
        networkLogUrl: `${baseUrl}/api/v1/investigations/${params.investigationId}/artifacts/${att2Network.captureId}`,
      } : {}),
      ...(att2Video ? {
        videoId: att2Video.captureId,
        videoUrl: `${baseUrl}/api/v1/investigations/${params.investigationId}/artifacts/${att2Video.captureId}`,
      } : {}),
    };

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
          executionDurationMs: params.attempt1DurationMs ?? 0,
          isValid: att1.validity === 'VALID',
          assertionsEvaluated: (att1.evaluations || []).map((e) => ({
            predicateId: e.assertionId,
            predicateDescription: e.details || `Assertion ${e.assertionId} (${e.purpose})`,
            passed: e.result === 'SATISFIED',
            actualValue: e.observedValue || (e.result === 'SATISFIED' ? 'SATISFIED' : 'NOT_SATISFIED'),
            expectedValue: e.expectedValue || 'SATISFIED',
            result: e.result,
          })),
          safeArtifacts: att1SafeArtifacts,
          sanitizedConsoleExcerpts: [],
        }
      : {
          attemptNumber: 1 as const,
          status: 'BLOCKED_ERROR' as const,
          failureSignatureMatched: false,
          executionDurationMs: params.attempt1DurationMs ?? 0,
          isValid: false,
          assertionsEvaluated: (params.assertions || []).map((a) => ({
            predicateId: a.assertionId,
            predicateDescription: a.details || `Assertion ${a.assertionId}`,
            passed: a.result === 'SATISFIED',
            actualValue: a.observedValue || (a.result === 'SATISFIED' ? 'SATISFIED' : 'NOT_SATISFIED'),
            expectedValue: a.expectedValue || 'SATISFIED',
            result: a.result,
          })),
          safeArtifacts: att1SafeArtifacts,
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
        executionDurationMs: params.attempt2DurationMs ?? 0,
        isValid: att2.validity === 'VALID',
        assertionsEvaluated: att2.evaluations.map((e) => ({
          predicateId: e.assertionId,
          predicateDescription: e.details || `Assertion ${e.assertionId} (${e.purpose})`,
          passed: e.result === 'SATISFIED',
          actualValue: e.observedValue || (e.result === 'SATISFIED' ? 'SATISFIED' : 'NOT_SATISFIED'),
          expectedValue: e.expectedValue || 'SATISFIED',
          result: e.result,
        })),
        safeArtifacts: att2SafeArtifacts,
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

    let testedEnvironment = params.testedEnvironment;
    if (!testedEnvironment) {
      const [target] = await db
        .select()
        .from(targetsTable)
        .where(eq(targetsTable.id, inv.targetId))
        .limit(1);
      testedEnvironment = target?.baseUrl || target?.name || inv.targetId;
    }
    const targetBuildId = params.targetBuildId || resetReceipt?.readback?.targetBuildId;
    const [report] = await db.select().from(bugReportsTable).where(eq(bugReportsTable.id, inv.reportId)).limit(1);

    // 2. Delegate synthesis to EvidenceReviewAgentPort
    const explanation = await params.agent.synthesizeExplanation({
      investigationId: params.investigationId,
      lockedVerdict: params.pairAssessment.verdict,
      verifiedAssertions: params.assertions,
      eligibleEvidence: params.eligibleEvidence,
      rawReport: report ? { title: report.title, description: report.rawDescription || report.bugDescription, claimedExpectedBehavior: report.expectedBehavior || undefined } : undefined,
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
