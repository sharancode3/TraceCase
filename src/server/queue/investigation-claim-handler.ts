import path from 'node:path';
import { eq, and, desc, isNull } from 'drizzle-orm';
import {
  executionRequestsTable,
  investigationsTable,
  planApprovalsTable,
  experimentPlanRevisionsTable,
  targetsTable,
} from '@/server/db/schema';
import { getDb, DbClient } from '@/server/db';
import { ExecutionLeaseService } from './execution-lease.service';
import { InvestigationExecutionJobData } from './types';
import { BrowserWorkerPort, unavailableBrowserWorker } from '@/server/services/ports';
import { getServiceContainer } from '@/server/services/service-container';
import { CaptureRegistrar } from '@/server/evidence/capture-registrar';
import { EvidencePipeline } from '@/server/evidence/evidence-pipeline';
import { evidenceReviewService } from '@/server/ai/evidence-review-service';
import { AttemptsRepository } from '@/server/db/repositories/attempts.repository';
import type { PairAssessmentResult, AttemptFinding, AssertionEvaluation } from '@/server/verification/types';
import type { VerificationAssertionResult } from '@/contracts/observations';
import type { AuthoritativeExperimentPlan, TypedAssertionKind, AssertionPurpose } from '@/contracts/planning';
import { projectSafeTargetProfile } from '@/contracts/targets';

export interface TwoAttemptControllerPort {
  executeInvestigationPair(params: {
    executionRequestId: string;
    investigationId: string;
    workerInstanceId: string;
    epoch: number;
  }): Promise<{
    status: string;
    verdict: string;
    summary: string;
  }>;
}

export class InvestigationClaimHandler {
  constructor(
    private leaseService: ExecutionLeaseService,
    private browserWorker: BrowserWorkerPort = unavailableBrowserWorker,
    private dbProvider: () => DbClient = getDb,
    private controller?: TwoAttemptControllerPort
  ) {}

