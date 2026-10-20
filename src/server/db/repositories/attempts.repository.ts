import { eq, and } from 'drizzle-orm';
import {
  investigationAttemptsTable,
  assertionEvaluationsTable,
  resetReceiptsTable,
  pairAssessmentsTable,
} from '@/server/db/schema';
import { getDb, DbClient } from '@/server/db';
import type { VerifiedResetReceipt } from '@/contracts/reset';
import type { ReproductionVerdict, MutationUncertainty } from '@/contracts/status';

export interface CreateAttemptRecordParams {
  investigationId: string;
  attemptNumber: 1 | 2;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  validity: 'PENDING' | 'VALID' | 'INVALID';
  finding: 'EXPECTED_BEHAVIOR' | 'REPORTED_FAILURE' | 'CONTRADICTORY' | 'UNEXPECTED_OUTCOME' | 'UNRESOLVED';
  invalidityReason?: string;
  totalDurationMs?: number;
  completedCleanly?: boolean;
  actionsExecuted?: number;
  mutationState?: MutationUncertainty;
  lastObservedStep?: string;
  summary?: string;
}

export interface SaveAssertionEvaluationParams {
  investigationId: string;
  attemptId?: string;
  attemptNumber: number;
  assertionId: string;
  kind: string;
  purpose: string;
  result: string;
  expectedValue?: string;
  observedValue?: string;
  details?: string;
}

export interface SavePairAssessmentParams {
  investigationId: string;
  verdict: ReproductionVerdict;
  validAttemptCount: number;
  matchingAttemptCount: number;
  isComparable: boolean;
  summary: string;
}

export class AttemptsRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  async createOrUpdateAttempt(
    params: CreateAttemptRecordParams,
    tx?: DbClient
  ) {
    const db = tx || this.dbProvider();
    const now = new Date();

    const [existing] = await db
      .select()
      .from(investigationAttemptsTable)
      .where(
        and(
          eq(investigationAttemptsTable.investigationId, params.investigationId),
          eq(investigationAttemptsTable.attemptNumber, params.attemptNumber)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(investigationAttemptsTable)
        .set({
          status: params.status,
          validity: params.validity,
          finding: params.finding,
          invalidityReason: params.invalidityReason || null,
          totalDurationMs: params.totalDurationMs,
          completedCleanly: params.completedCleanly ?? false,
          actionsExecuted: params.actionsExecuted ?? existing.actionsExecuted,
          mutationState: params.mutationState ?? existing.mutationState,
          lastObservedStep: params.lastObservedStep !== undefined ? params.lastObservedStep : existing.lastObservedStep,
          summary: params.summary,
          completedAt:
            params.status === 'COMPLETED' || params.status === 'FAILED' || params.status === 'ABORTED'
              ? now
              : existing.completedAt,
        })
        .where(eq(investigationAttemptsTable.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(investigationAttemptsTable)
      .values({
        investigationId: params.investigationId,
        attemptNumber: params.attemptNumber,
        status: params.status,
        validity: params.validity,
        finding: params.finding,
        invalidityReason: params.invalidityReason,
        totalDurationMs: params.totalDurationMs,
        completedCleanly: params.completedCleanly ?? false,
        actionsExecuted: params.actionsExecuted ?? 0,
        mutationState: params.mutationState ?? 'NONE',
        lastObservedStep: params.lastObservedStep || null,
        summary: params.summary,
        startedAt: now,
        completedAt:
          params.status === 'COMPLETED' || params.status === 'FAILED' || params.status === 'ABORTED'
            ? now
            : null,
      })
      .returning();

    return created;
  }

  async saveAssertionEvaluations(
    evaluations: SaveAssertionEvaluationParams[],
    tx?: DbClient
  ) {
    if (evaluations.length === 0) return [];
    const db = tx || this.dbProvider();

    return db
      .insert(assertionEvaluationsTable)
      .values(
        evaluations.map((ev) => ({
          investigationId: ev.investigationId,
          attemptId: ev.attemptId,
          attemptNumber: ev.attemptNumber,
          assertionId: ev.assertionId,
          kind: ev.kind,
          purpose: ev.purpose,
          result: ev.result,
          expectedValue: ev.expectedValue,
          observedValue: ev.observedValue,
          details: ev.details,
          evaluatedAt: new Date(),
        }))
      )
      .returning();
  }

  async saveResetReceipt(
    receipt: VerifiedResetReceipt,
    tx?: DbClient
  ) {
    const db = tx || this.dbProvider();

    const [saved] = await db
      .insert(resetReceiptsTable)
      .values({
        id: receipt.id,
        investigationId: receipt.investigationId,
        targetId: receipt.targetId,
        attemptNumber: receipt.attemptNumber,
        transportSuccess: receipt.transportSuccess,
        baselineEquivalent: receipt.baselineEquivalent,
        isVerifiedRestored: receipt.isVerifiedRestored,
        expectedStateHash: receipt.readback.expectedStateHash,
        observedStateHash: receipt.readback.observedStateHash,
        discrepancies: receipt.readback.discrepancies || [],
        verifiedAt: new Date(receipt.verifiedAt),
      })
      .returning();

    return saved;
  }

  async savePairAssessment(
    params: SavePairAssessmentParams,
    tx?: DbClient
  ) {
    const db = tx || this.dbProvider();

    const [saved] = await db
      .insert(pairAssessmentsTable)
      .values({
        investigationId: params.investigationId,
        verdict: params.verdict,
        validAttemptCount: params.validAttemptCount,
        matchingAttemptCount: params.matchingAttemptCount,
        isComparable: params.isComparable,
        summary: params.summary,
        assessedAt: new Date(),
      })
      .returning();

    return saved;
  }

  async getAttemptsByInvestigationId(investigationId: string) {
    const db = this.dbProvider();
    return db
      .select()
      .from(investigationAttemptsTable)
      .where(eq(investigationAttemptsTable.investigationId, investigationId));
  }

  async getAssertionEvaluations(investigationId: string, attemptNumber?: number) {
    const db = this.dbProvider();
    if (attemptNumber !== undefined) {
      return db
        .select()
        .from(assertionEvaluationsTable)
        .where(
          and(
            eq(assertionEvaluationsTable.investigationId, investigationId),
            eq(assertionEvaluationsTable.attemptNumber, attemptNumber)
          )
        );
    }

    return db
      .select()
      .from(assertionEvaluationsTable)
      .where(eq(assertionEvaluationsTable.investigationId, investigationId));
  }

  async getResetReceipt(investigationId: string) {
    const db = this.dbProvider();
    const [receipt] = await db
      .select()
      .from(resetReceiptsTable)
      .where(eq(resetReceiptsTable.investigationId, investigationId))
      .limit(1);

    return receipt || null;
  }

  async getPairAssessment(investigationId: string) {
    const db = this.dbProvider();
    const [assessment] = await db
      .select()
      .from(pairAssessmentsTable)
      .where(eq(pairAssessmentsTable.investigationId, investigationId))
      .limit(1);

    return assessment || null;
  }
}

export const attemptsRepository = new AttemptsRepository();
