import { describe, it, expect } from 'vitest';
import {
  DraftReportIntakeSchema,
  ExecutableExperimentPreconditionsSchema,
} from '@/contracts/reports';
import {
  ModelExperimentProposalSchema,
  TypedAssertionSchema,
} from '@/contracts/planning';
import { BrowserActionProposalSchema } from '@/contracts/ai';

describe('P1-01: Intake and Model Proposal Boundaries', () => {
  it('allows incomplete bug reports to be represented at initial intake', () => {
    const rawVagueIntake = {
      targetId: '11111111-1111-4111-8111-111111111111',
      title: 'Delete button does not work',
      rawDescription: 'I clicked the red button and nothing happened on screen.',
    };

    const parsed = DraftReportIntakeSchema.safeParse(rawVagueIntake);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.expectedBehavior).toBeUndefined();
      expect(parsed.data.buildVersion).toBeUndefined();
    }
  });

  it('strictly blocks incomplete reports from becoming execution-ready', () => {
    const unclarifiedIntake = {
      reportId: '22222222-2222-4222-8222-222222222222',
      targetId: '11111111-1111-4111-8111-111111111111',
      expectedCorrectBehavior: '   ', // empty/blank
      reportedFailureSignature: 'Something failed',
      preconditions: ['Logged in as user'],
      targetVerified: true,
    };

    const parsed = ExecutableExperimentPreconditionsSchema.safeParse(unclarifiedIntake);
    expect(parsed.success).toBe(false);
  });

  it('rejects model proposals that attempt to assert server-owned fields', () => {
    const rogueProposal = {
      preconditions: ['Target is reset to baseline'],
      steps: [
        {
          stepIndex: 0,
          semanticAction: 'Click delete button',
          toolKind: 'click_button',
          selector: '#delete-btn',
          tier: 'TIER_3_MUTATING_INTERACTION',
          timeoutMs: 5000,
        },
      ],
      expectedCorrectBehavior: 'Item row disappears from list',
      reportedFailureSignature: 'Item remains visible in list',
      assertions: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          purpose: 'REPORTED_FAILURE_SIGNATURE',
          subjectRef: '.item-row[data-id="123"]',
          operator: 'EXISTS',
          settlingPoint: 'AFTER_NETWORK_IDLE',
          description: 'Assert wrong item was deleted',
        },
      ],
      requiresResetHook: true,
      // Rogue fields that only the server may own:
      id: '44444444-4444-4444-8444-444444444444',
      planHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      approved: true,
    };

    const parsed = ModelExperimentProposalSchema.safeParse(rogueProposal);
    expect(parsed.success).toBe(false);
  });

  it('rejects unsupported assertion kinds and operators', () => {
    const invalidAssertion = {
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'EXECUTE_ARBITRARY_SQL', // Forbidden kind
      source: 'DATABASE_SHELL',
      purpose: 'EXPECTED_CORRECT_BEHAVIOR',
      subjectRef: 'SELECT * FROM tasks',
      operator: 'RETURNS_EMPTY',
      settlingPoint: 'IMMEDIATE',
      description: 'Run arbitrary SQL on target',
    };

    const parsed = TypedAssertionSchema.safeParse(invalidAssertion);
    expect(parsed.success).toBe(false);
  });

  it('enforces that browser investigation proposals cannot return final verdict', () => {
    const validNextAction = {
      kind: 'EXECUTE_ACTION',
      action: {
        stepIndex: 1,
        semanticAction: 'Filter active items',
        toolKind: 'click_button',
        selector: '#filter-active',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: 5000,
      },
      rationale: 'Isolate active items before deletion attempt',
      confidence: 0.95,
    };

    expect(BrowserActionProposalSchema.safeParse(validNextAction).success).toBe(true);

    const rogueVerdict = {
      kind: 'BUG_CONFIRMED_REPRODUCED',
      rationale: 'I observed the bug',
    };

    expect(BrowserActionProposalSchema.safeParse(rogueVerdict).success).toBe(false);
  });
});
