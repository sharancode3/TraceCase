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

    // 2. Delegate synthesis to EvidenceReviewAgentPort
    const explanation = await params.agent.synthesizeExplanation({
      investigationId: params.investigationId,
      lockedVerdict: params.pairAssessment.verdict,
      verifiedAssertions: params.assertions,
      eligibleEvidence: params.eligibleEvidence,
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
