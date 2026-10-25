'use client';

import * as React from 'react';

export interface TourStep {
  id: string;
  pageRoute: string; // The URL route where this step lives
  targetSelector?: string; // CSS selector for spotlight, or undefined for center modal
  title: string;
  badge: string;
  category: string;
  summary: string;
  explanation: string;
  keyTakeaway: string;
  preferredPosition?: 'right' | 'bottom' | 'top' | 'left' | 'center';
  interactivePreviewType?: 'clarification' | 'approval' | 'verification' | 'evidence' | 'complete';
}

export const TOUR_STEPS: TourStep[] = [
  // --- SECTION 1: INVESTIGATION DASHBOARD ---
  {
    id: 'step-dashboard-overview',
    pageRoute: '/',
    targetSelector: '#dashboard-header',
    title: 'Investigations Dashboard',
    badge: 'Step 1 of 12',
    category: 'dashboard',
    summary: 'Track every bug reproduction in real time.',
    explanation:
      'This dashboard is your central overview for all bug reproductions. You can track active runs, see preliminary AI findings, and review verified verdicts at a glance.',
    keyTakeaway: 'Clear visibility into every defect under investigation.',
    preferredPosition: 'bottom',
  },
  {
    id: 'step-dashboard-create',
    pageRoute: '/',
    targetSelector: '#dashboard-create-btn',
    title: 'Create Bug Report',
    badge: 'Step 2 of 12',
    category: 'dashboard',
    summary: 'Start an autonomous defect reproduction.',
    explanation:
      'Clicking this button starts a new bug reproduction. But before we file a bug report, we need to register the web application we want to test.',
    keyTakeaway: 'One click to start reproducing bugs.',
    preferredPosition: 'bottom',
  },
  {
    id: 'step-dashboard-search-filters',
    pageRoute: '/',
    targetSelector: '#dashboard-filter-search-container',
    title: 'Search & Outcome Filters',
    badge: 'Step 3 of 12',
    category: 'dashboard',
    summary: 'Find investigations and filter by outcome.',
    explanation:
      'Use this bar to search past investigations by title, or filter cases by outcome: Confirmed bugs, Clean runs where bugs did not occur, or in-progress runs.',
    keyTakeaway: 'Instant search and outcome isolation.',
    preferredPosition: 'bottom',
  },
  {
    id: 'step-nav-to-targets',
    pageRoute: '/',
    targetSelector: '#nav-targets',
    title: 'Navigate to Target Environments',
    badge: 'Step 4 of 12',
    category: 'navigation',
    summary: 'Open Target Environments from the sidebar.',
    explanation:
      'Before filing a bug, click "Target Environments" in the sidebar. This is where we register and authorize the test application so browser testing stays strictly bounded.',
    keyTakeaway: 'Configure targets in dedicated environment setup.',
    preferredPosition: 'right',
  },

  // --- SECTION 2: TARGET MANAGEMENT ---
  {
    id: 'step-targets-overview',
    pageRoute: '/targets',
    targetSelector: '#target-registration-card',
    title: 'Register Target Application',
    badge: 'Step 5 of 12',
    category: 'targets',
    summary: 'Connect your web application once.',
    explanation:
      'Now that we are in Target Environments, this is where you connect your web app. Simply provide your base URL and permissions. TraceCase guarantees browser automation will never leave the domains you approve.',
    keyTakeaway: 'Guaranteed safe execution within approved boundaries.',
    preferredPosition: 'bottom',
  },
  {
    id: 'step-targets-catalog',
    pageRoute: '/targets',
    targetSelector: '#targets-catalog-section',
    title: 'Active Test Environments',
    badge: 'Step 6 of 12',
    category: 'targets',
    summary: 'Reusable testing profiles and reset hooks.',
    explanation:
      'Your saved test targets and reset hooks are stored here for reuse, so you can test reported bugs without setting up environments each time.',
    keyTakeaway: 'Configure once, reuse across all bug reports.',
    preferredPosition: 'top',
  },
  {
    id: 'step-nav-to-reports',
    pageRoute: '/targets',
    targetSelector: '#nav-new-report',
    title: 'Navigate to Submit Bug Report',
    badge: 'Step 7 of 12',
    category: 'navigation',
    summary: 'Open bug report submission from sidebar.',
    explanation:
      'Now that our test target is registered, we click "Submit Bug Report" in the left navigation sidebar to report the defect.',
    keyTakeaway: 'Direct sidebar access to report intake.',
    preferredPosition: 'right',
  },

  // --- SECTION 3: REPORT INTAKE ---
  {
    id: 'step-report-target-select',
    pageRoute: '/investigations/new',
    targetSelector: '#target-select, #target-select-container',
    title: 'Select Target Application',
    badge: 'Step 8 of 12',
    category: 'reports',
    summary: 'Choose the authorized application to test against.',
    explanation:
      'Select your registered target from the dropdown. TraceCase automatically links its authorized origins and baseline reset endpoint.',
    keyTakeaway: 'Links your target sandbox automatically.',
    preferredPosition: 'bottom',
  },
  {
    id: 'step-report-desc',
    pageRoute: '/investigations/new',
    targetSelector: '#report-desc',
    title: 'Describe the Defect',
    badge: 'Step 9 of 12',
    category: 'reports',
    summary: 'Describe what broke in plain language.',
    explanation:
      'Explain what broke in ordinary language. Even vague descriptions work—no engineering scripts, selectors, or stack traces needed.',
    keyTakeaway: 'Anyone on your team can submit bugs easily.',
    preferredPosition: 'bottom',
  },
  {
    id: 'step-clarification-preview',
    pageRoute: '/investigations/new',
    targetSelector: '#submit-report-btn',
    title: 'Submit Bug Report',
    badge: 'Step 10 of 12',
    category: 'clarification',
    summary: 'Submit to generate an autonomous reproduction plan.',
    explanation:
      'Clicking Submit hands your defect report to the AI agent. If essential details are missing, TraceCase asks quick multiple-choice questions before generating the reproduction plan.',
    keyTakeaway: 'Eliminates wasted test runs by clarifying details upfront.',
    preferredPosition: 'top',
    interactivePreviewType: 'clarification',
  },
  {
    id: 'step-approval-preview',
    pageRoute: '/investigations/new',
    targetSelector: '#workflow-step-approval, #report-intake-card',
    title: 'Human Plan Approval Gate',
    badge: 'Step 11 of 12',
    category: 'approval',
    summary: 'You hold the final say before browser runs.',
    explanation:
      'Before any automated browser actions execute, TraceCase presents the generated plan for your inspection. Browser automation only begins after you inspect and explicitly click Approve.',
    keyTakeaway: 'Complete safety with human oversight.',
    preferredPosition: 'bottom',
    interactivePreviewType: 'approval',
  },
  {
    id: 'step-evidence-preview',
    pageRoute: '/investigations/new',
    targetSelector: '#workflow-step-evidence, #report-intake-card',
    title: 'Autonomous Verification & Evidence',
    badge: 'Step 12 of 12',
    category: 'evidence',
    summary: 'Dual-run verification, video recordings, and network traces.',
    explanation:
      'The agent runs the bug twice across an authenticated baseline reset. Confirmed reproductions include full WebM video replay, console logs, and network traces so developers can fix bugs immediately.',
    keyTakeaway: 'Engineers can fix bugs immediately without asking for repro steps.',
    preferredPosition: 'bottom',
    interactivePreviewType: 'evidence',
  },
];

