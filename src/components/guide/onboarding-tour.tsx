'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ArrowRight,
  ArrowLeft,
  X,
  ShieldCheck,
  CheckCircle2,
  PlayCircle,
  FileVideo,
  Target,
  RefreshCw,
  LogIn,
  AlertCircle,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';
import { useTour, TOUR_STEPS } from './tour-context';
import { TraceCaseLogo } from '@/components/ui/logo';

export function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    isPromptOpen,
    isOpen,
    currentStep,
    totalSteps,
    currentStepData,
    startTour,
    nextStep: contextNextStep,
    prevStep: contextPrevStep,
    skipTour,
    closePrompt,
    openPrompt,
    operator,
    setOperator,
  } = useTour();

  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const [spotlightRect, setSpotlightRect] = React.useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // Sample interactive state for Tour Step (Clarification Preview)
  const [selectedClarifyOption, setSelectedClarifyOption] = React.useState<string | null>('active');

  // Automatic multi-page navigation when tour step belongs to another route
  React.useEffect(() => {
    if (!isOpen || !currentStepData?.pageRoute) return;
    if (typeof window !== 'undefined' && pathname !== currentStepData.pageRoute) {
      router.push(currentStepData.pageRoute);
    }
  }, [isOpen, currentStepData, pathname, router]);

  // Handle step advance with proactive route navigation
  const handleNextStep = () => {
    if (currentStep < totalSteps - 1) {
      const nextStepData = TOUR_STEPS[currentStep + 1];
      if (nextStepData && nextStepData.pageRoute !== pathname) {
        router.push(nextStepData.pageRoute);
      }
      contextNextStep();
    } else {
      skipTour(true);
    }
  };

  // Handle step retreat with proactive route navigation
  const handlePrevStep = () => {
    if (currentStep > 0) {
      const prevStepData = TOUR_STEPS[currentStep - 1];
      if (prevStepData && prevStepData.pageRoute !== pathname) {
        router.push(prevStepData.pageRoute);
      }
      contextPrevStep();
    }
  };

  const [placedSide, setPlacedSide] = React.useState<'bottom' | 'top' | 'right' | 'left'>('bottom');

  // Scroll target element smoothly into view ONCE when switching steps
  React.useEffect(() => {
    if (!isOpen || !currentStepData?.targetSelector) return;

    const scrollTimer = setTimeout(() => {
      const selectors = currentStepData.targetSelector!.split(',').map((s) => s.trim());
      let el: HTMLElement | null = null;
      for (const sel of selectors) {
        const found = document.querySelector(sel);
        if (found instanceof HTMLElement) {
          el = found;
          break;
        }
      }

      if (el) {
        const main = document.querySelector('main');
        if (main) {
          const mainRect = main.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          // Scroll so the element is nicely centered vertically inside main
          const offset = elRect.top - mainRect.top - (mainRect.height / 2) + (elRect.height / 2);
          main.scrollBy({ top: offset, behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 100);

    return () => clearTimeout(scrollTimer);
  }, [isOpen, currentStep, currentStepData, pathname]);

  // Track target element bounding rectangle without fighting user scrolling
  React.useEffect(() => {
    if (!isOpen || !currentStepData) {
      setSpotlightRect(null);
      return;
    }

    let cancelled = false;

    const updateRect = () => {
      if (cancelled) return;
      if (!currentStepData.targetSelector) {
        setSpotlightRect(null);
        return;
      }

      const selectors = currentStepData.targetSelector.split(',').map((s) => s.trim());
      let el: HTMLElement | null = null;
      for (const sel of selectors) {
        const found = document.querySelector(sel);
        if (found instanceof HTMLElement) {
          el = found;
          break;
        }
      }

      if (el) {
        const r = el.getBoundingClientRect();
        const padding = 6;
        setSpotlightRect({
          top: Math.max(0, r.top - padding),
          left: Math.max(0, r.left - padding),
          width: r.width + padding * 2,
          height: r.height + padding * 2,
        });
      }
    };

    updateRect();
    const interval = setInterval(updateRect, 100);
    const stopTimer = setTimeout(() => clearInterval(interval), 3000);

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stopTimer);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isOpen, currentStepData, currentStep, pathname]);

  // Compute tooltip position relative to spotlight with collision avoidance and strict viewport clamping
  const tooltipStyle: React.CSSProperties = React.useMemo(() => {
    const margin = 16;
    const tooltipWidth = 370;
    const tooltipHeight = currentStepData?.interactivePreviewType ? 360 : 180;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    if (!spotlightRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: `${Math.min(520, windowWidth - margin * 2)}px`,
        width: 'calc(100vw - 32px)',
      };
    }

    const spaceBelow = windowHeight - (spotlightRect.top + spotlightRect.height);
    const spaceAbove = spotlightRect.top;
    const spaceRight = windowWidth - (spotlightRect.left + spotlightRect.width);
    const spaceLeft = spotlightRect.left;

    const pref = currentStepData?.preferredPosition || 'bottom';

    let top = 0;
    let left = 0;

    const canPlaceBelow = spaceBelow >= tooltipHeight + margin;
    const canPlaceAbove = spaceAbove >= tooltipHeight + margin;
    const canPlaceRight = spaceRight >= tooltipWidth + margin;
    const canPlaceLeft = spaceLeft >= tooltipWidth + margin;

    const candidates: Array<'bottom' | 'top' | 'right' | 'left'> = [];
    if (pref === 'bottom') candidates.push('bottom', 'top', 'right', 'left');
    else if (pref === 'top') candidates.push('top', 'bottom', 'right', 'left');
    else if (pref === 'right') candidates.push('right', 'left', 'bottom', 'top');
    else candidates.push('left', 'right', 'bottom', 'top');

    let chosenSide: 'bottom' | 'top' | 'right' | 'left' = 'bottom';
    for (const c of candidates) {
      if (c === 'bottom' && canPlaceBelow) { chosenSide = 'bottom'; break; }
      if (c === 'top' && canPlaceAbove) { chosenSide = 'top'; break; }
      if (c === 'right' && canPlaceRight) { chosenSide = 'right'; break; }
      if (c === 'left' && canPlaceLeft) { chosenSide = 'left'; break; }
    }

    // Default to the side with maximum available space if none strictly fit
    if (!canPlaceBelow && !canPlaceAbove && !canPlaceRight && !canPlaceLeft) {
      if (spaceBelow >= spaceAbove && spaceBelow >= spaceRight && spaceBelow >= spaceLeft) {
        chosenSide = 'bottom';
      } else if (spaceAbove >= spaceRight && spaceAbove >= spaceLeft) {
        chosenSide = 'top';
      } else if (spaceRight >= spaceLeft) {
        chosenSide = 'right';
      } else {
        chosenSide = 'left';
      }
    }

    setPlacedSide(chosenSide);

    if (chosenSide === 'bottom') {
      top = spotlightRect.top + spotlightRect.height + 12;
      left = spotlightRect.left + (spotlightRect.width / 2) - (tooltipWidth / 2);
    } else if (chosenSide === 'top') {
      top = spotlightRect.top - tooltipHeight - 12;
      left = spotlightRect.left + (spotlightRect.width / 2) - (tooltipWidth / 2);
    } else if (chosenSide === 'right') {
      left = spotlightRect.left + spotlightRect.width + 12;
      top = spotlightRect.top + (spotlightRect.height / 2) - (tooltipHeight / 2);
    } else {
      left = spotlightRect.left - tooltipWidth - 12;
      top = spotlightRect.top + (spotlightRect.height / 2) - (tooltipHeight / 2);
    }

    // Strict clamping within viewport so card is NEVER cut off
    left = Math.max(margin, Math.min(left, windowWidth - tooltipWidth - margin));
    top = Math.max(margin, Math.min(top, windowHeight - tooltipHeight - margin));

    return {
      top: `${top}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: `${Math.min(windowHeight - margin * 2, 500)}px`,
    };
  }, [spotlightRect, currentStepData]);

  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const handleDevSignIn = async () => {
    setIsSigningIn(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'operator@tracecase.local', role: 'operator' }),
      });
      if (res.ok) {
        const json = await res.json();
        const email = json.principal?.email || 'operator@tracecase.local';
        setOperator(email);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tracecase:auth-state-change', { detail: { operator: email } }));
        }
        openPrompt();
      }
    } catch {
      // Best-effort dev login
    } finally {
      setIsSigningIn(false);
    }
  };

  // --------------------------------------------------------------------------
  // 1. INITIAL POP-UP MODAL (SIGN IN IF NOT AUTHENTICATED, DEMO PROMPT IF SIGNED IN)
  // --------------------------------------------------------------------------
  if (isPromptOpen) {
    if (!operator) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/65 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-modal-title"
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-lavender-accent/40 overflow-hidden flex flex-col"
          >
            {/* Header Bar */}
            <div className="bg-gradient-to-r from-brand-navy to-brand-deepPurple p-5 text-white relative">
              <button
                onClick={() => closePrompt(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-md shrink-0">
                  <TraceCaseLogo size={24} color="#4767DB" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-lavender-accent">
                    Authentication Required
                  </span>
                  <h2 id="setup-modal-title" className="text-lg font-bold text-white tracking-tight">
                    Sign In for the Demo
                  </h2>
                </div>
              </div>
              <p className="text-xs text-white/90 leading-relaxed mt-1">
                Please sign in with your local operator credentials to take the interactive demo and run autonomous bug reproductions.
              </p>
            </div>

            {/* Caution Callout */}
            <div className="p-5">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950 space-y-1">
                  <strong className="font-semibold text-amber-900">Operator Sign-In Required</strong>
                  <p className="text-amber-800 leading-relaxed">
                    TraceCase runs verified browser automation inside authorized sandboxes. Signing in grants local operator permissions to explore the full defect reproduction demo.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Controls */}
            <div className="p-4 bg-neutral-surface/40 border-t border-neutral-divider/80 flex items-center justify-end gap-2">
              <button
                onClick={handleDevSignIn}
                disabled={isSigningIn}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold bg-cobalt-action hover:bg-cobalt-hover text-white rounded-xl shadow-sm flex items-center justify-center space-x-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{isSigningIn ? 'Signing in...' : 'Sign In'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/65 backdrop-blur-xs">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-modal-title"
          className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-lavender-accent/40 overflow-hidden flex flex-col"
        >
          {/* Header Bar */}
          <div className="bg-gradient-to-r from-brand-navy to-brand-deepPurple p-5 text-white relative">
            <button
              onClick={() => closePrompt(dontShowAgain)}
              className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-3 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-md shrink-0">
                <TraceCaseLogo size={24} color="#4767DB" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-lavender-accent">
                  Welcome to TraceCase
                </span>
                <h2 id="tour-modal-title" className="text-lg font-bold text-white tracking-tight">
                  Do you want to take a demo?
                </h2>
              </div>
            </div>
            <p className="text-xs text-white/90 leading-relaxed">
              Take a quick 2-minute walkthrough to see how TraceCase autonomously reproduces bugs, captures video evidence, and keeps humans in control.
            </p>
          </div>

          {/* Body Content */}
          <div className="p-5 space-y-3">
            <ul className="space-y-2.5 text-xs text-brand-navy py-1">
              <li className="flex items-start space-x-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong className="text-brand-navy font-semibold">Authorized Sandboxes:</strong>{' '}
                  <span className="text-brand-muted">Automated runs only occur within domains you register.</span>
                </div>
              </li>

              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-cobalt-action shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong className="text-brand-navy font-semibold">Human Approval Gate:</strong>{' '}
                  <span className="text-brand-muted">Inspect and approve proposed actions before any browser automation starts.</span>
                </div>
              </li>

              <li className="flex items-start space-x-2.5">
                <RefreshCw className="w-4 h-4 text-brand-deepPurple shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong className="text-brand-navy font-semibold">Verified Evidence:</strong>{' '}
                  <span className="text-brand-muted">Full WebM video replay, console logs, and network traces.</span>
                </div>
              </li>
            </ul>

            <label className="flex items-center space-x-2 cursor-pointer pt-1 text-xs text-brand-muted select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 rounded text-cobalt-action focus:ring-cobalt-action border-neutral-divider"
              />
              <span>Don&apos;t show this message on startup</span>
            </label>
          </div>

          {/* Footer Controls */}
          <div className="p-4 bg-neutral-surface/40 border-t border-neutral-divider/80 flex items-center justify-between gap-2">
            <button
              onClick={() => closePrompt(dontShowAgain)}
              className="px-4 py-2 text-xs font-semibold text-brand-muted hover:text-brand-navy hover:bg-neutral-surface rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (dontShowAgain && typeof window !== 'undefined') {
                  try {
                    localStorage.setItem('tracecase_onboarding_dismissed', 'true');
                  } catch {}
                }
                startTour(0);
              }}
              className="px-5 py-2 text-xs font-semibold bg-cobalt-action hover:bg-cobalt-hover text-white rounded-xl shadow-sm flex items-center space-x-1.5 transition-all transform active:scale-95 cursor-pointer"
            >
              <span>Take Demo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // 2. INTERACTIVE SPOTLIGHT TOUR (ALWAYS HIGHLIGHTS AND POINTS)
  // --------------------------------------------------------------------------
  if (!isOpen || !currentStepData) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-auto">
      {/* Steady Dark Overlay using SVG Mask Cutout */}
      <svg className="fixed inset-0 w-full h-full z-40 pointer-events-none">
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.left}
                y={spotlightRect.top}
                width={spotlightRect.width}
                height={spotlightRect.height}
                rx="6"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.65)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Visible Target Outline Ring with Animation Pulse */}
      {spotlightRect && (
        <div
          style={{
            top: `${spotlightRect.top}px`,
            left: `${spotlightRect.left}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
          }}
          className="fixed rounded-control ring-3 ring-cobalt-action pointer-events-none z-50 animate-pulse shadow-lg"
        />
      )}

      {/* Floating Tour Tooltip Card */}
      <div
        style={tooltipStyle}
        className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-lavender-accent/60 overflow-visible flex flex-col"
      >
        {/* Directional Pointer Arrow connecting Tooltip to Spotlight Target */}
        {spotlightRect && placedSide === 'top' && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-lavender-subtle/50 border-b border-r border-lavender-accent/60 rotate-45 pointer-events-none z-10" />
        )}
        {spotlightRect && placedSide === 'bottom' && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-lavender-subtle border-t border-l border-lavender-accent/60 rotate-45 pointer-events-none z-10" />
        )}
        {spotlightRect && placedSide === 'left' && (
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-t border-r border-lavender-accent/60 rotate-45 pointer-events-none z-10" />
        )}
        {spotlightRect && placedSide === 'right' && (
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-b border-l border-lavender-accent/60 rotate-45 pointer-events-none z-10" />
        )}

        {/* Inner Container with strict rounded-2xl overflow-hidden so all 4 corners are clipped identically */}
        <div className="w-full h-full rounded-2xl overflow-hidden flex flex-col bg-white">
          {/* Card Header: Step Badge + Title + Close 'X' Button */}
          <div className="bg-lavender-subtle px-4 py-2.5 border-b border-lavender-accent/40 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cobalt-action text-white">
              {currentStepData.badge}
            </span>
            <h3 className="text-xs font-bold text-brand-navy">
              {currentStepData.title}
            </h3>
          </div>
          <button
            onClick={() => skipTour(false)}
            className="text-brand-muted hover:text-brand-navy p-1 rounded-full hover:bg-neutral-surface transition-colors cursor-pointer"
            title="Exit Tour"
            aria-label="Close demo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card Content - Single crisp paragraph, zero duplicates */}
        <div className="p-4 space-y-3 flex-1 overflow-y-auto min-h-0 relative z-20">
          <p className="text-xs text-brand-navy leading-relaxed">
            {currentStepData.explanation}
          </p>

          {/* Interactive Step Previews on Steps 10, 11, 12 */}
          {currentStepData.interactivePreviewType === 'clarification' && (
            <div className="p-3 rounded-control bg-lavender-surface/50 border border-lavender-accent/50 space-y-2">
              <div className="flex items-center space-x-2 text-[11px] font-bold text-cobalt-action">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Example Targeted Clarification</span>
              </div>
              <p className="text-[11px] text-brand-navy font-medium">
                &ldquo;Which work queue filter state was active when the item deletion failed?&rdquo;
              </p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {['all (No filter)', 'active (Active queue)', 'completed (Completed)'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelectedClarifyOption(opt)}
                    className={`px-2 py-0.5 text-[11px] rounded-control border transition-all cursor-pointer ${
                      selectedClarifyOption === opt
                        ? 'bg-cobalt-action text-white border-cobalt-action font-semibold shadow-xs'
                        : 'bg-white text-brand-navy border-neutral-divider hover:border-cobalt-action'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStepData.interactivePreviewType === 'approval' && (
            <div className="p-3 rounded-control bg-emerald-50 border border-emerald-200/80 space-y-2">
              <div className="flex items-center space-x-2 text-[11px] font-bold text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Human-in-the-Loop Oversight</span>
              </div>
              <div className="text-[11px] text-emerald-950 space-y-1.5 leading-relaxed">
                <div className="bg-white/90 p-2 rounded border border-emerald-200 text-xs space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center">1</span>
                    <span>Open Target Web Application</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center">2</span>
                    <span>Execute reported user actions</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center">3</span>
                    <span>Verify defect symptoms deterministically</span>
                  </div>
                </div>
                <div className="text-[10px] text-emerald-800 font-semibold flex items-center space-x-1.5 pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Execution only proceeds after your explicit approval</span>
                </div>
              </div>
            </div>
          )}

          {currentStepData.interactivePreviewType === 'evidence' && (
            <div className="p-2.5 rounded-control bg-lavender-surface/60 border border-lavender-accent/40 text-[11px] space-y-1.5">
              <div className="font-bold text-cobalt-action flex items-center space-x-1.5">
                <FileVideo className="w-3.5 h-3.5" />
                <span>Captured Evidence Bundle</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px] text-brand-navy">
                <div className="bg-white p-1.5 rounded border border-neutral-divider flex flex-col items-center text-center">
                  <PlayCircle className="w-3.5 h-3.5 text-cobalt-action mb-0.5" />
                  <span className="font-semibold">WebM Video</span>
                  <span className="text-[9px] text-brand-muted">Replay</span>
                </div>
                <div className="bg-white p-1.5 rounded border border-neutral-divider flex flex-col items-center text-center">
                  <span className="font-bold text-amber-600 text-[10px]">LOGS</span>
                  <span className="font-semibold">Console</span>
                  <span className="text-[9px] text-brand-muted">Errors</span>
                </div>
                <div className="bg-white p-1.5 rounded border border-neutral-divider flex flex-col items-center text-center">
                  <span className="font-bold text-emerald-600 text-[10px]">NET</span>
                  <span className="font-semibold">Network</span>
                  <span className="text-[9px] text-brand-muted">HAR</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card Footer Navigation */}
        <div className="bg-lavender-subtle/50 px-4 py-2.5 border-t border-lavender-accent/40 flex items-center justify-between shrink-0">
          {/* Step Progress Dots */}
          <div className="flex items-center space-x-1.5">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentStep ? 'w-4 bg-cobalt-action' : 'bg-neutral-divider'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevStep}
              disabled={currentStep === 0}
              className="px-3 py-1.5 text-xs font-semibold text-brand-navy disabled:opacity-30 hover:bg-white rounded-control border border-transparent hover:border-neutral-divider transition-all flex items-center space-x-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            {currentStep < totalSteps - 1 ? (
              <button
                onClick={handleNextStep}
                className="px-4 py-1.5 text-xs font-semibold bg-cobalt-action hover:bg-cobalt-hover text-white rounded-control shadow-sm flex items-center space-x-1.5 transition-all transform active:scale-95 cursor-pointer"
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => skipTour(true)}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-control shadow-sm flex items-center space-x-1.5 transition-all transform active:scale-95 cursor-pointer"
              >
                <span>Finish Tour</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
