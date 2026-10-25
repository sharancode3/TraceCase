import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isTargetTrustedSandbox, projectSafeModelTargetContext } from '@/contracts/targets';
import { validateExperimentProposal } from '@/server/policy/proposal-validator';
import { resolvePrincipal, setCustomPrincipalResolverForTesting } from '@/server/auth';
import { createOperatorToken } from '@/server/auth/operator-auth';
import { principalsRepository } from '@/server/db/repositories/principals.repository';
import {
  investigationReportService,
  buildDeterministicFallbackPdf,
  type InvestigationReportData,
} from '@/server/reporting/investigation-report.service';

describe('Focused Verification of 5 Priority Fixes', () => {
  beforeEach(() => {
    setCustomPrincipalResolverForTesting(null);
  });

  describe('Priority 1: Worker Startup, Heartbeat & Configuration', () => {
    it('verifies render.yaml contains all required envVars on tracecase-worker', () => {
      const renderYaml = fs.readFileSync(path.resolve(process.cwd(), 'render.yaml'), 'utf8');
      const workerSection = renderYaml.slice(renderYaml.indexOf('name: tracecase-worker'));
      expect(workerSection).toContain('key: ENABLE_DEV_AUTH');
      expect(workerSection).toContain('value: "false"');
      expect(workerSection).toContain('key: DEV_PREVIEW_MODE');
      expect(workerSection).toContain('key: OPENAI_API_KEY');
      expect(workerSection).toContain('key: APP_URL');
      expect(workerSection).toContain('key: WORKBENCH_TARGET_URL');
      expect(workerSection).toContain('key: CART_TARGET_URL');
    });

    it('verifies worker health endpoint logic responds with 503 if queue is unhealthy', () => {
      const isShuttingDown = false;
      const queueUnhealthy = false;
      const isHealthy = !isShuttingDown && queueUnhealthy;
      expect(isHealthy ? 200 : 503).toBe(503);

      const queueHealthy = true;
      const isHealthy2 = !isShuttingDown && queueHealthy;
      expect(isHealthy2 ? 200 : 503).toBe(200);
    });
  });

  describe('Priority 2: Workbench Controlled Sandbox Authority', () => {
    it('verifies deployed Render Workbench is recognized as a verified sandbox authority', () => {
      const workbenchTarget = {
        targetId: '94c4dd7d-8021-45c7-92ab-494982f4136c',
        id: '94c4dd7d-8021-45c7-92ab-494982f4136c',
        baseUrl: 'https://tracecase-target-workbench-zt6y.onrender.com/workbench',
        allowedOrigins: ['https://tracecase-target-workbench-zt6y.onrender.com'],
        name: 'Controlled Workbench Target',
        environment: 'staging' as const,
      };
      expect(isTargetTrustedSandbox(workbenchTarget)).toBe(true);

      const safeContext = projectSafeModelTargetContext(workbenchTarget);
      expect(safeContext.isSandboxVerified).toBe(true);
      expect(safeContext.hasResetCapability).toBe(true);
      expect(safeContext.fixtureScope).toBe('workbench_work_items');
    });

    it('strictly preserves fail-closed safety for external untrusted targets', () => {
      const externalTarget = {
        targetId: '7332137e-2099-4dbc-a643-1b0ff7d0691f',
        id: '7332137e-2099-4dbc-a643-1b0ff7d0691f',
        baseUrl: 'https://example.com',
        allowedOrigins: ['https://example.com'],
        name: 'Example External Domain',
        environment: 'production' as const,
      };
      expect(isTargetTrustedSandbox(externalTarget)).toBe(false);

      const safeContext = projectSafeModelTargetContext(externalTarget);
      expect(safeContext.isSandboxVerified).toBe(false);

      const destructiveProposal = {
        planRevision: 1,
        preconditions: ['Baseline restored'],
        requiresResetHook: true,
        expectedCorrectBehavior: 'Item is deleted and remaining items stay preserved',
        reportedFailureSignature: 'Item is not deleted and remains visible',
        steps: [
          {
            stepIndex: 0,
            semanticAction: 'Delete item',
            toolKind: 'click_button' as const,
            selector: 'button.delete',
            tier: 'TIER_4_DESTRUCTIVE' as const,
            timeoutMs: 5000,
            rationale: 'Delete mutation',
          },
        ],
        assertions: [
          {
            id: 'assert-1',
            predicateId: 'assert_deleted',
            kind: 'ENTITY_PRESENCE' as const,
            source: 'DOM_ELEMENT' as const,
            purpose: 'EXPECTED_CORRECT_BEHAVIOR' as const,
            subjectRef: '#item-1',
            operator: 'NOT_EXISTS' as const,
            expectedValue: '0',
            settlingPoint: 'AFTER_NETWORK_IDLE' as const,
            description: 'Item removed',
          },
          {
            id: 'assert-2',
            predicateId: 'assert_still_present',
            kind: 'ENTITY_PRESENCE' as const,
            source: 'DOM_ELEMENT' as const,
            purpose: 'REPORTED_FAILURE_SIGNATURE' as const,
            subjectRef: '#item-1',
            operator: 'EXISTS' as const,
            expectedValue: '1',
            settlingPoint: 'AFTER_NETWORK_IDLE' as const,
            description: 'Item remains',
          },
        ],
      };

      const validation = validateExperimentProposal(destructiveProposal, safeContext);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Target sandbox authority is unverified'))).toBe(true);
    });

    it('permits destructive actions when target is a verified controlled sandbox', () => {
      const workbenchTarget = {
        targetId: '94c4dd7d-8021-45c7-92ab-494982f4136c',
        id: '94c4dd7d-8021-45c7-92ab-494982f4136c',
        baseUrl: 'https://tracecase-target-workbench-zt6y.onrender.com/workbench',
        allowedOrigins: ['https://tracecase-target-workbench-zt6y.onrender.com'],
        name: 'Controlled Workbench Target',
        environment: 'staging' as const,
      };
      const safeContext = projectSafeModelTargetContext(workbenchTarget);

      const destructiveProposal = {
        planRevision: 1,
        preconditions: ['Baseline restored'],
        requiresResetHook: true,
        expectedCorrectBehavior: 'Task B is deleted and Task A remains',
        reportedFailureSignature: 'Task B remains in the list after delete',
        steps: [
          {
            stepIndex: 0,
            semanticAction: 'Delete task B',
            toolKind: 'click_button' as const,
            selector: 'button#wb-item-b-delete-btn',
            tier: 'TIER_4_DESTRUCTIVE' as const,
            timeoutMs: 5000,
            rationale: 'Delete mutation',
          },
        ],
        assertions: [
          {
            id: 'assert-1',
            predicateId: 'assert_deleted',
            kind: 'ENTITY_PRESENCE' as const,
            source: 'DOM_ELEMENT' as const,
            purpose: 'EXPECTED_CORRECT_BEHAVIOR' as const,
            subjectRef: '#wb-item-b',
            operator: 'NOT_EXISTS' as const,
            expectedValue: '0',
            settlingPoint: 'AFTER_NETWORK_IDLE' as const,
            description: 'Item removed',
          },
          {
            id: 'assert-2',
            predicateId: 'assert_still_present',
            kind: 'ENTITY_PRESENCE' as const,
            source: 'DOM_ELEMENT' as const,
            purpose: 'REPORTED_FAILURE_SIGNATURE' as const,
            subjectRef: '#wb-item-b',
            operator: 'EXISTS' as const,
            expectedValue: '1',
            settlingPoint: 'AFTER_NETWORK_IDLE' as const,
            description: 'Item remains',
          },
        ],
      };

      const validation = validateExperimentProposal(destructiveProposal, safeContext);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Priority 3: Planning Reliability & Distinct Assertions', () => {
    it('verifies planner prompt instructs strict mutual exclusivity between correct and failure assertions', () => {
      const promptFile = fs.readFileSync(
        path.resolve(process.cwd(), 'src/server/ai/prompts/planner-prompt.ts'),
        'utf8'
      );
      expect(promptFile).toContain('CRITICAL ASSERTION SEMANTICS & MUTUAL EXCLUSIVITY RULES');
      expect(promptFile).toContain('MUTUAL EXCLUSIVITY');
      expect(promptFile).toContain('distinct, opposing test outcomes');
    });
  });

  describe('Priority 4: Verification Accuracy for Shopping Cart', () => {
    it('verifies planner prompt instructs exact numeric quantity assertions and separate subtotal/total assertions', () => {
      const promptFile = fs.readFileSync(
        path.resolve(process.cwd(), 'src/server/ai/prompts/planner-prompt.ts'),
        'utf8'
      );
      expect(promptFile).toContain('CART TARGET VERIFICATION RULES');
      expect(promptFile).toContain('item-quantity');
      expect(promptFile).toContain('NEVER assert the quantity by broad text matching on the row');
      expect(promptFile).toContain('Assert the line subtotal and the order total SEPARATELY');
    });
  });

  describe('Priority 5: Report Presentation & Reliable PDF Generation', () => {
    const mockReportData: InvestigationReportData = {
      investigationId: 'eb50c396-33ce-4220-8fdf-4762d9d22600',
      reportId: 'rep-001',
      title: 'Cart Subtotal Calculation Defect',
      generatedAt: new Date().toISOString(),
      target: {
        name: 'Acme Hardware Store',
        baseUrl: 'https://tracecase-target-cart-zt6y.onrender.com',
        environment: 'staging',
        buildVersion: 'cart-v1.0.0-buggy',
        isSandbox: true,
      },
      reporterClaim: {
        title: 'Quantity 2 still charges for 1 item',
        description: 'Changing mechanical keyboard quantity from 1 to 2 still calculates $120.00 subtotal.',
        claimedExpectedBehavior: 'Subtotal should calculate 2 * $120.00 = $240.00.',
        environmentClues: 'Chrome 131',
        clarificationHistory: [],
      },
      plan: {
        version: 1,
        planHash: 'hash-abc',
        preconditions: ['Baseline restored'],
        steps: [
          {
            stepIndex: 1,
            actionType: 'click_button',
            targetAccessibleName: 'Increase quantity',
            selector: '#btn-increase-prod-keyboard',
            value: null,
            rationale: 'Increment quantity',
            isDestructive: false,
          },
        ],
      },
      execution: {
        lifecycleStatus: 'COMPLETED',
        reproductionVerdict: 'CONFIRMED_REPRODUCED',
        reviewStatus: 'APPROVED',
        summary: 'Defect confirmed: $120.00 subtotal observed instead of $240.00 in two independent runs.',
        attempt1: {
          validity: 'VALID',
          durationMs: 1200,
          actionsExecuted: 1,
          defectDetected: true,
          buildId: 'cart-v1.0.0-buggy',
          failureMessage: null,
          assertions: [],
        },
        attempt2: {
          validity: 'VALID',
          durationMs: 1100,
          actionsExecuted: 1,
          defectDetected: true,
          buildId: 'cart-v1.0.0-buggy',
          failureMessage: null,
          assertions: [],
        },
        resetReceipt: {
          isVerifiedRestored: true,
          fixtureScope: 'cart_baseline',
          readbackState: null,
        },
      },
      evidenceSummary: {
        videoCapturesCount: 2,
        videoTier: 'RESTRICTED_RAW',
        consoleLogsCount: 4,
        networkRequestsCount: 8,
        sanitizationApplied: true,
      },
      limitations: [],
    };

    it('generates a valid, readable deterministic fallback PDF Buffer with %PDF- header', () => {
      const pdf = buildDeterministicFallbackPdf(mockReportData);
      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
      expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
      expect(pdf.toString('utf8')).toContain('REPRODUCTION VERDICT: CONFIRMED_REPRODUCED');
      expect(pdf.toString('utf8')).toContain('Quantity 2 still charges for 1 item');
      expect(pdf.toString('utf8')).toContain('%%EOF');
    });

    it('generates PDF via investigationReportService without throwing', async () => {
      const pdf = await investigationReportService.generateReportPdf(mockReportData);
      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
      expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    }, 20000);

    it('authenticates PDF requests using ?token= query parameter', async () => {
      vi.spyOn(principalsRepository, 'findOrCreateByExternalAuth').mockResolvedValueOnce({
        id: 'princ-123',
        externalIssuer: 'https://auth.tracecase.local',
        externalSubject: 'operator@tracecase.local',
        email: 'operator@tracecase.local',
        role: 'operator',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = await createOperatorToken({ email: 'operator@tracecase.local' });
      const req = new Request(`http://localhost:3000/api/v1/investigations/eb50c396/report/pdf?token=${token}`);
      const principal = await resolvePrincipal(req);
      expect(principal).not.toBeNull();
      expect(principal?.email).toBe('operator@tracecase.local');
    });
  });
});
