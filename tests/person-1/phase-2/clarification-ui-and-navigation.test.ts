import { describe, it, expect } from 'vitest';
import {
  groupQuestionsByRound,
  validateClarificationAnswers,
  hasAuthoritativeProposal,
  determineInitialPageState,
} from '@/features/investigations/clarification-state';
import type { ClarificationQuestionItem, ApiResponse, PlanDetailResult, InvestigationSnapshot } from '@/features/investigations/api-client';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';

describe('Phase 2 Stage H: Honest Clarification UI and Navigation', () => {
  const samplePlan: AuthoritativeExperimentPlan = {
    id: '00000000-0000-4000-a000-000000000001',
    investigationId: '00000000-0000-4000-b000-000000000002',
    targetId: '00000000-0000-4000-c000-000000000003',
    version: 1,
    targetUrl: 'http://localhost:3005',
    allowedOrigins: ['http://localhost:3005'],
    planHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    preconditions: ['Target sandbox restored'],
    steps: [
      {
        stepIndex: 0,
        semanticAction: 'Navigate to target',
        toolKind: 'navigate',
        selector: 'window',
        targetAccessibleName: 'Home',
        targetRole: 'page',
        value: 'http://localhost:3005',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: 10000,
      },
    ],
    expectedCorrectBehavior: 'Item list contains all created items',
    reportedFailureSignature: 'Item missing after creation',
    assertions: [
      {
        id: '00000000-0000-4000-d000-000000000004',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: '[data-testid="item-row"]',
        operator: 'EXISTS',
        expectedValue: 'true',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'Item row exists in table',
      },
    ],
    maxAttempts: 2,
    maxDurationMs: 120000,
    requiresResetHook: false,
    createdAt: '2026-10-23T12:00:00.000Z',
  };

  describe('1. Multi-Round Question Grouping and Ordering', () => {
    it('groups questions by roundIndex in ascending order and preserves question ordering', () => {
      const questions: ClarificationQuestionItem[] = [
        {
          id: 'q-r2-1',
          investigationId: 'inv-1',
          questionIndex: 2,
          roundIndex: 2,
          questionText: 'Round 2 question 1',
          isAnswered: false,
          createdAt: '2026-10-23T12:02:00Z',
        },
        {
          id: 'q-r1-2',
          investigationId: 'inv-1',
          questionIndex: 1,
          roundIndex: 1,
          questionText: 'Round 1 question 2',
          isAnswered: true,
          answerText: 'Answer 1.2',
          createdAt: '2026-10-23T12:01:00Z',
        },
        {
          id: 'q-r1-1',
          investigationId: 'inv-1',
          questionIndex: 0,
          roundIndex: 1,
          questionText: 'Round 1 question 1',
          isAnswered: true,
          answerText: 'Answer 1.1',
          createdAt: '2026-10-23T12:00:00Z',
        },
      ];

      const groups = groupQuestionsByRound(questions);

      expect(groups).toHaveLength(2);
      expect(groups[0].roundIndex).toBe(1);
      expect(groups[0].isFullyAnswered).toBe(true);
      expect(groups[0].questions).toHaveLength(2);
      expect(groups[0].questions[0].id).toBe('q-r1-1');
      expect(groups[0].questions[1].id).toBe('q-r1-2');

      expect(groups[1].roundIndex).toBe(2);
      expect(groups[1].isFullyAnswered).toBe(false);
      expect(groups[1].questions).toHaveLength(1);
      expect(groups[1].questions[0].id).toBe('q-r2-1');
    });

    it('defaults to Round 1 when roundIndex is undefined or 0', () => {
      const questions: ClarificationQuestionItem[] = [
        {
          id: 'q-legacy-1',
          investigationId: 'inv-1',
          questionText: 'Legacy question',
          isAnswered: false,
          createdAt: '2026-10-23T12:00:00Z',
        },
      ];

      const groups = groupQuestionsByRound(questions);
      expect(groups).toHaveLength(1);
      expect(groups[0].roundIndex).toBe(1);
      expect(groups[0].isFullyAnswered).toBe(false);
    });

    it('returns empty array when question list is empty', () => {
      expect(groupQuestionsByRound([])).toEqual([]);
    });
  });

  describe('2. Answer Validation and Persisted ID Binding', () => {
    const questions: ClarificationQuestionItem[] = [
      {
        id: '11111111-1111-4000-8000-000000000001',
        investigationId: 'inv-1',
        questionIndex: 0,
        roundIndex: 1,
        questionText: 'What browser was used?',
        suggestedOptions: ['Chrome 131', 'Firefox 133'],
        isAnswered: false,
        createdAt: '2026-10-23T12:00:00Z',
      },
      {
        id: '22222222-2222-4000-8000-000000000002',
        investigationId: 'inv-1',
        questionIndex: 1,
        roundIndex: 1,
        questionText: 'Which item was clicked?',
        isAnswered: false,
        createdAt: '2026-10-23T12:00:00Z',
      },
    ];

    it('binds answers strictly to question UUIDs, not array indices', () => {
      const drafts: Record<string, string> = {
        '22222222-2222-4000-8000-000000000002': 'Item 42',
      };

      const result = validateClarificationAnswers(questions, drafts);

      expect(result.isValid).toBe(true);
      expect(result.answersToSubmit).toHaveLength(1);
      expect(result.answersToSubmit[0].questionId).toBe('22222222-2222-4000-8000-000000000002');
      expect(result.answersToSubmit[0].answerText).toBe('Item 42');
    });

    it('fails validation when zero answers are supplied across pending questions', () => {
      const drafts: Record<string, string> = {
        '11111111-1111-4000-8000-000000000001': '   ',
      };

      const result = validateClarificationAnswers(questions, drafts);

      expect(result.isValid).toBe(false);
      expect(result.errors['11111111-1111-4000-8000-000000000001']).toContain(
        'Please provide an answer to at least one question to proceed.'
      );
    });

    it('ignores questions that are already answered when validating submission drafts', () => {
      const qAnsweredId = '33333333-3333-4000-8000-000000000003';
      const qPendingId = '44444444-4444-4000-8000-000000000004';

      const mixedQuestions: ClarificationQuestionItem[] = [
        {
          id: qAnsweredId,
          investigationId: 'inv-1',
          questionText: 'Already answered',
          isAnswered: true,
          answerText: 'Saved answer',
          createdAt: '2026-10-23T12:00:00Z',
        },
        {
          id: qPendingId,
          investigationId: 'inv-1',
          questionText: 'Still pending',
          isAnswered: false,
          createdAt: '2026-10-23T12:00:00Z',
        },
      ];

      const drafts: Record<string, string> = {
        [qPendingId]: 'Fresh response',
      };

      const result = validateClarificationAnswers(mixedQuestions, drafts);

      expect(result.isValid).toBe(true);
      expect(result.answersToSubmit).toEqual([
        { questionId: qPendingId, answerText: 'Fresh response' },
      ]);
    });
  });

  describe('3. Proposal Verification Gate (No Proposal = No Plan Review)', () => {
    it('returns true when plan, version > 0, hash, and assertions exist', () => {
      expect(hasAuthoritativeProposal(samplePlan, 1, samplePlan.planHash)).toBe(true);
    });

    it('rejects null, undefined, or missing plans', () => {
      expect(hasAuthoritativeProposal(null, 1, 'hash123')).toBe(false);
      expect(hasAuthoritativeProposal(undefined, 1, 'hash123')).toBe(false);
    });

    it('rejects zero or negative plan versions', () => {
      expect(hasAuthoritativeProposal(samplePlan, 0, samplePlan.planHash)).toBe(false);
      expect(hasAuthoritativeProposal(samplePlan, -1, samplePlan.planHash)).toBe(false);
      expect(hasAuthoritativeProposal(samplePlan, null, samplePlan.planHash)).toBe(false);
    });

    it('rejects empty or whitespace plan hashes', () => {
      expect(hasAuthoritativeProposal(samplePlan, 1, '')).toBe(false);
      expect(hasAuthoritativeProposal(samplePlan, 1, '   ')).toBe(false);
      expect(hasAuthoritativeProposal(samplePlan, 1, null)).toBe(false);
    });

    it('rejects plans with zero assertions or steps', () => {
      const planNoAssertions = { ...samplePlan, assertions: [] };
      expect(hasAuthoritativeProposal(planNoAssertions, 1, samplePlan.planHash)).toBe(false);

      const planNoSteps = { ...samplePlan, steps: [] };
      expect(hasAuthoritativeProposal(planNoSteps, 1, samplePlan.planHash)).toBe(false);
    });
  });

  describe('4. Initial Page State Derivation & Fetch Failure Protection', () => {
    it('FETCH_FAILED: Never treats a fetch failure as an empty success', () => {
      const failedFetch: ApiResponse<{ questions: ClarificationQuestionItem[] }> = {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          category: 'INTERNAL_ERROR',
          message: 'Failed to connect to backend',
        },
        status: 503,
      };

      const state = determineInitialPageState({ fetchResult: failedFetch });

      expect(state.status).toBe('FETCH_FAILED');
      expect(state.errorMessage).toBe('Failed to connect to backend');
      expect(state.statusCode).toBe(503);
    });

    it('PROPOSAL_READY: Only derived when authoritative plan revision and PROPOSAL_READY review status exist', () => {
      const successfulFetch: ApiResponse<{ questions: ClarificationQuestionItem[] }> = {
        success: true,
        data: { questions: [] },
      };

      const validPlanResult: ApiResponse<PlanDetailResult> = {
        success: true,
        data: {
          data: samplePlan,
          version: 1,
          planHash: samplePlan.planHash,
          createdAt: '2026-10-23T12:00:00Z',
        },
      };

      const invResult: ApiResponse<InvestigationSnapshot> = {
        success: true,
        data: {
          id: 'inv-1',
          reviewStatus: 'PROPOSAL_READY',
        } as unknown as InvestigationSnapshot,
      };

      const state = determineInitialPageState({
        fetchResult: successfulFetch,
        planResult: validPlanResult,
        investigationResult: invResult,
      });

      expect(state.status).toBe('PROPOSAL_READY');
      expect(state.planVersion).toBe(1);
      expect(state.planHash).toBe(samplePlan.planHash);
    });

    it('NO_PENDING_QUESTIONS: Never routes to approval when no proposal exists', () => {
      const successfulFetch: ApiResponse<{ questions: ClarificationQuestionItem[] }> = {
        success: true,
        data: { questions: [] },
      };

      const invResult: ApiResponse<InvestigationSnapshot> = {
        success: true,
        data: {
          id: 'inv-1',
          reviewStatus: 'PENDING_PLANNING',
        } as unknown as InvestigationSnapshot,
      };

      const state = determineInitialPageState({
        fetchResult: successfulFetch,
        investigationResult: invResult,
      });

      expect(state.status).toBe('NO_PENDING_QUESTIONS');
      expect(state.investigationReviewStatus).toBe('PENDING_PLANNING');
      expect(state.planVersion).toBeUndefined();
    });

    it('QUESTIONS_READY: Correctly identifies when pending questions exist to answer', () => {
      const questionsWithPending: ApiResponse<{ questions: ClarificationQuestionItem[] }> = {
        success: true,
        data: {
          questions: [
            {
              id: 'q-1',
              investigationId: 'inv-1',
              questionText: 'Test question',
              isAnswered: false,
              createdAt: '2026-10-23T12:00:00Z',
            },
          ],
        },
      };

      const state = determineInitialPageState({ fetchResult: questionsWithPending });

      expect(state.status).toBe('QUESTIONS_READY');
    });
  });

  describe('5. Suggested Option Integrity (No Invented Choices)', () => {
    it('questions without server-suggested options have empty or undefined options', () => {
      const textOnlyQuestion: ClarificationQuestionItem = {
        id: 'q-text-only',
        investigationId: 'inv-1',
        questionText: 'Please describe the error message text',
        isAnswered: false,
        createdAt: '2026-10-23T12:00:00Z',
      };

      expect(textOnlyQuestion.suggestedOptions).toBeUndefined();
    });

    it('preserves exact server-supplied option strings without modification', () => {
      const serverOptions = ['Credit Card', 'PayPal', 'Direct Debit'];
      const questionWithOptions: ClarificationQuestionItem = {
        id: 'q-options',
        investigationId: 'inv-1',
        questionText: 'Which payment method was selected?',
        suggestedOptions: serverOptions,
        isAnswered: false,
        createdAt: '2026-10-23T12:00:00Z',
      };

      expect(questionWithOptions.suggestedOptions).toEqual(serverOptions);
      expect(questionWithOptions.suggestedOptions).toHaveLength(3);
    });
  });
});
