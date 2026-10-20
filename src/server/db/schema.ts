import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  numeric,
  uuid,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const principalsTable = pgTable(
  'principals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    externalIssuer: text('external_issuer').notNull(),
    externalSubject: text('external_subject').notNull(),
    email: text('email'),
    role: text('role').notNull().default('operator'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('principals_issuer_subject_idx').on(table.externalIssuer, table.externalSubject),
  ]
);

export const targetsTable = pgTable(
  'targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => principalsTable.id),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    allowedOrigins: text('allowed_origins').array().notNull(),
    isSandbox: boolean('is_sandbox').notNull().default(false),
    isSandboxVerified: boolean('is_sandbox_verified').notNull().default(false),
    testAccountRef: text('test_account_ref'),
    fixtureResetEndpoint: text('fixture_reset_endpoint'),
    fixtureResetAuthSecretRef: text('fixture_reset_auth_secret_ref'),
    environment: text('environment').notNull().default('staging'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('targets_owner_id_idx').on(table.ownerId),
  ]
);

export const bugReportsTable = pgTable(
  'bug_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => principalsTable.id),
    targetId: uuid('target_id').notNull().references(() => targetsTable.id),
    title: text('title').notNull(),
    rawDescription: text('raw_description'),
    bugDescription: text('bug_description').notNull(),
    expectedBehavior: text('expected_behavior'),
    observedBehavior: text('observed_behavior'),
    suspectedSteps: text('suspected_steps').array(),
    browserEnvironment: text('browser_environment'),
    buildVersion: text('build_version'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bug_reports_owner_id_idx').on(table.ownerId),
    index('bug_reports_target_id_idx').on(table.targetId),
  ]
);

export const investigationsTable = pgTable(
  'investigations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => principalsTable.id),
    reportId: uuid('report_id').notNull().references(() => bugReportsTable.id),
    targetId: uuid('target_id').notNull().references(() => targetsTable.id),
    lifecycleStatus: text('lifecycle_status').notNull().default('DRAFT'),
    reproductionVerdict: text('reproduction_verdict').notNull().default('PENDING'),
    evidenceReadiness: text('evidence_readiness').notNull().default('PENDING_GENERATION'),
    workflowRevision: integer('workflow_revision').notNull().default(1),
    eventSequenceCounter: integer('event_sequence_counter').notNull().default(0),
    reviewStatus: text('review_status').notNull().default('NONE'),
    rejectionReason: text('rejection_reason'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: text('rejected_by'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    cancellationReason: text('cancellation_reason'),
    planVersion: integer('plan_version'),
    planHash: text('plan_hash'),
    activeAttemptNumber: integer('active_attempt_number'),
    tokenCostUsd: numeric('token_cost_usd', { precision: 8, scale: 4 }).notNull().default('0.0000'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('investigations_owner_id_idx').on(table.ownerId),
    index('investigations_target_id_idx').on(table.targetId),
    index('investigations_report_id_idx').on(table.reportId),
  ]
);

export const clarificationQuestionsTable = pgTable(
  'clarification_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    questionIndex: integer('question_index').notNull(),
    questionText: text('question_text').notNull(),
    explanation: text('explanation'),
    suggestedOptions: text('suggested_options').array(),
    isAnswered: boolean('is_answered').notNull().default(false),
    answerText: text('answer_text'),
    answeredBy: text('answered_by'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('clarification_questions_inv_idx_idx').on(table.investigationId, table.questionIndex),
    index('clarification_questions_inv_id_idx').on(table.investigationId),
  ]
);

export const experimentPlanRevisionsTable = pgTable(
  'experiment_plan_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    version: integer('version').notNull(),
    planHash: text('plan_hash').notNull(),
    planPayload: jsonb('plan_payload').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('experiment_plan_revisions_inv_ver_idx').on(table.investigationId, table.version),
  ]
);

export const planApprovalsTable = pgTable(
  'plan_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    targetId: uuid('target_id').references(() => targetsTable.id),
    planVersion: integer('plan_version').notNull(),
    planHash: text('plan_hash').notNull(),
    authorizedActorId: text('authorized_actor_id'),
    maxActionTierPermitted: text('max_action_tier_permitted').notNull().default('TIER_3_MUTATING_INTERACTION'),
    approvedBy: text('approved_by').notNull(),
    operatorNotes: text('operator_notes'),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    index('plan_approvals_inv_ver_idx').on(table.investigationId, table.planVersion),
  ]
);

