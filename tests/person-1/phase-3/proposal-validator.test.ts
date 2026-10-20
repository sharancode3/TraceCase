import { describe, it, expect } from 'vitest';
import { validateExperimentProposal } from '@/server/policy/proposal-validator';
import { ModelExperimentProposal } from '@/contracts/planning';
import { SafeModelTargetContext } from '@/contracts/targets';

describe('P1-03: Proposal Policy Validator', () => {
  const verifiedSandboxTarget: SafeModelTargetContext = {
    targetId: '00000000-0000-4000-8000-000000000001',
    name: 'Verified Demo App',
    baseUrl: 'https://sandbox.app.local',
    allowedOrigins: ['https://sandbox.app.local'],
    isSandboxVerified: true,
    environment: 'demo',
  };

  const productionUnverifiedTarget: SafeModelTargetContext = {
    targetId: '00000000-0000-4000-8000-000000000002',
    name: 'Production Staging App',
    baseUrl: 'https://staging.app.local',
    allowedOrigins: ['https://staging.app.local'],
    isSandboxVerified: false,
    environment: 'staging',
  };

  const validMinimalProposal: ModelExperimentProposal = {
    preconditions: ['Target app is reachable at baseURL', 'User test session is initialized'],
    steps: [
      {
        stepIndex: 0,
        semanticAction: 'Navigate to target dashboard',
        toolKind: 'navigate',
        value: 'https://sandbox.app.local/dashboard',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: 15000,
      },
      {
        stepIndex: 1,
        semanticAction: 'Click create item button',
        toolKind: 'click_button',
        selector: '#create-item-btn',
        tier: 'TIER_2_SAFE_INTERACTION',
        timeoutMs: 10000,
      },
    ],
    expectedCorrectBehavior: 'Item appears in the list after creation',
    reportedFailureSignature: 'Error 500 toast notification appears instead',
    assertions: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'EXPECTED_CORRECT_BEHAVIOR',
        subjectRef: '.item-card',
        operator: 'EXISTS',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'Verify new item card is present in DOM',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'ENTITY_PRESENCE',
        source: 'DOM_ELEMENT',
        purpose: 'REPORTED_FAILURE_SIGNATURE',
        subjectRef: '.error-toast',
        operator: 'EXISTS',
        settlingPoint: 'AFTER_NETWORK_IDLE',
        description: 'Verify error toast is displayed',
      },
    ],
    requiresResetHook: true,
  };

  describe('Tool Allowlist and Action Parameters', () => {
    it('accepts proposal with valid tools and parameters', () => {
      const result = validateExperimentProposal(validMinimalProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects forbidden tool delete_element with clear DOM mutation explanation', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        steps: [
          ...validMinimalProposal.steps,
          {
            stepIndex: 2,
            semanticAction: 'Delete DOM node',
            toolKind: 'delete_element' as any,
            selector: '#unwanted-node',
            tier: 'TIER_3_MUTATING_INTERACTION',
            timeoutMs: 5000,
          },
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('delete_element') && e.includes('DOM element deletion does not reproduce backend data mutations'))).toBe(true);
    });

    it('rejects forbidden tool clear_storage', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        steps: [
          ...validMinimalProposal.steps,
          {
            stepIndex: 2,
            semanticAction: 'Wipe local storage',
            toolKind: 'clear_storage' as any,
            tier: 'TIER_3_MUTATING_INTERACTION',
            timeoutMs: 5000,
          },
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('clear_storage'))).toBe(true);
    });

    it('rejects click action missing selector', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        steps: [
          {
            stepIndex: 0,
            semanticAction: 'Click without target',
            toolKind: 'click_button',
            tier: 'TIER_2_SAFE_INTERACTION',
            timeoutMs: 5000,
          },
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('selector'))).toBe(true);
    });

    it('rejects fill action missing value', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        steps: [
          {
            stepIndex: 0,
            semanticAction: 'Type into input',
            toolKind: 'fill_input',
            selector: '#username',
            tier: 'TIER_2_SAFE_INTERACTION',
            timeoutMs: 5000,
          },
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('requires a non-empty value'))).toBe(true);
    });
  });

  describe('Step Sequence and Timeout Bounds', () => {
    it('rejects non-sequential step indices', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        steps: [
          {
            stepIndex: 0,
            semanticAction: 'Step 0',
            toolKind: 'navigate',
            value: 'https://sandbox.app.local',
            tier: 'TIER_1_READ_ONLY',
            timeoutMs: 5000,
          },
          {
            stepIndex: 3, // gap: should be 1
            semanticAction: 'Step 3',
            toolKind: 'click_button',
            selector: '#btn',
            tier: 'TIER_2_SAFE_INTERACTION',
            timeoutMs: 5000,
          },
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Step index mismatch'))).toBe(true);
    });

    it('rejects step timeout under 1000ms or over 60000ms', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        steps: [
          {
            stepIndex: 0,
            semanticAction: 'Too fast step',
            toolKind: 'navigate',
            value: 'https://sandbox.app.local',
            tier: 'TIER_1_READ_ONLY',
            timeoutMs: 500, // under 1000
          },
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('timeoutMs') && e.includes('between 1000 and 60000 ms'))).toBe(true);
    });
  });

  describe('Typed Assertion Rules and Compatibility Matrix', () => {
    it('rejects MATCHES_REGEX operator due to catastrophic backtracking / unbounded risk', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        assertions: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            kind: 'VALUE_COMPARISON',
            source: 'DOM_TEXT',
            purpose: 'EXPECTED_CORRECT_BEHAVIOR',
            subjectRef: '.user-badge',
            operator: 'MATCHES_REGEX' as any,
            expectedValue: '^([a-z]+)+$',
            settlingPoint: 'AFTER_NETWORK_IDLE',
            description: 'Check username format',
          },
          validMinimalProposal.assertions[1],
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('MATCHES_REGEX') && e.includes('unbounded evaluation risk'))).toBe(true);
    });

    it('rejects hazardous script execution prefixes in expectedValue', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        assertions: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            kind: 'VALUE_COMPARISON',
            source: 'DOM_TEXT',
            purpose: 'EXPECTED_CORRECT_BEHAVIOR',
            subjectRef: '.user-badge',
            operator: 'EQUALS',
            expectedValue: 'javascript:alert(1)',
            settlingPoint: 'AFTER_NETWORK_IDLE',
            description: 'Check badge text',
          },
          validMinimalProposal.assertions[1],
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('hazardous execution prefix'))).toBe(true);
    });

    it('rejects incompatible (kind, source, operator) combinations', () => {
      const invalidProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        assertions: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            kind: 'ENTITY_PRESENCE',
            source: 'CONSOLE_LOG' as any, // incompatible: ENTITY_PRESENCE does not support CONSOLE_LOG source
            purpose: 'EXPECTED_CORRECT_BEHAVIOR',
            subjectRef: 'Error: invalid',
            operator: 'EXISTS',
            settlingPoint: 'AFTER_NETWORK_IDLE',
            description: 'Invalid assertion combination',
          },
          validMinimalProposal.assertions[1],
        ],
      };

      const result = validateExperimentProposal(invalidProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('cannot be observed from source'))).toBe(true);
    });

    it('enforces dual assertion requirement (both EXPECTED_CORRECT_BEHAVIOR and REPORTED_FAILURE_SIGNATURE)', () => {
      const missingFailureSignature: ModelExperimentProposal = {
        ...validMinimalProposal,
        assertions: [validMinimalProposal.assertions[0]], // only EXPECTED_CORRECT_BEHAVIOR
      };

      const result = validateExperimentProposal(missingFailureSignature, verifiedSandboxTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('REPORTED_FAILURE_SIGNATURE'))).toBe(true);
    });
  });

  describe('Sandbox Authority and Action Tier Enforcement', () => {
    it('permits TIER_4_DESTRUCTIVE actions when target has verified sandbox authority', () => {
      const destructiveProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        steps: [
          validMinimalProposal.steps[0],
          {
            stepIndex: 1,
            semanticAction: 'Drop database table via admin UI',
            toolKind: 'click_button',
            selector: '#btn-drop-table',
            tier: 'TIER_4_DESTRUCTIVE',
            timeoutMs: 15000,
          },
        ],
      };

      const result = validateExperimentProposal(destructiveProposal, verifiedSandboxTarget);
      expect(result.isValid).toBe(true);
    });

    it('rejects TIER_4_DESTRUCTIVE actions when target sandbox authority is not verified', () => {
      const destructiveProposal: ModelExperimentProposal = {
        ...validMinimalProposal,
        steps: [
          validMinimalProposal.steps[0],
          {
            stepIndex: 1,
            semanticAction: 'Drop database table via admin UI',
            toolKind: 'click_button',
            selector: '#btn-drop-table',
            tier: 'TIER_4_DESTRUCTIVE',
            timeoutMs: 15000,
          },
        ],
      };

      const result = validateExperimentProposal(destructiveProposal, productionUnverifiedTarget);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('TIER_4_DESTRUCTIVE') && e.includes('unverified'))).toBe(true);
    });
  });
});
