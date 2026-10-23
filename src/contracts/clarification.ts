import { z } from 'zod';

/**
 * Model-proposed clarification question (output from Luna Role 1).
 * Pure proposal without server-owned IDs, timestamps, or answer state.
 */
export const ProposedClarificationQuestionSchema = z.object({
  questionId: z.string().optional(),
  questionIndex: z.number().int().nonnegative().optional(),
  questionText: z.string().trim().min(5, 'Question text must be at least 5 characters').max(1000),
  explanation: z.string().trim().max(1000).optional(),
  whyItMatters: z.string().trim().max(1000).optional(),
  purpose: z.string().trim().max(1000).optional(),
  suggestedOptions: z.array(z.string().trim().min(1)).max(10).optional(),
  options: z.array(z.string().trim().min(1)).max(10).optional(),
  blocksExecution: z.boolean().optional(),
}).strict();
export type ProposedClarificationQuestion = z.infer<typeof ProposedClarificationQuestionSchema>;

/**
 * Server-owned, persisted clarification question record.
 */
export const ClarificationQuestionSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  questionIndex: z.number().int().nonnegative().default(0).optional(),
  roundIndex: z.number().int().positive().default(1).optional(),
  questionText: z.string().min(5).max(1000),
  explanation: z.string().max(1000).nullable().optional(),
  contextExplanation: z.string().max(1000).nullable().optional(), // Backward compatibility alias
  suggestedOptions: z.array(z.string().min(1)).nullable().optional(),
  isAnswered: z.boolean(),
  answerText: z.string().nullable().optional(),
  answeredBy: z.string().nullable().optional(),
  answeredAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

/**
 * Command schema for answering a single clarification question.
 */
export const AnswerClarificationCommandSchema = z.object({
  questionId: z.string().uuid('Valid question ID required'),
  answerText: z.string().trim().min(1, 'Answer cannot be empty').max(2000),
  expectedWorkflowRevision: z.number().int().positive().optional(),
}).strict();
export type AnswerClarificationCommand = z.infer<typeof AnswerClarificationCommandSchema>;

/**
 * Command schema for answering one or more clarification questions in batch.
 */
export const BatchAnswerClarificationsCommandSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid('Valid question ID required'),
      answerText: z.string().trim().min(1, 'Answer cannot be empty').max(2000),
    })
  ).min(1, 'At least one answer must be submitted').max(20),
  expectedWorkflowRevision: z.number().int().positive().optional(),
}).strict();
export type BatchAnswerClarificationsCommand = z.infer<typeof BatchAnswerClarificationsCommandSchema>;
