'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { HelpCircle, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SYNTHETIC_CLARIFICATION_QUESTIONS } from '@/dev/fixtures';

export default function ClarificationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [questions] = React.useState(SYNTHETIC_CLARIFICATION_QUESTIONS);
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});
  const [submitted, setSubmitted] = React.useState(false);

  const handleSelectOption = (questionId: string, option: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      router.push(`/investigations/${id}/approve`);
    }, 800);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center space-x-2 text-xs text-brand-muted">
        <Link href={`/investigations/${id}`} className="hover:text-cobalt-action flex items-center space-x-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Investigation</span>
        </Link>
        <span>/</span>
        <span className="text-brand-navy font-medium">Interactive Clarification Card</span>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          Clarification Required (Luna Role 1)
        </h2>
        <p className="text-sm text-brand-muted mt-1">
          The incoming bug report contained ambiguities. Clarify the execution environment to generate an accurate plan.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {questions.map((q, idx) => {
          const currentAnswer = selectedAnswers[q.id] || (q.isAnswered ? q.answerText || '' : '');
          return (
            <Card key={q.id}>
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
                  <label className="block text-[11px] font-semibold text-brand-muted mb-1">
                    Or provide specific answer:
                  </label>
                  <Textarea
                    rows={2}
                    placeholder="Type customized clarification..."
                    value={currentAnswer}
                    onChange={(e) =>
                      setSelectedAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-brand-muted">
            Answers are passed back to GPT-6 Luna Role 2 to update the Experiment Plan.
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
