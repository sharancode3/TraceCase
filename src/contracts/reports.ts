import { z } from 'zod';

export const CreateReportCommandSchema = z.object({
  targetId: z.string().uuid('Valid target ID is required'),
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(200),
  bugDescription: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  expectedBehavior: z.string().trim().min(5, 'Expected behavior must be at least 5 characters').max(2000),
  observedBehavior: z.string().trim().min(5, 'Observed behavior must be at least 5 characters').max(2000),
  suspectedSteps: z.array(z.string().trim().min(1)).max(20).optional(),
  browserEnvironment: z.string().trim().max(100).optional(),
  buildVersion: z.string().trim().max(50).optional(),
}).strict(); // Server owns ID, createdBy, timestamps, and investigation links
export type CreateReportCommand = z.infer<typeof CreateReportCommandSchema>;

export const BugReportResponseSchema = z.object({
  id: z.string().uuid(),
  targetId: z.string().uuid(),
  title: z.string(),
  bugDescription: z.string(),
  expectedBehavior: z.string(),
  observedBehavior: z.string(),
  suspectedSteps: z.array(z.string()).nullable(),
  browserEnvironment: z.string().nullable(),
  buildVersion: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BugReportResponse = z.infer<typeof BugReportResponseSchema>;
