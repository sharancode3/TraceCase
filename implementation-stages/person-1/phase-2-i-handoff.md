# Person 1 — Phase 2-I Handoff: First-Use Guide and Permanent Help

**Stage:** Phase 2 Stage I (`P1-2.4 / Phase I: First-use guide and permanent help`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Problem Resolved

**Goal:** A first-time user understands the real TraceCase journey, the operational boundary between TraceCase and target applications, and the distinction between lifecycle, verdict, and evidence statuses without operational side effects.

### Core Problems Addressed
1. **Unclear End-to-End Journey:** First-time users previously encountered an interactive tour that spotlighted UI controls without explaining the six sequential stages required to reproduce a defect: target registration, report submission, clarification when needed, plan approval, execution start, and evidence inspection.
2. **Target vs. Server Confusion:** Users often assume TraceCase hosts or starts target applications. The guide explicitly clarifies that `demo-target` is a separate application running at its own configured URL (e.g. `http://localhost:3005`); registration merely authorizes TraceCase to test it without deploying or starting it.
3. **Reproduction vs. Patching Confusion:** Users sometimes expect an automated agent to patch source code. The guide explicitly emphasizes that TraceCase attempts defect reproduction and packages diagnostic evidence; it does *not* modify or fix target source code.
4. **Status Overload:** Users easily conflate lifecycle execution completion (`COMPLETED`) with reproduction success (`CONFIRMED_REPRODUCED`). The guide introduces an authoritative 3-dimension legend separating Lifecycle Completion, Reproduction Verdict, and Evidence Readiness.
5. **Lack of Permanent Help & Disruption:** Interactive tours often vanish once dismissed. "How to use TraceCase" is now permanently discoverable in the navigation sidebar, top header, and dashboard reopen bar, with skip/dismiss preferences stored in `localStorage` without side effects.
6. **No Synthetic Investigations:** Guide interactions never trigger Luna calls, start Playwright jobs, reset targets, consume credits, or inject fake investigations into the dashboard.

---

## 2. Implementation Details

### A. Authoritative Guide Content (`src/components/guide/first-use-guide-content.ts`)
- **Six-Step Reproduction Journey (`SIX_STEP_JOURNEY`):**
  1. `Register an authorized test target once`: Explains target registration once, allowed origins, and clean reset endpoints. Clarifies that the demo-target is a separate application and TraceCase does not host or start it. Provides illustrative URL (`http://localhost:3005`) and build version (`build-20261023`).
  2. `File a report against that saved target`: Explains that describing what went wrong in plain language is sufficient, and that uncertainty in initial intake is completely normal.
  3. `Answer specific planning questions when needed`: Clarifies that up to 3 bounded questions resolve missing parameters for the initial experiment plan, not execution-time chat.
  4. `Review and explicitly approve the plan`: Emphasizes human oversight and explicit approval before any browser automation starts.
  5. `Separately start the bounded investigation`: Explains that plan approval and starting execution are two distinct operations, admitting the approved plan into a durable execution queue under timeout guards.
  6. `Inspect two-attempt outcomes and available evidence`: Explains the dual-run deterministic verification across an authenticated clean baseline reset, capturing video, console logs, and network traces. Clarifies the reproduction scope notice: TraceCase reproduces defects and packages evidence; it does not patch target source code.
- **Walkthrough Stamping:**
  - `EXAMPLE_WALKTHROUGH_LABEL`: Every step is labeled with the badge `"Walkthrough example — not a live investigation"`.
- **Status Dimension Legend (`STATUS_DIMENSION_LEGEND`):**
  - Defines 3 independent dimensions:
    - `lifecycle`: Execution lifecycle state (`INITIALIZED`, `QUEUED`, `RUNNING`, `COMPLETED`, `CANCELLED`). Completed means the test execution finished; it does not indicate whether a bug was found.
    - `verdict`: Reproduction verdict evaluated deterministically across two attempts (`CONFIRMED_REPRODUCED`, `NOT_REPRODUCED`, `INCONCLUSIVE`, `PENDING`).
    - `evidence`: Diagnostic artifact packaging status (`AVAILABLE`, `PROCESSING`, `EMPTY`, `RESTRICTED`).
  - Distinction rule: `STATUS_DIMENSIONS_DIFFERENCE_NOTE` (`"These three dimensions do not mean the same thing: an investigation can be Completed with verdict Not Reproduced, or Inconclusive with Restricted evidence."`).

### B. Walkthrough Modal Component (`src/components/guide/first-use-guide-modal.tsx`)
- **Modal Dialog Semantics:**
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby="guide-modal-title"`.
  - Accessible tablist with `role="tablist"` and `role="tab"` for the 6 steps with corresponding `role="tabpanel"`.
  - Full keyboard accessibility: `Escape` closes the guide, `ArrowRight` advances to the next step, and `ArrowLeft` returns to the previous step.
- **Boundary & Reference Callouts:**
  - Step 1: Target vs. TraceCase Server Boundary alert.
  - Step 6: Defect Reproduction vs. Patching Scope Notice alert.
  - Collapsible 3-Dimension Status Legend explaining Lifecycle, Verdict, and Evidence with distinction warnings.
- **Dismissal Controls:**
  - Close button with optional "Don't show this message on startup" checkbox persisting to `tracecase_guide_dismissed`.

### C. Tour Context Updates (`src/components/guide/tour-context.tsx`)
- Added state and methods:
  - `isGuideOpen: boolean`
  - `guideStep: number`
  - `openGuide: (step?: number) => void`
  - `closeGuide: (dontShowAgain?: boolean) => void`
  - `nextGuideStep: () => void`
  - `prevGuideStep: () => void`
- Preserved existing interactive spotlight tour functionality and test contracts (`TOUR_STEPS`, `startTour`, `skipTour`, `currentStep`, etc.) without regression.

### D. Permanent Navigation Entries
- **Sidebar (`src/components/layout/sidebar.tsx`):**
  - Added permanent `"How to use TraceCase"` button (`id="sidebar-how-to-use-btn"`) with `HelpCircle` icon, calling `openGuide(0)`.
- **Header (`src/components/layout/header.tsx`):**
  - Added desktop header button (`id="header-how-to-use-btn"`) calling `openGuide(0)`.
  - Added mobile menu item (`id="header-mobile-how-to-use-btn"`) calling `openGuide(0)` and closing the mobile drawer.

### E. Dashboard Banner & Reopen Bar (`src/app/page.tsx`)
- **Dismissible & Reopenable Guide Banner:**
  - Default/Dismissed state: Renders a compact reopen strip (`#dashboard-guide-reopen-bar`) with `"Show Overview"` button (`#dashboard-reopen-banner-btn`) and `"Open 6-Step Walkthrough"` button (`#dashboard-open-guide-btn`).
  - Open state: Renders `#dashboard-guide-banner` containing:
    - Core distinction alerts: Target vs. TraceCase Server and Defect Reproduction vs. Patching.
    - 6 clickable mini step cards linking directly to the respective walkthrough step in the modal.
    - 3-Dimension Status Dimension summary and toggle.
    - Dismiss button (`#dashboard-dismiss-guide-btn`) persisting to `localStorage.setItem('tracecase_guide_banner_dismissed', 'true')`.
  - Never injects fake or synthetic investigations into the dashboard list.

### F. Layout Integration (`src/app/layout.tsx`)
- Mounted `<FirstUseGuideModal />` under `<TourProvider>` alongside `<OnboardingTour />`, ensuring modal accessibility across all routes without page-level dependencies.

---

## 3. Verification Report

### A. Implemented
- [x] Compact first-use guide and permanent "How to use TraceCase" entry.
- [x] Clear explanation of all six steps:
  - Register authorized test/staging target once.
  - File a report against that saved target.
  - Answer specific planning questions when needed.
  - Review and explicitly approve the plan.
  - Separately start the bounded investigation.
  - Inspect two-attempt outcomes and available evidence.
- [x] Clear explanation that TraceCase attempts reproduction and packages evidence, and does not patch the target.
- [x] Clear explanation that demo-target is a separate app at its configured URL; registration does not host, deploy, or start it.
- [x] Clearly illustrative ports and builds (`http://localhost:3005`, `build-20261023`).
- [x] Independent explanation of lifecycle completion, reproduction verdict, and evidence readiness.
- [x] Skip/close/reopen behavior using existing preference conventions (`tracecase_guide_banner_dismissed`, `tracecase_guide_dismissed`).
- [x] Accessible semantics (`role="dialog"`, `role="tablist"`, `role="tabpanel"`) and responsive layout.
- [x] Guide interactions trigger zero operational side effects (no Luna, browser workers, jobs, target resets, or credit consumption).
- [x] Explicit label on all examples: `"Walkthrough example — not a live investigation"`.
- [x] Zero synthetic investigations added to dashboard.

### B. Verified
- **Unit & Contract Suite:**
  - `tests/person-1/phase-2/first-use-guide.test.ts` (10/10 passed):
    - Confirms all 6 steps exist with authoritative titles and explanations.
    - Confirms `EXAMPLE_WALKTHROUGH_LABEL` stamped across all steps.
    - Confirms target vs server boundary definitions and illustrative configuration notes.
    - Confirms initial intake uncertainty note.
    - Confirms clarification preparing plan vs execution-time chat.
    - Confirms explicit human approval before browser automation.
    - Confirms distinction between plan approval and queue admission.
    - Confirms dual-run clean reset and defect reproduction vs patching boundary.
    - Confirms 3 independent status dimensions and difference note.
    - Confirms zero operational side effects.
  - `tests/onboarding-tour.test.ts` (6/6 passed):
    - Confirms complete regression safety for the existing onboarding tour contracts.
  - `tests/person-1/phase-2/` (all 12 test files, 101 tests passed):
    - Confirms all Phase 2 suites (registration, selection/reuse, intake resilience, durable save, clarification ordering, grounded planning, honest clarification UI, first-use guide) pass cleanly.
- **Typecheck & Linter:**
  - `npm run typecheck` (`tsc --noEmit`): Passed with exit code 0.
  - `npm run lint` (`next lint`): Passed with zero warnings or errors.

### C. Blocked
- None. Phase I is fully implemented and verified locally.

---

## 4. Required Statement

Browser verification not run, per instruction.
