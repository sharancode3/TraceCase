import { describe, it, expect } from 'vitest';
import { TOUR_STEPS } from '../src/components/guide/tour-context';

describe('Person 1: Onboarding Tour & Interactive Pitch Walkthrough (Stage P1-2.4)', () => {
  it('defines 12 ordered, structured steps covering the entire pitch journey', () => {
    expect(TOUR_STEPS).toHaveLength(12);

    const stepIds = TOUR_STEPS.map((s) => s.id);
    expect(stepIds).toEqual([
      'step-dashboard-overview',
      'step-dashboard-create',
      'step-dashboard-search-filters',
      'step-nav-to-targets',
      'step-targets-overview',
      'step-targets-catalog',
      'step-nav-to-reports',
      'step-report-target-select',
      'step-report-desc',
      'step-clarification-preview',
      'step-approval-preview',
      'step-evidence-preview',
    ]);
  });

  it('navigates seamlessly across dashboard, targets, and new report pages', () => {
    const dashboardSteps = TOUR_STEPS.filter((s) => s.pageRoute === '/');
    const targetSteps = TOUR_STEPS.filter((s) => s.pageRoute === '/targets');
    const reportSteps = TOUR_STEPS.filter((s) => s.pageRoute === '/investigations/new');

    expect(dashboardSteps.length).toBe(4);
    expect(targetSteps.length).toBe(3);
    expect(reportSteps.length).toBe(5);
  });

  it('guarantees every step points to a real, visible UI target selector', () => {
    for (const step of TOUR_STEPS) {
      expect(step.targetSelector).toBeDefined();
      expect(step.targetSelector?.length).toBeGreaterThan(1);
    }
  });

  it('embodies human-in-the-loop safety without autonomous approvals', () => {
    const approvalStep = TOUR_STEPS.find((s) => s.id === 'step-approval-preview');
    expect(approvalStep).toBeDefined();
    expect(approvalStep?.title).toContain('Human Plan Approval');
    expect(approvalStep?.summary).toContain('final say');
    expect(approvalStep?.keyTakeaway).toContain('human oversight');
  });

  it('explains evidence package truthfully and crisply', () => {
    const evidenceStep = TOUR_STEPS.find((s) => s.id === 'step-evidence-preview');
    expect(evidenceStep).toBeDefined();
    expect(evidenceStep?.summary).toContain('verification');
  });

  it('guarantees zero emojis across all titles, badges, summaries, and takeaways', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
    for (const step of TOUR_STEPS) {
      expect(emojiRegex.test(step.title)).toBe(false);
      expect(emojiRegex.test(step.badge)).toBe(false);
      expect(emojiRegex.test(step.summary)).toBe(false);
      expect(emojiRegex.test(step.explanation)).toBe(false);
      expect(emojiRegex.test(step.keyTakeaway)).toBe(false);

      expect(step.title.length).toBeGreaterThan(5);
      expect(step.badge.length).toBeGreaterThan(3);
      expect(step.summary.length).toBeGreaterThan(10);
      expect(step.explanation.length).toBeGreaterThan(20);
      expect(step.keyTakeaway.length).toBeGreaterThan(10);
    }
  });
});
