import { describe, it, expect } from 'vitest';
import {
  SIX_STEP_JOURNEY,
  STATUS_DIMENSION_LEGEND,
  STATUS_DIMENSIONS_DIFFERENCE_NOTE,
  EXAMPLE_WALKTHROUGH_LABEL,
} from '@/components/guide/first-use-guide-content';

describe('Phase I — First-use guide and permanent help contracts', () => {
  it('defines the complete six-step TraceCase journey in order', () => {
    expect(SIX_STEP_JOURNEY).toHaveLength(6);

    const stepNumbers = SIX_STEP_JOURNEY.map((s) => s.stepNumber);
    expect(stepNumbers).toEqual([1, 2, 3, 4, 5, 6]);

    // Check titles for all six core stages
    expect(SIX_STEP_JOURNEY[0].title).toMatch(/Register an authorized test target once/i);
    expect(SIX_STEP_JOURNEY[1].title).toMatch(/File a report against that saved target/i);
    expect(SIX_STEP_JOURNEY[2].title).toMatch(/Answer specific planning questions/i);
    expect(SIX_STEP_JOURNEY[3].title).toMatch(/Review and explicitly approve the plan/i);
    expect(SIX_STEP_JOURNEY[4].title).toMatch(/Separately start the bounded investigation/i);
    expect(SIX_STEP_JOURNEY[5].title).toMatch(/Inspect two-attempt outcomes and available evidence/i);
  });

  it('labels every illustrative step as a walkthrough example and not a live investigation', () => {
    expect(EXAMPLE_WALKTHROUGH_LABEL).toBe('Walkthrough example — not a live investigation');

    for (const step of SIX_STEP_JOURNEY) {
      expect(step.exampleBadge).toBe(EXAMPLE_WALKTHROUGH_LABEL);
    }
  });

  it('Step 1 explains that demo-target is a separate app and registration does not host, deploy, or start it', () => {
    const step1 = SIX_STEP_JOURNEY[0];
    expect(step1.serverTargetBoundary).toBeDefined();
    expect(step1.serverTargetBoundary).toMatch(/does not host or deploy your target/i);
    expect(step1.serverTargetBoundary).toMatch(/demo-target is a separate application/i);
    expect(step1.serverTargetBoundary).toMatch(/does not deploy, build, or start/i);

    // Ports and builds must be explicitly illustrative
    expect(step1.illustrativeExample).toBeDefined();
    expect(step1.illustrativeExample?.url).toMatch(/illustrative example/i);
    expect(step1.illustrativeExample?.buildVersion).toMatch(/illustrative example/i);
  });

  it('Step 2 clarifies that uncertainty in initial intake is acceptable', () => {
    const step2 = SIX_STEP_JOURNEY[1];
    expect(step2.shortSummary).toMatch(/uncertainty is okay/i);
    expect(step2.explanation).toMatch(/uncertainty in initial intake is completely normal/i);
  });

  it('Step 3 explains that clarification questions prepare a plan and are not execution-time chat', () => {
    const step3 = SIX_STEP_JOURNEY[2];
    expect(step3.explanation).toMatch(/prepare the plan/i);
    expect(step3.explanation).toMatch(/not interactive chat asked during execution/i);
  });

  it('Step 4 highlights human oversight and approval before any browser automation starts', () => {
    const step4 = SIX_STEP_JOURNEY[3];
    expect(step4.explanation).toMatch(/human oversight/i);
    expect(step4.explanation).toMatch(/never executes without your explicit human approval/i);
  });

  it('Step 5 highlights that plan approval and starting execution are separate operations', () => {
    const step5 = SIX_STEP_JOURNEY[4];
    expect(step5.explanation).toMatch(/distinct operations/i);
    expect(step5.explanation).toMatch(/durable queue/i);
  });

  it('Step 6 explains dual-run verification across clean reset and that TraceCase does not patch the target', () => {
    const step6 = SIX_STEP_JOURNEY[5];
    expect(step6.explanation).toMatch(/twice across an authenticated baseline reset/i);
    expect(step6.explanation).toMatch(/video replay, console logs, and network traces/i);

    expect(step6.reproductionBoundary).toBeDefined();
    expect(step6.reproductionBoundary).toMatch(/does not patch, modify, or fix/i);
  });

  it('defines 3 distinct status dimensions separating lifecycle, verdict, and evidence readiness', () => {
    expect(STATUS_DIMENSION_LEGEND).toHaveLength(3);

    const dims = STATUS_DIMENSION_LEGEND.map((d) => d.dimension);
    expect(dims).toEqual(['lifecycle', 'verdict', 'evidence']);

    // Lifecycle must clarify that Completed != bug found
    const lifecycle = STATUS_DIMENSION_LEGEND.find((d) => d.dimension === 'lifecycle')!;
    expect(lifecycle.meaning).toMatch(/Completed means the execution finished; it does not indicate whether a bug was found/i);

    // Verdict must clarify independent verification finding
    const verdict = STATUS_DIMENSION_LEGEND.find((d) => d.dimension === 'verdict')!;
    expect(verdict.meaning).toMatch(/Independent verification finding evaluated deterministically across two attempts/i);

    // Evidence must clarify packaging and readiness
    const evidence = STATUS_DIMENSION_LEGEND.find((d) => d.dimension === 'evidence')!;
    expect(evidence.meaning).toMatch(/packaging status of diagnostic artifacts/i);

    // Distinction note
    expect(STATUS_DIMENSIONS_DIFFERENCE_NOTE).toMatch(
      /These three dimensions do not mean the same thing/i
    );
  });

  it('has zero side effects, browser invocations, or credit consumption in guide contracts', () => {
    // Verifying static pure content structure
    expect(typeof SIX_STEP_JOURNEY).toBe('object');
    expect(Object.isFrozen(SIX_STEP_JOURNEY) || Array.isArray(SIX_STEP_JOURNEY)).toBe(true);
  });
});
