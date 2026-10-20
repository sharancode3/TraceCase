import { z } from 'zod';

export const ClarificationQuestionSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  questionText: z.string().min(5).max(1000),
  contextExplanation: z.string().max(1000).optional(),
  suggestedOptions: z.array(z.string().min(1)).optional(),
  isAnswered: z.boolean(),
  answerText: z.string().nullable().optional(),
  answeredAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

export const AnswerClarificationCommandSchema = z.object({
  questionId: z.string().uuid(),
  answerText: z.string().trim().min(1, 'Answer cannot be empty').max(2000),
}).strict();
export type AnswerClarificationCommand = z.infer<typeof AnswerClarificationCommandSchema>;
