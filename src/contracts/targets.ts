import { z } from 'zod';

export const TargetProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  allowedOrigins: z.array(z.string().url()).min(1),
  isSandbox: z.boolean(),
  testAccountRef: z.string().max(100).nullable().optional(),
  fixtureResetEndpoint: z.string().url().nullable().optional(),
  fixtureResetAuthSecret: z.string().nullable().optional(),
  environment: z.enum(['staging', 'development', 'demo', 'production']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TargetProfile = z.infer<typeof TargetProfileSchema>;

/**
 * Command schema for creating a new target profile.
 * Notice: 'isSandbox' in client commands is a requested classification;
 * trusted server code validates sandbox declarations against allowlists.
 */
export const CreateTargetCommandSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  baseUrl: z.string().trim().url('Must be a valid URL'),
  allowedOrigins: z.array(z.string().trim().url()).min(1, 'At least one allowed origin is required'),
  isSandboxRequested: z.boolean().default(true),
  testAccountRef: z.string().trim().max(100).optional(),
  fixtureResetEndpoint: z.string().trim().url().optional(),
  environment: z.enum(['staging', 'development', 'demo', 'production']).default('staging'),
}).strict(); // Reject unexpected fields to protect server authority
export type CreateTargetCommand = z.infer<typeof CreateTargetCommandSchema>;
