import { describe, it, expect } from 'vitest';
import { CreateReportCommandSchema } from '@/contracts/reports';
import { CreateTargetCommandSchema } from '@/contracts/targets';
import { PlanStepSchema, SupportedToolKindSchema, ApprovePlanCommandSchema } from '@/contracts/planning';
import { InvestigationProgressEventSchema } from '@/contracts/events';
import { SafeErrorEnvelopeSchema } from '@/contracts/errors';

describe('Canonical Contracts Verification', () => {
  it('validates a correct bug report command', () => {
    const valid = {
      targetId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      title: 'Deleting active task deletes completed item',
      bugDescription: 'When filtered by Active and delete is clicked on first item, wrong item is removed.',
      expectedBehavior: 'Active task is removed from task list.',
      observedBehavior: 'Completed task is removed instead.',
    };
    const result = CreateReportCommandSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects bug report missing required expectedBehavior', () => {
    const missingExpected = {
      targetId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      title: 'Deleting active task deletes completed item',
      bugDescription: 'When filtered by Active and delete is clicked on first item, wrong item is removed.',
      observedBehavior: 'Completed task is removed instead.',
    };
    const result = CreateReportCommandSchema.safeParse(missingExpected);
    expect(result.success).toBe(false);
  });

  it('rejects client attempt to inject server-owned fields into report submission', () => {
    const malicious = {
      targetId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      title: 'Deleting active task deletes completed item',
      bugDescription: 'When filtered by Active and delete is clicked on first item, wrong item is removed.',
      expectedBehavior: 'Active task is removed.',
      observedBehavior: 'Completed task is removed.',
      // Malicious attempt to assert authority:
      id: 'server-owned-id-001',
      isApproved: true,
      verdict: 'CONFIRMED_REPRODUCED',
    };
    const result = CreateReportCommandSchema.safeParse(malicious);
    // .strict() rejects unknown properties
    expect(result.success).toBe(false);
  });

  it('rejects unsupported browser tool kinds in plan steps', () => {
    const invalidTool = {
      stepIndex: 0,
      semanticAction: 'Arbitrary shell execution',
      toolKind: 'execute_arbitrary_shell_script', // Prohibited!
      tier: 'TIER_1_READ_ONLY',
      timeoutMs: 5000,
    };
    const result = PlanStepSchema.safeParse(invalidTool);
    expect(result.success).toBe(false);
  });

  it('validates plan approval command and enforces SHA-256 hex format', () => {
    const validApproval = {
      investigationId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      planVersion: 1,
      approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    const result = ApprovePlanCommandSchema.safeParse(validApproval);
    expect(result.success).toBe(true);

    const invalidHash = {
      ...validApproval,
      approvedPlanHash: 'not-a-valid-sha256-hex-hash',
    };
    const resultInvalid = ApprovePlanCommandSchema.safeParse(invalidHash);
    expect(resultInvalid.success).toBe(false);
  });

  it('validates progress events and enforces monotonic schemaVersion 1', () => {
    const validEvent = {
      eventId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      schemaVersion: 1,
      investigationId: 'a11ac10b-58cc-4372-a567-0e02b2c3d401',
      sequenceIndex: 0,
      eventType: 'ATTEMPT_STARTED',
      timestamp: new Date().toISOString(),
      payload: { attemptNumber: 1 },
    };
    const result = InvestigationProgressEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });
});