  async handleInvestigationExecution(
    data: InvestigationExecutionJobData,
    workerInstanceId: string
  ): Promise<{ status: string; reason?: string; epoch?: number; verdict?: string }> {
    const db = this.dbProvider();
    const now = new Date();

    // 1. Acquire global execution lease
    const lease = await this.leaseService.acquireGlobalLease({
      workerInstanceId,
      executionRequestId: data.executionRequestId,
      investigationId: data.investigationId,
      leaseTtlMs: 60000,
    });

    if (!lease.acquired) {
      return {
        status: 'LEASE_UNAVAILABLE',
        reason: lease.reason,
      };
    }

    const epoch = lease.epoch;
    let shouldReleaseLease = true;

    try {
      // 2. Re-read execution request and investigation state
      const [req] = await db
        .select()
        .from(executionRequestsTable)
        .where(eq(executionRequestsTable.id, data.executionRequestId))
        .limit(1);

      if (!req) {
        return { status: 'REQUEST_NOT_FOUND', epoch };
      }

      if (req.status === 'COMPLETED' || req.status === 'FAILED') {
        return { status: 'ALREADY_TERMINAL', epoch };
      }

      if (req.status === 'CLAIMED' || req.status === 'ACTIVE') {
        return { status: 'ALREADY_CLAIMED', epoch };
      }

      if (req.status === 'CANCELLED') {
        return { status: 'CANCELLED_BEFORE_CLAIM', epoch };
      }

      // Check request payload identity binding
      if (
        (req.investigationId && req.investigationId !== data.investigationId) ||
        (req.planVersion && req.planVersion !== data.planVersion) ||
        (req.planHash && data.planHash && req.planHash.toLowerCase() !== data.planHash.toLowerCase())
      ) {
        return { status: 'PAYLOAD_MISMATCH', epoch };
      }

      const [inv] = await db
        .select()
        .from(investigationsTable)
        .where(eq(investigationsTable.id, data.investigationId))
        .limit(1);

      if (!inv || inv.lifecycleStatus === 'CANCELLED') {
        await db
          .update(executionRequestsTable)
          .set({ status: 'CANCELLED', completedAt: now })
          .where(eq(executionRequestsTable.id, data.executionRequestId));
        return { status: 'INVESTIGATION_CANCELLED', epoch };
      }

      // 3. Re-read active approval at claim time & check expiration
      const [approval] = await db
        .select()
        .from(planApprovalsTable)
        .where(
          and(
            eq(planApprovalsTable.investigationId, data.investigationId),
            eq(planApprovalsTable.planVersion, data.planVersion),
            isNull(planApprovalsTable.revokedAt)
          )
        )
        .orderBy(desc(planApprovalsTable.approvedAt))
        .limit(1);

      if (!approval || approval.planHash.toLowerCase() !== data.planHash.toLowerCase()) {
        // Approval was revoked while queued!
        await db
          .update(executionRequestsTable)
          .set({
            status: 'CANCELLED',
            completedAt: now,
          })
          .where(eq(executionRequestsTable.id, data.executionRequestId));

        return { status: 'APPROVAL_INVALID_AT_CLAIM', epoch };
      }

      if (approval.expiresAt && approval.expiresAt.getTime() <= now.getTime()) {
        await db
          .update(executionRequestsTable)
          .set({
            status: 'CANCELLED',
            completedAt: now,
          })
          .where(eq(executionRequestsTable.id, data.executionRequestId));

        return { status: 'APPROVAL_EXPIRED_AT_CLAIM', epoch };
      }

      // 4. Load persisted plan revision and target records
      const [planRevision] = await db
        .select()
        .from(experimentPlanRevisionsTable)
        .where(
          and(
            eq(experimentPlanRevisionsTable.investigationId, data.investigationId),
            eq(experimentPlanRevisionsTable.version, data.planVersion)
          )
        )
        .limit(1);

      const [target] = await db
        .select()
        .from(targetsTable)
        .where(eq(targetsTable.id, inv.targetId))
        .limit(1);

      if (!planRevision || !target) {
        await db
          .update(executionRequestsTable)
          .set({ status: 'FAILED', completedAt: now })
          .where(eq(executionRequestsTable.id, data.executionRequestId));
        return { status: 'RECORDS_MISSING_AT_CLAIM', epoch };
      }

      const safeTarget = projectSafeTargetProfile(target);

      // 5. Check if browser worker is unavailable
      if (this.browserWorker === unavailableBrowserWorker) {
        await db
          .update(executionRequestsTable)
          .set({
            status: 'FAILED',
            fencingEpoch: epoch,
            workerInstanceId,
            completedAt: now,
          })
          .where(eq(executionRequestsTable.id, data.executionRequestId));

        return {
          status: 'EXECUTOR_UNAVAILABLE',
          reason: 'Playwright worker execution is scheduled for Stage 2.',
          epoch,
        };
      }

      // Mark execution request CLAIMED and bind epoch atomically
      await this.leaseService.assertFencingEpoch({ workerInstanceId, epoch });

      const updateBuilder = db
        .update(executionRequestsTable)
        .set({
          status: 'CLAIMED',
          workerInstanceId,
          fencingEpoch: epoch,
          updatedAt: now,
        })
        .where(
          and(
            eq(executionRequestsTable.id, data.executionRequestId),
            eq(executionRequestsTable.status, 'ADMITTED')
          )
        );

      let claimedReq: { id: string } | null = null;
      const builderWithReturning = updateBuilder as unknown as {
        returning?: () => Promise<Array<{ id: string }>>;
      };
      if (typeof builderWithReturning.returning === 'function') {
        const rows = await builderWithReturning.returning();
        claimedReq = rows?.[0] ?? null;
      } else {
        await updateBuilder;
        claimedReq = { id: data.executionRequestId };
      }

      if (!claimedReq) {
        return { status: 'ALREADY_CLAIMED', epoch };
      }

      // 6. If two-attempt controller is provided, execute full pair
      if (this.controller) {
        try {
          const outcome = await this.controller.executeInvestigationPair({
            executionRequestId: data.executionRequestId,
            investigationId: data.investigationId,
            workerInstanceId,
            epoch,
          });

          if (outcome.status === 'MUTATION_UNCERTAIN') {
            shouldReleaseLease = false;
          }

          if (outcome.status === 'COMPLETED') {
            try {
              const stagingDir = path.join(process.cwd(), '.tmp', 'staging', data.investigationId);
              const registrar = new CaptureRegistrar(this.dbProvider);
              await registrar.registerAttemptCapturesFromDirectory({
                investigationId: data.investigationId,
                attemptNumber: 1,
                stagingDir: path.join(stagingDir, 'attempt-1'),
              });
              await registrar.registerAttemptCapturesFromDirectory({
                investigationId: data.investigationId,
                attemptNumber: 2,
                stagingDir: path.join(stagingDir, 'attempt-2'),
              });

              const pipeline = new EvidencePipeline(this.dbProvider);
              await pipeline.processInvestigationEvidence({
                investigationId: data.investigationId,
                storagePort: getServiceContainer().evidenceStorage,
              });

              // Synthesize explanation via EvidenceReviewService (AI Role 3)
              const reviewAgent = getServiceContainer().evidenceReviewAgent;
              if (reviewAgent) {
                try {
                  const attemptsRepo = new AttemptsRepository(this.dbProvider);
                  const pairAssessment = await attemptsRepo.getPairAssessment(data.investigationId);
                  const rawAssertions = await attemptsRepo.getAssertionEvaluations(data.investigationId);
                  const eligibleEvidence = await pipeline.getEligibleEvidence(data.investigationId);

                  if (pairAssessment) {
                    const attempts = await attemptsRepo.getAttemptsByInvestigationId(data.investigationId);
                    const att1 = attempts.find((a) => a.attemptNumber === 1);
                    const att2 = attempts.find((a) => a.attemptNumber === 2);
                    const reset = await attemptsRepo.getResetReceipt(data.investigationId);
                    const att1Evaluations = await attemptsRepo.getAssertionEvaluations(data.investigationId, 1);
                    const att2Evaluations = await attemptsRepo.getAssertionEvaluations(data.investigationId, 2);

                    const mapEvaluation = (a: {
                      assertionId: string;
                      kind?: string | null;
                      purpose?: string | null;
                      result: string;
                      expectedValue?: string | null;
                      observedValue?: string | null;
                      details?: string | null;
                      evaluatedAt: Date;
                    }): AssertionEvaluation => {
                      const res = (a.result === 'PASSED' || a.result === 'SATISFIED')
                        ? 'SATISFIED'
                        : (a.result === 'FAILED' || a.result === 'NOT_SATISFIED')
                        ? 'NOT_SATISFIED'
                        : 'OBSERVATION_UNAVAILABLE';
                      return {
                        assertionId: a.assertionId,
                        kind: (a.kind as TypedAssertionKind) || 'ENTITY_PRESENCE',
                        purpose: (a.purpose as AssertionPurpose) || 'EXPECTED_CORRECT_BEHAVIOR',
                        result: res as 'SATISFIED' | 'NOT_SATISFIED' | 'OBSERVATION_UNAVAILABLE',
                        expectedValue: a.expectedValue || undefined,
                        observedValue: a.observedValue || undefined,
                        details: a.details || undefined,
                        evaluatedAt: a.evaluatedAt.toISOString(),
                      };
                    };

                    const verifiedAssertions: VerificationAssertionResult[] = rawAssertions.map((a) => ({
                      assertionId: a.assertionId,
                      result: (a.result === 'PASSED' || a.result === 'SATISFIED')
                        ? 'SATISFIED'
                        : (a.result === 'FAILED' || a.result === 'NOT_SATISFIED')
                        ? 'NOT_SATISFIED'
                        : 'OBSERVATION_UNAVAILABLE',
                      expectedValue: a.expectedValue || undefined,
                      observedValue: a.observedValue || undefined,
                      details: a.details || undefined,
                      evaluatedAt: a.evaluatedAt.toISOString(),
                    }));

                    const pairAssessmentResult: PairAssessmentResult = {
                      investigationId: data.investigationId,
                      verdict: pairAssessment.verdict as PairAssessmentResult['verdict'],
                      validAttemptCount: pairAssessment.validAttemptCount,
                      matchingAttemptCount: pairAssessment.matchingAttemptCount,
                      isComparable: pairAssessment.isComparable,
                      attempt1Assessment: {
                        attemptNumber: 1,
                        validity: (att1?.validity as 'VALID' | 'INVALID') || 'INVALID',
                        finding: (att1?.finding as AttemptFinding) || 'UNRESOLVED',
                        invalidityReason: att1?.invalidityReason || undefined,
                        preconditionsMet: !(att1?.invalidityReason?.includes('PRECONDITION')),
                        procedureCompleted: att1?.completedCleanly ?? false,
                        scopeAdhered: !(att1?.invalidityReason?.includes('SCOPE')),
                        requiredObservationsAvailable: (att1?.actionsExecuted ?? 0) > 0,
                        evaluations: att1Evaluations.map(mapEvaluation),
                        assessedAt: (att1?.completedAt ? att1.completedAt.toISOString() : undefined) || new Date().toISOString(),
                      },
                      attempt2Assessment: att2 ? {
                        attemptNumber: 2,
                        validity: (att2.validity as 'VALID' | 'INVALID') || 'INVALID',
                        finding: (att2.finding as AttemptFinding) || 'UNRESOLVED',
                        invalidityReason: att2.invalidityReason || undefined,
                        preconditionsMet: !(att2.invalidityReason?.includes('PRECONDITION')),
                        procedureCompleted: att2.completedCleanly ?? false,
                        scopeAdhered: !(att2.invalidityReason?.includes('SCOPE')),
                        requiredObservationsAvailable: (att2.actionsExecuted ?? 0) > 0,
                        evaluations: att2Evaluations.map(mapEvaluation),
                        assessedAt: (att2.completedAt ? att2.completedAt.toISOString() : undefined) || new Date().toISOString(),
                      } : undefined,
                      resetReceipt: reset ? {
                        id: reset.id,
                        targetId: reset.targetId,
                        investigationId: reset.investigationId,
                        attemptNumber: 2 as const,
                        transportSuccess: reset.transportSuccess,
                        baselineEquivalent: reset.baselineEquivalent,
                        isVerifiedRestored: reset.isVerifiedRestored,
                        readback: {
                          targetId: reset.targetId,
                          expectedStateHash: reset.expectedStateHash || 'unknown',
                          observedStateHash: reset.observedStateHash || 'unknown',
                          isEquivalent: reset.baselineEquivalent,
                          discrepancies: (reset.discrepancies as string[]) || [],
                          checkedAt: reset.verifiedAt.toISOString(),
                        },
                        verifiedAt: reset.verifiedAt.toISOString(),
                      } : undefined,
                      summary: pairAssessment.summary,
                      limitations: [],
                      assessedAt: pairAssessment.assessedAt.toISOString(),
                    };

                    await evidenceReviewService.generateExplanation({
                      investigationId: data.investigationId,
                      pairAssessment: pairAssessmentResult,
                      assertions: verifiedAssertions,
                      eligibleEvidence,
                      agent: reviewAgent,
                    });
                  }
                } catch {
                  // Post-verification explanation synthesis failure does not invalidate reproduction verdict (TC-INV-007)
                }
              }
            } catch {
              // Post-verification packaging error does not alter reproduction verdict (TC-INV-007)
            } finally {
              await db
                .update(investigationsTable)
                .set({
                  lifecycleStatus: 'COMPLETED',
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(investigationsTable.id, data.investigationId),
                    eq(investigationsTable.lifecycleStatus, 'FINALIZING_EVIDENCE')
                  )
                );
            }
          }

          return {
            status: outcome.status === 'COMPLETED' ? 'PAIR_COMPLETED' : outcome.status,
            verdict: outcome.verdict,
            epoch,
          };
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          if (errorMsg.includes('UNCERTAIN') || errorMsg.includes('MUTATION_TIMEOUT')) {
            shouldReleaseLease = false;
            await this.leaseService.quarantineLease({
              workerInstanceId,
              epoch,
              quarantineMs: 60 * 60 * 1000,
              reason: errorMsg,
            });
          }

          await db
            .update(executionRequestsTable)
            .set({
              status: 'FAILED',
              completedAt: new Date(),
            })
            .where(eq(executionRequestsTable.id, data.executionRequestId));

          return { status: 'EXECUTOR_UNAVAILABLE', reason: errorMsg, epoch };
        }
      }

      // Fallback for single-attempt mock workers (Phase 4 / Phase 5 claiming unit tests)
      await db
        .update(executionRequestsTable)
        .set({
          status: 'ACTIVE',
          workerInstanceId,
          fencingEpoch: epoch,
          updatedAt: now,
        })
        .where(eq(executionRequestsTable.id, data.executionRequestId));

      const receipt = await this.browserWorker.executeAttempt({
        investigationId: data.investigationId,
        attemptNumber: 1,
        plan: planRevision.planPayload as AuthoritativeExperimentPlan,
        target: safeTarget,
      });

      const hasMutationUncertainty = receipt.actionsExecuted.some(
        (a) => a.uncertainty === 'MUTATION_UNCERTAIN'
      );

      if (hasMutationUncertainty) {
        shouldReleaseLease = false;
        await this.leaseService.quarantineLease({
          workerInstanceId,
          epoch,
          quarantineMs: 60 * 60 * 1000,
          reason: 'Investigation attempt 1 encountered MUTATION_UNCERTAIN.',
        });

        await db
          .update(executionRequestsTable)
          .set({
            status: 'FAILED',
            completedAt: now,
          })
          .where(eq(executionRequestsTable.id, data.executionRequestId));

        return { status: 'MUTATION_UNCERTAIN', epoch };
      }

      return { status: 'ATTEMPT_1_EXECUTED', epoch };
    } finally {
      if (shouldReleaseLease) {
        await this.leaseService.releaseGlobalLease({ workerInstanceId, epoch });
      }
    }
  }
}
