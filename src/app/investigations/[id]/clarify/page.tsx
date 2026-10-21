'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { HelpCircle, Check, ArrowRight, ArrowLeft, AlertCircle, Info, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SYNTHETIC_CLARIFICATION_QUESTIONS } from '@/dev/fixtures';
import { AnswerClarificationCommandSchema } from '@/contracts/clarification';

export default function ClarificationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [questions] = React.useState(SYNTHETIC_CLARIFICATION_QUESTIONS);
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({});
  const [submitted, setSubmitted] = React.useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    // Validate each question's answer against AnswerClarificationCommandSchema
    for (const q of questions) {
      const answer = (selectedAnswers[q.id] || (q.isAnswered ? q.answerText || '' : '')).trim();
      const validation = AnswerClarificationCommandSchema.safeParse({
        questionId: q.id,
        answerText: answer,
      });

      if (!validation.success) {
        errors[q.id] = validation.error.errors[0]?.message || 'Please provide an answer for this question.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSubmitted(true);
    setTimeout(() => {
      router.push(`/investigations/${id}/approve`);
    }, 600);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-2 text-xs text-brand-muted">
        <Link href={`/investigations/${id}`} className="hover:text-cobalt-action flex items-center space-x-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Investigation</span>
        </Link>
        <span>/</span>
        <span className="text-brand-navy font-medium">Interactive Clarification Card</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
            Clarification Required (Luna Role 1)
          </h2>
          <p className="text-sm text-brand-muted mt-1">
            The incoming bug report contained ambiguities. Clarify the execution environment to generate an accurate plan.
          </p>
        </div>

        <div className="shrink-0">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-lavender-surface text-brand-deepPurple border border-cobalt-action/30 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cobalt-action" />
            <span>Preview Mode</span>
          </span>
        </div>
      </div>

      {/* Backend Dependency Status Notice */}
      <div className="p-4 rounded-control bg-lavender-surface border border-cobalt-action/30 text-xs text-brand-deepPurple space-y-1.5">
        <div className="font-semibold flex items-center space-x-1.5 text-cobalt-action">
          <Info className="w-4 h-4 shrink-0" />
          <span>Backend Clarification API Status (P1-02 / P2-04 Integration Pending)</span>
        </div>
        <p className="text-[11px] leading-relaxed text-brand-navy/80">
          The autonomous AI clarification engine and persistent clarification API endpoints are currently pending Person 1 / Person 2 backend integration. Responses entered below are validated locally against canonical contract <code className="font-mono bg-white/70 px-1 py-0.5 rounded">AnswerClarificationCommandSchema</code> and staged for preview workflow testing.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {questions.map((q, idx) => {
          const currentAnswer = selectedAnswers[q.id] !== undefined
            ? selectedAnswers[q.id]
            : (q.isAnswered ? q.answerText || '' : '');
          const errorMsg = validationErrors[q.id];

          return (
            <Card key={q.id} className={errorMsg ? 'border-red-300' : ''}>
              <CardHeader>
                <div className="flex items-center space-x-2 text-xs font-bold text-cobalt-action">
                  <HelpCircle className="w-4 h-4" />
                  <span>Clarification Question #{idx + 1}</span>
                </div>
                <CardTitle className="text-base mt-1">{q.questionText}</CardTitle>
                {q.contextExplanation && (
                  <CardDescription>{q.contextExplanation}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {q.suggestedOptions && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.suggestedOptions.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        aria-pressed={currentAnswer === opt}
                        onClick={() => handleSelectOption(q.id, opt)}
                        className={`p-3 rounded-control text-left text-xs font-medium border transition-colors flex items-center justify-between ${
                          currentAnswer === opt
                            ? 'bg-lavender-surface border-cobalt-action text-cobalt-action font-semibold'
                            : 'bg-white border-neutral-divider text-brand-navy hover:bg-neutral-surface'
                        }`}
                      >
                        <span>{opt}</span>
                        {currentAnswer === opt && <Check className="w-3.5 h-3.5 text-cobalt-action" />}
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <label htmlFor={`clarify-${q.id}`} className="block text-[11px] font-semibold text-brand-muted mb-1">
                    Or provide specific answer:
                  </label>
                  <Textarea
                    id={`clarify-${q.id}`}
                    rows={2}
                    placeholder="Type customized clarification..."
                    value={currentAnswer}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                  />
                  {errorMsg && (
                    <div className="flex items-center space-x-1.5 text-xs text-status-confirmed mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-brand-muted">
            Validated against AnswerClarificationCommandSchema. Answers stage to Experiment Plan generator.
          </span>
          <Button type="submit" variant="primary" className="space-x-1.5" disabled={submitted}>
            <span>{submitted ? 'Updating Plan...' : 'Submit Answers & Review Plan'}</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
