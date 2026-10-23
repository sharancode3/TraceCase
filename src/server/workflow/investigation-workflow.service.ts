import { INITIAL_WORKBENCH_FIXTURE } from '../../../demo-target/workbench/workbench-view';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import {
  investigationsTable,
  targetsTable,
  bugReportsTable,
  experimentPlanRevisionsTable,
  planApprovalsTable,
  investigationEventsTable,
  investigationAttemptsTable,
} from '@/server/db/schema';
import { getDb, DbClient } from '@/server/db';
import {
  AuthoritativeExperimentPlan,
} from '@/contracts/planning';
import {
  ReportPlannerOutputSchema,
} from '@/contracts/ai';
import { TxOrDb } from '@/server/db/repositories/clarifications.repository';
import {
  ActionTier,
  InvestigationLifecycleStatus,
  ReproductionVerdict,
  EvidenceReadinessStatus,
  AttemptValidity,
  MutationUncertainty,
} from '@/contracts/status';
import { projectSafeModelTargetContext } from '@/contracts/targets';
import { InvestigationSnapshot } from '@/contracts/investigations';
import {
  ReportClarificationAgentPort,
  unavailableReportClarificationAgent,
  QueueDispatcherPort,
  unavailableQueueDispatcher,
} from '@/server/services/ports';
import { getServiceContainer } from '@/server/services/service-container';
import { validateExperimentProposal } from '@/server/policy/proposal-validator';
import { calculateAuthoritativePlanFingerprint } from '@/server/policy/plan-fingerprint';
import { verifyAuthoritativeApprovalCompatibility } from '@/server/policy/approval-guard';
import { clarificationsRepository } from '@/server/db/repositories/clarifications.repository';
import { attemptsRepository } from '@/server/db/repositories/attempts.repository';
import {
  ConflictError,
  PolicyViolationError,
  NotFoundError,
  ValidationFailedError,
} from './workflow-errors';
import { AuthorizationError } from '@/server/auth';

export class InvestigationWorkflowService {
  constructor(private dbProvider: () => DbClient = getDb) {}

  /**
   * Helper to fetch an investigation scoped strictly to the requesting owner.
   */
  async getOwnedInvestigationOrThrow(investigationId: string, ownerId: string) {
    const db = this.dbProvider();
    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(
        and(
          eq(investigationsTable.id, investigationId),
          eq(investigationsTable.ownerId, ownerId)
        )
      )
      .limit(1);

    if (!inv) {
      throw new NotFoundError('Investigation', investigationId);
    }
    return inv;
  }

