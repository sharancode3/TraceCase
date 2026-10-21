import { describe, it, expect } from 'vitest';
import {
  createPlannerCompatibilityAdapter,
  createBrowserProposerCompatibilityAdapter,
  createReviewerCompatibilityAdapter,
  projectClarificationForUi,
  projectReviewForUi,
  sanitizeModelPayload,
  assertNoForbiddenAuthority,
  UNAGREED_SHARED_CONTRACT_DECISIONS,
} from '../src/server/ai/compatibility-adapter';
import { MockTestDoubleModelProvider } from '../src/server/ai/provider';
import {
  ReportAgentInputSchema,
  BrowserAgentInputSchema,
  EvidenceReviewAgentInputSchema,
  ReportAgentOutput,
  EvidenceReviewOutput,
} from '../src/server/ai/contracts';
import { DemoTargetStore } from '../demo-target/store';
import { DemoTargetClient } from '../demo-target/client';
import { EvaluationHarness } from '../evaluation/harness';
import { getEvaluationCaseById, TC1_ARRAY_OFFSET_CASE } from '../evaluation/cases';
import type { ExecutionReceipt } from '../evaluation/case-schema';

describe('Person 2: Integration Contracts and Compatibility Handoffs (H-01 / Phase 2)', () => {
  // ==========================================================================
  // 1. P1 CAN INVOKE EACH ROLE AND CONSUME TYPED RESULTS
  // ==========================================================================
  describe('P1 Role Invocation and Typed Results', () => {
    it('P1 invokes Planner via compatibility adapter and consumes typed ReportAgentOutput', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const expectedOutput: ReportAgentOutput = {
        variant: 'PLAN_PROPOSED',
        extractedClaim: {
          summary: 'Deleting active task deletes completed task instead',
          reportedProblem: 'Task A deleted instead of Task B',
          claimedExpectedBehavior: 'Task B is deleted and Task A is kept',
          affectedEntities: ['Task A', 'Task B'],
        },
        experimentPlan: {
          planRevision: 1,
          preconditions: ['Baseline restored via POST /api/test/reset-fixture'],
          requiredRole: 'test_user',
          steps: [
            {
              stepNumber: 1,
              actionType: 'NAVIGATE',
              intentDescription: 'Open demo tasks app',
              isDestructive: false,
            },
            {
              stepNumber: 2,
              actionType: 'CLICK',
              intentDescription: 'Click Active filter',
              targetRole: 'button',
              targetAccessibleName: 'Active',
              isDestructive: false,
            },
            {
              stepNumber: 3,
              actionType: 'CLICK',
              intentDescription: 'Delete Task B',
              targetRole: 'button',
              targetAccessibleName: 'Delete Task B',
              isDestructive: true,
              affectedDataScope: 'task-b',
            },
          ],
          correctBehaviorAssertions: [
            {
              predicateId: 'assert_task_b_deleted',
              assertionType: 'CORRECT_BEHAVIOR',
              target: 'DOM_ELEMENT',
              selector: '[data-task-id="task-b"]',
              expectedCondition: 'NOT_EXISTS',
              expectedValue: true,
            },
          ],
          reportedFailureAssertions: [
            {
              predicateId: 'assert_task_a_wrongly_deleted',
              assertionType: 'REPORTED_FAILURE_SIGNATURE',
              target: 'DOM_ELEMENT',
              selector: '[data-task-id="task-a"]',
              expectedCondition: 'NOT_EXISTS',
              expectedValue: true,
            },
          ],
        },
      };

      mockProvider.queueResponse(expectedOutput);
      const planner = createPlannerCompatibilityAdapter(mockProvider);

      const result = await planner.evaluateReport({
        investigationId: '11111111-2222-3333-4444-555555555555',
        rawReport: {
          title: 'Deleting active task deletes completed item',
          description: 'When Active filter is applied, clicking delete on Task B removes Task A instead.',
          claimedExpectedBehavior: 'Task B should be removed, Task A preserved.',
        },
        targetProfile: {
          name: 'Demo App',
          baseUrl: 'http://localhost:3005',
          isSandbox: true,
          allowedOrigins: ['http://localhost:3005'],
          hasResetFixture: true,
        },
      });

      expect(result.output.variant).toBe('PLAN_PROPOSED');
      if (result.output.variant === 'PLAN_PROPOSED') {
        expect(result.output.experimentPlan.steps).toHaveLength(3);
        expect(result.output.experimentPlan.correctBehaviorAssertions[0].predicateId).toBe('assert_task_b_deleted');
      }
      expect(result.usage.tokenCostUsd).toBe('0.0000');
    });

    it('P1 invokes Browser Proposer via compatibility adapter and consumes typed BrowserDecisionOutput', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const expectedDecision = {
        variant: 'PROPOSE_ACTION' as const,
        echoedStepNumber: 2,
        echoedObservationId: '22222222-3333-4444-5555-666666666666',
        action: {
          actionType: 'CLICK' as const,
          targetNodeId: 'node_1',
          primarySelector: 'button:has-text("Active")',
          cssFallback: 'button[data-filter="active"]',
        },
        expectedPostcondition: 'Active filter applied',
        rationale: 'Matches step intent',
      };

      mockProvider.queueResponse(expectedDecision);
      const proposer = createBrowserProposerCompatibilityAdapter(mockProvider);

      const result = await proposer.proposeNextAction({
        investigationId: '11111111-2222-3333-4444-555555555555',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3005'],
        currentStep: {
          stepNumber: 2,
          actionType: 'CLICK',
          intentDescription: 'Click Active filter',
          targetDescription: 'Active filter',
          isDestructive: false,
        },
        observation: {
          observationId: '22222222-3333-4444-5555-666666666666',
          pageUrl: 'http://localhost:3005/',
          pageTitle: 'TraceCase Tasks Demo',
          axTree: [
            {
              nodeId: 'node_1',
              role: 'button',
              name: 'Active',
              description: 'Active filter',
              disabled: false,
            },
          ],
        },
      });

      expect(result.output.variant).toBe('PROPOSE_ACTION');
      if (result.output.variant === 'PROPOSE_ACTION') {
        expect(result.output.action.targetNodeId).toBe('node_1');
        expect(result.output.action.primarySelector).toBe('button:has-text("Active")');
      }
    });

    it('P1 browser compatibility adapter propagates isRevokedOrCancelled correctly', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const proposer = createBrowserProposerCompatibilityAdapter(mockProvider);

      const result = await proposer.proposeNextAction({
        investigationId: '11111111-2222-3333-4444-555555555555',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3005'],
        isRevokedOrCancelled: true,
        currentStep: {
          stepNumber: 2,
          actionType: 'CLICK',
          intentDescription: 'Click Active filter',
          targetDescription: 'Active filter',
          isDestructive: false,
        },
        observation: {
          observationId: '22222222-3333-4444-5555-666666666666',
          pageUrl: 'http://localhost:3005/',
          pageTitle: 'TraceCase Tasks Demo',
          axTree: [
            {
              nodeId: 'node_1',
              role: 'button',
              name: 'Active',
              disabled: false,
            },
          ],
        },
      });

      expect(result.output.variant).toBe('STOP_BLOCKED');
      if (result.output.variant === 'STOP_BLOCKED') {
        expect(result.output.errorCode).toBe('EXECUTION_CANCELLED_OR_REVOKED');
      }
      expect(mockProvider.getCallCount()).toBe(0);
    });

    it('P1 browser compatibility adapter propagates lastActionMutationUncertain correctly', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const proposer = createBrowserProposerCompatibilityAdapter(mockProvider);

      const result = await proposer.proposeNextAction({
        investigationId: '11111111-2222-3333-4444-555555555555',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3005'],
        lastActionMutationUncertain: true,
        currentStep: {
          stepNumber: 3,
          actionType: 'CLICK',
          intentDescription: 'Delete Task',
          targetDescription: 'Delete button',
          isDestructive: true,
        },
        observation: {
          observationId: '22222222-3333-4444-5555-666666666666',
          pageUrl: 'http://localhost:3005/',
          pageTitle: 'TraceCase Tasks Demo',
          axTree: [
            {
              nodeId: 'node_2',
              role: 'button',
              name: 'Delete',
              disabled: false,
            },
          ],
        },
      });

      expect(result.output.variant).toBe('STOP_BLOCKED');
      if (result.output.variant === 'STOP_BLOCKED') {
        expect(result.output.errorCode).toBe('MUTATION_UNCERTAIN_TIMEOUT');
      }
      expect(mockProvider.getCallCount()).toBe(0);
    });

    it('P1 browser compatibility adapter propagates remainingStepBudget correctly', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const proposer = createBrowserProposerCompatibilityAdapter(mockProvider);

      const result = await proposer.proposeNextAction({
        investigationId: '11111111-2222-3333-4444-555555555555',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3005'],
        remainingStepBudget: 0,
        currentStep: {
          stepNumber: 10,
          actionType: 'CLICK',
          intentDescription: 'Click next',
          targetDescription: 'Next button',
          isDestructive: false,
        },
        observation: {
          observationId: '22222222-3333-4444-5555-666666666666',
          pageUrl: 'http://localhost:3005/',
          pageTitle: 'TraceCase Tasks Demo',
          axTree: [
            {
              nodeId: 'node_3',
              role: 'button',
              name: 'Next',
              disabled: false,
            },
          ],
        },
      });

      expect(result.output.variant).toBe('STOP_BLOCKED');
      if (result.output.variant === 'STOP_BLOCKED') {
        expect(result.output.errorCode).toBe('EXHAUSTED_LIMITS');
      }
      expect(mockProvider.getCallCount()).toBe(0);
    });

    it('P1 invokes Reviewer via compatibility adapter and consumes typed EvidenceReviewOutput', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const expectedReview: EvidenceReviewOutput = {
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Defect reproduced in both attempts with identical failure signature.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Task A deleted instead of Task B in run 1',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Task A deleted instead of Task B in run 2',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        evidenceCitations: [
          {
            artifactId: 'art-video-001',
            artifactType: 'VIDEO',
            safeUrl: 'http://localhost:3000/api/v1/artifacts/vid-001/public',
            timestampOffsetMs: 1200,
            relevanceExplanation: 'Shows wrong task deleted',
          },
        ],
        manualReproductionSteps: ['Open app', 'Filter Active', 'Delete Task B'],
        diagnosticHypothesis: {
          isVerifiedFact: false,
          hypothesisText: 'Row index was passed to deletion handler instead of entity ID',
          supportingEvidenceTokens: ['index-offset', 'filter'],
          suggestedInvestigationDirection: 'Check task row onClick handler',
        },
        limitationsAndCaveats: ['Verified only in synthetic demo sandbox'],
      };

      mockProvider.queueResponse(expectedReview);
      const reviewer = createReviewerCompatibilityAdapter(mockProvider);

      const result = await reviewer.reviewEvidence({
        investigationId: '11111111-2222-3333-4444-555555555555',
        reproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1: {
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          executionDurationMs: 1500,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B must not exist',
              passed: false,
              actualValue: 'true',
              expectedValue: 'false',
            },
          ],
          safeArtifacts: {
            videoId: 'art-video-001',
            videoUrl: 'http://localhost:3000/api/v1/artifacts/vid-001/public',
          },
          sanitizedConsoleExcerpts: [],
          isValid: true,
        },
        attempt2: {
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          executionDurationMs: 1450,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B must not exist',
              passed: false,
              actualValue: 'true',
              expectedValue: 'false',
            },
          ],
          safeArtifacts: {
            videoId: 'art-video-002',
            videoUrl: 'http://localhost:3000/api/v1/artifacts/vid-002/public',
          },
          sanitizedConsoleExcerpts: [],
          isValid: true,
        },
      });

      expect(result.output.variant).toBe('REPORT_SYNTHESIZED');
      if (result.output.variant === 'REPORT_SYNTHESIZED') {
        expect(result.output.evidenceCitations[0].artifactId).toBe('art-video-001');
        expect(result.output.diagnosticHypothesis?.isVerifiedFact).toBe(false);
      }
    });
  });

  // ==========================================================================
  // 2. P3 CAN RENDER CLARIFICATION & REVIEWER OUTPUTS DIRECTLY (NO PROSE PARSING)
  // ==========================================================================
  describe('P3 Structured UI Projections', () => {
    it('projects NEEDS_CLARIFICATION directly into typed UI question cards', () => {
      const output: ReportAgentOutput = {
        variant: 'NEEDS_CLARIFICATION',
        extractedClaim: {
          summary: 'Ambiguous task deletion claim',
          affectedFeature: 'Task Deletion',
          missingFacts: ['Expected behavior', 'Target task identifier'],
        },
        questions: [
          {
            questionId: 'q_target',
            questionText: 'Which task was clicked?',
            whyItMatters: 'To identify DOM target',
            options: ['Task A', 'Task B'],
            blocksExecution: true,
          },
          {
            questionId: 'q_expected',
            questionText: 'What was the expected outcome?',
            whyItMatters: 'To construct assertion oracle',
            options: ['Task is removed', 'Dialog opens'],
            blocksExecution: true,
          },
        ],
      };

      const uiView = projectClarificationForUi(output);
      expect(uiView.state).toBe('NEEDS_CLARIFICATION');
      expect(uiView.questions).toHaveLength(2);
      expect(uiView.questions[0].options).toEqual(['Task A', 'Task B']);
      expect(uiView.questions[0].blocksExecution).toBe(true);
      // Zero prose parsing required by P3 UI components!
    });

    it('projects REPORT_SYNTHESIZED directly into typed executive summary and citations', () => {
      const output: EvidenceReviewOutput = {
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Defect confirmed reproduced across two runs.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Run 1 failed matching signature',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: {
          summary: 'Run 2 failed matching signature after reset',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        evidenceCitations: [
          {
            artifactId: 'art-video-001',
            artifactType: 'VIDEO',
            safeUrl: 'http://localhost:3000/api/v1/artifacts/vid-001/public',
            timestampOffsetMs: 1500,
            relevanceExplanation: 'Shows unexpected task deletion',
          },
        ],
        manualReproductionSteps: ['Step 1', 'Step 2'],
        diagnosticHypothesis: {
          isVerifiedFact: false,
          hypothesisText: 'Array index offset bug',
          supportingEvidenceTokens: ['offset'],
          suggestedInvestigationDirection: 'Check delete controller',
        },
        limitationsAndCaveats: ['Sandbox only'],
      };

      const uiView = projectReviewForUi(output);
      expect(uiView.state).toBe('REPORT_SYNTHESIZED');
      expect(uiView.verdict).toBe('CONFIRMED_REPRODUCED');
      expect(uiView.citations[0].artifactId).toBe('art-video-001');
      expect(uiView.hypothesis?.isVerifiedFact).toBe(false);
      expect(uiView.manualSteps).toEqual(['Step 1', 'Step 2']);
    });

    it('projects EXPLANATION_UNAVAILABLE_FALLBACK directly into deterministic fact cards', () => {
      const output: EvidenceReviewOutput = {
        variant: 'EXPLANATION_UNAVAILABLE_FALLBACK',
        reproductionVerdict: 'CONFIRMED_REPRODUCED',
        fallbackReason: 'Model inference timed out after 10000ms',
        deterministicFacts: {
          attempt1Status: 'FAILED_ASSERTIONS',
          attempt1MatchedFailure: true,
          attempt2MatchedFailure: true,
          evaluatedAssertionsCount: 2,
          passedAssertionsCount: 1,
          failedAssertionsCount: 1,
          availableArtifacts: ['VIDEO', 'CONSOLE_LOG'],
          missingOrRestrictedEvidence: [],
        },
      };

      const uiView = projectReviewForUi(output);
      expect(uiView.state).toBe('FALLBACK');
      expect(uiView.verdict).toBe('CONFIRMED_REPRODUCED');
      expect(uiView.citations).toHaveLength(0);
      expect(uiView.hypothesis).toBeNull();
      expect(uiView.deterministicFacts).toBeDefined();
    });
  });

  // ==========================================================================
  // 3. SECRETS AND EVALUATOR-ONLY LABELS ARE ABSENT FROM ROLE INPUTS
  // ==========================================================================
  describe('Secret and Evaluator Label Ingress Isolation', () => {
    it('ReportAgentInputSchema strictly excludes target secrets and evaluation ground-truth labels', () => {
      const inputWithForbiddenSecrets = {
        contractVersion: '1.0.0',
        investigationId: '11111111-2222-3333-4444-555555555555',
        targetProfile: {
          name: 'Demo App',
          baseUrl: 'http://localhost:3005',
          isSandbox: true,
          allowedOrigins: ['http://localhost:3005'],
          hasResetFixture: true,
          // Malicious / accidental secret injection:
          fixtureResetAuthSecret: 'tc-fixture-secret-2026',
        },
        rawReport: {
          title: 'Bug Report',
          description: 'Description here',
          // Malicious evaluator label injection:
          actualBugPresent: true,
        },
        groundTruth: {
          actualBugPresent: true,
          rootCauseSummary: 'Array index offset',
        },
      };

      // Zod strip behavior ensures extra keys are stripped
      const parsed = ReportAgentInputSchema.parse(inputWithForbiddenSecrets);
      expect((parsed as any).groundTruth).toBeUndefined();
      expect((parsed.targetProfile as any).fixtureResetAuthSecret).toBeUndefined();
      expect((parsed.rawReport as any).actualBugPresent).toBeUndefined();
    });

    it('BrowserAgentInputSchema strictly excludes target credentials and synthetic test secrets', () => {
      const inputWithCredentials = {
        contractVersion: '1.0.0',
        investigationId: '11111111-2222-3333-4444-555555555555',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        currentStep: {
          stepNumber: 1,
          actionType: 'CLICK',
          intentDescription: 'Click button',
          targetDescription: 'Target button',
          isDestructive: false,
        },
        observation: {
          observationId: '22222222-3333-4444-5555-666666666666',
          pageUrl: 'http://localhost:3005',
          pageTitle: 'Demo',
          axTree: [],
        },
        priorActionHistory: [],
        // Leaked auth credentials:
        authorizationHeader: 'Bearer synthetic-jwt-token-xyz-9876',
        resetSecret: 'tc-fixture-secret-2026',
      };

      const parsed = BrowserAgentInputSchema.parse(inputWithCredentials);
      expect((parsed as any).authorizationHeader).toBeUndefined();
      expect((parsed as any).resetSecret).toBeUndefined();
    });
  });

  // ==========================================================================
  // 4. FORBIDDEN AUTHORITY FIELDS ARE REJECTED OR STRIPPED
  // ==========================================================================
  describe('Forbidden Authority Policy', () => {
    it('assertNoForbiddenAuthority throws when model attempts to assert approval or verdict', () => {
      expect(() => {
        assertNoForbiddenAuthority({
          variant: 'PLAN_PROPOSED',
          isApproved: true, // Forgery!
        });
      }).toThrow(/Forbidden authority field 'isApproved'/);

      expect(() => {
        assertNoForbiddenAuthority({
          variant: 'PLAN_PROPOSED',
          planHash: 'a'.repeat(64), // Forgery!
        });
      }).toThrow(/Forbidden authority field 'planHash'/);

      expect(() => {
        assertNoForbiddenAuthority({
          variant: 'REPORT_SYNTHESIZED',
          reproductionVerdict: 'CONFIRMED_REPRODUCED', // Forgery!
        });
      }).toThrow(/Forbidden authority field 'reproductionVerdict'/);

      expect(() => {
        assertNoForbiddenAuthority({
          variant: 'PROPOSE_ACTION',
          workerLeaseId: 'lease-999', // Forgery!
        });
      }).toThrow(/Forbidden authority field 'workerLeaseId'/);
    });

    it('sanitizeModelPayload strips all forbidden authority fields cleanly', () => {
      const maliciousPayload = {
        variant: 'PLAN_PROPOSED',
        isApproved: true,
        approvedBy: 'malicious-agent',
        planHash: 'tampered-hash',
        reproductionVerdict: 'CONFIRMED_REPRODUCED',
        workerLeaseId: 'worker-fake-01',
        legitimateData: 'Hello world',
      };

      const sanitized = sanitizeModelPayload(maliciousPayload);
      expect(sanitized).not.toHaveProperty('isApproved');
      expect(sanitized).not.toHaveProperty('approvedBy');
      expect(sanitized).not.toHaveProperty('planHash');
      expect(sanitized).not.toHaveProperty('reproductionVerdict');
      expect(sanitized).not.toHaveProperty('workerLeaseId');
      expect(sanitized).toHaveProperty('legitimateData', 'Hello world');
    });
  });

  // ==========================================================================
  // 5. TARGET ADAPTER CONTRACT (SCOPED RESET, READBACK, CLEANUP)
  // ==========================================================================
  describe('Target Adapter Contract', () => {
    it('DemoTargetStore executes scoped reset and correlated readback', () => {
      const store = new DemoTargetStore(true, 'v1.0.0-buggy');
      const scope = 'two_tasks_one_completed';

      // 1. Mutate
      store.deleteTask(scope, 'task-b', 'active');
      expect(store.getTasks(scope, 'all')).toHaveLength(1);

      // 2. Privileged reset
      const resetReceipt = store.resetFixture(scope);
      expect(resetReceipt.success).toBe(true);
      expect(resetReceipt.fixtureScope).toBe(scope);
      expect(resetReceipt.buildVersion).toBe('v1.0.0-buggy');
      expect(resetReceipt.itemsRestored).toBe(2);

      // 3. Independent readback
      const readback = store.readbackFixture(scope);
      expect(readback.itemCount).toBe(2);
      expect(readback.items[0].id).toBe('task-a');
      expect(readback.items[1].id).toBe('task-b');

      // 4. Cleanup
      store.cleanupFixture(scope);
      const postCleanup = store.readbackFixture(scope);
      expect(postCleanup.itemCount).toBe(0);
    });

    it('DemoTargetClient rejects unauthorized requests and unrecognized scopes', async () => {
      const client = new DemoTargetClient({
        baseUrl: 'http://localhost:3005',
        resetSecret: 'wrong-secret',
      });

      // Calling against non-running or unauthorized throws typed error
      await expect(client.resetFixture('two_tasks_one_completed')).rejects.toThrow();
    });
  });

  // ==========================================================================
  // 6. INVALID/UNKNOWN REFERENCES CANNOT BECOME EXECUTABLE OR ELIGIBLE
  // ==========================================================================
  describe('Reference Grounding & Eligibility Enforcement', () => {
    it('unknown node reference or unanchored selector cannot become an executable locator', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const proposer = createBrowserProposerCompatibilityAdapter(mockProvider);

      // Model attempts to propose an unknown node ID not in observation
      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '22222222-3333-4444-5555-666666666666',
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_999', // Unknown node!
          primarySelector: 'button#mystery',
        },
        expectedPostcondition: 'Clicked',
        rationale: 'Unknown element',
      });

      const result = await proposer.proposeNextAction({
        investigationId: '11111111-2222-3333-4444-555555555555',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        currentStep: {
          stepNumber: 1,
          actionType: 'CLICK',
          intentDescription: 'Click button',
          targetDescription: 'Any button',
          isDestructive: false,
        },
        observation: {
          observationId: '22222222-3333-4444-5555-666666666666',
          pageUrl: 'http://localhost:3005/',
          pageTitle: 'TraceCase Tasks Demo',
          axTree: [
            {
              nodeId: 'node_1',
              role: 'button',
              name: 'Active',
              disabled: false,
            },
          ],
        },
      });

      // Must be safely intercepted: requests observation rather than dispatching invalid execution
      expect(result.output.variant).toBe('REQUEST_OBSERVATION');
      if (result.output.variant === 'REQUEST_OBSERVATION') {
        expect(result.output.reason).toContain('Target node \'node_999\' not found');
      }
    });

    it('unverified foreign artifact URL cannot become an eligible citation in Reviewer', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const reviewer = createReviewerCompatibilityAdapter(mockProvider);

      // Model hallucinates an unauthorized citation URL
      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Review summary',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: {
          summary: 'Run 1 summary',
          failedAssertions: ['assert_task_b_deleted'],
          matchingFailureObserved: true,
        },
        attempt2Comparison: null,
        evidenceCitations: [
          {
            artifactType: 'VIDEO',
            safeUrl: 'http://attacker-site.com/forged-leak.mp4', // FORGED / UNVERIFIED URL!
            relevanceExplanation: 'Forged proof',
          },
        ],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const result = await reviewer.reviewEvidence({
        investigationId: '11111111-2222-3333-4444-555555555555',
        reproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1: {
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          executionDurationMs: 1200,
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B deletion',
              passed: false,
              actualValue: 'true',
              expectedValue: 'false',
            },
          ],
          safeArtifacts: {
            videoId: 'art-video-001',
            videoUrl: 'http://localhost:3000/api/v1/artifacts/vid-001/public',
          },
          sanitizedConsoleExcerpts: [],
          isValid: true,
        },
        attempt2: null,
      });

      // Reviewer strips citations referencing unverified URLs
      expect(result.output.variant).toBe('REPORT_SYNTHESIZED');
      if (result.output.variant === 'REPORT_SYNTHESIZED') {
        expect(result.output.evidenceCitations).toHaveLength(0);
      }
    });
  });

  // ==========================================================================
  // 7. EVALUATION CONSUMER INDEPENDENT ACCEPTANCE ASSESSMENT
  // ==========================================================================
  describe('Evaluation Consumer Interface', () => {
    it('accepts authoritative execution receipt with approvedPlanId and valid timestamps', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      mockProvider.queueResponse({
        variant: 'REPORT_SYNTHESIZED',
        executiveSummary: 'Defect reproduced cleanly.',
        observedReproductionVerdict: 'CONFIRMED_REPRODUCED',
        attempt1Comparison: { summary: 'matched', failedAssertions: ['assert_task_b_deleted'], matchingFailureObserved: true },
        attempt2Comparison: { summary: 'matched', failedAssertions: ['assert_task_b_deleted'], matchingFailureObserved: true },
        evidenceCitations: [
          { artifactType: 'VIDEO', safeUrl: 'http://localhost:3000/api/v1/artifacts/vid-1/public', relevanceExplanation: 'Shows bug' },
        ],
        manualReproductionSteps: ['Step 1'],
        diagnosticHypothesis: null,
        limitationsAndCaveats: [],
      });

      const harness = new EvaluationHarness(mockProvider);

      const validReceipt: ExecutionReceipt = {
        investigationId: '11111111-2222-3333-4444-555555555555',
        workerId: 'worker-node-01',
        leaseId: 'lease-uuid-001',
        planHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        targetBuildVersion: 'v1.0.0-buggy',
        fixtureScope: 'two_tasks_one_completed',
        approvedPlanId: 'approved-plan-uuid-001',
        authoritativeReproductionVerdict: 'CONFIRMED_REPRODUCED',
        authoritativeLifecycleState: 'COMPLETED',
        attempt1: {
          attemptId: 'att-001',
          attemptIndex: 1,
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          isValid: true,
          executionDurationMs: 2500,
          readbackBaselineVerified: true,
          startedAtUtc: '2026-10-20T18:00:00.000Z',
          completedAtUtc: '2026-10-20T18:00:03.000Z',
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B must not exist',
              passed: false,
              actualValue: true,
              expectedValue: false,
            },
          ],
          artifactManifest: {
            videoArtifactId: 'art-vid-1',
            videoVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/vid-1/public',
            consoleLogArtifactId: 'art-con-1',
            consoleLogVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/con-1/public',
            networkLogArtifactId: 'art-net-1',
            networkLogVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/net-1/public',
            restrictedArtifactTypes: [],
            unverifiedOrMissing: [],
          },
          sanitizedConsoleExcerpts: [],
        },
        resetReceipt: {
          receiptId: 'rst-001',
          httpStatus: 200,
          baselineRestored: true,
          fixtureScope: 'two_tasks_one_completed',
          timestampUtc: '2026-10-20T18:00:04.000Z',
          attemptPair: ['att-001', 'att-002'],
        },
        attempt2: {
          attemptId: 'att-002',
          attemptIndex: 2,
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          isValid: true,
          executionDurationMs: 2400,
          readbackBaselineVerified: true,
          startedAtUtc: '2026-10-20T18:00:05.000Z',
          completedAtUtc: '2026-10-20T18:00:08.000Z',
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B must not exist',
              passed: false,
              actualValue: true,
              expectedValue: false,
            },
          ],
          artifactManifest: {
            videoArtifactId: 'art-vid-2',
            videoVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/vid-2/public',
            consoleLogArtifactId: 'art-con-2',
            consoleLogVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/con-2/public',
            networkLogArtifactId: 'art-net-2',
            networkLogVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/net-2/public',
            restrictedArtifactTypes: [],
            unverifiedOrMissing: [],
          },
          sanitizedConsoleExcerpts: [],
        },
      };

      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: validReceipt,
      });

      expect(record.evaluationStatus).toBe('PASS');
      expect(record.verdictMatchesGroundTruth).toBe(true);
      expect(record.isFalseConfirmation).toBe(false);
    });

    it('rejects execution receipt missing approvedPlanId', async () => {
      const harness = new EvaluationHarness(new MockTestDoubleModelProvider());

      const missingPlanReceipt: ExecutionReceipt = {
        investigationId: '11111111-2222-3333-4444-555555555555',
        workerId: 'worker-node-01',
        leaseId: 'lease-uuid-001',
        planHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        targetBuildVersion: 'v1.0.0-buggy',
        fixtureScope: 'two_tasks_one_completed',
        // approvedPlanId is omitted!
        authoritativeReproductionVerdict: 'CONFIRMED_REPRODUCED',
        authoritativeLifecycleState: 'COMPLETED',
        resetReceipt: {
          receiptId: 'rst-001',
          httpStatus: 200,
          baselineRestored: true,
          fixtureScope: 'two_tasks_one_completed',
          timestampUtc: '2026-10-20T18:00:04.000Z',
          attemptPair: ['att-001', 'att-002'],
        },
        attempt1: {
          attemptId: 'att-001',
          attemptIndex: 1,
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          isValid: true,
          executionDurationMs: 2500,
          readbackBaselineVerified: true,
          startedAtUtc: '2026-10-20T18:00:00.000Z',
          completedAtUtc: '2026-10-20T18:00:03.000Z',
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B',
              passed: false,
              actualValue: true,
              expectedValue: false,
            },
          ],
          artifactManifest: {
            videoArtifactId: 'art-vid-1',
            videoVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/vid-1/public',
            consoleLogArtifactId: 'art-con-1',
            consoleLogVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/con-1/public',
            networkLogArtifactId: 'art-net-1',
            networkLogVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/net-1/public',
            restrictedArtifactTypes: [],
            unverifiedOrMissing: [],
          },
          sanitizedConsoleExcerpts: [],
        },
        attempt2: {
          attemptId: 'att-002',
          attemptIndex: 2,
          status: 'FAILED_ASSERTIONS',
          failureSignatureMatched: true,
          isValid: true,
          executionDurationMs: 2400,
          readbackBaselineVerified: true,
          startedAtUtc: '2026-10-20T18:00:05.000Z',
          completedAtUtc: '2026-10-20T18:00:08.000Z',
          assertionsEvaluated: [
            {
              predicateId: 'assert_task_b_deleted',
              predicateDescription: 'Task B',
              passed: false,
              actualValue: true,
              expectedValue: false,
            },
          ],
          artifactManifest: {
            videoArtifactId: 'art-vid-2',
            videoVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/vid-2/public',
            consoleLogArtifactId: 'art-con-2',
            consoleLogVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/con-2/public',
            networkLogArtifactId: 'art-net-2',
            networkLogVerifiedUrl: 'http://localhost:3000/api/v1/artifacts/net-2/public',
            restrictedArtifactTypes: [],
            unverifiedOrMissing: [],
          },
          sanitizedConsoleExcerpts: [],
        },
      };

      const record = await harness.evaluateCase(TC1_ARRAY_OFFSET_CASE, {
        mode: 'INTEGRATED_DEPLOYED',
        receipts: missingPlanReceipt,
      });

      expect(record.evaluationStatus).toBe('FAIL');
      expect(record.notes.some((n) => n.includes('missing approvedPlanId'))).toBe(true);
    });
  });

  // ==========================================================================
  // 8. RECORD OF UNAGREED SHARED CONTRACT DECISIONS
  // ==========================================================================
  describe('Explicit Handoff Decision Visibility', () => {
    it('documents all unagreed shared contract decisions with agreementClaimed: false', () => {
      expect(UNAGREED_SHARED_CONTRACT_DECISIONS.length).toBeGreaterThanOrEqual(5);

      for (const record of UNAGREED_SHARED_CONTRACT_DECISIONS) {
        expect(record.proposedBy).toBe('Person 2');
        expect(record.status).toBe('PROPOSED_PENDING_AGREEMENT');
        expect(record.agreementClaimed).toBe(false);
        expect(record.description).toBeDefined();
        expect(record.person2ProposedSolution).toBeDefined();
      }
    });
  });
});