export const investigationEventsTable = pgTable(
  'investigation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    sequenceIndex: integer('sequence_index').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('investigation_events_inv_seq_unique_idx').on(table.investigationId, table.sequenceIndex),
  ]
);

export const idempotencyKeysTable = pgTable(
  'idempotency_keys',
  {
    principalId: uuid('principal_id').notNull().references(() => principalsTable.id),
    key: text('key').notNull(),
    resourceId: text('resource_id').notNull(),
    commandName: text('command_name').notNull(),
    commandFingerprint: text('command_fingerprint').notNull(),
    status: text('status').notNull().default('IN_PROGRESS'), // 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.principalId, table.key] }),
    index('idempotency_keys_resource_idx').on(table.principalId, table.resourceId),
  ]
);

export const targetLocksTable = pgTable('target_locks', {
  targetId: uuid('target_id').primaryKey().references(() => targetsTable.id),
  investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
  workerId: text('worker_id').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
});

export const executionRequestsTable = pgTable(
  'execution_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    planVersion: integer('plan_version').notNull(),
    planHash: text('plan_hash').notNull(),
    approvalId: uuid('approval_id').notNull().references(() => planApprovalsTable.id),
    requestedBy: text('requested_by').notNull(),
    status: text('status').notNull().default('ADMITTED'),
    fencingEpoch: integer('fencing_epoch'),
    workerInstanceId: text('worker_instance_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('execution_requests_investigation_id_idx').on(table.investigationId),
    index('execution_requests_status_idx').on(table.status),
  ]
);

export const outboxMessagesTable = pgTable(
  'outbox_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queueName: text('queue_name').notNull(),
    payload: jsonb('payload').notNull(),
    singletonKey: text('singleton_key'),
    status: text('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    index('outbox_messages_status_idx').on(table.status),
    index('outbox_messages_created_at_idx').on(table.createdAt),
  ]
);

export const globalExecutionLeasesTable = pgTable(
  'global_execution_leases',
  {
    slotName: text('slot_name').primaryKey(),
    workerInstanceId: text('worker_instance_id').notNull(),
    executionRequestId: uuid('execution_request_id').references(() => executionRequestsTable.id),
    investigationId: uuid('investigation_id').references(() => investigationsTable.id),
    ownershipEpoch: integer('ownership_epoch').notNull().default(1),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    isQuarantined: boolean('is_quarantined').notNull().default(false),
    quarantineReason: text('quarantine_reason'),
    quarantinedAt: timestamp('quarantined_at', { withTimezone: true }),
    quarantinedByWorker: text('quarantined_by_worker'),
    quarantineClearedAt: timestamp('quarantine_cleared_at', { withTimezone: true }),
    quarantineClearedBy: text('quarantine_cleared_by'),
  }
);

export const diagnosticRunsTable = pgTable(
  'diagnostic_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: text('job_id').notNull(),
    workerInstanceId: text('worker_instance_id').notNull(),
    status: text('status').notNull(),
    fencingEpoch: integer('fencing_epoch').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    details: jsonb('details'),
  },
  (table) => [
    uniqueIndex('diagnostic_runs_job_id_unique_idx').on(table.jobId),
  ]
);

export const investigationAttemptsTable = pgTable(
  'investigation_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    attemptNumber: integer('attempt_number').notNull(),
    status: text('status').notNull().default('PENDING'),
    validity: text('validity').notNull().default('PENDING'),
    finding: text('finding').notNull().default('UNRESOLVED'),
    invalidityReason: text('invalidity_reason'),
    totalDurationMs: integer('total_duration_ms'),
    completedCleanly: boolean('completed_cleanly').default(false),
    actionsExecuted: integer('actions_executed').notNull().default(0),
    mutationState: text('mutation_state').notNull().default('NONE'),
    lastObservedStep: text('last_observed_step'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    summary: text('summary'),
  },
  (table) => [
    index('investigation_attempts_investigation_id_idx').on(table.investigationId),
    uniqueIndex('investigation_attempts_unique_idx').on(table.investigationId, table.attemptNumber),
  ]
);

