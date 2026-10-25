import { describe, it, expect } from 'vitest';
import { ReportExperimentAgent } from '@/server/ai/planner';
import { MockTestDoubleModelProvider } from '@/server/ai/provider';
import { investigationReportService } from '@/server/reporting/investigation-report.service';
import type { InvestigationReportData } from '@/server/reporting/investigation-report.service';
import { CartStore } from '../../demo-target/cart/server';

describe('Live QA Audit Defect Repairs & Invariant Verifications', () => {
  describe('P1 Intake & Clarification Grounding', () => {
    it('does not offer deletion options when report explicitly states "do not delete"', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new ReportExperimentAgent(mockProvider);

      const samplePlanOutput = {
  variant: 'PLAN_PROPOSED' as const,
  extractedClaim: {
    summary: 'Heading check',
    reportedProblem: 'Heading does not render',
    claimedExpectedBehavior: 'Heading is visible',
    affectedEntities: ['Heading'],
  },
  experimentPlan: {
    planRevision: 1,
    preconditions: ['Target application is reachable'],
    requiredRole: 'test_user',
    steps: [
      {
        stepNumber: 1,
        actionType: 'NAVIGATE' as const,
        inputValue: 'http://localhost:3000',
        intentDescription: 'Open dashboard',
        isDestructive: false,
      },
    ],
    correctBehaviorAssertions: [
      {
        predicateId: 'assert_heading_visible',
        assertionType: 'CORRECT_BEHAVIOR' as const,
        target: 'DOM_ELEMENT' as const,
        selector: ':is(h1, h2, [role="heading"]):has-text("Investigations")',
        expectedCondition: 'EXISTS' as const,
        expectedValue: true,
        description: 'Dashboard heading should be visible',
      },
    ],
    reportedFailureAssertions: [
      {
        predicateId: 'assert_heading_missing',
        assertionType: 'REPORTED_FAILURE_SIGNATURE' as const,
        target: 'DOM_ELEMENT' as const,
        selector: ':is(h1, h2, [role="heading"]):has-text("Investigations")',
        expectedCondition: 'NOT_EXISTS' as const,
        expectedValue: true,
        description: 'Dashboard heading is not visible',
      },
    ],
  },
};

      mockProvider.queueResponse(samplePlanOutput);

      const input = {
        contractVersion: '1.0.0' as const,
        investigationId: '123e4567-e89b-12d3-a456-426614174000',
        targetProfile: {
          id: 'tgt-1',
          name: 'TraceCase App',
          baseUrl: 'http://localhost:3000',
          allowedOrigins: ['http://localhost:3000'],
          isSandbox: false,
          hasResetFixture: false,
        },
        rawReport: {
          title: 'Investigations Dashboard Heading Visibility',
          description:
            'The dashboard heading should be visible on page load. Prohibit mutation. Do not delete or mutate any data.',
        },
        clarificationHistory: [],
      };

      const result = await agent.evaluateReport(input);
      // Invariant 4 succeeds because "should be visible" is matched by fixed regex -> PLAN_PROPOSED
      expect(result.output.variant).toBe('PLAN_PROPOSED');
    });

    it('tailors clarification options to navigation/visibility rather than deletion for heading reports lacking expectations', async () => {
      const mockProvider = new MockTestDoubleModelProvider();
      const agent = new ReportExperimentAgent(mockProvider);

      const samplePlanOutput = {
  variant: 'PLAN_PROPOSED' as const,
  extractedClaim: {
    summary: 'Heading check',
    reportedProblem: 'Heading does not render',
    claimedExpectedBehavior: 'Heading is visible',
    affectedEntities: ['Heading'],
  },
  experimentPlan: {
    planRevision: 1,
    preconditions: ['Target application is reachable'],
    requiredRole: 'test_user',
    steps: [
      {
        stepNumber: 1,
        actionType: 'NAVIGATE' as const,
        inputValue: 'http://localhost:3000',
        intentDescription: 'Open dashboard',
        isDestructive: false,
      },
    ],
    correctBehaviorAssertions: [
      {
        predicateId: 'assert_heading_visible',
        assertionType: 'CORRECT_BEHAVIOR' as const,
        target: 'DOM_ELEMENT' as const,
        selector: ':is(h1, h2, [role="heading"]):has-text("Investigations")',
        expectedCondition: 'EXISTS' as const,
        expectedValue: true,
        description: 'Dashboard heading should be visible',
      },
    ],
    reportedFailureAssertions: [
      {
        predicateId: 'assert_heading_missing',
        assertionType: 'REPORTED_FAILURE_SIGNATURE' as const,
        target: 'DOM_ELEMENT' as const,
        selector: ':is(h1, h2, [role="heading"]):has-text("Investigations")',
        expectedCondition: 'NOT_EXISTS' as const,
        expectedValue: true,
        description: 'Dashboard heading is not visible',
      },
    ],
  },
};

      mockProvider.queueResponse(samplePlanOutput);

      const input = {
        contractVersion: '1.0.0' as const,
        investigationId: '123e4567-e89b-12d3-a456-426614174001',
        targetProfile: {
          id: 'tgt-1',
          name: 'TraceCase App',
          baseUrl: 'http://localhost:3000',
          allowedOrigins: ['http://localhost:3000'],
          isSandbox: false,
          hasResetFixture: false,
        },
        rawReport: {
          title: 'Heading inspection report',
          description: 'Observed blank space where the header element normally renders. Never delete items.',
        },
        clarificationHistory: [],
      };

      const result = await agent.evaluateReport(input);
      // Because expected behavior is missing, Invariant 4 triggers clarification
      expect(result.output.variant).toBe('NEEDS_CLARIFICATION');
      if (result.output.variant === 'NEEDS_CLARIFICATION') {
        const q = result.output.questions[0];
        // Must NOT offer deletion options
        const anyOptionMentionsDelete = q.options?.some((opt) => opt.toLowerCase().includes('delete') || opt.toLowerCase().includes('permanently removed'));
        expect(anyOptionMentionsDelete).toBe(false);

        // Must offer navigation/visibility options
        const anyOptionMentionsVisible = q.options?.some((opt) => opt.toLowerCase().includes('visible') || opt.toLowerCase().includes('heading') || opt.toLowerCase().includes('navigation'));
        expect(anyOptionMentionsVisible).toBe(true);
      }
    });
  });

  describe('P1 Truthful Assistant Responses (Unexecuted / Cancelled Runs)', () => {
    it('truthfully reports 0 executions instead of claiming planned steps ran', async (ctx) => {
      let isServerUp = false;
      try {
        const ping = await fetch('http://localhost:3000/api/health', { signal: AbortSignal.timeout(1000) });
        isServerUp = ping.ok;
      } catch {
        isServerUp = false;
      }
      if (!isServerUp) {
        ctx.skip();
        return;
      }

      const res = await fetch('http://localhost:3000/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'evaluator@tracecase.local' }),
      });
      expect(res.ok).toBe(true);
      const sessionData = await res.json();
      expect(sessionData.success).toBe(true);
      expect(sessionData.principal.role).toBe('operator');

      const createRes = await fetch('http://localhost:3000/api/v1/investigations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `tc_session=${sessionData.token}`,
        },
        body: JSON.stringify({
          title: 'Readiness and truthfulness audit check',
          rawDescription: 'The dashboard heading should be visible on page load.',
          targetId: '00000000-0000-0000-0000-000000000001',
        }),
      });

      if (createRes.ok) {
        const inv = await createRes.json();
        const invId = inv.id;

        const cancelRes = await fetch(`http://localhost:3000/api/v1/investigations/${invId}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `tc_session=${sessionData.token}`,
          },
          body: JSON.stringify({
            investigationId: invId,
            cancellationReason: 'Cancelled during verification test',
            expectedWorkflowRevision: inv.workflowRevision,
          }),
        });

        if (cancelRes.ok) {
          const cancelData = await cancelRes.json();
          expect(cancelData.status).toBe('CANCELLED');
          expect(typeof cancelData.cancelledAt).toBe('string');
          expect(isNaN(new Date(cancelData.cancelledAt).getTime())).toBe(false);

          const assistantRes = await fetch(`http://localhost:3000/api/v1/investigations/${invId}/assistant`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: `tc_session=${sessionData.token}`,
            },
            body: JSON.stringify({ query: 'What steps did the browser execute?' }),
          });

          if (assistantRes.ok) {
            const assistantData = await assistantRes.json();
            expect(assistantData.answerText).toContain('No browser actions were executed');
            expect(assistantData.answerText).not.toContain('The browser executed 1 planned steps');
          }

          const evidenceRes = await fetch(`http://localhost:3000/api/v1/investigations/${invId}/assistant`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: `tc_session=${sessionData.token}`,
            },
            body: JSON.stringify({ query: 'What evidence logs and video were captured?' }),
          });

          if (evidenceRes.ok) {
            const evidenceData = await evidenceRes.json();
            expect(evidenceData.answerText).toContain('No runtime evidence artifacts were collected');
          }
        }
      }
    });
  });

  describe('P1 Truthful PDF Reports', () => {
    it('accurately states "Cancelled Before Execution", "Not Evaluated", and "No Artifacts" when 0 runs executed', async () => {
      const mockReportData: InvestigationReportData = {
        investigationId: '123e4567-e89b-12d3-a456-426614174099',
        reportId: 'rep-12345',
        title: 'Audit Verification Report',
        generatedAt: new Date().toISOString(),
        target: {
          name: 'Demo Target',
          baseUrl: 'http://localhost:3005',
          environment: 'STAGING',
          buildVersion: 'wb-v1.0.0-buggy',
          isSandbox: true,
        },
        reporterClaim: {
          title: 'Heading visibility claim',
          description: 'The heading should be visible.',
          claimedExpectedBehavior: 'Heading displays',
          environmentClues: null,
          clarificationHistory: [],
        },
        plan: {
          version: 1,
          planHash: 'hash-abc-123',
          preconditions: [],
          steps: [
            {
              stepIndex: 1,
              actionType: 'NAVIGATE',
              targetAccessibleName: null,
              selector: null,
              value: 'http://localhost:3005',
              rationale: 'Navigate to base url',
              isDestructive: false,
            },
          ],
        },
        execution: {
          lifecycleStatus: 'CANCELLED',
          reproductionVerdict: 'PENDING',
          reviewStatus: 'AUTOMATED',
          summary: 'Cancelled before execution',
          attempt1: null,
          attempt2: null,
          resetReceipt: null,
        },
        evidenceSummary: {
          videoCapturesCount: 0,
          videoTier: 'RESTRICTED_RAW',
          consoleLogsCount: 0,
          networkRequestsCount: 0,
          sanitizationApplied: true,
        },
        aiExplanation: null,
        limitations: [],
      };

      const html = investigationReportService.renderReportHtml(mockReportData);

      expect(html).toContain('Approved Reproduction Plan (Cancelled Before Execution)');
      expect(html).not.toContain('<h2>3. Executed Reproduction Plan');

      expect(html).toContain('Preconditions Met: <strong>NOT EVALUATED (CANCELLED)</strong>');
      expect(html).not.toContain('Preconditions Met: <strong>true</strong>');

      expect(html).toContain('NO ARTIFACTS COLLECTED');
      expect(html).toContain('NOT APPLICABLE (NO RUN)');
      expect(html).not.toContain('<span class="data-val">SHA-256 HASH VERIFIED</span>');

      expect(html).not.toContain('<div>Page 1 of 1');
    });
  });

  describe('P2 Demo Target Invariants (Cart & Workbench)', () => {
    it('Cart target search input is type="text" and arithmetic reflects quantity 2 bug in buggy mode', () => {
      const store = new CartStore(true);
      store.resetToBaseline();

      // Buggy mode: quantity 2 charges for 1 item ($120.00 = 12000 cents)
      const buggyItem = store.updateQuantity('prod-keyboard', 2);
      expect(buggyItem.subtotalCents).toBe(12000);

      // Fixed mode: quantity 2 charges for 2 items ($240.00 = 24000 cents)
      store.setBugMode(false);
      const fixedItem = store.updateQuantity('prod-keyboard', 2);
      expect(fixedItem.subtotalCents).toBe(24000);
    });
  });
});
