import { eq, and, isNull } from 'drizzle-orm';
import { getDb, DbClient } from '@/server/db';
import {
  investigationsTable,
  executionRequestsTable,
  targetsTable,
  experimentPlanRevisionsTable,
  planApprovalsTable,
} from '@/server/db/schema';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import { projectSafeTargetProfile } from '@/contracts/targets';
import type { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import { attemptsRepository } from '@/server/db/repositories/attempts.repository';
import { eventsRepository } from '@/server/db/repositories/events.repository';
import { DeterministicAssertionEvaluator } from './evaluator';
import { AttemptAssessor } from './attempt-assessor';
import { TargetResetClient } from './target-reset-client';
import { PairAssessor } from './pair-assessor';

export interface ExecutePairParams {
  executionRequestId: string;
  investigationId: string;
  workerInstanceId: string;
  epoch: number;
}

export interface PairExecutionOutcome {
  status:
    | 'COMPLETED'
    | 'MUTATION_UNCERTAIN'
    | 'RESET_FAILED'
    | 'ATTEMPT_FAILED'
    | 'CANCELLED'
    | 'PREFLIGHT_BASELINE_FAILED';
  verdict: string;
  summary: string;
}

export class TwoAttemptController {
  constructor(
    private leaseService: ExecutionLeaseService,
    private browserWorker: PlaywrightBrowserWorker,
    private dbProvider: () => DbClient = getDb
  ) {}

  /**
   * Executes the complete bounded two-attempt reproduction experiment with verified reset.
   * Maintains global execution lease across both runs and enforces all verification invariants.
   */
  public async executeInvestigationPair(
    params: ExecutePairParams
  ): Promise<PairExecutionOutcome> {
    const db = this.dbProvider();
    const now = new Date();

    // 1. Load immutable plan revision and target from DB
    const [execReq] = await db
      .select()
      .from(executionRequestsTable)
      .where(eq(executionRequestsTable.id, params.executionRequestId))
      .limit(1);

    if (!execReq) {
      throw new Error(`Execution request '${params.executionRequestId}' not found.`);
    }

    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(eq(investigationsTable.id, params.investigationId))
      .limit(1);

    if (!inv) {
      throw new Error(`Investigation '${params.investigationId}' not found.`);
    }

    // Exact plan revision query bound to investigationId AND planVersion
    const [planRevision] = await db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(
        and(
          eq(experimentPlanRevisionsTable.investigationId, params.investigationId),
          eq(experimentPlanRevisionsTable.version, execReq.planVersion)
        )
      )
      .limit(1);

    if (!planRevision) {
      throw new Error(`Plan revision v${execReq.planVersion} for investigation '${params.investigationId}' not found.`);
    }

    if (planRevision.planHash.toLowerCase() !== execReq.planHash.toLowerCase()) {
      throw new Error(`Plan revision hash '${planRevision.planHash}' does not match execution request plan hash '${execReq.planHash}'.`);
    }

    const plan = planRevision.planPayload as AuthoritativeExperimentPlan;
    if (!plan || !Array.isArray(plan.steps) || !Array.isArray(plan.assertions)) {
      throw new Error(`Plan revision payload is not a valid experiment plan for investigation '${params.investigationId}'.`);
    }

    const [target] = await db
      .select()
      .from(targetsTable)
      .where(eq(targetsTable.id, inv.targetId))
      .limit(1);

    if (!target) {
      throw new Error(`Target '${inv.targetId}' not found.`);
    }

    const safeTarget = projectSafeTargetProfile(target);

    // TC3 Sandbox Safety Invariant: Mutating/destructive actions (TIER_3_MUTATING_INTERACTION, TIER_4_DESTRUCTIVE)
    // are strictly prohibited against non-sandbox or unverified targets, even if the origin is an authorized target URL.
    const hasMutatingStep = plan.steps.some(
      (s) => s.tier === 'TIER_3_MUTATING_INTERACTION' || s.tier === 'TIER_4_DESTRUCTIVE'
    );
    if (hasMutatingStep && (!target.isSandbox || !target.isSandboxVerified)) {
      throw new Error(
        `[SandboxPolicyViolation] Mutating actions are strictly prohibited on target '${target.id}' because it is not an authorized, verified sandbox environment (TC3 fail-closed safety invariant).`
      );
    }

    // Periodic background renewal interval to prevent lease expiration during long operations
    let leaseLostError: Error | null = null;

    // Helper to verify cancellation, fencing epoch, and active unrevoked approval
    const assertExecutionAuthorized = async () => {
      if (leaseLostError) {
        throw leaseLostError;
      }

      await this.leaseService.assertFencingEpoch({
        workerInstanceId: params.workerInstanceId,
        epoch: params.epoch,
      });

      const [currentInv] = await db
        .select()
        .from(investigationsTable)
        .where(eq(investigationsTable.id, params.investigationId))
        .limit(1);

      if (!currentInv || currentInv.lifecycleStatus === 'CANCELLED') {
        throw new Error('Investigation was cancelled by user operator.');
      }

      if (currentInv.lifecycleStatus === 'REJECTED' || currentInv.reviewStatus === 'REJECTED') {
        throw new Error('Investigation was rejected by user operator.');
      }

      if (currentInv.reviewStatus !== 'APPROVED') {
        throw new Error(`Investigation plan is not approved (current status: '${currentInv.reviewStatus}').`);
      }

      // Check active unrevoked approval record exists for this plan version
      const [approval] = await db
        .select()
        .from(planApprovalsTable)
        .where(
          and(
            eq(planApprovalsTable.investigationId, params.investigationId),
            eq(planApprovalsTable.planVersion, execReq.planVersion),
            isNull(planApprovalsTable.revokedAt)
          )
        )
        .limit(1);

      if (!approval) {
        throw new Error(`Plan version ${execReq.planVersion} approval has been revoked or is not active.`);
      }

      if (approval.authorizedActorId !== currentInv.ownerId) {
        throw new Error(
          `Plan approval actor mismatch: approval was issued to '${approval.authorizedActorId}', but investigation is owned by '${currentInv.ownerId}'.`
        );
      }

      if (approval.expiresAt && approval.expiresAt.getTime() <= Date.now()) {
        throw new Error(`Plan version ${execReq.planVersion} approval has expired at ${approval.expiresAt.toISOString()}.`);
      }
    };

    // Heartbeat helper that checks and renews lease, failing closed on loss
    const renewHeartbeat = async () => {
      await assertExecutionAuthorized();
      const renewed = await this.leaseService.renewGlobalLease({
        workerInstanceId: params.workerInstanceId,
        epoch: params.epoch,
        leaseTtlMs: 60_000,
      });
      if (!renewed) {
        throw new Error(
          `[ExecutionFencingError] Failed to renew global execution lease for worker '${params.workerInstanceId}' epoch ${params.epoch}. Lease lost or expired.`
        );
      }
    };

    const periodicLeaseRenewal = setInterval(async () => {
      try {
        await renewHeartbeat();
      } catch (err: unknown) {
        leaseLostError = err instanceof Error ? err : new Error(String(err));
      }
    }, 15_000);

    try {
      // Fail closed immediately if authorization, approval, or lease is invalid before touching target network
      await assertExecutionAuthorized();

      const expectedBaseline: Record<string, unknown> = {
        targetId: safeTarget.id,
        environment: safeTarget.environment,
        fixtureScope: 'default',
        ...(((plan as unknown as Record<string, unknown>).expectedBaseline as Record<string, unknown>) || {}),
      };

      // Pre-flight baseline verification for Attempt 1
      let att1PreconditionsMet = true;
      let targetBuildIdAttempt1: string | undefined =
        typeof (safeTarget as unknown as Record<string, unknown>).buildId === 'string'
          ? ((safeTarget as unknown as Record<string, unknown>).buildId as string)
          : undefined;

      if (safeTarget.hasResetCapability) {
        try {
          const preflight = await TargetResetClient.verifyBaselineReadback({
            target: safeTarget,
            expectedBaseline,
          });
          att1PreconditionsMet = preflight.isEquivalent;
          if (preflight.targetBuildId) {
            targetBuildIdAttempt1 = preflight.targetBuildId;
          }
        } catch {
          att1PreconditionsMet = false;
        }

      if (!att1PreconditionsMet) {
        clearInterval(periodicLeaseRenewal);
        await attemptsRepository.createOrUpdateAttempt({
          investigationId: params.investigationId,
          attemptNumber: 1,
          status: 'FAILED',
          validity: 'INVALID',
          finding: 'UNRESOLVED',
          invalidityReason: 'PRECONDITION_FAILED: Target initial pre-flight baseline verification failed.',
          summary: 'Attempt 1 blocked: Target initial baseline dirty or unreachable.',
        });

        await attemptsRepository.savePairAssessment({
          investigationId: params.investigationId,
          verdict: 'INCONCLUSIVE',
          validAttemptCount: 0,
          matchingAttemptCount: 0,
          isComparable: false,
          summary: 'Investigation blocked: Target failed initial pre-flight baseline verification.',
        });

        await db
          .update(investigationsTable)
          .set({
            lifecycleStatus: 'FAILED',
            reproductionVerdict: 'INCONCLUSIVE',
            updatedAt: new Date(),
          })
          .where(eq(investigationsTable.id, params.investigationId));

        await db
          .update(executionRequestsTable)
          .set({
            status: 'FAILED',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(executionRequestsTable.id, params.executionRequestId));

        return {
          status: 'PREFLIGHT_BASELINE_FAILED',
          verdict: 'INCONCLUSIVE',
          summary: 'Pre-flight target baseline verification failed; execution blocked to protect target state.',
        };
      }
    }

    // =========================================================================
    // ATTEMPT 1 EXECUTION
    // =========================================================================
    await assertExecutionAuthorized();

    await db
      .update(investigationsTable)
      .set({
        lifecycleStatus: 'RUNNING_ATTEMPT_1',
        activeAttemptNumber: 1,
        updatedAt: now,
      })
      .where(eq(investigationsTable.id, params.investigationId));

    await eventsRepository.appendEvent({
      investigationId: params.investigationId,
      eventType: 'ATTEMPT_STARTED',
      message: 'Attempt 1 execution started in fresh isolated browser context.',
      payload: { attemptNumber: 1, planVersion: plan.version },
    });

    const attempt1Receipt = await this.browserWorker.executeAttempt({
      investigationId: params.investigationId,
      attemptNumber: 1,
      plan,
      target: safeTarget,
      onHeartbeat: renewHeartbeat,
    });

    // Check mutation uncertainty
    const att1HasUncertainty = attempt1Receipt.actionsExecuted.some(
      (a) => a.uncertainty === 'MUTATION_UNCERTAIN'
    );

    // Derive real scope adherence from action receipts
    const att1ScopeAdhered = !attempt1Receipt.actionsExecuted.some(
      (a) =>
        a.errorDetails?.includes('TargetScopeViolationError') ||
        a.errorDetails?.includes('TargetNetworkGuard') ||
        a.errorDetails?.includes('blockedbyclient')
    );

    // Evaluate assertions for Attempt 1
    const att1Evaluations = DeterministicAssertionEvaluator.evaluateAll(
      plan.assertions || [],
      attempt1Receipt.assertionObservations || new Map()
    );

    // Assess Attempt 1
    const att1Assessment = AttemptAssessor.assessAttempt({
      attemptNumber: 1,
      evaluations: att1Evaluations,
      preconditionsMet: att1PreconditionsMet,
      procedureCompleted: attempt1Receipt.completedCleanly,
      scopeAdhered: att1ScopeAdhered,
      hasMutationUncertainty: att1HasUncertainty,
      runnerError: attempt1Receipt.actionsExecuted.find((a) => a.status !== 'SUCCESS')?.errorDetails,
    });

    const lastStep1 = attempt1Receipt.actionsExecuted.slice(-1)[0];
    const mutState1 = att1HasUncertainty
      ? 'MUTATION_UNCERTAIN'
      : attempt1Receipt.actionsExecuted.some((a) => a.uncertainty === 'MUTATION_CONFIRMED')
      ? 'MUTATION_CONFIRMED'
      : 'NONE';

    // Persist Attempt 1 Record & Evaluations
    const attempt1Record = await attemptsRepository.createOrUpdateAttempt({
      investigationId: params.investigationId,
      attemptNumber: 1,
      status: att1Assessment.validity === 'VALID' ? 'COMPLETED' : 'FAILED',
      validity: att1Assessment.validity,
      finding: att1Assessment.finding,
      invalidityReason: att1Assessment.invalidityReason,
      totalDurationMs: attempt1Receipt.totalDurationMs,
      completedCleanly: attempt1Receipt.completedCleanly,
      actionsExecuted: attempt1Receipt.actionsExecuted.length,
      mutationState: mutState1,
      lastObservedStep: lastStep1 ? String(lastStep1.stepIndex) : undefined,
      summary: `Attempt 1: finding=${att1Assessment.finding}, validity=${att1Assessment.validity}`,
    });

    await attemptsRepository.saveAssertionEvaluations(
      att1Evaluations.map((ev) => ({
        investigationId: params.investigationId,
        attemptId: attempt1Record.id,
        attemptNumber: 1,
        assertionId: ev.assertionId,
        kind: ev.kind,
        purpose: ev.purpose,
        result: ev.result,
        expectedValue: ev.expectedValue,
        observedValue: ev.observedValue,
        details: ev.details,
      }))
    );

    await eventsRepository.appendEvent({
      investigationId: params.investigationId,
      eventType: 'ATTEMPT_COMPLETED',
      message: `Attempt 1 finished with finding: ${att1Assessment.finding} (${att1Assessment.validity}).`,
      payload: {
        attemptNumber: 1,
        validity: att1Assessment.validity,
        finding: att1Assessment.finding,
        durationMs: attempt1Receipt.totalDurationMs,
      },
    });

    // If Attempt 1 produced MUTATION_UNCERTAIN, quarantine lease and halt
    if (att1HasUncertainty) {
      await this.leaseService.quarantineLease({
        workerInstanceId: params.workerInstanceId,
        epoch: params.epoch,
        quarantineMs: 60 * 60 * 1000,
        reason: 'Attempt 1 produced MUTATION_UNCERTAIN.',
      });

      await db
        .update(investigationsTable)
        .set({
          lifecycleStatus: 'FAILED',
          reproductionVerdict: 'INCONCLUSIVE',
          updatedAt: new Date(),
        })
        .where(eq(investigationsTable.id, params.investigationId));

      await db
        .update(executionRequestsTable)
        .set({ status: 'FAILED', completedAt: new Date() })
        .where(eq(executionRequestsTable.id, params.executionRequestId));

      return {
        status: 'MUTATION_UNCERTAIN',
        verdict: 'INCONCLUSIVE',
        summary: 'Attempt 1 encountered mutation uncertainty. Execution halted and slot quarantined.',
      };
    }

    // =========================================================================
    // RESET GATE (Between Attempt 1 and Attempt 2)
    // =========================================================================
    await assertExecutionAuthorized();

    await db
      .update(investigationsTable)
      .set({
        lifecycleStatus: 'RESETTING_TARGET',
        updatedAt: new Date(),
      })
      .where(eq(investigationsTable.id, params.investigationId));

    await eventsRepository.appendEvent({
      investigationId: params.investigationId,
      eventType: 'TARGET_RESET_REQUESTED',
      message: 'Coordinating target fixture reset and baseline readback verification.',
      payload: { targetId: safeTarget.id },
    });

    const resetReceipt = await TargetResetClient.coordinateReset({
      target: safeTarget,
      investigationId: params.investigationId,
      attemptPairId: params.executionRequestId,
      expectedBaseline,
    });

    await attemptsRepository.saveResetReceipt(resetReceipt);

    await eventsRepository.appendEvent({
      investigationId: params.investigationId,
      eventType: resetReceipt.isVerifiedRestored
        ? 'TARGET_RESET_COMPLETED'
        : 'TARGET_RESET_FAILED',
      message: resetReceipt.isVerifiedRestored
        ? 'Target fixture restored and independently verified by baseline readback.'
        : `Target fixture reset verification failed: ${resetReceipt.readback.discrepancies?.join(', ')}`,
      payload: {
        isVerifiedRestored: resetReceipt.isVerifiedRestored,
        transportSuccess: resetReceipt.transportSuccess,
        baselineEquivalent: resetReceipt.baselineEquivalent,
      },
    });

    // If reset failed, Attempt 2 is BLOCKED
    if (!resetReceipt.isVerifiedRestored) {
      const pairResult = PairAssessor.assessPair({
        investigationId: params.investigationId,
        attempt1: att1Assessment,
        resetReceipt,
      });

      await attemptsRepository.savePairAssessment({
        investigationId: params.investigationId,
        verdict: pairResult.verdict,
        validAttemptCount: pairResult.validAttemptCount,
        matchingAttemptCount: pairResult.matchingAttemptCount,
        isComparable: false,
        summary: pairResult.summary,
      });

      await db
        .update(investigationsTable)
        .set({
          lifecycleStatus: 'FAILED',
          reproductionVerdict: pairResult.verdict,
          updatedAt: new Date(),
        })
        .where(eq(investigationsTable.id, params.investigationId));

      await db
        .update(executionRequestsTable)
        .set({ status: 'FAILED', completedAt: new Date() })
        .where(eq(executionRequestsTable.id, params.executionRequestId));

      return {
        status: 'RESET_FAILED',
        verdict: pairResult.verdict,
        summary: pairResult.summary,
      };
    }

    // =========================================================================
    // ATTEMPT 2 EXECUTION (Fresh Context)
    // =========================================================================
    await assertExecutionAuthorized();

    await db
      .update(investigationsTable)
      .set({
        lifecycleStatus: 'RUNNING_ATTEMPT_2',
        activeAttemptNumber: 2,
        updatedAt: new Date(),
      })
      .where(eq(investigationsTable.id, params.investigationId));

    await eventsRepository.appendEvent({
      investigationId: params.investigationId,
      eventType: 'ATTEMPT_STARTED',
      message: 'Attempt 2 execution started in fresh isolated browser context.',
      payload: { attemptNumber: 2, planVersion: plan.version },
    });

    const attempt2Receipt = await this.browserWorker.executeAttempt({
      investigationId: params.investigationId,
      attemptNumber: 2,
      plan,
      target: safeTarget,
      onHeartbeat: renewHeartbeat,
    });

    const att2HasUncertainty = attempt2Receipt.actionsExecuted.some(
      (a) => a.uncertainty === 'MUTATION_UNCERTAIN'
    );

    // Derive real scope adherence from action receipts
    const att2ScopeAdhered = !attempt2Receipt.actionsExecuted.some(
      (a) =>
        a.errorDetails?.includes('TargetScopeViolationError') ||
        a.errorDetails?.includes('TargetNetworkGuard') ||
        a.errorDetails?.includes('blockedbyclient')
    );

    const att2Evaluations = DeterministicAssertionEvaluator.evaluateAll(
      plan.assertions || [],
      attempt2Receipt.assertionObservations || new Map()
    );

    const att2Assessment = AttemptAssessor.assessAttempt({
      attemptNumber: 2,
      evaluations: att2Evaluations,
      preconditionsMet: resetReceipt.isVerifiedRestored,
      procedureCompleted: attempt2Receipt.completedCleanly,
      scopeAdhered: att2ScopeAdhered,
      hasMutationUncertainty: att2HasUncertainty,
      runnerError: attempt2Receipt.actionsExecuted.find((a) => a.status !== 'SUCCESS')?.errorDetails,
    });

    const lastStep2 = attempt2Receipt.actionsExecuted.slice(-1)[0];
    const mutState2 = att2HasUncertainty
      ? 'MUTATION_UNCERTAIN'
      : attempt2Receipt.actionsExecuted.some((a) => a.uncertainty === 'MUTATION_CONFIRMED')
      ? 'MUTATION_CONFIRMED'
      : 'NONE';

    const attempt2Record = await attemptsRepository.createOrUpdateAttempt({
      investigationId: params.investigationId,
      attemptNumber: 2,
      status: att2Assessment.validity === 'VALID' ? 'COMPLETED' : 'FAILED',
      validity: att2Assessment.validity,
      finding: att2Assessment.finding,
      invalidityReason: att2Assessment.invalidityReason,
      totalDurationMs: attempt2Receipt.totalDurationMs,
      completedCleanly: attempt2Receipt.completedCleanly,
      actionsExecuted: attempt2Receipt.actionsExecuted.length,
      mutationState: mutState2,
      lastObservedStep: lastStep2 ? String(lastStep2.stepIndex) : undefined,
      summary: `Attempt 2: finding=${att2Assessment.finding}, validity=${att2Assessment.validity}`,
    });

    await attemptsRepository.saveAssertionEvaluations(
      att2Evaluations.map((ev) => ({
        investigationId: params.investigationId,
        attemptId: attempt2Record.id,
        attemptNumber: 2,
        assertionId: ev.assertionId,
        kind: ev.kind,
        purpose: ev.purpose,
        result: ev.result,
        expectedValue: ev.expectedValue,
        observedValue: ev.observedValue,
        details: ev.details,
      }))
    );

    await eventsRepository.appendEvent({
      investigationId: params.investigationId,
      eventType: 'ATTEMPT_COMPLETED',
      message: `Attempt 2 finished with finding: ${att2Assessment.finding} (${att2Assessment.validity}).`,
      payload: {
        attemptNumber: 2,
        validity: att2Assessment.validity,
        finding: att2Assessment.finding,
        durationMs: attempt2Receipt.totalDurationMs,
      },
    });

    // =========================================================================
    // MASTER PAIR ASSESSMENT & CONCLUSION
    // =========================================================================
    const targetBuildIdAttempt2 =
      resetReceipt.targetBuildId ||
      resetReceipt.readback?.targetBuildId ||
      targetBuildIdAttempt1;

    const pairResult = PairAssessor.assessPair({
      investigationId: params.investigationId,
      attempt1: att1Assessment,
      attempt2: att2Assessment,
      resetReceipt,
      targetBuildIdAttempt1,
      targetBuildIdAttempt2,
      allowUnattestedTargetBuild:
        safeTarget.environment === 'development' &&
        process.env.NODE_ENV !== 'production',
    });

    await attemptsRepository.savePairAssessment({
      investigationId: params.investigationId,
      verdict: pairResult.verdict,
      validAttemptCount: pairResult.validAttemptCount,
      matchingAttemptCount: pairResult.matchingAttemptCount,
      isComparable: pairResult.isComparable,
      summary: pairResult.summary,
    });

    // Finalize investigation state
    const completionDate = new Date();
    await db
      .update(investigationsTable)
      .set({
        lifecycleStatus: 'FINALIZING_EVIDENCE',
        reproductionVerdict: pairResult.verdict,
        completedAt: completionDate,
        updatedAt: completionDate,
      })
      .where(eq(investigationsTable.id, params.investigationId));

    await db
      .update(executionRequestsTable)
      .set({
        status: 'COMPLETED',
        completedAt: completionDate,
        updatedAt: completionDate,
      })
      .where(eq(executionRequestsTable.id, params.executionRequestId));

    await eventsRepository.appendEvent({
      investigationId: params.investigationId,
      eventType: 'INVESTIGATION_COMPLETED',
      message: `Reproduction experiment concluded: ${pairResult.verdict}. ${pairResult.summary}`,
      payload: {
        verdict: pairResult.verdict,
        attemptsCompleted: 2,
        durationMs: attempt1Receipt.totalDurationMs + attempt2Receipt.totalDurationMs,
        summary: pairResult.summary,
      },
    });

    return {
      status: 'COMPLETED',
      verdict: pairResult.verdict,
      summary: pairResult.summary,
    };
  } finally {
    clearInterval(periodicLeaseRenewal);
  }
}
}