export const assertionEvaluationsTable = pgTable(
  'assertion_evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    attemptId: uuid('attempt_id').references(() => investigationAttemptsTable.id),
    attemptNumber: integer('attempt_number').notNull(),
    assertionId: uuid('assertion_id').notNull(),
    kind: text('kind').notNull(),
    purpose: text('purpose').notNull(),
    result: text('result').notNull(),
    expectedValue: text('expected_value'),
    observedValue: text('observed_value'),
    details: text('details'),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('assertion_evaluations_investigation_id_idx').on(table.investigationId),
    index('assertion_evaluations_attempt_id_idx').on(table.attemptId),
  ]
);

export const resetReceiptsTable = pgTable(
  'reset_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    targetId: uuid('target_id').notNull().references(() => targetsTable.id),
    attemptNumber: integer('attempt_number').notNull().default(2),
    transportSuccess: boolean('transport_success').notNull(),
    baselineEquivalent: boolean('baseline_equivalent').notNull(),
    isVerifiedRestored: boolean('is_verified_restored').notNull(),
    expectedStateHash: text('expected_state_hash'),
    observedStateHash: text('observed_state_hash'),
    discrepancies: jsonb('discrepancies'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reset_receipts_investigation_id_idx').on(table.investigationId),
  ]
);

export const pairAssessmentsTable = pgTable(
  'pair_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    verdict: text('verdict').notNull(),
    validAttemptCount: integer('valid_attempt_count').notNull(),
    matchingAttemptCount: integer('matching_attempt_count').notNull(),
    isComparable: boolean('is_comparable').notNull(),
    summary: text('summary').notNull(),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('pair_assessments_investigation_id_unique_idx').on(table.investigationId),
  ]
);

export const evidenceArtifactsTable = pgTable(
  'evidence_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    attemptNumber: integer('attempt_number'),
    kind: text('kind').notNull(),
    storageTier: text('storage_tier').notNull().default('RESTRICTED_RAW'),
    localPath: text('local_path'),
    storageRef: text('storage_ref'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    sha256Checksum: text('sha256_checksum').notNull(),
    redactionApplied: boolean('redaction_applied').notNull().default(false),
    isEligibleForSharing: boolean('is_eligible_for_sharing').notNull().default(false),
    quarantineReason: text('quarantine_reason'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('evidence_artifacts_investigation_id_idx').on(table.investigationId),
    index('evidence_artifacts_kind_idx').on(table.kind),
    index('evidence_artifacts_storage_tier_idx').on(table.storageTier),
  ]
);

export const synthesisExplanationsTable = pgTable(
  'synthesis_explanations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    naturalLanguageSummary: text('natural_language_summary').notNull(),
    verifiedFactsExplanation: text('verified_facts_explanation').notNull(),
    observationsVsHypotheses: jsonb('observations_vs_hypotheses'),
    evidenceReferences: jsonb('evidence_references'),
    limitationsAndGaps: jsonb('limitations_and_gaps'),
    tokenCostUsd: numeric('token_cost_usd', { precision: 8, scale: 4 }).notNull().default('0.0000'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('synthesis_explanations_inv_unique_idx').on(table.investigationId),
  ]
);

export const workerHeartbeatsTable = pgTable(
  'worker_heartbeats',
  {
    workerId: text('worker_id').primaryKey(),
    status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'DRAINING' | 'OFFLINE'
    activeJobs: integer('active_jobs').notNull().default(0),
    hostname: text('hostname'),
    pid: integer('pid'),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('worker_heartbeats_last_heartbeat_idx').on(table.lastHeartbeatAt),
  ]
);

export const budgetReservationsTable = pgTable(
  'budget_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
    ticketId: text('ticket_id').notNull().unique(),
    reservedUsd: numeric('reserved_usd', { precision: 8, scale: 4 }).notNull(),
    status: text('status').notNull().default('RESERVED'), // 'RESERVED' | 'COMMITTED' | 'RELEASED' | 'EXPIRED'
    actualCostUsd: numeric('actual_cost_usd', { precision: 8, scale: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (table) => [
    index('budget_reservations_inv_idx').on(table.investigationId),
    index('budget_reservations_status_idx').on(table.status),
    uniqueIndex('budget_reservations_ticket_idx').on(table.ticketId),
  ]
);

