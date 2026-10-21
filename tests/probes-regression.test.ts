import { describe, it, expect } from 'vitest';
import { normalizeLocalModelOutput } from '../src/server/ai/provider';
import { ReportAgentOutputSchema } from '../src/server/ai/contracts';
import { BrowserInteractionAgent } from '../src/server/ai/browser-actor';
import { getEligibleArtifacts } from '../src/server/ai/reviewer';
import { pruneObservationAXTree } from '../src/server/ai/observation-pruner';
import { MockTestDoubleModelProvider } from '../src/server/ai/provider';
import type { PrunedAXTreeNode } from '../src/server/ai/contracts';

describe('Person 2 Verification Regression Probes', () => {
  // PROBE 1: Finding 2 — Malformed model output must NOT be manufactured into a valid experiment
  describe('Probe 1: Semantic Fabrication Prevention', () => {
    it('rejects empty experiment plan and does not manufacture missing semantic facts', () => {
      const rawMalformedOutput = {
        variant: 'PLAN_PROPOSED',
        experimentPlan: {},
      };

      const normalized = normalizeLocalModelOutput(rawMalformedOutput);
      const parseResult = ReportAgentOutputSchema.safeParse(normalized);

      // Must FAIL validation rather than inventing steps/claims/assertions
      expect(parseResult.success).toBe(false);
    });

    it('rejects plans with missing steps or assertions instead of synthesizing them', () => {
      const missingSteps = {
        variant: 'PLAN_PROPOSED',
        experimentPlan: {
          experimentId: 'exp-1',
          extractedClaim: 'Bug occurs when deleting task',
          targetEnvironment: 'http://localhost:3000',
          preconditions: [],
          // steps is missing
          failureAssertions: [],
          successAssertions: [],
        },
      };

      const normalized = normalizeLocalModelOutput(missingSteps);
      const parseResult = ReportAgentOutputSchema.safeParse(normalized);
      expect(parseResult.success).toBe(false);
    });
  });

  // PROBE 2: Finding 3 — Stale and ungrounded browser proposals must be rejected
  describe('Probe 2: Stale Correlation and Ungrounded Action Rejection', () => {
    it('returns REQUEST_OBSERVATION when step/observation IDs are stale instead of rewriting them', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      // Queue a proposal with stale IDs
      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 999, // Stale step number (current is 1)
        echoedObservationId: '00000000-0000-0000-0000-000000000000', // Stale obs ID
        action: {
          actionType: 'CLICK',
          primarySelector: '#delete-task-b',
          targetNodeId: 'node_1',
        },
        expectedPostcondition: 'done',
        rationale: 'Stale action proposal',
      });

      const agent = new BrowserInteractionAgent(mockProvider);
      const result = await agent.proposeNextAction({
        contractVersion: '1.0.0',
        investigationId: '11111111-1111-1111-1111-111111111111',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3000'],
        currentStep: {
          stepNumber: 1,
          actionType: 'CLICK',
          intentDescription: 'Click delete button for Task B',
          targetDescription: 'Delete Task B',
          isDestructive: true,
        },
        observation: {
          observationId: '22222222-2222-2222-2222-222222222222',
          pageUrl: 'http://localhost:3000/demo',
          pageTitle: 'Demo App',
          axTree: [
            {
              nodeId: 'node_1',
              role: 'button',
              name: 'Delete Task B',
            },
          ],
        },
        priorActionHistory: [],
      });

      // Must NOT return PROPOSE_ACTION with rewritten IDs; must return REQUEST_OBSERVATION
      expect(result.output.variant).toBe('REQUEST_OBSERVATION');
      if (result.output.variant === 'REQUEST_OBSERVATION') {
        expect(result.output.reason).toContain('Stale correlation rejected');
      }
    });

    it('returns REQUEST_OBSERVATION when element action selector is ungrounded in observed nodes', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      // Queue a proposal with matching IDs but an unobserved selector and no targetNodeId
      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: '22222222-2222-2222-2222-222222222222',
        action: {
          actionType: 'CLICK',
          primarySelector: '#completely-unobserved-button',
        },
        expectedPostcondition: 'done',
        rationale: 'Ungrounded proposal',
      });

      const agent = new BrowserInteractionAgent(mockProvider);
      const result = await agent.proposeNextAction({
        contractVersion: '1.0.0',
        investigationId: '11111111-1111-1111-1111-111111111111',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3000'],
        currentStep: {
          stepNumber: 1,
          actionType: 'CLICK',
          intentDescription: 'Click delete button for Task B',
          targetDescription: 'Delete Task B',
          isDestructive: true,
        },
        observation: {
          observationId: '22222222-2222-2222-2222-222222222222',
          pageUrl: 'http://localhost:3000/demo',
          pageTitle: 'Demo App',
          axTree: [
            {
              nodeId: 'node_1',
              role: 'button',
              name: 'Submit Form',
            },
          ],
        },
        priorActionHistory: [],
      });

      expect(result.output.variant).toBe('REQUEST_OBSERVATION');
      if (result.output.variant === 'REQUEST_OBSERVATION') {
        expect(result.output.reason).toContain('is not grounded in any observed interactive node');
      }
    });
  });

  // PROBE 3: Finding 4 — Restricted artifact references must be consistently excluded on Attempt 2
  describe('Probe 3: Consistent Restricted Artifact Filtering on Attempt 2', () => {
    it('excludes Attempt-2 VIDEO when marked restricted in restrictedArtifactTypes', () => {
      const attempt2WithRestrictedVideo = {
        status: 'PASSED_ASSERTIONS',
        failureSignatureMatched: false,
        executionDurationMs: 2500,
        isValid: true,
        assertionsEvaluated: [],
        safeArtifacts: {
          videoUrl: 'http://storage.local/attempt2-video.webm',
          consoleLogUrl: 'http://storage.local/attempt2-console.log',
          networkLogUrl: 'http://storage.local/attempt2-network.json',
        },
        restrictedArtifactTypes: ['VIDEO'], // Standard type, not ATTEMPT2_VIDEO
      };

      const result = getEligibleArtifacts(attempt2WithRestrictedVideo);

      // VIDEO must be excluded from eligibleUrls and placed in restrictedList
      expect(result.eligibleUrls).not.toContain('http://storage.local/attempt2-video.webm');
      expect(result.eligibleUrls).toContain('http://storage.local/attempt2-console.log');
      expect(result.eligibleUrls).toContain('http://storage.local/attempt2-network.json');
      expect(result.restrictedList.some((r) => r.includes('VIDEO'))).toBe(true);
    });
  });

  // PROBE 4: Finding 5 — Observation pruning priority scoring must determine retained nodes
  describe('Probe 4: Priority-Aware Observation Pruning', () => {
    it('retains high-priority target entity controls when budget is restricted to maxNodes=1', () => {
      const rawNodes: PrunedAXTreeNode[] = [
        {
          nodeId: 'node_1',
          role: 'StaticText',
          name: 'Welcome to the Task App header',
        },
        {
          nodeId: 'node_2',
          role: 'button',
          name: 'Delete Task B',
        },
      ];

      // With maxNodes = 1 and targetEntityHint = 'Task B', node_2 must be prioritized over node_1
      const result = pruneObservationAXTree(rawNodes, {
        maxNodes: 1,
        targetEntityHint: 'Task B',
      });

      expect(result.prunedNodes).toHaveLength(1);
      expect(result.prunedNodes[0].nodeId).toBe('node_2');
      expect(result.prunedNodes[0].name).toBe('Delete Task B');
      expect(result.originalNodeCount).toBe(2);
      expect(result.prunedNodeCount).toBe(1);
      expect(result.truncatedNodeCount).toBe(1);
    });
  });

  // PROBE 5: Finding 6 — Contradictory selector and node entity matching
  describe('Probe 5: Action Grounding Entity Consistency', () => {
    const validObsId = '11111111-2222-3333-4444-555555555555';

    it('rejects proposal when Task B node ID is paired with Task A selector', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: validObsId,
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_2', // Node 2 is Task B
          primarySelector: 'button[data-task-id="task-a"]', // Contradiction!
        },
        expectedPostcondition: 'done',
        rationale: 'Delete task',
      });

      const agent = new BrowserInteractionAgent(mockProvider);
      const result = await agent.proposeNextAction({
        contractVersion: '1.0.0',
        investigationId: '11111111-1111-1111-1111-111111111111',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3000'],
        currentStep: {
          stepNumber: 1,
          actionType: 'CLICK',
          intentDescription: 'Click delete button for Task B',
          targetDescription: 'Delete Task B',
          isDestructive: true,
        },
        observation: {
          observationId: validObsId,
          pageUrl: 'http://localhost:3000/demo',
          pageTitle: 'Demo App',
          axTree: [
            { nodeId: 'node_1', role: 'button', name: 'Delete Task A', description: 'task-a' },
            { nodeId: 'node_2', role: 'button', name: 'Delete Task B', description: 'task-b' },
          ],
        },
        priorActionHistory: [],
      });

      expect(result.output.variant).toBe('STOP_BLOCKED');
      if (result.output.variant === 'STOP_BLOCKED') {
        expect(result.output.errorCode).toBe('SELECTOR_ENTITY_MISMATCH');
      }
    });

    it('rejects element action proposing non-interactive StaticText control', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: validObsId,
        action: {
          actionType: 'CLICK',
          targetNodeId: 'node_1',
          primarySelector: '.static-text',
        },
        expectedPostcondition: 'done',
        rationale: 'Click text',
      });

      const agent = new BrowserInteractionAgent(mockProvider);
      const result = await agent.proposeNextAction({
        contractVersion: '1.0.0',
        investigationId: '11111111-1111-1111-1111-111111111111',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3000'],
        currentStep: {
          stepNumber: 1,
          actionType: 'CLICK',
          intentDescription: 'Click item',
          targetDescription: 'Static item',
          isDestructive: false,
        },
        observation: {
          observationId: validObsId,
          pageUrl: 'http://localhost:3000/demo',
          pageTitle: 'Demo App',
          axTree: [
            { nodeId: 'node_1', role: 'StaticText', name: 'Static text label' },
          ],
        },
        priorActionHistory: [],
      });

      expect(result.output.variant).toBe('STOP_BLOCKED');
      if (result.output.variant === 'STOP_BLOCKED') {
        expect(result.output.errorCode).toBe('TARGET_NOT_INTERACTIVE');
      }
    });

    it('rejects NAVIGATE action proposing origin outside allowedOrigins', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      mockProvider.queueResponse({
        variant: 'PROPOSE_ACTION',
        echoedStepNumber: 1,
        echoedObservationId: validObsId,
        action: {
          actionType: 'NAVIGATE',
          primarySelector: 'https://attacker.evil.com/login',
        },
        expectedPostcondition: 'done',
        rationale: 'Navigate to site',
      });

      const agent = new BrowserInteractionAgent(mockProvider);
      const result = await agent.proposeNextAction({
        contractVersion: '1.0.0',
        investigationId: '11111111-1111-1111-1111-111111111111',
        attemptIndex: 1,
        approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        allowedOrigins: ['http://localhost:3000'],
        currentStep: {
          stepNumber: 1,
          actionType: 'NAVIGATE',
          intentDescription: 'Navigate to app',
          targetDescription: 'App URL',
          isDestructive: false,
        },
        observation: {
          observationId: validObsId,
          pageUrl: 'http://localhost:3000/demo',
          pageTitle: 'Demo App',
          axTree: [],
        },
        priorActionHistory: [],
      });

      expect(result.output.variant).toBe('STOP_BLOCKED');
      if (result.output.variant === 'STOP_BLOCKED') {
        expect(result.output.errorCode).toBe('FORBIDDEN_ORIGIN_NAVIGATION');
      }
    });
  });

  // PROBE 6: Planner Semantic Assertion Conflict
  describe('Probe 6: Planner Assertion Semantic Integrity', () => {
    it('rejects plans with identical correct and failure conditions under different IDs', async () => {
      const { ReportExperimentAgent } = await import('../src/server/ai/planner');
      const mockProvider = new MockTestDoubleModelProvider();
      mockProvider.queueResponse({
        variant: 'PLAN_PROPOSED',
        extractedClaim: {
          summary: 'Identical assertions test',
          reportedProblem: 'Problem description here',
          claimedExpectedBehavior: 'Expected behavior here',
          affectedEntities: ['Task B'],
        },
        experimentPlan: {
          planRevision: 1,
          preconditions: ['Reset baseline'],
          requiredRole: 'test_user',
          steps: [
            { stepNumber: 1, actionType: 'NAVIGATE', intentDescription: 'Open application', isDestructive: false },
          ],
          correctBehaviorAssertions: [
            {
              predicateId: 'assert_correct_outcome',
              assertionType: 'CORRECT_BEHAVIOR',
              target: 'DOM_ELEMENT',
              selector: '#item-1',
              expectedCondition: 'EXISTS',
              expectedValue: true,
            },
          ],
          reportedFailureAssertions: [
            {
              predicateId: 'assert_failure_outcome', // Different ID
              assertionType: 'REPORTED_FAILURE_SIGNATURE',
              target: 'DOM_ELEMENT',
              selector: '#item-1', // Identical target & condition!
              expectedCondition: 'EXISTS',
              expectedValue: true,
            },
          ],
        },
      });

      const planner = new ReportExperimentAgent(mockProvider);
      await expect(
        planner.evaluateReport({
          contractVersion: '1.0.0',
          investigationId: '11111111-1111-1111-1111-111111111111',
          targetProfile: {
            name: 'App',
            baseUrl: 'http://localhost:3000',
            isSandbox: true,
            allowedOrigins: ['http://localhost:3000'],
            hasResetFixture: true,
          },
          rawReport: {
            title: 'Valid detailed report title',
            description: 'Valid detailed report description with enough characters to pass vague check.',
          },
          clarificationHistory: [],
        })
      ).rejects.toThrow(/share identical verification semantics despite different predicateIds/);
    });
  });

  // PROBE 7: Provider Normalization Integrity
  describe('Probe 7: Provider Normalization Invariants', () => {
    it('rejects conflicting canonical and alias keys with different values', () => {
      const conflictingOutput = {
        variant: 'PLAN_PROPOSED',
        experimentPlan: {
          steps: [{ stepNumber: 1, actionType: 'CLICK', intentDescription: 'canonical step' }],
          actions: [{ stepNumber: 2, actionType: 'NAVIGATE', intentDescription: 'different alias action' }],
        },
      };

      expect(() => normalizeLocalModelOutput(conflictingOutput)).toThrow(/Conflicting canonical 'steps' and alias 'actions'/);
    });

    it('does not coerce invalid string "1junk" or fractional "1.5" into a number', () => {
      const rawWithJunk = {
        variant: 'PLAN_PROPOSED',
        experimentPlan: {
          steps: [{ stepNumber: '1junk', actionType: 'CLICK', intentDescription: 'step' }],
        },
      };

      const norm = normalizeLocalModelOutput(rawWithJunk) as { experimentPlan: { steps: { stepNumber: unknown }[] } };
      // Must remain "1junk" rather than being parsed to 1 by parseInt
      expect(norm.experimentPlan.steps[0].stepNumber).toBe('1junk');
    });
  });
});

