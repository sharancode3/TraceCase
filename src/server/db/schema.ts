import { pgTable, text, timestamp, boolean, integer, jsonb, numeric, uuid } from 'drizzle-orm/pg-core';

export const targetsTable = pgTable('targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  allowedOrigins: text('allowed_origins').array().notNull(),
  isSandbox: boolean('is_sandbox').notNull().default(false),
  testAccountRef: text('test_account_ref'),
  fixtureResetEndpoint: text('fixture_reset_endpoint'),
  environment: text('environment').notNull().default('staging'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bugReportsTable = pgTable('bug_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  targetId: uuid('target_id').notNull().references(() => targetsTable.id),
  title: text('title').notNull(),
  bugDescription: text('bug_description').notNull(),
  expectedBehavior: text('expected_behavior').notNull(),
  observedBehavior: text('observed_behavior').notNull(),
  suspectedSteps: text('suspected_steps').array(),
  browserEnvironment: text('browser_environment'),
  buildVersion: text('build_version'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const investigationsTable = pgTable('investigations', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').notNull().references(() => bugReportsTable.id),
  targetId: uuid('target_id').notNull().references(() => targetsTable.id),
  lifecycleStatus: text('lifecycle_status').notNull().default('DRAFT'),
  reproductionVerdict: text('reproduction_verdict').notNull().default('PENDING'),
  evidenceReadiness: text('evidence_readiness').notNull().default('PENDING_GENERATION'),
  planVersion: integer('plan_version'),
  planHash: text('plan_hash'),
  activeAttemptNumber: integer('active_attempt_number'),
  tokenCostUsd: numeric('token_cost_usd', { precision: 8, scale: 4 }).notNull().default('0.0000'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const planApprovalsTable = pgTable('plan_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
  planVersion: integer('plan_version').notNull(),
  planHash: text('plan_hash').notNull(),
  approvedBy: text('approved_by').notNull(),
  operatorNotes: text('operator_notes'),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
});

export const investigationEventsTable = pgTable('investigation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
  sequenceIndex: integer('sequence_index').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull().defaultNow(),
});

export const targetLocksTable = pgTable('target_locks', {
  targetId: uuid('target_id').primaryKey().references(() => targetsTable.id),
  investigationId: uuid('investigation_id').notNull().references(() => investigationsTable.id),
  workerId: text('worker_id').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
});