  /**
   * Verifies optimistic concurrency against the investigation's current workflowRevision.
   */
  private verifyRevision(currentRevision: number, expectedRevision?: number) {
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      throw new ConflictError(
        `Optimistic concurrency conflict: expected workflow revision ${expectedRevision}, but current revision is ${currentRevision}.`,
        'CONFLICT_STALE_VERSION',
        { currentRevision, expectedRevision }
      );
    }
  }

  /**
   * Emits a typed, allowlisted investigation progress event with serialized sequence index.
   */
  async emitEvent(
    investigationId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<number> {
    const db = this.dbProvider();
    let nextSeq = 1;

    try {
      const [updated] = await db
        .update(investigationsTable)
        .set({
          eventSequenceCounter: sql`${investigationsTable.eventSequenceCounter} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(investigationsTable.id, investigationId))
        .returning({ counter: investigationsTable.eventSequenceCounter });

      if (updated && typeof updated.counter === 'number') {
        nextSeq = updated.counter;
      } else {
        const existingEvents = await db
          .select({ seq: investigationEventsTable.sequenceIndex })
          .from(investigationEventsTable)
          .where(eq(investigationEventsTable.investigationId, investigationId));
        nextSeq = existingEvents.reduce((max: number, e: { seq: number }) => Math.max(max, e.seq), 0) + 1;
      }
    } catch {
      const existingEvents = await db
        .select({ seq: investigationEventsTable.sequenceIndex })
        .from(investigationEventsTable)
        .where(eq(investigationEventsTable.investigationId, investigationId));
      nextSeq = existingEvents.reduce((max: number, e: { seq: number }) => Math.max(max, e.seq), 0) + 1;
    }

    await db.insert(investigationEventsTable).values({
      investigationId,
      sequenceIndex: nextSeq,
      eventType,
      payload,
    });

    return nextSeq;
  }

  /**
   * Triggers experiment planning via ReportClarificationAgentPort.
   * Handles clarification requests, proposal validation, and authoritative plan publication.
   */
  async requestPlanning(params: {
    investigationId: string;
    ownerId: string;
    userGuidance?: string;
    expectedWorkflowRevision?: number;
    plannerPort?: ReportClarificationAgentPort;
  }) {
    const db = this.dbProvider();
    const inv = await this.getOwnedInvestigationOrThrow(params.investigationId, params.ownerId);
    this.verifyRevision(inv.workflowRevision, params.expectedWorkflowRevision);
    const initialWorkflowRevision = inv.workflowRevision;

    if (inv.lifecycleStatus === 'CANCELLED' || inv.reviewStatus === 'CANCELLED') {
      throw new ConflictError('Cannot plan an investigation that has been cancelled.', 'INVESTIGATION_CANCELLED');
    }

    // Load bug report and target
    const [report] = await db
      .select()
      .from(bugReportsTable)
      .where(eq(bugReportsTable.id, inv.reportId))
      .limit(1);
    const [target] = await db
      .select()
      .from(targetsTable)
      .where(eq(targetsTable.id, inv.targetId))
      .limit(1);

    if (!report || !target) {
      throw new NotFoundError('Report or Target', params.investigationId);
    }

    const safeTargetContext = projectSafeModelTargetContext(target as unknown as Record<string, unknown>);
    const planner = params.plannerPort || getServiceContainer().clarificationAgent || unavailableReportClarificationAgent;

    // 3. Load answered and pending clarification questions to construct normalized context with provenance
    const questions = await clarificationsRepository.listQuestions(inv.id);
    const knownFacts: Record<string, string> = {
      '[Target Config] Base URL': target.baseUrl,
      '[Target Config] Environment': target.environment,
      '[Target Config] Allowed Origins': target.allowedOrigins.join(', '),
      '[Reporter Claim] Bug Title': report.title,
      '[Reporter Claim] Bug Description': report.rawDescription || report.bugDescription,
    };
    if (report.expectedBehavior) {
      knownFacts['[Reporter Claim] Claimed Expected Behavior'] = report.expectedBehavior;
    }
    if (report.observedBehavior) {
      knownFacts['[Reporter Claim] Claimed Failure Signature'] = report.observedBehavior;
    }
    if (report.suspectedSteps && Array.isArray(report.suspectedSteps) && report.suspectedSteps.length > 0) {
      knownFacts['[Reporter Claim] Suspected Steps'] = report.suspectedSteps.join(' -> ');
    }

    const missingFacts: string[] = [];
    const answeredQuestionTexts = new Set<string>();

    for (const q of questions) {
      if (q.isAnswered && q.answerText) {
        knownFacts[`[User Clarification Round ${q.roundIndex ?? 1} Q${q.questionIndex}] ${q.questionText}`] = q.answerText;
        answeredQuestionTexts.add(q.questionText.trim().toLowerCase());
      } else {
        missingFacts.push(q.questionText);
      }
    }

    // If the investigation is already awaiting user answers for a pending clarification round,
    // return existing unanswered questions without re-invoking the model or duplicating rows
    if (inv.reviewStatus === 'CLARIFICATION_PENDING') {
      const pendingQuestions = questions.filter((q) => !q.isAnswered);
      if (pendingQuestions.length > 0) {
        return {
          status: 'CLARIFICATION_NEEDED' as const,
          questions: pendingQuestions,
          workflowRevision: inv.workflowRevision,
        };
      }
    }

    const stepsFormatted = Array.isArray(report.suspectedSteps) && report.suspectedSteps.length > 0
      ? `\n\nSuspected Steps to Reproduce:\n` + report.suspectedSteps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')
      : '';
    const fullRawDescription = (report.rawDescription || report.bugDescription || '') + stepsFormatted;

    const plannerInput = {
      reportId: report.id,
      targetId: target.id,
      title: report.title,
      rawDescription: fullRawDescription,
      suspectedSteps: report.suspectedSteps,
      knownFacts,
      missingFacts,
      clarificationStatus: (missingFacts.length > 0 ? 'PENDING_USER_ANSWER' : 'NOT_NEEDED') as
        | 'PENDING_USER_ANSWER'
        | 'NOT_NEEDED',
      clarifiedExpectedBehavior: report.expectedBehavior,
      clarifiedFailureSignature: report.observedBehavior,
      targetEnvironment: target.environment,
      buildVersion: report.buildVersion,
      resolvedAt: null,
    };

    // Rebuild clarification history from all answered questions
    const clarificationHistory = questions
      .filter((q) => q.isAnswered && q.answerText)
      .map((q) => {
        const isSuggested =
          q.suggestedOptions &&
          Array.isArray(q.suggestedOptions) &&
          q.suggestedOptions.includes(q.answerText!);
        return {
          questionId: q.id,
          questionText: q.questionText,
          selectedOption: isSuggested ? q.answerText! : (q.answerText || 'Answered'),
          customText: isSuggested ? undefined : (q.answerText || undefined),
        };
      });

    // Model request is executed outside of any database transaction
    const plannerOutput = await planner.generateProposal({
      investigationId: inv.id,
      report: plannerInput,
      target: safeTargetContext,
      clarificationHistory,
    });

    // Validate planner output against runtime schema
    const schemaValidation = ReportPlannerOutputSchema.safeParse(plannerOutput);
    if (!schemaValidation.success) {
      throw new ValidationFailedError(
        `Planner output schema validation failed: ${schemaValidation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`,
        schemaValidation.error.format()
      );
    }

    if (plannerOutput.status === 'CLARIFICATION_NEEDED') {
      // Authoritative clarification limit from system architecture: maximum 3 rounds
      const MAX_CLARIFICATION_ROUNDS = 3;
      const completedRounds = Math.max(0, ...questions.map((q) => q.roundIndex ?? 1));

      if (completedRounds >= MAX_CLARIFICATION_ROUNDS) {
        const nextRev = initialWorkflowRevision + 1;
        const [updatedInv] = await db
          .update(investigationsTable)
          .set({
            reviewStatus: 'BLOCKED',
            workflowRevision: nextRev,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(investigationsTable.id, inv.id),
              eq(investigationsTable.workflowRevision, initialWorkflowRevision)
            )
          )
          .returning();

        if (!updatedInv || updatedInv.lifecycleStatus === 'CANCELLED') {
          throw new ConflictError(
            `Investigation workflow revision changed concurrently during planning (expected rev ${initialWorkflowRevision}).`,
            'CONCURRENT_WORKFLOW_MUTATION'
          );
        }

        await this.emitEvent(inv.id, 'PLANNING_BLOCKED', {
          reason: `Maximum clarification rounds (${MAX_CLARIFICATION_ROUNDS}) reached without sufficient facts to synthesize a testable plan.`,
          missingPrerequisites: ['Sufficient defect steps and observable assertion criteria could not be established within allowed clarification rounds.'],
        });

        return {
          status: 'UNABLE_TO_PROCEED' as const,
          reason: `Maximum clarification rounds (${MAX_CLARIFICATION_ROUNDS}) reached without sufficient facts to synthesize a testable plan.`,
          missingPrerequisites: ['Sufficient defect steps and observable assertion criteria could not be established within allowed clarification rounds.'],
          workflowRevision: nextRev,
        };
      }

      // Avoid repeating already answered questions unless follow-up is distinct
      const candidateQuestions = plannerOutput.questions.filter((q) => {
        const key = q.questionText.trim().toLowerCase();
        return !answeredQuestionTexts.has(key);
      });
      const questionsToPersist = candidateQuestions.length > 0 ? candidateQuestions : plannerOutput.questions;

      // Server-assigned append-only ordering: do NOT forward model-local questionIndex
      const persistedQuestions = await clarificationsRepository.saveQuestions(
        inv.id,
        questionsToPersist.map((q) => ({
          questionText: q.questionText,
          explanation: q.explanation || (q as unknown as { whyItMatters?: string }).whyItMatters || null,
          suggestedOptions: q.suggestedOptions || (q as unknown as { options?: string[] }).options || null,
        }))
      );

      const nextRev = initialWorkflowRevision + 1;
      const [updatedInv] = await db
        .update(investigationsTable)
        .set({
          reviewStatus: 'CLARIFICATION_PENDING',
          workflowRevision: nextRev,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(investigationsTable.id, inv.id),
            eq(investigationsTable.workflowRevision, initialWorkflowRevision)
          )
        )
        .returning();

      if (!updatedInv || updatedInv.lifecycleStatus === 'CANCELLED') {
        throw new ConflictError(
          `Investigation workflow revision changed concurrently during planning (expected rev ${initialWorkflowRevision}).`,
          'CONCURRENT_WORKFLOW_MUTATION'
        );
      }

      await this.emitEvent(inv.id, 'CLARIFICATION_REQUESTED', {
        questionCount: persistedQuestions.length,
        preliminaryUnderstanding: plannerOutput.preliminaryUnderstanding,
      });

      return {
        status: 'CLARIFICATION_NEEDED' as const,
        questions: persistedQuestions,
        workflowRevision: nextRev,
      };
    }

    if (plannerOutput.status === 'EXPERIMENT_PROPOSED') {
      const proposal = plannerOutput.proposal;

      // Validate proposal against deterministic tool, assertion, and sandbox rules
      const validation = validateExperimentProposal(proposal, safeTargetContext);
      if (!validation.isValid) {
        throw new ValidationFailedError(
          `Experiment proposal validation failed: ${validation.errors.join('; ')}`,
          validation.errors
        );
      }

      // Next plan version allocation
      const nextVersion = (inv.planVersion || 0) + 1;
      const now = new Date().toISOString();

      // Derive fixtureScope and expectedBaseline from target / proposal
      const isWorkbench =
        Boolean((target as any).fixtureScope === 'workbench_work_items') ||
        (typeof target.baseUrl === 'string' && target.baseUrl.includes('/workbench')) ||
        (proposal as any).fixtureScope === 'workbench_work_items';

      const fixtureScope = isWorkbench
        ? 'workbench_work_items'
        : ((target as any).fixtureScope || (proposal as any).fixtureScope || undefined);

      const expectedBaseline = isWorkbench
        ? {
            fixtureScope: 'workbench_work_items',
            buildVersion: 'wb-v1.0.0-buggy',
            itemCount: 4,
            items: INITIAL_WORKBENCH_FIXTURE,
          }
        : ((proposal as any).expectedBaseline || undefined);

      const authoritativePlan: AuthoritativeExperimentPlan = {
        id: crypto.randomUUID(),
        investigationId: inv.id,
        version: nextVersion,
        targetId: target.id,
        targetUrl: target.baseUrl,
        allowedOrigins: target.allowedOrigins,
        testAccountRef: target.testAccountRef || null,
        preconditions: proposal.preconditions,
        steps: proposal.steps,
        expectedCorrectBehavior: proposal.expectedCorrectBehavior,
        reportedFailureSignature: proposal.reportedFailureSignature,
        assertions: proposal.assertions,
        maxAttempts: 2,
        maxDurationMs: 120000,
        requiresResetHook: proposal.requiresResetHook,
        fixtureScope,
        expectedBaseline,
        planHash: '', // computed below
        createdAt: now,
      };

      const computedHash = calculateAuthoritativePlanFingerprint(authoritativePlan);
      authoritativePlan.planHash = computedHash;

      // Store immutable plan revision and update parent investigation atomically inside a transaction
      const nextRev = initialWorkflowRevision + 1;

      const runPersist = async (tx: TxOrDb) => {
        await tx.insert(experimentPlanRevisionsTable).values({
          id: authoritativePlan.id,
          investigationId: inv.id,
          version: nextVersion,
          planHash: computedHash,
          planPayload: authoritativePlan as unknown as Record<string, unknown>,
          createdBy: params.ownerId,
          createdAt: new Date(),
        });

        const [updatedInv] = await tx
          .update(investigationsTable)
          .set({
            planVersion: nextVersion,
            planHash: computedHash,
            reviewStatus: 'PROPOSAL_READY',
            workflowRevision: nextRev,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(investigationsTable.id, inv.id),
              eq(investigationsTable.workflowRevision, initialWorkflowRevision)
            )
          )
          .returning();

        if (!updatedInv || updatedInv.lifecycleStatus === 'CANCELLED') {
          throw new ConflictError(
            `Investigation workflow revision changed concurrently during planning (expected rev ${initialWorkflowRevision}).`,
            'CONCURRENT_WORKFLOW_MUTATION'
          );
        }

        return updatedInv;
      };

      if (typeof db.transaction === 'function') {
        await db.transaction(runPersist);
      } else {
        await runPersist(db);
      }

      await this.emitEvent(inv.id, 'PLAN_PUBLISHED', {
        planVersion: nextVersion,
        planHash: computedHash,
        stepCount: authoritativePlan.steps.length,
        assertionCount: authoritativePlan.assertions.length,
      });

      return {
        status: 'PROPOSAL_READY' as const,
        plan: authoritativePlan,
        workflowRevision: nextRev,
      };
    }

    if (plannerOutput.status === 'UNABLE_TO_PROCEED') {
      const nextRev = initialWorkflowRevision + 1;
      const [updatedInv] = await db
        .update(investigationsTable)
        .set({
          reviewStatus: 'BLOCKED',
          workflowRevision: nextRev,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(investigationsTable.id, inv.id),
            eq(investigationsTable.workflowRevision, initialWorkflowRevision)
          )
        )
        .returning();

      if (!updatedInv || updatedInv.lifecycleStatus === 'CANCELLED') {
        throw new ConflictError(
          `Investigation workflow revision changed concurrently during planning (expected rev ${initialWorkflowRevision}).`,
          'CONCURRENT_WORKFLOW_MUTATION'
        );
      }

      await this.emitEvent(inv.id, 'PLANNING_BLOCKED', {
        reason: plannerOutput.reason,
        missingPrerequisites: plannerOutput.missingPrerequisites,
      });

      return {
        status: 'UNABLE_TO_PROCEED' as const,
        reason: plannerOutput.reason,
        missingPrerequisites: plannerOutput.missingPrerequisites,
        workflowRevision: nextRev,
      };
    }

    throw new Error('Unrecognized planner output status.');
  }

  /**
   * Submits answers to one or more clarification questions.
   */
  async answerClarifications(params: {
    investigationId: string;
    ownerId: string;
    answers: Array<{ questionId: string; answerText: string }>;
    expectedWorkflowRevision?: number;
  }) {
    const db = this.dbProvider();
    const inv = await this.getOwnedInvestigationOrThrow(params.investigationId, params.ownerId);
    this.verifyRevision(inv.workflowRevision, params.expectedWorkflowRevision);
    const initialWorkflowRevision = inv.workflowRevision;

    if (inv.lifecycleStatus === 'CANCELLED' || inv.reviewStatus === 'CANCELLED') {
      throw new ConflictError('Cannot answer clarifications for a cancelled investigation.', 'INVESTIGATION_CANCELLED');
    }

    if (!params.answers || params.answers.length === 0) {
      throw new ValidationFailedError('At least one answer must be submitted.', ['answers cannot be empty']);
    }

    // Load existing questions to validate existence, investigation association, and round validity
    const existingQuestions = await clarificationsRepository.listQuestions(inv.id);
    const questionMap = new Map(existingQuestions.map((q) => [q.id, q]));

    const pendingQuestions = existingQuestions.filter((q) => !q.isAnswered);
    const activeRound = pendingQuestions.length > 0
      ? Math.max(...pendingQuestions.map((q) => q.roundIndex ?? 1))
      : Math.max(1, ...existingQuestions.map((q) => q.roundIndex ?? 1));

    for (const a of params.answers) {
      const q = questionMap.get(a.questionId);
      if (!q) {
        throw new NotFoundError('ClarificationQuestion', a.questionId);
      }
      if (q.investigationId !== inv.id) {
        throw new NotFoundError('ClarificationQuestion', a.questionId);
      }
      if (typeof a.answerText !== 'string' || a.answerText.trim().length === 0) {
        throw new ValidationFailedError(`Answer for question ${a.questionId} cannot be empty.`, ['empty answer text']);
      }
      // If there are pending questions in an active round, prevent answering questions from prior completed rounds
      if (pendingQuestions.length > 0 && q.isAnswered && (q.roundIndex ?? 1) < activeRound) {
        throw new ConflictError(
          `Question ${a.questionId} belongs to prior round ${q.roundIndex ?? 1} which is already answered.`,
          'PRIOR_ROUND_QUESTION'
        );
      }
    }

    const answered = await clarificationsRepository.batchAnswerQuestions(
      inv.id,
      params.answers,
      params.ownerId
    );

    const nextRev = initialWorkflowRevision + 1;
    const [updatedInv] = await db
      .update(investigationsTable)
      .set({
        workflowRevision: nextRev,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(investigationsTable.id, inv.id),
          eq(investigationsTable.workflowRevision, initialWorkflowRevision)
        )
      )
      .returning();

    if (!updatedInv || updatedInv.lifecycleStatus === 'CANCELLED') {
      throw new ConflictError(
        `Investigation workflow revision changed concurrently during answer submission (expected rev ${initialWorkflowRevision}).`,
        'CONCURRENT_WORKFLOW_MUTATION'
      );
    }

    await this.emitEvent(inv.id, 'CLARIFICATION_ANSWERED', {
      answeredCount: answered.length,
    });

    return {
      answers: answered,
      workflowRevision: nextRev,
    };
  }

  /**
   * Genuine human approval against persisted immutable plan state.
   */
  async approvePlan(params: {
    investigationId: string;
    ownerId: string;
    planVersion: number;
    approvedPlanHash: string;
    operatorNotes?: string;
    expectedWorkflowRevision?: number;
  }) {
    const db = this.dbProvider();
    const inv = await this.getOwnedInvestigationOrThrow(params.investigationId, params.ownerId);
    this.verifyRevision(inv.workflowRevision, params.expectedWorkflowRevision);

    if (inv.planVersion !== params.planVersion || !inv.planHash) {
      throw new ConflictError(
        `Plan version mismatch: approved v${params.planVersion}, but active investigation plan is v${inv.planVersion || 'none'}.`,
        'STALE_PLAN_VERSION'
      );
    }

    // Load exact persisted plan revision
    const [revision] = await db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(
        and(
          eq(experimentPlanRevisionsTable.investigationId, inv.id),
          eq(experimentPlanRevisionsTable.version, params.planVersion)
        )
      )
      .limit(1);

    if (!revision) {
      throw new NotFoundError('PlanRevision', `${inv.id}:v${params.planVersion}`);
    }

    // Recompute fingerprint
    const plan = revision.planPayload as AuthoritativeExperimentPlan;
    const recomputedHash = calculateAuthoritativePlanFingerprint(plan);

    if (recomputedHash.toLowerCase() !== revision.planHash.toLowerCase()) {
      throw new ConflictError('Plan integrity violation: persisted revision planHash does not match canonical recomputed fingerprint.', 'CORRUPTED_PLAN_HASH');
    }

    if (params.approvedPlanHash.toLowerCase() !== revision.planHash.toLowerCase()) {
      throw new ConflictError('Plan approval hash mismatch: the reviewed plan content differs from the stored plan revision.', 'PLAN_HASH_MISMATCH');
    }

    // Load target for sandbox verification check
    const [target] = await db
      .select()
      .from(targetsTable)
      .where(eq(targetsTable.id, inv.targetId))
      .limit(1);

    if (!target) {
      throw new NotFoundError('Target', inv.targetId);
    }

    // Determine max action tier required
    let maxTier: 'TIER_1_READ_ONLY' | 'TIER_2_SAFE_INTERACTION' | 'TIER_3_MUTATING_INTERACTION' | 'TIER_4_DESTRUCTIVE' = 'TIER_1_READ_ONLY';
    for (const step of plan.steps) {
      if (step.tier === 'TIER_4_DESTRUCTIVE') {
        maxTier = 'TIER_4_DESTRUCTIVE';
        break;
      } else if (step.tier === 'TIER_3_MUTATING_INTERACTION') {
        maxTier = 'TIER_3_MUTATING_INTERACTION';
      } else if (step.tier === 'TIER_2_SAFE_INTERACTION' && maxTier === 'TIER_1_READ_ONLY') {
        maxTier = 'TIER_2_SAFE_INTERACTION';
      }
    }

    if (maxTier === 'TIER_4_DESTRUCTIVE' && !target.isSandboxVerified) {
      throw new PolicyViolationError('Cannot approve plan requiring TIER_4_DESTRUCTIVE when target sandbox authority is unverified.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h validity

    // Record authoritative approval
    const [approvalRecord] = await db
      .insert(planApprovalsTable)
      .values({
        investigationId: inv.id,
        targetId: target.id,
        planVersion: params.planVersion,
        planHash: revision.planHash,
        authorizedActorId: params.ownerId,
        maxActionTierPermitted: maxTier,
        approvedBy: params.ownerId,
        operatorNotes: params.operatorNotes || null,
        approvedAt: now,
        expiresAt,
        revokedAt: null,
      })
      .returning();

    const nextRev = inv.workflowRevision + 1;
    await db
      .update(investigationsTable)
      .set({
        reviewStatus: 'APPROVED',
        workflowRevision: nextRev,
        updatedAt: now,
      })
      .where(eq(investigationsTable.id, inv.id));

    await this.emitEvent(inv.id, 'PLAN_APPROVED', {
      planVersion: params.planVersion,
      planHash: revision.planHash,
      authorizedActorId: params.ownerId,
      maxActionTierPermitted: maxTier,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      approved: true,
      approvalRecord: {
        ...approvalRecord,
        approvedAt: approvalRecord.approvedAt.toISOString(),
        expiresAt: approvalRecord.expiresAt ? approvalRecord.expiresAt.toISOString() : null,
        revokedAt: approvalRecord.revokedAt ? approvalRecord.revokedAt.toISOString() : null,
      },
      workflowRevision: nextRev,
    };
  }

  /**
   * Human operator rejection of a proposed plan.
   */
  async rejectPlan(params: {
    investigationId: string;
    ownerId: string;
    planVersion: number;
    rejectionReason: string;
    expectedWorkflowRevision?: number;
  }) {
    const db = this.dbProvider();
    const inv = await this.getOwnedInvestigationOrThrow(params.investigationId, params.ownerId);
    this.verifyRevision(inv.workflowRevision, params.expectedWorkflowRevision);

    if (inv.planVersion !== params.planVersion) {
      throw new ConflictError(
        `Plan version mismatch: attempted to reject v${params.planVersion}, but current plan is v${inv.planVersion || 'none'}.`,
        'STALE_PLAN_VERSION'
      );
    }

    const now = new Date();
    const nextRev = inv.workflowRevision + 1;

    await db
      .update(investigationsTable)
      .set({
        reviewStatus: 'REJECTED',
        rejectionReason: params.rejectionReason,
        rejectedAt: now,
        rejectedBy: params.ownerId,
        workflowRevision: nextRev,
        updatedAt: now,
      })
      .where(eq(investigationsTable.id, inv.id));

    await this.emitEvent(inv.id, 'PLAN_REJECTED', {
      planVersion: params.planVersion,
      rejectionReason: params.rejectionReason,
    });

    return {
      rejected: true,
      workflowRevision: nextRev,
    };
  }

  /**
   * Revocation of a previously granted plan approval.
   */
  async revokeApproval(params: {
    investigationId: string;
    ownerId: string;
    planVersion: number;
    revocationReason: string;
    expectedWorkflowRevision?: number;
  }) {
    const db = this.dbProvider();
    const inv = await this.getOwnedInvestigationOrThrow(params.investigationId, params.ownerId);
    this.verifyRevision(inv.workflowRevision, params.expectedWorkflowRevision);

    const now = new Date();

    // Mark active approval revoked
    await db
      .update(planApprovalsTable)
      .set({ revokedAt: now })
      .where(
        and(
          eq(planApprovalsTable.investigationId, inv.id),
          eq(planApprovalsTable.planVersion, params.planVersion)
        )
      );

    const nextRev = inv.workflowRevision + 1;
    await db
      .update(investigationsTable)
      .set({
        reviewStatus: 'REVOKED',
        workflowRevision: nextRev,
        updatedAt: now,
      })
      .where(eq(investigationsTable.id, inv.id));

    await this.emitEvent(inv.id, 'APPROVAL_REVOKED', {
      planVersion: params.planVersion,
      revocationReason: params.revocationReason,
    });

    return {
      revoked: true,
      workflowRevision: nextRev,
    };
  }

  /**
   * Pre-execution cancellation of an investigation.
   */
  async cancelInvestigation(params: {
    investigationId: string;
    ownerId: string;
    cancellationReason: string;
    expectedWorkflowRevision?: number;
  }) {
    const db = this.dbProvider();
    const inv = await this.getOwnedInvestigationOrThrow(params.investigationId, params.ownerId);
    this.verifyRevision(inv.workflowRevision, params.expectedWorkflowRevision);

    if (
      inv.lifecycleStatus === 'COMPLETED' ||
      inv.lifecycleStatus === 'FAILED' ||
      inv.lifecycleStatus === 'RUNNING_ATTEMPT_1' ||
      inv.lifecycleStatus === 'RUNNING_ATTEMPT_2'
    ) {
      throw new ConflictError('Cannot cancel an investigation that has already completed or is executing.', 'CANNOT_CANCEL_EXECUTING');
    }

    const now = new Date();

    // Invalidate any active approval
    if (inv.planVersion) {
      await db
        .update(planApprovalsTable)
        .set({ revokedAt: now })
        .where(eq(planApprovalsTable.investigationId, inv.id));
    }

    const nextRev = inv.workflowRevision + 1;
    await db
      .update(investigationsTable)
      .set({
        lifecycleStatus: 'CANCELLED',
        reviewStatus: 'CANCELLED',
        cancelledAt: now,
        cancelledBy: params.ownerId,
        cancellationReason: params.cancellationReason,
        workflowRevision: nextRev,
        updatedAt: now,
      })
      .where(eq(investigationsTable.id, inv.id));

    await this.emitEvent(inv.id, 'INVESTIGATION_CANCELLED', {
      cancellationReason: params.cancellationReason,
    });

    return {
      cancelled: true,
      workflowRevision: nextRev,
    };
  }

  /**
   * Start / Admission boundary.
   * Validates all authorization, scope, target, and approval preconditions before dispatching.
   * In live Stage 0 / Phase P1-03, dispatcherPort throws ServiceUnavailableError,
   * which truthfully reports that the queue is scheduled for Phase P1-04.
   */
  async startInvestigation(params: {
    investigationId: string;
    ownerId: string;
    planVersion: number;
    approvedPlanHash: string;
    expectedWorkflowRevision?: number;
    dispatcherPort?: QueueDispatcherPort;
  }) {
    const db = this.dbProvider();
    const inv = await this.getOwnedInvestigationOrThrow(params.investigationId, params.ownerId);
    this.verifyRevision(inv.workflowRevision, params.expectedWorkflowRevision);

    if (inv.reviewStatus !== 'APPROVED') {
      throw new PolicyViolationError(`Investigation cannot start: review status is '${inv.reviewStatus}', must be 'APPROVED'.`);
    }

    if (inv.planVersion !== params.planVersion) {
      throw new ConflictError(`Plan version mismatch: start requested for v${params.planVersion}, but current approved version is v${inv.planVersion}.`, 'STALE_PLAN_VERSION');
    }

    // Load plan revision
    const [revision] = await db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(
        and(
          eq(experimentPlanRevisionsTable.investigationId, inv.id),
          eq(experimentPlanRevisionsTable.version, params.planVersion)
        )
      )
      .limit(1);

    if (!revision) {
      throw new NotFoundError('PlanRevision', `${inv.id}:v${params.planVersion}`);
    }

    if (params.approvedPlanHash.toLowerCase() !== revision.planHash.toLowerCase()) {
      throw new ConflictError(
        'Plan hash mismatch: requested approved plan hash does not match stored revision hash.',
        'PLAN_HASH_MISMATCH'
      );
    }

    if (inv.planHash && inv.planHash.toLowerCase() !== revision.planHash.toLowerCase()) {
      throw new ConflictError(
        'Investigation plan hash mismatch with stored revision.',
        'CORRUPTED_PLAN_HASH'
      );
    }

    const plan = revision.planPayload as AuthoritativeExperimentPlan;

    // Load active approval (deterministic selection: unrevoked, highest approvedAt)
    const [approval] = await db
      .select()
      .from(planApprovalsTable)
      .where(
        and(
          eq(planApprovalsTable.investigationId, inv.id),
          eq(planApprovalsTable.planVersion, params.planVersion),
          isNull(planApprovalsTable.revokedAt)
        )
      )
      .orderBy(desc(planApprovalsTable.approvedAt))
      .limit(1);

    if (!approval) {
      throw new PolicyViolationError('No active un-revoked approval record exists for this plan version (TC-INV-003).');
    }

    if (approval.planHash.toLowerCase() !== revision.planHash.toLowerCase()) {
      throw new ConflictError(
        'Stored approval plan hash does not match current plan revision hash.',
        'PLAN_HASH_MISMATCH'
      );
    }

    // Validate approval compatibility
    const compatibility = verifyAuthoritativeApprovalCompatibility({
      plan,
      approval: {
        ...approval,
        targetId: approval.targetId || inv.targetId,
        authorizedActorId: approval.authorizedActorId || approval.approvedBy,
        maxActionTierPermitted: approval.maxActionTierPermitted as ActionTier,
        approvedAt: approval.approvedAt.toISOString(),
        expiresAt: approval.expiresAt ? approval.expiresAt.toISOString() : null,
        revokedAt: approval.revokedAt ? approval.revokedAt.toISOString() : null,
      },
      trustedContext: {
        targetId: inv.targetId,
        actorId: params.ownerId,
        currentTimestamp: new Date().toISOString(),
      },
    });

    if (!compatibility.isCompatible) {
      throw new AuthorizationError(`Approval guard compatibility failed: ${compatibility.reason}`);
    }

    // Call dispatcher port
    const dispatcher = params.dispatcherPort || getServiceContainer().queueDispatcher || unavailableQueueDispatcher;
    const dispatchResult = await dispatcher.enqueueInvestigation({
      investigationId: inv.id,
      planVersion: params.planVersion,
    });

    const nextRev = inv.workflowRevision + 1;
    await db
      .update(investigationsTable)
      .set({
        lifecycleStatus: 'QUEUED',
        workflowRevision: nextRev,
        updatedAt: new Date(),
      })
      .where(eq(investigationsTable.id, inv.id));

    await this.emitEvent(inv.id, 'EXECUTION_ADMITTED', {
      planVersion: params.planVersion,
      planHash: revision.planHash,
      jobId: dispatchResult.jobId,
    });

    return {
      started: true,
      jobId: dispatchResult.jobId,
      queuedAt: dispatchResult.queuedAt,
      workflowRevision: nextRev,
    };
  }

  /**
   * Builds an authoritative, truthful read model snapshot for an investigation.
   */
  async getInvestigationSnapshot(investigationId: string, ownerId: string): Promise<InvestigationSnapshot> {
    const db = this.dbProvider();
    const inv = await this.getOwnedInvestigationOrThrow(investigationId, ownerId);

    const [target] = await db
      .select()
      .from(targetsTable)
      .where(eq(targetsTable.id, inv.targetId))
      .limit(1);

    const [report] = await db
      .select()
      .from(bugReportsTable)
      .where(eq(bugReportsTable.id, inv.reportId))
      .limit(1);

    if (!target || !report) {
      throw new NotFoundError('Target or Report', investigationId);
    }

    // Derive genuine approval validity
    let isApproved = false;
    let approvedBy: string | null = null;
    let approvedAt: string | null = null;

    if (inv.planVersion && inv.reviewStatus === 'APPROVED') {
      const [approval] = await db
        .select()
        .from(planApprovalsTable)
        .where(
          and(
            eq(planApprovalsTable.investigationId, inv.id),
            eq(planApprovalsTable.planVersion, inv.planVersion)
          )
        )
        .limit(1);

      if (approval && !approval.revokedAt) {
        const notExpired = !approval.expiresAt || approval.expiresAt.getTime() > Date.now();
        if (notExpired && approval.planHash === inv.planHash) {
          isApproved = true;
          approvedBy = approval.approvedBy;
          approvedAt = approval.approvedAt.toISOString();
        }
      }
    }

    // Query investigationAttemptsTable for attempt 1 and attempt 2
    let attempt1Summary: InvestigationSnapshot['attempt1'] = null;
    let attempt2Summary: InvestigationSnapshot['attempt2'] = null;

    const mapToContractValidity = (
      validity: string,
      finding: string,
      reason?: string | null
    ): AttemptValidity => {
      if (validity === 'VALID') {
        return finding === 'REPORTED_FAILURE' ? 'VALID_DEFECT_DETECTED' : 'VALID_CLEAN_RUN';
      }
      if (validity === 'INVALID') {
        if (reason?.toLowerCase().includes('timeout')) return 'INVALID_TIMEOUT';
        if (reason?.toLowerCase().includes('blocked') || reason?.toLowerCase().includes('scope')) return 'INVALID_BLOCKED';
        return 'INVALID_CRASH';
      }
      return 'PENDING';
    };

    const attempts = await db
      .select()
      .from(investigationAttemptsTable)
      .where(eq(investigationAttemptsTable.investigationId, inv.id));

    const att1 = attempts.find((a) => a.attemptNumber === 1);
    if (att1) {
      attempt1Summary = {
        attemptNumber: 1,
        validity: mapToContractValidity(att1.validity, att1.finding, att1.invalidityReason),
        defectDetected: att1.finding === 'REPORTED_FAILURE',
        startedAt: att1.startedAt.toISOString(),
        completedAt: att1.completedAt ? att1.completedAt.toISOString() : null,
        durationMs: att1.totalDurationMs ?? null,
        actionsExecuted: att1.actionsExecuted ?? (att1.completedCleanly ? 1 : 0),
        lastObservedStep: att1.lastObservedStep != null ? parseInt(att1.lastObservedStep, 10) : null,
        mutationState: (att1.mutationState as MutationUncertainty) || 'NONE',
        failureMessage: att1.invalidityReason || null,
        summary: att1.summary || null,
        buildId: (target as unknown as { buildId?: string }).buildId || report.buildVersion || null,
      };
    }

    const att2 = attempts.find((a) => a.attemptNumber === 2);
    if (att2) {
      attempt2Summary = {
        attemptNumber: 2,
        validity: mapToContractValidity(att2.validity, att2.finding, att2.invalidityReason),
        defectDetected: att2.finding === 'REPORTED_FAILURE',
        startedAt: att2.startedAt.toISOString(),
        completedAt: att2.completedAt ? att2.completedAt.toISOString() : null,
        durationMs: att2.totalDurationMs ?? null,
        actionsExecuted: att2.actionsExecuted ?? (att2.completedCleanly ? 1 : 0),
        lastObservedStep: att2.lastObservedStep != null ? parseInt(att2.lastObservedStep, 10) : null,
        mutationState: (att2.mutationState as MutationUncertainty) || 'NONE',
        failureMessage: att2.invalidityReason || null,
        summary: att2.summary || null,
        buildId: (target as unknown as { buildId?: string }).buildId || report.buildVersion || null,
      };
    }

    // Query reset receipt if recorded
    let resetReceipt: InvestigationSnapshot['resetReceipt'] = null;
    try {
      const rawReceipt = await attemptsRepository.getResetReceipt(inv.id);
      if (rawReceipt) {
        resetReceipt = {
          id: rawReceipt.id,
          targetId: rawReceipt.targetId,
          investigationId: rawReceipt.investigationId,
          attemptNumber: 2 as const,
          transportSuccess: rawReceipt.transportSuccess,
          baselineEquivalent: rawReceipt.baselineEquivalent,
          isVerifiedRestored: rawReceipt.isVerifiedRestored,
          targetBuildId: (target as unknown as { buildId?: string }).buildId || undefined,
          readback: {
            targetId: rawReceipt.targetId,
            expectedStateHash: rawReceipt.expectedStateHash || '',
            observedStateHash: rawReceipt.observedStateHash || '',
            isEquivalent: rawReceipt.baselineEquivalent,
            discrepancies: Array.isArray(rawReceipt.discrepancies) ? (rawReceipt.discrepancies as string[]) : [],
            checkedAt: rawReceipt.verifiedAt.toISOString(),
          },
          verifiedAt: rawReceipt.verifiedAt.toISOString(),
        };
      }
    } catch {
      // Best effort lookup
    }

    // Query assertion evaluations
    let assertionEvaluations: InvestigationSnapshot['assertionEvaluations'] = [];
    try {
      const rawEvaluations = await attemptsRepository.getAssertionEvaluations(inv.id);
      assertionEvaluations = rawEvaluations.map((ev) => ({
        id: ev.id,
        attemptNumber: ev.attemptNumber,
        assertionId: ev.assertionId,
        kind: ev.kind,
        purpose: ev.purpose,
        result: ev.result,
        expectedValue: ev.expectedValue ?? null,
        observedValue: ev.observedValue ?? null,
        details: ev.details ?? null,
        evaluatedAt: ev.evaluatedAt.toISOString(),
      }));
    } catch {
      // Best effort lookup
    }

    return {
      id: inv.id,
      reportId: inv.reportId,
      targetId: inv.targetId,
      targetName: target.name,
      targetUrl: target.baseUrl,
      isSandbox: target.isSandbox,
      title: report.title,
      lifecycleStatus: inv.lifecycleStatus as InvestigationLifecycleStatus,
      reproductionVerdict: inv.reproductionVerdict as ReproductionVerdict,
      evidenceReadiness: inv.evidenceReadiness as EvidenceReadinessStatus,
      workflowRevision: inv.workflowRevision,
      reviewStatus: inv.reviewStatus as InvestigationSnapshot['reviewStatus'],
      eventWatermark: typeof inv.eventSequenceCounter === 'number' ? inv.eventSequenceCounter : 0,
      activeAttemptNumber: (inv.activeAttemptNumber === 1 || inv.activeAttemptNumber === 2
        ? inv.activeAttemptNumber
        : null),
      attempt1: attempt1Summary,
      attempt2: attempt2Summary,
      planVersion: inv.planVersion,
      planHash: inv.planHash,
      isApproved,
      approvedBy,
      approvedAt,
      rejectionReason: inv.rejectionReason,
      cancellationReason: inv.cancellationReason,
      tokenCostUsd: Number(inv.tokenCostUsd || 0),
      resetReceipt,
      assertionEvaluations,
      targetEnvironment: target.environment || null,
      targetBuildVersion: (target as unknown as { buildId?: string }).buildId || report.buildVersion || null,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      completedAt: inv.completedAt ? inv.completedAt.toISOString() : null,
    };
  }
}

export const investigationWorkflowService = new InvestigationWorkflowService();
