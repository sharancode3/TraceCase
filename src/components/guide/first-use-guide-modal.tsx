'use client';

import * as React from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Target,
  FileText,
  HelpCircle,
  CheckCircle2,
  PlayCircle,
  Activity,
  Info,
  Layers,
} from 'lucide-react';
import { useTour } from './tour-context';
import {
  SIX_STEP_JOURNEY,
  STATUS_DIMENSION_LEGEND,
  STATUS_DIMENSIONS_DIFFERENCE_NOTE,
} from './first-use-guide-content';
import { TraceCaseLogo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';

export function FirstUseGuideModal() {
  const {
    isGuideOpen,
    guideStep,
    closeGuide,
    nextGuideStep,
    prevGuideStep,
    openGuide,
  } = useTour();

  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const [showStatusLegend, setShowStatusLegend] = React.useState(false);

  // Keyboard navigation: Escape closes, ArrowLeft/ArrowRight step through
  React.useEffect(() => {
    if (!isGuideOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGuide(dontShowAgain);
      } else if (e.key === 'ArrowRight') {
        nextGuideStep();
      } else if (e.key === 'ArrowLeft') {
        prevGuideStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGuideOpen, closeGuide, nextGuideStep, prevGuideStep, dontShowAgain]);

  if (!isGuideOpen) return null;

  const currentStep = SIX_STEP_JOURNEY[guideStep] || SIX_STEP_JOURNEY[0];

  const stepIcons = [
    <Target key="target" className="w-4 h-4" />,
    <FileText key="report" className="w-4 h-4" />,
    <HelpCircle key="clarify" className="w-4 h-4" />,
    <CheckCircle2 key="approve" className="w-4 h-4" />,
    <PlayCircle key="start" className="w-4 h-4" />,
    <Activity key="evidence" className="w-4 h-4" />,
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-brand-navy/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-card shadow-2xl border border-lavender-accent/40 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-brand-navy to-brand-deepPurple p-5 sm:p-6 text-white relative shrink-0">
          <button
            onClick={() => closeGuide(dontShowAgain)}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Close guide"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 mb-1.5">
            <div className="w-9 h-9 rounded-control bg-white flex items-center justify-center shadow-md shrink-0">
              <TraceCaseLogo size={22} color="#4767DB" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-lavender-accent">
                Permanent Product Walkthrough
              </span>
              <h1 id="guide-modal-title" className="text-lg sm:text-xl font-bold text-white tracking-tight">
                How to use TraceCase
              </h1>
            </div>
          </div>
          <p className="text-xs text-white/90 leading-relaxed max-w-lg">
            Understand the 6-step reproduction workflow, target boundaries, and evidence model.
          </p>
        </div>

        {/* Step Indicator Tabs */}
        <div
          role="tablist"
          aria-label="Guide Steps"
          className="flex items-center space-x-1 p-2 bg-neutral-surface border-b border-neutral-divider overflow-x-auto shrink-0 select-none"
        >
          {SIX_STEP_JOURNEY.map((s, idx) => {
            const isActive = idx === guideStep;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`guide-panel-${idx}`}
                id={`guide-tab-${idx}`}
                onClick={() => openGuide(idx)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-control text-xs font-medium transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-action ${
                  isActive
                    ? 'bg-white text-cobalt-action font-semibold shadow-xs border border-neutral-divider'
                    : 'text-brand-muted hover:text-brand-navy hover:bg-white/60'
                }`}
              >
                <span>{stepIcons[idx]}</span>
                <span>Step {s.stepNumber}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Body */}
        <div
          id={`guide-panel-${guideStep}`}
          role="tabpanel"
          aria-labelledby={`guide-tab-${guideStep}`}
          className="p-5 sm:p-6 space-y-4 overflow-y-auto min-h-0 text-brand-navy"
        >
          {/* Active Step Details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-lavender-surface text-brand-deepPurple border border-cobalt-action/20">
                Step {currentStep.stepNumber} of 6
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
                {currentStep.exampleBadge}
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-bold text-brand-navy leading-snug">
              {currentStep.title}
            </h2>
            <p className="text-xs font-semibold text-cobalt-action leading-normal">
              {currentStep.shortSummary}
            </p>
            <p className="text-xs text-brand-muted leading-relaxed">
              {currentStep.explanation}
            </p>
          </div>

          {/* Core Boundary Callout: Target vs Server Distinction (Step 1) */}
          {currentStep.serverTargetBoundary && (
            <div className="p-3.5 rounded-control bg-lavender-surface/60 border border-cobalt-action/30 space-y-1 text-xs">
              <div className="flex items-center space-x-1.5 font-bold text-brand-deepPurple">
                <Info className="w-4 h-4 text-cobalt-action shrink-0" />
                <span>Target vs. TraceCase Server Boundary</span>
              </div>
              <p className="text-[11px] leading-relaxed text-brand-navy/90">
                {currentStep.serverTargetBoundary}
              </p>
            </div>
          )}

          {/* Core Boundary Callout: Defect Reproduction vs Patching (Step 6) */}
          {currentStep.reproductionBoundary && (
            <div className="p-3.5 rounded-control bg-emerald-50/70 border border-emerald-300 space-y-1 text-xs">
              <div className="flex items-center space-x-1.5 font-bold text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Reproduction Scope Notice</span>
              </div>
              <p className="text-[11px] leading-relaxed text-emerald-800">
                {currentStep.reproductionBoundary}
              </p>
            </div>
          )}

          {/* Illustrative Example Callout */}
          {currentStep.illustrativeExample && (
            <div className="p-3 rounded-control bg-neutral-surface border border-neutral-divider text-xs space-y-1">
              <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider block">
                Illustrative Configuration Reference
              </span>
              <div className="font-mono text-[11px] text-brand-navy space-y-0.5">
                {currentStep.illustrativeExample.url && (
                  <div>Target URL: {currentStep.illustrativeExample.url}</div>
                )}
                {currentStep.illustrativeExample.buildVersion && (
                  <div>Target Build: {currentStep.illustrativeExample.buildVersion}</div>
                )}
              </div>
            </div>
          )}

          {/* Toggleable 3-Dimension Status Legend */}
          <div className="pt-2 border-t border-neutral-divider/80">
            <button
              type="button"
              onClick={() => setShowStatusLegend(!showStatusLegend)}
              className="flex items-center justify-between w-full py-1 text-xs font-semibold text-cobalt-action hover:underline cursor-pointer"
            >
              <span className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Status Legend: Lifecycle vs. Verdict vs. Evidence</span>
              </span>
              <span className="text-[11px] text-brand-muted">
                {showStatusLegend ? 'Hide Legend' : 'Explain Status Dimensions'}
              </span>
            </button>

            {showStatusLegend && (
              <div className="mt-2.5 p-3.5 rounded-control bg-lavender-subtle/50 border border-lavender-accent/40 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {STATUS_DIMENSION_LEGEND.map((dim) => (
                    <div
                      key={dim.dimension}
                      className="p-2.5 rounded-control bg-white border border-neutral-divider space-y-1"
                    >
                      <span className="font-bold text-xs text-brand-navy block">
                        {dim.title}
                      </span>
                      <p className="text-[11px] text-brand-muted leading-tight">
                        {dim.meaning}
                      </p>
                      <div className="pt-1 text-[10px] font-mono text-cobalt-action">
                        {dim.examples.slice(0, 3).join(', ')}...
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-2 rounded bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 leading-snug">
                  <span className="font-semibold">Key Rule: </span>
                  {STATUS_DIMENSIONS_DIFFERENCE_NOTE}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Controls */}
        <div className="p-4 bg-neutral-surface/60 border-t border-neutral-divider flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <label className="flex items-center space-x-2 text-xs text-brand-muted select-none cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded text-cobalt-action focus:ring-cobalt-action border-neutral-divider"
            />
            <span>Don&apos;t show on startup</span>
          </label>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={guideStep === 0}
              onClick={prevGuideStep}
              className="space-x-1 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </Button>

            {guideStep < SIX_STEP_JOURNEY.length - 1 ? (
              <Button
                type="button"
                variant="primary"
                onClick={nextGuideStep}
                className="space-x-1 text-xs"
              >
                <span>Next Step</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={() => closeGuide(dontShowAgain)}
                className="space-x-1 text-xs"
              >
                <span>Finish Guide</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