export * from './first-use-guide-content';

interface TourContextType {
  isPromptOpen: boolean;
  isOpen: boolean;
  currentStep: number;
  totalSteps: number;
  currentStepData: TourStep | null;
  startTour: (fromStep?: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: (completed?: boolean) => void;
  openPrompt: () => void;
  closePrompt: (dontShowAgain?: boolean) => void;
  hasSeenPrompt: boolean;
  hasCompletedTour: boolean;
  // First-use guide & permanent help
  isGuideOpen: boolean;
  guideStep: number;
  openGuide: (step?: number) => void;
  closeGuide: (dontShowAgain?: boolean) => void;
  nextGuideStep: () => void;
  prevGuideStep: () => void;
  // Operator authentication state
  operator: string | null;
  setOperator: (operator: string | null) => void;
}

const TourContext = React.createContext<TourContextType | undefined>(undefined);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [operator, setOperator] = React.useState<string | null>(null);
  const [isPromptOpen, setIsPromptOpen] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [hasSeenPrompt, setHasSeenPrompt] = React.useState(false);
  const [hasCompletedTour, setHasCompletedTour] = React.useState(false);
  const [isGuideOpen, setIsGuideOpen] = React.useState(false);
  const [guideStep, setGuideStep] = React.useState(0);

  // Initialize operator session and auth listener
  React.useEffect(() => {
    let isMounted = true;
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.principal?.email) {
          setOperator(data.principal.email);
        } else if (isMounted) {
          fetch('/api/dev/session')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (isMounted && d?.principal?.email) {
                setOperator(d.principal.email);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    const handleAuthChange = (e: Event) => {
      const custom = e as CustomEvent<{ operator: string | null }>;
      const newOp = custom.detail?.operator || null;
      if (isMounted) {
        setOperator(newOp);
        if (newOp) {
          // As soon as the user signs in, immediately show "Do you want to take a demo?"
          setIsOpen(false);
          setIsPromptOpen(true);
        }
      }
    };
    window.addEventListener('tracecase:auth-state-change', handleAuthChange);

    return () => {
      isMounted = false;
      window.removeEventListener('tracecase:auth-state-change', handleAuthChange);
    };
  }, []);

  // Initialize from localStorage on mount
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const dismissed = localStorage.getItem('tracecase_onboarding_dismissed');
      const completed = localStorage.getItem('tracecase_tour_completed');
      const guideDismissed = localStorage.getItem('tracecase_guide_dismissed');

      if (completed === 'true') {
        setHasCompletedTour(true);
      }
      if (dismissed === 'true' || guideDismissed === 'true') {
        setHasSeenPrompt(true);
      } else {
        const timer = setTimeout(() => {
          setIsPromptOpen(true);
        }, 600);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  // Keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      } else if (e.key === 'ArrowRight') {
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStep]);

