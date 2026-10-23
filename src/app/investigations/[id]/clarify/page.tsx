'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  HelpCircle,
  Check,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  fetchClarifications,
  fetchPlan,
  fetchInvestigation,
  answerClarification,
  type ClarificationQuestionItem,
  type PlanDetailResult,
  type InvestigationSnapshot,
  type ApiResponse,
} from '@/features/investigations/api-client';
import { executePlanningTransition } from '@/features/investigations/planning-orchestration';
import {
  groupQuestionsByRound,
  validateClarificationAnswers,
  hasAuthoritativeProposal,
  determineInitialPageState,
  type ClarificationUiStatus,
} from '@/features/investigations/clarification-state';

export default function ClarificationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const isMountedRef = React.useRef(true);

  const [uiStatus, setUiStatus] = React.useState<ClarificationUiStatus>('LOADING');
  const [questions, setQuestions] = React.useState<ClarificationQuestionItem[]>([]);
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [cannotProceedReason, setCannotProceedReason] = React.useState<string | null>(null);
  const [cannotProceedPrereqs, setCannotProceedPrereqs] = React.useState<string[]>([]);
  const [investigationStatus, setInvestigationStatus] = React.useState<string>('PENDING_PLANNING');
  const [verifiedPlan, setVerifiedPlan] = React.useState<{ version: number; planHash: string } | null>(null);

  // Recovery state: true if user answers were persisted but downstream planning failed
  const [answersSavedPlanningFailed, setAnswersSavedPlanningFailed] = React.useState(false);
  const [planningFailureMessage, setPlanningFailureMessage] = React.useState<string | null>(null);
  const [targetId, setTargetId] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setUiStatus('LOADING');
    setErrorMessage(null);
    setAnswersSavedPlanningFailed(false);
    setPlanningFailureMessage(null);

    // Fetch in parallel: clarifications, plan (to check if already proposed), and snapshot
    const [clarificationsRes, planRes, invRes] = await Promise.all([
      fetchClarifications(id),
      fetchPlan(id).catch(() => null as ApiResponse<PlanDetailResult> | null),
      fetchInvestigation(id).catch(() => null as ApiResponse<InvestigationSnapshot> | null),
    ]);

    if (!isMountedRef.current) return;

    const state = determineInitialPageState({
      fetchResult: clarificationsRes,
      planResult: planRes || undefined,
      investigationResult: invRes || undefined,
    });

    if (state.status === 'FETCH_FAILED') {
      setUiStatus('FETCH_FAILED');
      setErrorMessage(state.errorMessage || 'Failed to load clarification questions.');
      return;
    }

    if (state.status === 'PROPOSAL_READY' && state.planVersion && state.planHash) {
      setVerifiedPlan({ version: state.planVersion, planHash: state.planHash });
      setUiStatus('PROPOSAL_READY');
      return;
    }

    if (invRes?.success && invRes.data?.targetId) {
      setTargetId(invRes.data.targetId);
    }
    const loadedQuestions = clarificationsRes.success ? clarificationsRes.data.questions : [];
    setQuestions(loadedQuestions);
    setInvestigationStatus(state.investigationReviewStatus || 'PENDING_PLANNING');
    setUiStatus(state.status);
  }, [id]);

  React.useEffect(() => {
    isMountedRef.current = true;
    loadData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadData]);

  const handleSelectOption = (questionId: string, option: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: option }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleTextChange = (questionId: string, text: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: text }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  /**
   * Submits answers to the backend, then triggers planning.
   * If answers save but planning fails, marks answersSavedPlanningFailed for safe retry.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setPlanningFailureMessage(null);

    const validation = validateClarificationAnswers(questions, selectedAnswers);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    setUiStatus('SUBMITTING');

    // 1. Submit answers via batch API
    const answerRes = await answerClarification(id, {
      answers: validation.answersToSubmit,
    });

    if (!answerRes.success) {
      setUiStatus('QUESTIONS_READY');
      setErrorMessage(`Failed to save clarification answers: ${answerRes.error.message}`);
      return;
    }

    // 2. Answers saved successfully! Mark recovery state in case planning fails
    setAnswersSavedPlanningFailed(false);
    setUiStatus('PLANNING');

    // 3. Trigger experiment planning
    await runPlanningTransition();
  };

  /**
   * Retries autonomous planning directly without re-submitting already accepted answers.
   */
  const handleRetryPlanningOnly = async () => {
    setPlanningFailureMessage(null);
    setUiStatus('PLANNING');
    await runPlanningTransition();
  };

  const runPlanningTransition = async () => {
    const transitionResult = await executePlanningTransition({
      investigationId: id,
    });

    if (transitionResult.outcome === 'PROPOSAL_READY') {
      // Authoritatively verify the plan before allowing review navigation
      const planCheck = await fetchPlan(id);
      if (
        planCheck.success &&
        planCheck.data &&
        hasAuthoritativeProposal(planCheck.data.data, planCheck.data.version, planCheck.data.planHash)
      ) {
        setVerifiedPlan({
          version: planCheck.data.version,
          planHash: planCheck.data.planHash,
        });
        setUiStatus('PROPOSAL_READY');
        router.push(transitionResult.navigationTarget);
        return;
      }
    }

    if (transitionResult.outcome === 'CLARIFICATION_NEEDED') {
      // Another clarification round was appended by the backend
      const refreshed = await fetchClarifications(id);
      if (refreshed.success) {
        setQuestions(refreshed.data.questions);
        setSelectedAnswers({});
        setValidationErrors({});
        setUiStatus('QUESTIONS_READY');
      } else {
        setUiStatus('FETCH_FAILED');
        setErrorMessage(refreshed.error.message);
      }
      return;
    }

    if (transitionResult.outcome === 'UNABLE_TO_PROCEED') {
      setUiStatus('CANNOT_PROCEED');
      setCannotProceedReason(transitionResult.reason);
      setCannotProceedPrereqs(transitionResult.missingPrerequisites || []);
      return;
    }

    if (transitionResult.outcome === 'ERROR') {
      setAnswersSavedPlanningFailed(true);
      setPlanningFailureMessage(transitionResult.message);
      setUiStatus('QUESTIONS_READY');
    }
  };

  const roundGroups = React.useMemo(() => groupQuestionsByRound(questions), [questions]);
  const pendingCount = questions.filter((q) => !q.isAnswered).length;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Accessible Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-xs text-brand-muted">
        <Link
          href={`/investigations/${id}`}
          className="hover:text-cobalt-action flex items-center space-x-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cobalt-action rounded"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Investigation</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-brand-navy font-medium">Clarify report details</span>
      </nav>

      {/* Primary Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-navy tracking-tight">Clarify report details</h1>
        <p className="text-sm text-brand-muted mt-1 leading-relaxed">
          These questions resolve ambiguities in the bug report to build a safe, testable reproduction plan.
          These answers prepare the initial experiment plan and are not interactive questions asked during execution.
        </p>
      </div>

      {/* STATE 1: LOADING */}
      {uiStatus === 'LOADING' && (
        <Card className="p-12 text-center flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-7 h-7 animate-spin text-cobalt-action" aria-hidden="true" />
          <p className="text-xs font-medium text-brand-navy">Loading clarification details...</p>
          <p className="text-[11px] text-brand-muted max-w-sm">
            Fetching persisted clarification questions and verifying current plan status.
          </p>
        </Card>
      )}

      {/* STATE 2: FETCH FAILED (Visibly an error state — never an empty success) */}
      {uiStatus === 'FETCH_FAILED' && (
        <Card className="p-8 border-red-200 bg-red-50/40 text-center space-y-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto text-status-confirmed">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-brand-navy">Unable to load clarification questions</h2>
            <p className="text-xs text-status-confirmed max-w-md mx-auto">
              {errorMessage || 'A connection or server error prevented loading questions for this investigation.'}
            </p>
          </div>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <Button variant="secondary" onClick={loadData} className="space-x-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </Button>
            <Link href={`/investigations/${id}`}>
              <Button variant="outline" className="text-xs">
                Back to Investigation
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* STATE 3: SUBMITTING / PLANNING SPINNER */}
      {(uiStatus === 'SUBMITTING' || uiStatus === 'PLANNING') && (
        <Card className="p-12 text-center flex flex-col items-center justify-center space-y-3 bg-lavender-surface/30 border-cobalt-action/20">
          <Loader2 className="w-8 h-8 animate-spin text-cobalt-action" aria-hidden="true" />
          <h2 className="text-sm font-bold text-brand-navy">
            {uiStatus === 'SUBMITTING'
              ? 'Submitting your clarification answers...'
              : 'Answers saved; generating experiment plan...'}
          </h2>
          <p className="text-xs text-brand-muted max-w-md">
            {uiStatus === 'SUBMITTING'
              ? 'Persisting your answers into the durable fact ledger.'
              : 'Autonomous planning is synthesizing a safe, testable reproduction plan. This takes a few moments.'}
          </p>
        </Card>
      )}

      {/* STATE 4: PROPOSAL READY (Verified Authoritative Proposal) */}
      {uiStatus === 'PROPOSAL_READY' && verifiedPlan && (
        <Card className="p-8 text-center space-y-4 border-emerald-200 bg-emerald-50/30">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-status-notReproduced">
            <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-brand-navy">Experiment plan is ready for review</h2>
            <p className="text-xs text-brand-muted max-w-md mx-auto">
              All required facts have been clarified. An immutable reproduction proposal (Version {verifiedPlan.version})
              has been generated with fingerprint{' '}
              <code className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-neutral-divider">
                {verifiedPlan.planHash.slice(0, 12)}...
              </code>
            </p>
          </div>
          <div className="pt-2">
            <Link href={`/investigations/${id}/approve`}>
              <Button variant="primary" className="space-x-1.5">
                <span>Go to plan review</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* STATE 5: CANNOT PROCEED */}
      {uiStatus === 'CANNOT_PROCEED' && (
        <Card className="p-8 border-amber-200 bg-amber-50/40 text-center space-y-5">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto text-amber-700">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-brand-navy">Unable to formulate a safe experiment plan</h2>
            <p className="text-xs text-amber-900 max-w-md mx-auto leading-relaxed">
              {cannotProceedReason ||
                'Autonomous planning could not construct a safe, verifiable reproduction plan within policy bounds.'}
            </p>
            {cannotProceedPrereqs.length > 0 && (
              <div className="pt-3 text-left max-w-md mx-auto bg-white/70 p-3 rounded-control border border-amber-200/60">
                <span className="text-[11px] font-semibold text-amber-950 block mb-1">
                  Missing details needed:
                </span>
                <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5">
                  {cannotProceedPrereqs.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="p-3 bg-lavender-surface/50 border border-lavender-accent/40 rounded-control text-left max-w-md mx-auto space-y-1">
            <span className="text-[11px] font-bold text-cobalt-action block">How to skip clarification:</span>
            <p className="text-[11px] text-brand-muted leading-relaxed">
              When filing a bug report, describing the step-by-step actions (e.g. filter to Active, click delete on Task B) and stating both expected and unexpected behavior allows TraceCase to generate a plan directly without clarification questions.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              onClick={handleRetryPlanningOnly}
              className="space-x-1.5 text-xs h-9 px-4"
              id="retry-plan-btn"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Plan Generation</span>
            </Button>
            <Link href={targetId ? `/investigations/new?targetId=${targetId}` : '/investigations/new'}>
              <Button variant="outline" className="text-xs h-9 px-4">
                Submit Refined Report
              </Button>
            </Link>
            <Link href={`/investigations/${id}`}>
              <Button variant="ghost" className="text-xs h-9 px-3 text-brand-muted hover:text-brand-navy">
                Investigation Overview
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* STATE 6: NO PENDING QUESTIONS & NO PROPOSAL (Honest status, no false approval navigation) */}
      {uiStatus === 'NO_PENDING_QUESTIONS' && (
        <Card className="p-8 text-center space-y-4">
          <div className="w-10 h-10 rounded-full bg-lavender-surface flex items-center justify-center mx-auto text-cobalt-action">
            <Check className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-brand-navy">No pending clarification questions</h2>
            <p className="text-xs text-brand-muted max-w-md mx-auto">
              There are currently no unanswered questions for this report.
              Investigation status is currently <span className="font-semibold">{investigationStatus}</span>.
            </p>
          </div>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <Button variant="primary" onClick={handleRetryPlanningOnly} className="space-x-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Generate experiment plan</span>
            </Button>
            <Link href={`/investigations/${id}`}>
              <Button variant="outline" className="text-xs">
                Back to Investigation
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* STATE 7: QUESTIONS READY (Primary Interactive Form) */}
      {uiStatus === 'QUESTIONS_READY' && (
        <div className="space-y-6">
          {/* Recovery Banner: Answers saved but planning failed */}
          {answersSavedPlanningFailed && (
            <div
              role="alert"
              className="p-4 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-2"
            >
              <div className="flex items-center space-x-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Answers saved; planning retry available</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Your clarification answers were successfully saved to the server. However, generating the reproduction
                plan timed out or encountered a service error: {planningFailureMessage}
              </p>
              <div className="pt-1">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleRetryPlanningOnly}
                  className="space-x-1.5 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry planning now</span>
                </Button>
              </div>
            </div>
          )}

          {/* Submission Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-control bg-red-50 border border-red-300 text-xs text-status-confirmed flex items-center space-x-2"
            >
              <AlertCircle className="w-4 h-4 text-status-confirmed shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {roundGroups.map((group) => (
              <section key={`round-${group.roundIndex}`} aria-labelledby={`round-heading-${group.roundIndex}`} className="space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-divider pb-2">
                  <h2
                    id={`round-heading-${group.roundIndex}`}
                    className="text-xs font-bold uppercase tracking-wider text-brand-muted"
                  >
                    Clarification Round {group.roundIndex}
                  </h2>
                  <Badge variant={group.isFullyAnswered ? 'notReproduced' : 'pending'}>
                    {group.isFullyAnswered ? 'Answered' : 'Needs your input'}
                  </Badge>
                </div>

                <div className="space-y-4">
                  {group.questions.map((q) => {
                    const isPending = !q.isAnswered;
                    const currentDraft = selectedAnswers[q.id] || '';
                    const errorMsg = validationErrors[q.id];

                    return (
                      <Card
                        key={q.id}
                        className={`transition-colors ${
                          errorMsg ? 'border-red-300 ring-1 ring-red-200' : isPending ? 'border-cobalt-action/30' : 'bg-neutral-surface/40'
                        }`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-xs font-semibold text-cobalt-action">
                              <HelpCircle className="w-4 h-4" aria-hidden="true" />
                              <span>Question #{q.questionIndex !== undefined ? q.questionIndex + 1 : '1'}</span>
                            </div>
                            {q.isAnswered && (
                              <Badge variant="notReproduced" className="space-x-1">
                                <Check className="w-3 h-3" />
                                <span>Accepted answer</span>
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-base mt-1.5 leading-snug">{q.questionText}</CardTitle>
                          {q.explanation && (
                            <CardDescription className="text-xs leading-relaxed">{q.explanation}</CardDescription>
                          )}
                        </CardHeader>

                        <CardContent className="space-y-3 pt-0">
                          {/* Case A: Already Answered — show accepted answer read-only */}
                          {q.isAnswered ? (
                            <div className="p-3 rounded-control bg-white border border-neutral-divider text-xs space-y-1">
                              <span className="text-[11px] font-semibold text-brand-muted block">
                                Accepted Answer:
                              </span>
                              <p className="font-medium text-brand-navy">{q.answerText}</p>
                            </div>
                          ) : (
                            /* Case B: Pending Question — interactive options and free text */
                            <div className="space-y-3">
                              {/* Suggested Options Buttons (ONLY if server provided options) */}
                              {q.suggestedOptions && Array.isArray(q.suggestedOptions) && q.suggestedOptions.length > 0 && (
                                <div className="space-y-1.5">
                                  <span className="block text-[11px] font-semibold text-brand-muted">
                                    Suggested options:
                                  </span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {q.suggestedOptions.map((opt) => {
                                      const isSelected = currentDraft === opt;
                                      return (
                                        <button
                                          type="button"
                                          key={opt}
                                          role="button"
                                          aria-pressed={isSelected}
                                          onClick={() => handleSelectOption(q.id, opt)}
                                          className={`p-3 rounded-control text-left text-xs font-medium border transition-all flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-action ${
                                            isSelected
                                              ? 'bg-lavender-surface border-cobalt-action text-cobalt-action font-semibold shadow-xs'
                                              : 'bg-white border-neutral-divider text-brand-navy hover:bg-neutral-surface hover:border-brand-muted/40'
                                          }`}
                                        >
                                          <span className="pr-2">{opt}</span>
                                          {isSelected && <Check className="w-4 h-4 text-cobalt-action shrink-0" />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Free-text response path */}
                              <div>
                                <label
                                  htmlFor={`clarify-${q.id}`}
                                  className="block text-[11px] font-semibold text-brand-muted mb-1"
                                >
                                  {q.suggestedOptions && q.suggestedOptions.length > 0
                                    ? 'Or provide specific answer:'
                                    : 'Your answer:'}
                                </label>
                                <Textarea
                                  id={`clarify-${q.id}`}
                                  rows={2}
                                  placeholder="Type your clarification..."
                                  value={currentDraft}
                                  onChange={(e) => handleTextChange(q.id, e.target.value)}
                                  className={errorMsg ? 'border-red-300 focus-visible:ring-red-300' : ''}
                                />
                                {errorMsg && (
                                  <div
                                    role="alert"
                                    className="flex items-center space-x-1.5 text-xs text-status-confirmed mt-1.5"
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{errorMsg}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}

            {/* Bottom Actions Bar */}
            {pendingCount > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-neutral-divider">
                <span className="text-xs text-brand-muted">
                  {pendingCount} question{pendingCount > 1 ? 's' : ''} awaiting clarification.
                </span>
                <div className="flex items-center space-x-3">
                  <Link href={`/investigations/${id}`}>
                    <Button type="button" variant="outline" className="text-xs">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" variant="primary" className="space-x-1.5 text-xs">
                    <span>Submit Answers & Prepare Plan</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
