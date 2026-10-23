import { z } from 'zod';

/**
 * Legacy/preview report command schema.
 * Preserved for existing preview intake forms and tests.
 */
export const CreateReportCommandSchema = z.object({
  targetId: z.string().uuid('Valid target ID is required'),
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(200),
  bugDescription: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  expectedBehavior: z.string().trim().min(5, 'Expected behavior must be at least 5 characters').max(2000),
  observedBehavior: z.string().trim().min(5, 'Observed behavior must be at least 5 characters').max(2000),
  suspectedSteps: z.array(z.string().trim().min(1)).max(20).optional(),
  browserEnvironment: z.string().trim().max(100).optional(),
  buildVersion: z.string().trim().max(50).optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
}).strict(); // Server owns ID, createdBy, timestamps, and investigation links
export type CreateReportCommand = z.infer<typeof CreateReportCommandSchema>;

/**
 * Initial draft bug intake schema.
 * Supports realistic, incomplete bug reports where expected behavior, suspected steps,
 * or build details are not yet fully known by the reporter.
 */
export const DraftReportIntakeSchema = z.object({
  targetId: z.string().uuid('Valid target ID is required'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  rawDescription: z.string().trim().min(5, 'Description must be at least 5 characters').max(5000),
  expectedBehavior: z.string().trim().max(2000).optional(),
  observedBehavior: z.string().trim().max(2000).optional(),
  suspectedSteps: z.array(z.string().trim().min(1)).max(20).optional(),
  browserEnvironment: z.string().trim().max(100).optional(),
  buildVersion: z.string().trim().max(50).optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
}).strict();
export type DraftReportIntake = z.infer<typeof DraftReportIntakeSchema>;

/**
 * Clarified report context.
 * Represents the normalized report state after AI/reporter clarification dialogues.
 * Tracks known vs missing facts explicitly before experiment planning.
 */
export const ClarifiedReportContextSchema = z.object({
  reportId: z.string().uuid(),
  targetId: z.string().uuid(),
  title: z.string().min(1).max(200),
  rawDescription: z.string().min(1).max(5000),
  knownFacts: z.record(z.string()),
  missingFacts: z.array(z.string()),
  clarificationStatus: z.enum(['NOT_NEEDED', 'PENDING_USER_ANSWER', 'RESOLVED']),
  clarifiedExpectedBehavior: z.string().nullable(),
  clarifiedFailureSignature: z.string().nullable(),
  targetEnvironment: z.string().nullable(),
  buildVersion: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
});
export type ClarifiedReportContext = z.infer<typeof ClarifiedReportContextSchema>;

/**
 * Preconditions validator for experiment execution readiness.
 * An incomplete draft report CANNOT be approved or executed without satisfying these conditions.
 */
export const ExecutableExperimentPreconditionsSchema = z.object({
  reportId: z.string().uuid(),
  targetId: z.string().uuid(),
  expectedCorrectBehavior: z.string().trim().min(5, 'Expected correct behavior must be explicitly clarified'),
  reportedFailureSignature: z.string().trim().min(5, 'Reported failure signature must be explicitly clarified'),
  preconditions: z.array(z.string().trim().min(1)).min(1, 'At least one verified precondition is required'),
  targetVerified: z.boolean().refine((val) => val === true, 'Target sandbox authority must be verified by server'),
});
export type ExecutableExperimentPreconditions = z.infer<typeof ExecutableExperimentPreconditionsSchema>;

/**
 * Persisted bug report response representation.
 * Supports nullable expected/observed behavior for incomplete draft reports.
 */
export const BugReportResponseSchema = z.object({
  id: z.string().uuid(),
  targetId: z.string().uuid(),
  title: z.string(),
  rawDescription: z.string().nullable().optional(),
  bugDescription: z.string(),
  expectedBehavior: z.string().nullable(),
  observedBehavior: z.string().nullable(),
  suspectedSteps: z.array(z.string()).nullable(),
  browserEnvironment: z.string().nullable(),
  buildVersion: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BugReportResponse = z.infer<typeof BugReportResponseSchema>;

export const LiveBugReportResponseSchema = BugReportResponseSchema.extend({
  ownerId: z.string().uuid(),
});
export type LiveBugReportResponse = z.infer<typeof LiveBugReportResponseSchema>;