  const openPrompt = () => {
    setIsOpen(false);
    setIsPromptOpen(true);
  };

  const closePrompt = (dontShowAgain = false) => {
    setIsPromptOpen(false);
    setHasSeenPrompt(true);
    if (dontShowAgain && typeof window !== 'undefined') {
      try {
        localStorage.setItem('tracecase_onboarding_dismissed', 'true');
      } catch {}
    }
  };

  const startTour = (fromStep = 0) => {
    setIsPromptOpen(false);
    setCurrentStep(Math.max(0, Math.min(fromStep, TOUR_STEPS.length - 1)));
    setIsOpen(true);
  };

  const nextStep = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      skipTour(true);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const skipTour = (completed = false) => {
    setIsOpen(false);
    setIsPromptOpen(false);
    setCurrentStep(0);
    if (completed) {
      setHasCompletedTour(true);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('tracecase_tour_completed', 'true');
          localStorage.setItem('tracecase_onboarding_dismissed', 'true');
        } catch {}
      }
    }
  };

  const openGuide = (step = 0) => {
    setIsPromptOpen(false);
    setIsOpen(false);
    setGuideStep(Math.max(0, Math.min(step, 5)));
    setIsGuideOpen(true);
  };

  const closeGuide = (dontShowAgain = false) => {
    setIsGuideOpen(false);
    if (dontShowAgain && typeof window !== 'undefined') {
      try {
        localStorage.setItem('tracecase_guide_dismissed', 'true');
        localStorage.setItem('tracecase_onboarding_dismissed', 'true');
      } catch {}
    }
  };

  const nextGuideStep = () => {
    if (guideStep < 5) {
      setGuideStep((prev) => prev + 1);
    } else {
      closeGuide(false);
    }
  };

  const prevGuideStep = () => {
    if (guideStep > 0) {
      setGuideStep((prev) => prev - 1);
    }
  };

  const currentStepData = isOpen ? TOUR_STEPS[currentStep] || null : null;

  return (
    <TourContext.Provider
      value={{
        isPromptOpen,
        isOpen,
        currentStep,
        totalSteps: TOUR_STEPS.length,
        currentStepData,
        startTour,
        nextStep,
        prevStep,
        skipTour,
        openPrompt,
        closePrompt,
        hasSeenPrompt,
        hasCompletedTour,
        isGuideOpen,
        guideStep,
        openGuide,
        closeGuide,
        nextGuideStep,
        prevGuideStep,
        operator,
        setOperator,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = React.useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}
