/**
 * Authoritative content for the TraceCase First-Use Guide and Permanent Help.
 * Encapsulates the 6-step reproduction journey, server vs target distinction,
 * status dimension legend, and illustrative example labels.
 */

export interface GuideStep {
  stepNumber: number;
  id: string;
  title: string;
  shortSummary: string;
  explanation: string;
  serverTargetBoundary?: string;
  reproductionBoundary?: string;
  exampleBadge: string;
  illustrativeExample?: {
    url?: string;
    buildVersion?: string;
    actionSample?: string;
  };
}

export const EXAMPLE_WALKTHROUGH_LABEL = 'Walkthrough example — not a live investigation';

export const SIX_STEP_JOURNEY: GuideStep[] = [
  {
    stepNumber: 1,
    id: 'step-1-register-target',
    title: 'Register an authorized test target once',
    shortSummary: 'Define the test boundary, allowed origins, and optional reset fixture.',
    explanation:
      'Connect your test or staging web application by specifying its display name, base URL, and environment. TraceCase records the allowed origins and baseline reset configuration so you can choose this target whenever you file a bug report without re-registering it.',
    serverTargetBoundary:
      'TraceCase does not host or deploy your target. The local demo-target is a separate application running at its own configured URL (e.g., http://localhost:3005). Registering it tells TraceCase which site to test; it does not deploy, build, or start that app.',
    exampleBadge: EXAMPLE_WALKTHROUGH_LABEL,
    illustrativeExample: {
      url: 'http://localhost:3005 (illustrative example URL)',
      buildVersion: 'build-20261023 (illustrative example build)',
    },
  },
  {
    stepNumber: 2,
    id: 'step-2-file-report',
    title: 'File a report against that saved target',
    shortSummary: 'Describe what went wrong in plain language; uncertainty is okay.',
    explanation:
      'Select your saved target and enter a short bug title and description of what went wrong. Expected behavior, reproduction steps, and diagnostic details are optional—TraceCase uses autonomous planning to discover necessary preconditions, so uncertainty in initial intake is completely normal.',
    exampleBadge: EXAMPLE_WALKTHROUGH_LABEL,
  },
  {
    stepNumber: 3,
    id: 'step-3-clarify-details',
    title: 'Answer specific planning questions when needed',
    shortSummary: 'Resolve missing parameters to build a safe, testable reproduction plan.',
    explanation:
      'If critical parameters (such as filter state or user role preconditions) are ambiguous in the bug report, TraceCase asks up to 3 bounded clarification questions with selectable options or free text. These answers prepare the plan—they are not interactive chat asked during execution.',
    exampleBadge: EXAMPLE_WALKTHROUGH_LABEL,
  },
  {
    stepNumber: 4,
    id: 'step-4-approve-plan',
    title: 'Review and explicitly approve the plan',
    shortSummary: 'Inspect proposed browser actions and assertions before automation starts.',
    explanation:
      'You maintain complete human oversight. Before any browser automation executes, review the generated plan version, proposed navigation steps, and deterministic assertions. Browser automation never executes without your explicit human approval.',
    exampleBadge: EXAMPLE_WALKTHROUGH_LABEL,
  },
  {
    stepNumber: 5,
    id: 'step-5-start-investigation',
    title: 'Separately start the bounded investigation',
    shortSummary: 'Admit the approved plan into the execution queue under timeout guards.',
    explanation:
      'Plan approval and execution start are two distinct operations. Clicking Start admits the approved plan into the durable queue where a sandboxed Playwright worker executes the procedure under strict timeout and egress guards.',
    exampleBadge: EXAMPLE_WALKTHROUGH_LABEL,
  },
  {
    stepNumber: 6,
    id: 'step-6-inspect-evidence',
    title: 'Inspect two-attempt outcomes and available evidence',
    shortSummary: 'Dual-run verification across clean baseline reset, capturing video replay and traces.',
    explanation:
      'The browser worker executes the procedure twice across an authenticated baseline reset to eliminate transient flukes. Inspect video replay, console logs, and network traces to confirm reproduction.',
    reproductionBoundary:
      'TraceCase attempts defect reproduction and packages diagnostic evidence. It does not patch, modify, or fix target source code.',
    exampleBadge: EXAMPLE_WALKTHROUGH_LABEL,
  },
];

export interface StatusDimension {
  dimension: string;
  title: string;
  meaning: string;
  examples: string[];
}

export const STATUS_DIMENSION_LEGEND: StatusDimension[] = [
  {
    dimension: 'lifecycle',
    title: 'Lifecycle Status',
    meaning: 'Shows system execution state (INITIALIZED, QUEUED, RUNNING, COMPLETED, CANCELLED). Completed means the execution finished; it does not indicate whether a bug was found.',
    examples: ['INITIALIZED', 'QUEUED', 'RUNNING', 'COMPLETED', 'CANCELLED'],
  },
  {
    dimension: 'verdict',
    title: 'Reproduction Verdict',
    meaning: 'Independent verification finding evaluated deterministically across two attempts (CONFIRMED_REPRODUCED, NOT_REPRODUCED, INCONCLUSIVE). Distinct from lifecycle.',
    examples: ['CONFIRMED_REPRODUCED', 'NOT_REPRODUCED', 'INCONCLUSIVE', 'PENDING'],
  },
  {
    dimension: 'evidence',
    title: 'Evidence Readiness',
    meaning: 'Availability and packaging status of diagnostic artifacts (AVAILABLE, PROCESSING, EMPTY, RESTRICTED). Separates artifact readiness from verdict outcome.',
    examples: ['AVAILABLE', 'PROCESSING', 'EMPTY', 'RESTRICTED'],
  },
];

export const STATUS_DIMENSIONS_DIFFERENCE_NOTE =
  'These three dimensions do not mean the same thing: an investigation can be Completed with verdict Not Reproduced, or Inconclusive with Restricted evidence.';
