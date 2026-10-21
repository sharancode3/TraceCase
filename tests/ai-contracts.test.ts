import { describe, it, expect } from 'vitest';
import {
  PrunedAXTreeNodeSchema,
  ReportAgentInputSchema,
  ReportAgentOutputSchema,
  BrowserAgentInputSchema,
  BrowserDecisionOutputSchema,
  EvidenceReviewAgentInputSchema,
  EvidenceReviewOutputSchema,
  stripModelAuthorityFields,
  PlanAssertionSchema,
} from '../src/server/ai/contracts';
import {
  ALL_EVALUATION_CASES,
  RESERVED_BENCHMARK_CASES,
  PROMPT_DEV_EXAMPLES,
  getEvaluationCaseById,
} from '../evaluation/cases';
import { EvaluationCaseSchema } from '../evaluation/case-schema';
import { MockTestDoubleModelProvider } from '../src/server/ai/provider';

describe('Person 2: AI Contracts & Boundary Specification (H-01)', () => {
  it('validates interactive AXTree nodes within size constraints', () => {
    const validNode = {
      nodeId: 'node_42',
      role: 'button' as const,
      name: 'Delete Task B',
      disabled: false,
      focused: true,
    };
    expect(PrunedAXTreeNodeSchema.parse(validNode)).toEqual(validNode);

    // Invalid node ID format must fail
    expect(() =>
      PrunedAXTreeNodeSchema.parse({
        nodeId: 'invalid-id',
        role: 'button',
        name: 'test',
      })
    ).toThrow();
  });

  it('validates typed assertion predicates (TC-INV-014)', () => {
    const validPredicate = {
      predicateId: 'assert_task_b_deleted',
      assertionType: 'CORRECT_BEHAVIOR' as const,
      target: 'DOM_ELEMENT' as const,
      selector: '[data-task-id="task-b"]',
      expectedCondition: 'NOT_EXISTS' as const,
      expectedValue: true,
      description: 'Task B must not be present after deletion',
    };
    expect(PlanAssertionSchema.parse(validPredicate)).toEqual(validPredicate);

    // Invalid predicateId format must fail
    expect(() =>
      PlanAssertionSchema.parse({
        ...validPredicate,
        predicateId: 'INVALID_ID_FORMAT',
      })
    ).toThrow();
  });

  it('validates ReportAgent input and output discriminants', () => {
    const sampleInput = {
      contractVersion: '1.0.0' as const,
      investigationId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
      targetProfile: {
        name: 'Demo App',
        baseUrl: 'http://localhost:3005',
        isSandbox: true,
        allowedOrigins: ['http://localhost:3005'],
        hasResetFixture: true,
      },
      rawReport: {
        title: 'Filter delete bug',
        description: 'When I delete an active task under Active filter, wrong item is deleted.',
      },
      clarificationHistory: [],
    };
    expect(ReportAgentInputSchema.parse(sampleInput)).toEqual(sampleInput);

    // Clarification variant
    const clarificationOutput = {
      variant: 'NEEDS_CLARIFICATION' as const,
      extractedClaim: {
        summary: 'Delete button deletes wrong task when filter is applied',
        affectedFeature: 'Task Filter & Deletion',
        missingFacts: ['Expected behavior', 'Specific task IDs'],
      },
      questions: [
        {
          questionId: 'q_expected_behavior',
          questionText: 'What should happen when deleting Task B while Active filter is on?',
          whyItMatters: 'To establish independent expected correct behavior',
          options: ['Task B is deleted and Task A is kept', 'Both tasks remain unchanged'],
          blocksExecution: true,
        },
      ],
    };
    expect(ReportAgentOutputSchema.parse(clarificationOutput)).toEqual(clarificationOutput);

    // Plan proposed variant
    const planOutput = {
      variant: 'PLAN_PROPOSED' as const,
      extractedClaim: {
        summary: 'Delete wrong task under Active filter',
        reportedProblem: 'Task A deleted instead of Task B',
        claimedExpectedBehavior: 'Task B deleted, Task A preserved',
        affectedEntities: ['Task A', 'Task B'],
      },
      experimentPlan: {
        planRevision: 1,
        preconditions: ['Target reset to initial state with Task A (completed) and Task B (active)'],
        requiredRole: 'test_user',
        steps: [
          {
            stepNumber: 1,
            actionType: 'NAVIGATE' as const,
            intentDescription: 'Open task application',
            isDestructive: false,
          },
          {
            stepNumber: 2,
            actionType: 'CLICK' as const,
            intentDescription: 'Click Active filter button',
            targetRole: 'button',
            targetAccessibleName: 'Active',
            isDestructive: false,
          },
          {
            stepNumber: 3,
            actionType: 'CLICK' as const,
            intentDescription: 'Click Delete on Task B',
            targetRole: 'button',
            targetAccessibleName: 'Delete Task B',
            isDestructive: true,
            affectedDataScope: 'task-b',
          },
        ],
        correctBehaviorAssertions: [
          {
            predicateId: 'assert_task_b_deleted',
            assertionType: 'CORRECT_BEHAVIOR' as const,
            target: 'DOM_ELEMENT' as const,
            selector: '[data-task-id="task-b"]',
            expectedCondition: 'NOT_EXISTS' as const,
            expectedValue: true,
          },
        ],
        reportedFailureAssertions: [
          {
            predicateId: 'assert_task_a_wrongly_deleted',
            assertionType: 'REPORTED_FAILURE_SIGNATURE' as const,
            target: 'DOM_ELEMENT' as const,
            selector: '[data-task-id="task-a"]',
            expectedCondition: 'NOT_EXISTS' as const,
            expectedValue: true,
          },
        ],
      },
    };
    expect(ReportAgentOutputSchema.parse(planOutput)).toEqual(planOutput);
  });

  it('validates BrowserAgent input and decision output', () => {
    const browserInput = {
      contractVersion: '1.0.0' as const,
      investigationId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
      attemptIndex: 1 as const,
      approvedPlanHash: 'a'.repeat(64),
      currentStep: {
        stepNumber: 2,
        actionType: 'CLICK' as const,
        intentDescription: 'Click Active filter',
        targetDescription: 'Active filter tab',
        isDestructive: false,
      },
      observation: {
        observationId: 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5e',
        pageUrl: 'http://localhost:3005/',
        pageTitle: 'TraceCase Tasks Demo',
        axTree: [
          {
            nodeId: 'node_1',
            role: 'button' as const,
            name: 'Active',
            disabled: false,
          },
        ],
      },
      priorActionHistory: [],
    };
    expect(BrowserAgentInputSchema.parse(browserInput)).toEqual(browserInput);

    const actionOutput = {
      variant: 'PROPOSE_ACTION' as const,
      echoedStepNumber: 2,
      echoedObservationId: 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5e',
      action: {
        actionType: 'CLICK' as const,
        targetNodeId: 'node_1',
        primarySelector: 'button:has-text("Active")',
        cssFallback: '[data-filter="active"]',
      },
      expectedPostcondition: 'Only active tasks are visible',
      rationale: 'Matches step intent to filter tasks',
    };
    expect(BrowserDecisionOutputSchema.parse(actionOutput)).toEqual(actionOutput);
  });

  it('strictly enforces isVerifiedFact: false for Evidence Review hypotheses', () => {
    const validReportOutput = {
      variant: 'REPORT_SYNTHESIZED' as const,
      executiveSummary: 'Defect successfully reproduced across two consecutive runs.',
      observedReproductionVerdict: 'CONFIRMED_REPRODUCED' as const,
      attempt1Comparison: {
        summary: 'Task A deleted instead of Task B in run 1',
        failedAssertions: ['assert_task_b_deleted'],
        matchingFailureObserved: true,
      },
      attempt2Comparison: {
        summary: 'Task A deleted instead of Task B in run 2 after verified reset',
        failedAssertions: ['assert_task_b_deleted'],
        matchingFailureObserved: true,
      },
      evidenceCitations: [
        {
          artifactType: 'VIDEO' as const,
          safeUrl: 'http://localhost:3000/api/v1/artifacts/vid-001/public',
          relevanceExplanation: 'Shows wrong task disappearing',
        },
      ],
      manualReproductionSteps: ['Apply filter', 'Click delete on second item'],
      diagnosticHypothesis: {
        isVerifiedFact: false as const,
        hypothesisText: 'Deletion handler likely indexes filtered array instead of database ID.',
        supportingEvidenceTokens: ['array-index', 'offset'],
        suggestedInvestigationDirection: 'Inspect task deletion component props',
      },
      limitationsAndCaveats: ['Tested on staging sandbox only'],
    };
    expect(EvidenceReviewOutputSchema.parse(validReportOutput)).toEqual(validReportOutput);

    // Attempting to declare hypothesis as verified fact must fail schema check!
    const invalidHypothesisOutput = {
      ...validReportOutput,
      diagnosticHypothesis: {
        ...validReportOutput.diagnosticHypothesis,
        isVerifiedFact: true, // INVALID! Model is NOT authoritative.
      },
    };
    expect(() => EvidenceReviewOutputSchema.parse(invalidHypothesisOutput)).toThrow();
  });

  it('strips model-injected authority fields to prevent privilege escalation', () => {
    const untrustedModelPayload = {
      variant: 'PLAN_PROPOSED',
      isApproved: true, // Model attempting to self-approve!
      approvedBy: 'hacker-bot',
      planHash: 'tampered-hash',
      reproductionVerdict: 'CONFIRMED_REPRODUCED',
      safeData: 'legitimate plan content',
    };

    const sanitized = stripModelAuthorityFields(untrustedModelPayload);
    expect(sanitized).not.toHaveProperty('isApproved');
    expect(sanitized).not.toHaveProperty('approvedBy');
    expect(sanitized).not.toHaveProperty('planHash');
    expect(sanitized).not.toHaveProperty('reproductionVerdict');
    expect(sanitized).toHaveProperty('safeData', 'legitimate plan content');
  });

  it('validates all independent evaluation cases (TC1-TC4 + negative cases)', () => {
    expect(ALL_EVALUATION_CASES.length).toBe(12);

    for (const testCase of ALL_EVALUATION_CASES) {
      expect(EvaluationCaseSchema.parse(testCase)).toEqual(testCase);
    }

    // Verify dataset partitioning
    expect(RESERVED_BENCHMARK_CASES.length).toBeGreaterThan(0);
    expect(PROMPT_DEV_EXAMPLES.length).toBeGreaterThan(0);

    // Verify retrieval by ID
    const tc1 = getEvaluationCaseById('TC-TC1-ARRAY-OFFSET');
    expect(tc1).toBeDefined();
    expect(tc1?.groundTruth.actualBugPresent).toBe(true);

    const tc2 = getEvaluationCaseById('TC-TC2-CLEAN-BUILD');
    expect(tc2).toBeDefined();
    expect(tc2?.groundTruth.actualBugPresent).toBe(false);
  });

  it('executes deterministic mock model provider correctly', async () => {
    const mockProvider = new MockTestDoubleModelProvider();
    const expectedData = {
      variant: 'UNABLE_TO_INTERPRET' as const,
      explanation: 'Input text was corrupted or unreadable',
    };

    mockProvider.queueResponse(expectedData);

    const result = await mockProvider.generateStructuredCompletion(
      {
        roleId: 'AT-ROLE-001',
        systemPrompt: 'System',
        userPrompt: 'User',
      },
      ReportAgentOutputSchema
    );

    expect(result.data).toEqual(expectedData);
    expect(result.usage.modelIdentifier).toBe('test-double-luna-v1');
  });
});
