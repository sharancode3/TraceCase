import { describe, it, expect } from 'vitest';
import { EvaluationHarness, type CaseExecutionRecord } from '../evaluation/harness';
import {
  TC1_ARRAY_OFFSET_CASE,
  TC2_CLEAN_BUILD_CASE,
  TC3_SANDBOX_GUARDRAIL_CASE,
  TC4_SECRET_REDACTION_CASE,
  NEGATIVE_AMBIGUOUS_REPORT_CASE,
  NEGATIVE_PROMPT_INJECTION_CASE,
  NEGATIVE_REVOKED_APPROVAL_CASE,
  NEGATIVE_FAILED_RESET_CASE,
  NEGATIVE_MUTATION_TIMEOUT_CASE,
} from '../evaluation/cases';
import { MockTestDoubleModelProvider, OllamaLocalModelProvider } from '../src/server/ai/provider';
import type { ExecutionReceipt } from '../evaluation/case-schema';

describe('EvaluationHarness: Synthetic Role Testing vs Integrated Deployed Execution', () => {
  describe('Path A: Synthetic Role Testing', () => {
    it('executes TC1 role test without deriving verdict from hidden ground truth', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const harness = new EvaluationHarness(mockProvider);

      // Queue Role 1 (Plan)
      mockProvider.queueResponse({
        variant: 'PLAN_PROPOSED',
        extractedClaim: {
          summary: 'Delete Task B deletes Task A',
          reportedProblem: 'Task A deleted',
          claimedExpectedBehavior: 'Task B deleted',
          affectedEntities: ['Task A', 'Task B'],
        },
        experimentPlan: {
          planRevision: 1,
          preconditions: ['Reset baseline'],
          requiredRole: 'test_user',
          steps: [
            {
              stepNumber: 1,
              actionType: 'CLICK',
              intentDescription: 'Click Delete on Task B',
              targetDescription: 'Delete Task B',
              affectedDataScope: 'task-b',
              isDestructive: true,
            },
          ],
          correctBehaviorAssertions: [
            {
              predicateId: 'assert_task_b_deleted',
              assertionType: 'CORRECT_BEHAVIOR',
              target: 'DOM_ELEMENT',
              selector: 'button[data-task-id="task-b"]',
              expectedCondition: 'NOT_EXISTS',
              expectedValue: true,
            },
          ],
          reportedFailureAssertions: [
            {
              predicateId: 'assert_task_a_wrongly_removed',
              assertionType: 'REPORTED_FAILURE_SIGNATURE',
              target: 'DOM_ELEMENT',
              selector: 'button[data-task-id="task-a"]',
              expectedCondition: 'NOT_EXISTS',
              expectedValue: true,
            },
          ],
        },
      });

      // Queue Role 2 (Actor)
      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '11111111-2222-3333-4444-555555555555',
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_5',
          primarySelector: 'button[data-task-id="task-b"]',
        },
        expectedPostcondition: 'Task B deleted',
        rationale: 'Delete Task B',
      });

      // Queue Role 3 (Reviewer)
      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Synthetic role test explanation.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 matched failure signature',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Attempt 2 matched failure signature',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        evidenceCitations: [],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, { mode: 'SYNTHETIC_ROLE_TEST' });

      expect(record.caseId).toBe('TC-TC1-ARRAY-OFFSET');
      expect(record.executionMode).toBe('SYNTHETIC_ROLE_TEST');
      expect(record.evaluationStatus).toBe('PASS');
      expect(record.reproductionVerdict).toBe('PENDING'); // Not derived from hidden labels
      expect(record.lifecycleStatus).toBe('COMPLETED');
      expect(record.evidenceReadiness).toBe('NOT_RUN');
    });

    it('halts without invoking actor when planner requires clarification', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const harness = new EvaluationHarness(mockProvider);

      mockProvider.queueResponse({
        variant: 'NEEDS_CLARIFICATION',
        extractedClaim: {
          summary: 'Vague defect report',
          affectedFeature: 'Tasks list',
          missingFacts: ['target element'],
        },
        questions: [
          {
            questionId: 'q_target',
            questionText: 'Which element was clicked?',
            whyItMatters: 'To find target control',
            options: ['Task B', 'Task A'],
            blocksExecution: true,
          },
        ],
      });

      const record = await harness.evaluateCase(NEGATIVE_AMBIGUOUS_REPORT_CASE, { mode: 'SYNTHETIC_ROLE_TEST' });

      expect(record.lifecycleStatus).toBe('PLANNING');
      expect(record.reproductionVerdict).toBe('PENDING');
      expect(record.evaluationStatus).toBe('PASS');
      expect(record.browserGroundingsTotal).toBe(0); // Actor was never called
    });

    it('fails evaluation when planner returns UNSUPPORTED_CLAIM for complete TC1 report', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const harness = new EvaluationHarness(mockProvider);

      mockProvider.queueResponse({
        variant: 'UNSUPPORTED_CLAIM',
        reason: 'Claims cannot be tested',
        unsupportedFeatures: ['Complex dynamic animations'],
        recommendation: 'Manual QA testing',
      });

      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, { mode: 'SYNTHETIC_ROLE_TEST' });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.notes.some((n) => n.includes('Planner returned UNSUPPORTED_CLAIM'))).toBe(true);
    });

    it('fails evaluation and propagates error when actor inference throws', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const harness = new EvaluationHarness(mockProvider);

      mockProvider.queueResponse({
        variant: 'PLAN_PROPOSED',
        extractedClaim: {
          summary: 'TC1 Bug',
          reportedProblem: 'Delete Task B bug',
          claimedExpectedBehavior: 'Task B deleted',
          affectedEntities: ['Task B'],
        },
        experimentPlan: {
          planRevision: 1,
          preconditions: ['Reset baseline'],
          requiredRole: 'tester',
          steps: [{ stepNumber: 1, actionType: 'CLICK', intentDescription: 'Click Delete', isDestructive: true }],
          correctBehaviorAssertions: [
            { predicateId: 'assert_1', assertionType: 'CORRECT_BEHAVIOR', target: 'DOM_ELEMENT', selector: '#btn', expectedCondition: 'NOT_EXISTS', expectedValue: true },
          ],
          reportedFailureAssertions: [
            { predicateId: 'assert_2', assertionType: 'REPORTED_FAILURE_SIGNATURE', target: 'DOM_ELEMENT', selector: '#btn2', expectedCondition: 'NOT_EXISTS', expectedValue: true },
          ],
        },
      });

      // Queue Role 2 (Actor) - Invalid schema causing throw
      mockProvider.queueResponse({
        variant: 'MALFORMED_OUTPUT',
      });

      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, { mode: 'SYNTHETIC_ROLE_TEST' });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.lifecycleStatus).toBe('FAILED');
      expect(record.notes.some((n) => n.includes('Actor inference failed'))).toBe(true);
    });

    it('fails evaluation when actor proposes non-matching entity control', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const harness = new EvaluationHarness(mockProvider);

      mockProvider.queueResponse({
        variant: 'PLAN_PROPOSED',
        extractedClaim: {
          summary: 'TC1 Bug',
          reportedProblem: 'Delete Task B bug',
          claimedExpectedBehavior: 'Task B deleted',
          affectedEntities: ['Task B'],
        },
        experimentPlan: {
          planRevision: 1,
          preconditions: ['Reset baseline'],
          requiredRole: 'tester',
          steps: [{ stepNumber: 1, actionType: 'CLICK', intentDescription: 'Click Delete on Task B', isDestructive: true }],
          correctBehaviorAssertions: [
            { predicateId: 'assert_1', assertionType: 'CORRECT_BEHAVIOR', target: 'DOM_ELEMENT', selector: '#btn', expectedCondition: 'NOT_EXISTS', expectedValue: true },
          ],
          reportedFailureAssertions: [
            { predicateId: 'assert_2', assertionType: 'REPORTED_FAILURE_SIGNATURE', target: 'DOM_ELEMENT', selector: '#btn2', expectedCondition: 'NOT_EXISTS', expectedValue: true },
          ],
        },
      });

      // Queue Role 2 (Actor) proposing node_3 (Delete Task A) instead of Task B
      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '11111111-2222-3333-4444-555555555555',
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_3', // Node 3 is Task A
          primarySelector: 'button[data-task-id="task-a"]',
        },
        expectedPostcondition: 'Task deleted',
        rationale: 'Delete task',
      });

      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, { mode: 'SYNTHETIC_ROLE_TEST' });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.notes.some((n) => n.includes('Actor stopped blocked') || n.includes('Grounding failure'))).toBe(true);
    });

    it('does not increment schemaValidationsPassed when reviewer uses deterministic fallback', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const harness = new EvaluationHarness(mockProvider);

      mockProvider.queueResponse({
        variant: 'PLAN_PROPOSED',
        extractedClaim: {
          summary: 'TC1 Bug',
          reportedProblem: 'Delete Task B bug',
          claimedExpectedBehavior: 'Task B deleted',
          affectedEntities: ['Task B'],
        },
        experimentPlan: {
          planRevision: 1,
          preconditions: ['Reset baseline'],
          requiredRole: 'tester',
          steps: [{ stepNumber: 1, actionType: 'CLICK', intentDescription: 'Click Delete', isDestructive: true }],
          correctBehaviorAssertions: [
            { predicateId: 'assert_1', assertionType: 'CORRECT_BEHAVIOR', target: 'DOM_ELEMENT', selector: '#btn', expectedCondition: 'NOT_EXISTS', expectedValue: true },
          ],
          reportedFailureAssertions: [
            { predicateId: 'assert_2', assertionType: 'REPORTED_FAILURE_SIGNATURE', target: 'DOM_ELEMENT', selector: '#btn2', expectedCondition: 'NOT_EXISTS', expectedValue: true },
          ],
        },
      });

      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '11111111-2222-3333-4444-555555555555',
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_5',
          primarySelector: 'button[data-task-id="task-b"]',
        },
        expectedPostcondition: 'Task B deleted',
        rationale: 'Delete Task B',
      });

      // Queue Reviewer: EXPLANATION_UNAVAILABLE_FALLBACK
      mockProvider.queueResponse({
        variant: 'EXPLANATION_UNAVAILABLE_FALLBACK',
        reason: 'Model explanations disabled',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        factualObservations: ['Run 1 confirmed failure'],
      });

      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, { mode: 'SYNTHETIC_ROLE_TEST' });

      // Planner (1) + Actor (1) passed schema, Reviewer fallback does NOT increment
      expect(record.schemaValidationsPassed).toBe(2);
      expect(record.schemaValidationsTotal).toBe(3);
    });

    it('marks secret coverage as unverified when required surfaces are unavailable for TC4', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const harness = new EvaluationHarness(mockProvider);

      mockProvider.queueResponse({
        variant: 'PLAN_PROPOSED',
        extractedClaim: {
          summary: 'TC4 Secret Scrubbing',
          reportedProblem: 'Secret exposure check',
          claimedExpectedBehavior: 'Secrets scrubbed',
          affectedEntities: ['Auth Token'],
        },
        experimentPlan: {
          planRevision: 1,
          preconditions: ['Reset baseline'],
          requiredRole: 'tester',
          steps: [{ stepNumber: 1, actionType: 'CLICK', intentDescription: 'Click Delete', isDestructive: true }],
          correctBehaviorAssertions: [
            { predicateId: 'assert_1', assertionType: 'CORRECT_BEHAVIOR', target: 'DOM_ELEMENT', selector: '#btn', expectedCondition: 'NOT_EXISTS', expectedValue: true },
          ],
          reportedFailureAssertions: [
            { predicateId: 'assert_2', assertionType: 'REPORTED_FAILURE_SIGNATURE', target: 'DOM_ELEMENT', selector: '#btn2', expectedCondition: 'NOT_EXISTS', expectedValue: true },
          ],
        },
      });

      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '11111111-2222-3333-4444-555555555555',
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_5',
          primarySelector: 'button[data-task-id="task-b"]',
        },
        expectedPostcondition: 'Done',
        rationale: 'Done',
      });

      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'TC4 Review summary.',
        observedReproductionVerdict: 'NOT_REPRODUCED',
        attempt1Comparison: {
          summary: 'Clean',
          failedAssertions: [],
          matchingFailureObserved: false,
        },
        evidenceCitations: [],
        manualReproductionSteps: [],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const record = await harness.evaluateCase(TC4_SECRET_REDACTION_CASE, { mode: 'SYNTHETIC_ROLE_TEST' });

      // In synthetic mode, surfaces like transcripts/toolCalls/prompts are unavailable,
      // so coverage remains unverified rather than reporting a clean aggregate pass.
      expect(record.secretExposureCheckPassed).toBe(false);
      expect(record.unverifiedSurfaces).toBeDefined();
      expect(record.unverifiedSurfaces!.length).toBeGreaterThan(0);
      expect(record.notes.some((n) => n.includes('Coverage remains unverified'))).toBe(true);
    });
  });

  describe('Path B: Integrated Deployed Receipt Consumption', () => {
    const validReceiptFixture: ExecutionReceipt = {
      investigationId: '11111111-2222-3333-4444-555555555555',
      workerId: 'worker-node-1',
      leaseId: 'lease-789',
      planHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      approvedPlanId: 'approved-plan-uuid-001',
      targetBuildVersion: 'v1.0.0-buggy',
      fixtureScope: 'two_tasks_one_completed',
      authoritativeReproductionVerdict: 'CONFIRMED_REPRODUCED',
      authoritativeLifecycleState: 'COMPLETED',
      resetReceipt: {
        receiptId: 'reset-rec-001',
        httpStatus: 200,
        baselineRestored: true,
        fixtureScope: 'two_tasks_one_completed',
        timestampUtc: '2026-10-20T12:05:00.000Z',
      },
      attempt1: {
        attemptId: 'att-001',
        attemptIndex: 1,
        startedAtUtc: '2026-10-20T12:00:00.000Z',
        completedAtUtc: '2026-10-20T12:04:00.000Z',
        status: 'FAILED_ASSERTIONS',
        failureSignatureMatched: true,
        isValid: true,
        executionDurationMs: 3200,
        readbackBaselineVerified: true,
        assertionsEvaluated: [
          {
            predicateId: 'assert_task_b_deleted',
            predicateDescription: 'Task B should be deleted',
            passed: false,
            actualValue: 'PRESENT',
            expectedValue: 'NOT_PRESENT',
          },
        ],
        artifactManifest: {
          videoArtifactId: 'art-vid-1',
          videoVerifiedUrl: 'http://localhost:3005/artifacts/run1_video.webm',
          consoleLogArtifactId: 'art-con-1',
          consoleLogVerifiedUrl: 'http://localhost:3005/artifacts/run1_console.log',
          networkLogArtifactId: 'art-net-1',
          networkLogVerifiedUrl: 'http://localhost:3005/artifacts/run1_network.json',
          restrictedArtifactTypes: [],
          unverifiedOrMissing: [],
        },
        sanitizedConsoleExcerpts: ['[INFO] Run 1 clean'],
      },
      attempt2: {
        attemptId: 'att-002',
        attemptIndex: 2,
        startedAtUtc: '2026-10-20T12:06:00.000Z',
        completedAtUtc: '2026-10-20T12:10:00.000Z',
        status: 'FAILED_ASSERTIONS',
        failureSignatureMatched: true,
        isValid: true,
        executionDurationMs: 3100,
        readbackBaselineVerified: true,
        assertionsEvaluated: [
          {
            predicateId: 'assert_task_b_deleted',
            predicateDescription: 'Task B should be deleted',
            passed: false,
            actualValue: 'PRESENT',
            expectedValue: 'NOT_PRESENT',
          },
        ],
        artifactManifest: {
          videoArtifactId: 'art-vid-2',
          videoVerifiedUrl: 'http://localhost:3005/artifacts/run2_video.webm',
          consoleLogArtifactId: 'art-con-2',
          consoleLogVerifiedUrl: 'http://localhost:3005/artifacts/run2_console.log',
          networkLogArtifactId: 'art-net-2',
          networkLogVerifiedUrl: 'http://localhost:3005/artifacts/run2_network.json',
          restrictedArtifactTypes: [],
          unverifiedOrMissing: [],
        },
        sanitizedConsoleExcerpts: ['[INFO] Run 2 clean'],
      },
    };

    it('returns BLOCKED when no receipts are provided', async () => {
      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, { mode: 'INTEGRATED_DEPLOYED' });

      expect(record.evaluationStatus).toBe('BLOCKED');
      expect(record.reproductionVerdict).toBe('PENDING');
      expect(record.evidenceReadiness).toBe('UNAVAILABLE');
    });

    it('rejects a mere {} cast to receipt type (malformed receipts rejected)', async () => {
      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: {} as unknown as ExecutionReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('schema validation failed'))).toBe(true);
    });

    it('evaluates two valid supporting attempts and compares with expected classification', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Defect reproduced cleanly.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: { summary: 'matched', failedAssertions: ['assert_task_b_deleted'], matchingFailureObserved: true },
        attempt2Comparison: { summary: 'matched', failedAssertions: ['assert_task_b_deleted'], matchingFailureObserved: true },
        evidenceCitations: [
          { artifactType: 'VIDEO', safeUrl: 'http://localhost:3005/artifacts/run1_video.webm', relevanceExplanation: 'Shows bug' },
        ],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const harness = new EvaluationHarness(mockProvider);
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: validReceiptFixture,
      });

      expect(record.evaluationStatus).toBe('PASS');
      expect(record.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
      expect(record.evidenceReadiness).toBe('PUBLIC_SAFE_READY');
      expect(record.verdictMatchesGroundTruth).toBe(true);
    });

    it('rejects single attempt claiming two-run confirmation', async () => {
      const singleAttemptReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt2: undefined,
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: singleAttemptReceipt,
      });

      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.notes.some((n) => n.includes('Receipt contradiction'))).toBe(true);
    });

    it('reports INCONSISTENT_OBSERVATIONS when attempt outcomes do not match', async () => {
      const mismatchReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        authoritativeReproductionVerdict: 'INCONSISTENT_OBSERVATIONS',
        attempt2: {
          ...validReceiptFixture.attempt2!,
          status: 'PASSED_ASSERTIONS',
          failureSignatureMatched: false,
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: mismatchReceipt,
      });

      expect(record.reproductionVerdict).toBe('INCONSISTENT_OBSERVATIONS');
    });

    it('treats crashed attempt as INCONCLUSIVE rather than valid nonmatch', async () => {
      const crashedReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          status: 'CRASHED',
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: crashedReceipt,
      });

      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('Crashed or timed out'))).toBe(true);
    });

    it('rejects missing or unauthenticated baseline reset', async () => {
      const failedResetReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        resetReceipt: undefined,
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: failedResetReceipt,
      });

      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('Receipt contradiction'))).toBe(true);
    });

    it('rejects wrong target build correlation', async () => {
      const wrongBuildReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        targetBuildVersion: 'v2.0.0-unrelated',
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: wrongBuildReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.notes.some((n) => n.includes('Correlation mismatch'))).toBe(true);
    });

    it('marks evidence readiness as PENDING_GENERATION when manifest is missing verified artifact URLs', async () => {
      const missingArtifactReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          artifactManifest: {
            ...validReceiptFixture.attempt1.artifactManifest,
            videoVerifiedUrl: undefined,
            unverifiedOrMissing: ['VIDEO'],
          },
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: missingArtifactReceipt,
      });

      expect(record.evidenceReadiness).toBe('PENDING_GENERATION');
      expect(record.notes.some((n) => n.includes('Evidence incomplete'))).toBe(true);
    });

    it('quarantines restricted artifacts detected in manifest', async () => {
      const restrictedArtifactReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          artifactManifest: {
            ...validReceiptFixture.attempt1.artifactManifest,
            restrictedArtifactTypes: ['VIDEO', 'CONSOLE_LOG'],
          },
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: restrictedArtifactReceipt,
      });

      expect(record.evidenceReadiness).toBe('QUARANTINED_LEAK_DETECTED');
      expect(record.secretExposureCheckPassed).toBe(false);
    });

    it('guarantees changing hidden ground truth does not change consumed observed facts', async () => {
      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());

      const tamperedCase = {
        ...TC1_ARRAY_OFFSET_CASE,
        groundTruth: {
          ...TC1_ARRAY_OFFSET_CASE.groundTruth,
          actualBugPresent: false, // Inverting hidden truth
        },
      };

      const record = await harness.evaluateCase(tamperedCase, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: validReceiptFixture,
      });

      // Observed facts must come STRICTLY from the receipts, not ground truth
      expect(record.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
      expect(record.isFalseConfirmation).toBe(true); // Flagged because ground truth was tampered to false
    });

    it('rejects receipt when Attempt 1 readbackBaselineVerified is false', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          readbackBaselineVerified: false,
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('Attempt 1 readbackBaselineVerified is false'))).toBe(true);
    });

    it('rejects receipt when Attempt 2 readbackBaselineVerified is false', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt2: {
          ...validReceiptFixture.attempt2!,
          readbackBaselineVerified: false,
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('Attempt 2 readbackBaselineVerified is false'))).toBe(true);
    });

    it('rejects receipt when attempt indices are invalid (attempt2 has attemptIndex 1)', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt2: {
          ...validReceiptFixture.attempt2!,
          attemptIndex: 1 as 2, // Contradictory attemptIndex
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('Receipt contradiction') || n.includes('attemptIndex'))).toBe(true);
    });

    it('rejects receipt when attempt IDs are identical across attempts', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          attemptId: 'duplicate-attempt-uuid-1234',
        },
        attempt2: {
          ...validReceiptFixture.attempt2!,
          attemptId: 'duplicate-attempt-uuid-1234',
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('identical attemptId'))).toBe(true);
    });

    it('rejects receipt when resetReceipt fixtureScope does not match execution fixtureScope', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        resetReceipt: {
          ...validReceiptFixture.resetReceipt!,
          fixtureScope: 'unrelated_other_fixture',
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('Reset fixtureScope'))).toBe(true);
    });

    it('rejects receipt when resetReceipt HTTP status is non-200', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        resetReceipt: {
          ...validReceiptFixture.resetReceipt!,
          httpStatus: 500 as unknown as 200,
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('indicates reset failure'))).toBe(true);
    });

    it('rejects receipt when resetReceipt baselineRestored is false', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        resetReceipt: {
          ...validReceiptFixture.resetReceipt!,
          baselineRestored: false as unknown as true,
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('indicates reset failure'))).toBe(true);
    });

    it('rejects receipt when receipt planHash does not match case expectedPlanHash', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        planHash: '0000000000000000000000000000000000000000000000000000000000000000',
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('does not match expected approved plan hash'))).toBe(true);
    });

    it('rejects receipt when reset timestamp precedes Attempt 1 completion timestamp', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          completedAtUtc: '2026-10-20T12:05:00.000Z',
        },
        resetReceipt: {
          ...validReceiptFixture.resetReceipt!,
          timestampUtc: '2026-10-20T12:01:00.000Z', // Reset happened before Attempt 1 finished!
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('Reset receipt timestamp precedes Attempt 1 completion'))).toBe(true);
    });

    it('rejects receipt when attempt reports passed assertions during confirmed reproduction', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B should be deleted',
              passed: true, // Contradiction: passed assertions cannot confirm reproduction of failure signature!
              actualValue: 'NOT_PRESENT',
              expectedValue: 'NOT_PRESENT',
            },
          ],
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('no failed assertions recorded'))).toBe(true);
    });

    it('applies shared safe projection preventing VIDEO-restricted manifest URL from reaching provider prompt', async () => {
      class CapturingFakeProvider extends MockTestDoubleModelProvider {
        public capturedPrompts: string[] = [];

        public async generateStructuredCompletion<T>(input: any, outputSchema: any) {
          this.capturedPrompts.push(JSON.stringify(input));
          return super.generateStructuredCompletion<T>(input, outputSchema);
        }
      }

      const capturingProvider = new CapturingFakeProvider();
      capturingProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Quarantined report summary',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Attempt 1 comparison',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Attempt 2 comparison',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        evidenceCitations: [
          { artifactType: 'CONSOLE_LOG', safeUrl: 'http://localhost:3005/artifacts/run1_console.log', relevanceExplanation: 'Safe log' },
        ],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const restrictedReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          artifactManifest: {
            ...validReceiptFixture.attempt1.artifactManifest,
            restrictedArtifactTypes: ['VIDEO'], // VIDEO restricted
            videoVerifiedUrl: 'http://localhost:3005/artifacts/quarantined-leak-video.webm',
          },
        },
      };

      const harness = new EvaluationHarness(capturingProvider);
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: restrictedReceipt,
      });

      expect(record.evidenceReadiness).toBe('QUARANTINED_LEAK_DETECTED');
      expect(record.reproductionVerdict).toBe('CONFIRMED_REPRODUCED'); // Finding preserved separately
      expect(record.evaluationStatus).toBe('FAIL'); // Fails official acceptance gate due to quarantined required evidence!
      expect(record.notes.some((n) => n.includes('Evidence gate failed'))).toBe(true);

      const summary = harness.compileSummary([record]);
      expect(summary.hasReleaseBlocker).toBe(true);
      expect(summary.quarantinedEvidenceCount).toBe(1);

      // Crucial: The restricted video URL MUST NOT appear anywhere in the reviewer prompt!
      const allPrompts = capturingProvider.capturedPrompts.join('\n');
      expect(allPrompts).not.toContain('quarantined-leak-video.webm');
      expect(allPrompts).toContain('http://localhost:3005/artifacts/run1_console.log');
    });

    it('rejects confirmation-capable receipt when attempt IDs are missing', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          attemptId: undefined, // Missing attemptId
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('requires non-empty attemptId'))).toBe(true);
    });

    it('rejects receipt when timestamps are not valid ISO dates (not-a-date)', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        resetReceipt: {
          ...validReceiptFixture.resetReceipt!,
          timestampUtc: 'not-a-date',
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('is not a valid date'))).toBe(true);
    });

    it('rejects receipt when evaluated assertions are not bound to approved experiment plan predicates', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        approvedPlanPredicateIds: ['assert_approved_predicate_1', 'assert_approved_predicate_2'],
        attempt1: {
          ...validReceiptFixture.attempt1,
          assertionsEvaluated: [
            {
              predicateId: 'assert_unapproved_invented_predicate', // Not in approved plan!
              predicateDescription: 'Invented check',
              passed: false,
              actualValue: 'FAIL',
              expectedValue: 'PASS',
            },
          ],
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('are not bound to the authoritative approved experiment plan'))).toBe(true);
    });

    it('rejects confirmation when Attempt 1 and Attempt 2 fail on disjoint/unrelated assertions', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted', // Failed on B
              predicateDescription: 'Task B should be deleted',
              passed: false,
              actualValue: 'PRESENT',
              expectedValue: 'NOT_PRESENT',
            },
          ],
        },
        attempt2: {
          ...validReceiptFixture.attempt2!,
          assertionsEvaluated: [
            {
              predicateId: 'assert_some_unrelated_thing', // Failed on unrelated assertion!
              predicateDescription: 'Unrelated assertion',
              passed: false,
              actualValue: 'FOO',
              expectedValue: 'BAR',
            },
          ],
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('no shared failure predicate') || n.includes('lack two valid matching failures'))).toBe(true);
    });

    it('rejects confirmation when shared failure predicate does not correlate with approved experiment predicates', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          assertionsEvaluated: [
            {
              predicateId: 'assert_unapproved_secret_metric',
              predicateDescription: 'Unapproved predicate',
              passed: false,
              actualValue: 123,
              expectedValue: 456,
            },
          ],
        },
        attempt2: {
          ...validReceiptFixture.attempt2!,
          assertionsEvaluated: [
            {
              predicateId: 'assert_unapproved_secret_metric',
              predicateDescription: 'Unapproved predicate',
              passed: false,
              actualValue: 123,
              expectedValue: 456,
            },
          ],
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('do not correlate with approved case predicates'))).toBe(true);
    });

    it('rejects receipt when reset ordering is inverted (Attempt 2 starts before reset)', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt2: {
          ...validReceiptFixture.attempt2!,
          startedAtUtc: '2026-10-20T12:04:30.000Z', // Precedes reset at 12:05:00
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('precedes reset receipt'))).toBe(true);
    });

    it('rejects receipt when reset attemptPair does not correlate with executed attempts', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        resetReceipt: {
          ...validReceiptFixture.resetReceipt!,
          attemptPair: ['wrong-att-1', 'wrong-att-2'],
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('does not match execution attempts'))).toBe(true);
    });

    it('rejects receipt when approved plan reference is dummy static hash or missing context', async () => {
      const invalidReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        approvedPlanId: undefined, // Missing authoritative approved-plan reference!
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: invalidReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.reproductionVerdict).toBe('INCONCLUSIVE');
      expect(record.notes.some((n) => n.includes('lacks real authoritative approved-plan reference'))).toBe(true);
    });

    it('blocks official acceptance (status BLOCKED) when required evidence is missing or pending', async () => {
      const missingEvidenceReceipt: ExecutionReceipt = {
        ...validReceiptFixture,
        attempt1: {
          ...validReceiptFixture.attempt1,
          artifactManifest: {
            ...validReceiptFixture.attempt1.artifactManifest,
            videoVerifiedUrl: undefined,
            unverifiedOrMissing: ['VIDEO'],
          },
        },
      };

      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: missingEvidenceReceipt,
      });

      expect(record.evidenceReadiness).toBe('PENDING_GENERATION');
      expect(record.evaluationStatus).toBe('BLOCKED'); // Cannot be PASS!
      expect(record.reproductionVerdict).toBe('CONFIRMED_REPRODUCED'); // Finding preserved separately
    });

    it('ensures quarantined case summary sets hasReleaseBlocker and blocks campaign acceptance', () => {
      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const quarantinedRecord: CaseExecutionRecord = {
        recordId: 'rec-quarantine-1',
        caseId: 'TC-TC1-ARRAY-OFFSET',
        caseTitle: 'TC1',
        category: 'OFFICIAL_PS_BENCHMARK',
        datasetPartition: 'RESERVED_EVALUATION_HOLDOUT',
        timestampUtc: new Date().toISOString(),
        modelIdentifier: 'mock_test_double',
        providerType: 'mock_test_double',
        promptVersion: '1.0.0',
        durationMs: 2500,
        evaluationStatus: 'FAIL',
        lifecycleStatus: 'COMPLETED',
        reproductionVerdict: 'CONFIRMED_REPRODUCED', // Finding preserved
        evidenceReadiness: 'QUARANTINED_LEAK_DETECTED',
        verdictMatchesGroundTruth: true,
        isFalseConfirmation: false,
        secretExposureCheckPassed: false,
        hasRedactionObligation: true,
        clarificationCorrectnessPassed: false,
        exposedTokens: [],
        notes: ['Evidence quarantined'],
        executionMode: 'INTEGRATED_DEPLOYED',
        schemaValidationsPassed: 1,
        schemaValidationsTotal: 1,
        browserGroundingsPassed: 0,
        browserGroundingsTotal: 0,
        policyChecksPassed: 1,
        policyChecksTotal: 1,
        faithfulnessPassed: 1,
        faithfulnessTotal: 1,
      };

      const summary = harness.compileSummary([quarantinedRecord]);
      expect(summary.quarantinedEvidenceCount).toBe(1);
      expect(summary.hasReleaseBlocker).toBe(true);
      expect(summary.passedCount).toBe(0);
      expect(summary.failedCount).toBe(1);
    });
  });

  describe('Secret Redaction & Representation Scanning (TC4)', () => {
    it('verifies safe surfaces are clean and reports opaque references for leaks', () => {
      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());
      const forbiddenTokens = ['secret-token-12345'];

      const safeSurfaces = {
        safeModelInputs: { prompt: 'Clean input' },
        reports: { summary: 'Clean report' },
      };

      const cleanResult = harness.scanRepresentationsForTokens(safeSurfaces, forbiddenTokens);
      expect(cleanResult.isClean).toBe(true);
      expect(cleanResult.leakedTokens).toHaveLength(0);

      const leakingSurfaces = {
        reports: { summary: 'Contains secret-token-12345 in plain text' },
      };

      const leakResult = harness.scanRepresentationsForTokens(leakingSurfaces, forbiddenTokens);
      expect(leakResult.isClean).toBe(false);
      // Opaque reference reported, NOT the token literal!
      expect(leakResult.leakedTokens[0]).toBe('LEAK_REF_TOKEN_0_SURFACE_reports');
      expect(leakResult.leakedTokens[0]).not.toContain('secret-token-12345');
    });
  });

  describe('Metrics Compilation (10 Dimensions)', () => {
    it('accurately computes 10 dimensions with honest denominators', () => {
      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());

      const sampleRecords = [
        {
          recordId: '1',
          caseId: 'TC-TC1-ARRAY-OFFSET',
          caseTitle: 'TC1',
          category: 'OFFICIAL_PS_BENCHMARK',
          datasetPartition: 'RESERVED_EVALUATION_HOLDOUT',
          timestampUtc: new Date().toISOString(),
          modelIdentifier: 'qwen2.5-coder:3b',
          providerType: 'local_ollama',
          promptVersion: '1.0.0',
          durationMs: 4000,
          evaluationStatus: 'PASS' as const,
          lifecycleStatus: 'COMPLETED' as const,
          reproductionVerdict: 'CONFIRMED_REPRODUCED' as const,
          evidenceReadiness: 'PUBLIC_SAFE_READY' as const,
          verdictMatchesGroundTruth: true,
          isFalseConfirmation: false,
          hasRedactionObligation: false,
          clarificationCorrectnessPassed: true,
          secretExposureCheckPassed: true,
          exposedTokens: [],
          notes: [],
          executionMode: 'INTEGRATED_DEPLOYED' as const,
          schemaValidationsPassed: 1,
          schemaValidationsTotal: 1,
          browserGroundingsPassed: 1,
          browserGroundingsTotal: 1,
          policyChecksPassed: 1,
          policyChecksTotal: 1,
          faithfulnessPassed: 1,
          faithfulnessTotal: 1,
        },
        {
          recordId: '2',
          caseId: 'TC-TC2-CLEAN-BUILD',
          caseTitle: 'TC2',
          category: 'OFFICIAL_PS_BENCHMARK',
          datasetPartition: 'RESERVED_EVALUATION_HOLDOUT',
          timestampUtc: new Date().toISOString(),
          modelIdentifier: 'qwen2.5-coder:3b',
          providerType: 'local_ollama',
          promptVersion: '1.0.0',
          durationMs: 3800,
          evaluationStatus: 'PASS' as const,
          lifecycleStatus: 'COMPLETED' as const,
          reproductionVerdict: 'NOT_REPRODUCED' as const,
          evidenceReadiness: 'PUBLIC_SAFE_READY' as const,
          verdictMatchesGroundTruth: true,
          isFalseConfirmation: false,
          hasRedactionObligation: false,
          clarificationCorrectnessPassed: true,
          secretExposureCheckPassed: true,
          exposedTokens: [],
          notes: [],
          executionMode: 'INTEGRATED_DEPLOYED' as const,
          schemaValidationsPassed: 1,
          schemaValidationsTotal: 1,
          browserGroundingsPassed: 1,
          browserGroundingsTotal: 1,
          policyChecksPassed: 1,
          policyChecksTotal: 1,
          faithfulnessPassed: 1,
          faithfulnessTotal: 1,
        },
      ];

      const summary = harness.compileSummary(sampleRecords);

      expect(summary.totalCasesEvaluated).toBe(2);
      expect(summary.passedCount).toBe(2);
      expect(summary.falseConfirmationCount).toBe(0);
      expect(summary.metrics).toHaveLength(10);

      const evidenceMetric = summary.metrics.find((m) => m.name === 'Required Evidence Completeness');
      expect(evidenceMetric?.percentage).toBe(100);

      const renamedFaithfulness = summary.metrics.find((m) => m.name === 'Evidence Citation and Verdict Consistency');
      expect(renamedFaithfulness).toBeDefined();
    });

    it('excludes synthetic records from End-to-End Classification Correctness and reports N/A', () => {
      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());

      const syntheticOnlyRecords: CaseExecutionRecord[] = [
        {
          recordId: 'syn-1',
          caseId: 'TC-TC1-ARRAY-OFFSET',
          caseTitle: 'TC1',
          category: 'OFFICIAL_PS_BENCHMARK',
          datasetPartition: 'RESERVED_EVALUATION_HOLDOUT',
          timestampUtc: new Date().toISOString(),
          modelIdentifier: 'qwen2.5-coder:3b',
          providerType: 'local_ollama',
          promptVersion: '1.0.0',
          durationMs: 1200,
          evaluationStatus: 'PASS',
          lifecycleStatus: 'COMPLETED',
          reproductionVerdict: 'PENDING',
          evidenceReadiness: 'NOT_RUN',
          verdictMatchesGroundTruth: false,
          isFalseConfirmation: false,
          hasRedactionObligation: false,
          clarificationCorrectnessPassed: true,
          secretExposureCheckPassed: true,
          exposedTokens: [],
          notes: [],
          executionMode: 'SYNTHETIC_ROLE_TEST',
          schemaValidationsPassed: 3,
          schemaValidationsTotal: 3,
          browserGroundingsPassed: 1,
          browserGroundingsTotal: 1,
          policyChecksPassed: 1,
          policyChecksTotal: 1,
          faithfulnessPassed: 1,
          faithfulnessTotal: 1,
        },
      ];

      const summary = harness.compileSummary(syntheticOnlyRecords);

      const e2eMetric = summary.metrics.find((m) => m.name === 'End-to-End Classification Correctness');
      expect(e2eMetric).toBeDefined();
      expect(e2eMetric?.numerator).toBe(0);
      expect(e2eMetric?.denominator).toBe(0);
      expect(e2eMetric?.percentage).toBeNull(); // N/A, not falsely 100%!
    });
  });

  describe.runIf(process.env.RUN_LOCAL_MODELS === 'true')('Real Local Model Quality Evaluation (qwen2.5-coder:3b)', () => {
    it(
      'executes live evaluation harness against active Ollama model at $0.0000 API cost',
      async () => {
        const localProvider = new OllamaLocalModelProvider({
          endpointUrl: 'http://localhost:11434',
          modelIdentifier: 'qwen2.5-coder:3b',
          timeoutMs: 180000,
        });

        const harness = new EvaluationHarness(localProvider);
        const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE);

        expect(record.modelIdentifier).toBe('qwen2.5-coder:3b');
        expect(record.durationMs).toBeGreaterThan(0);
      },
      180000
    );
  });
});
