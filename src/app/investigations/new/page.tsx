'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bug, ArrowRight, ShieldCheck, AlertCircle, Paperclip, Loader2, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ClientSafeTargetProfile, SafeTargetProfile } from '@/contracts/targets';
import { SYNTHETIC_TARGETS } from '@/dev/fixtures';
import { fetchTargets, submitBugReport } from '@/features/investigations/api-client';

export default function NewReportPage() {
  const router = useRouter();

  const [targets, setTargets] = React.useState<ClientSafeTargetProfile[]>(SYNTHETIC_TARGETS);
  const [targetLoadStatus, setTargetLoadStatus] = React.useState<string>('preview');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);
  const [attachedFileName, setAttachedFileName] = React.useState<string | null>(null);

  const [formData, setFormData] = React.useState({
    targetId: '',
    title: '',
    bugDescription: '',
    expectedBehavior: '',
    observedBehavior: '',
    suspectedSteps: '',
    browserEnvironment: '',
    buildVersion: '',
  });

  // Fetch target environments on mount
  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      const res = await fetchTargets();
      if (!isMounted) return;
      if (res.success && res.data.targets.length > 0) {
        setTargets(
          res.data.targets.map((t: SafeTargetProfile) => ({
            ...t,
            isSandbox: Boolean(t.isSandboxVerified),
          }))
        );
        setTargetLoadStatus(res.data.mode);
        setFormData((prev) => ({
          ...prev,
          targetId: prev.targetId || res.data.targets[0].id,
        }));
      } else if (res.success && res.data.mode === 'live') {
        setTargets([]);
        setTargetLoadStatus('live');
      } else {
        setTargets(SYNTHETIC_TARGETS);
        setTargetLoadStatus('preview');
        setFormData((prev) => ({
          ...prev,
          targetId: prev.targetId || SYNTHETIC_TARGETS[0].id,
        }));
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSubmissionError(null);

    const stepsArray = formData.suspectedSteps
      ? formData.suspectedSteps.split('\n').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const payload = {
      targetId: formData.targetId,
      title: formData.title.trim(),
      bugDescription: formData.bugDescription.trim(),
      expectedBehavior: formData.expectedBehavior.trim(),
      observedBehavior: formData.observedBehavior.trim(),
      suspectedSteps: stepsArray && stepsArray.length > 0 ? stepsArray : undefined,
      browserEnvironment: formData.browserEnvironment.trim() || undefined,
      buildVersion: formData.buildVersion.trim() || undefined,
    };

    setIsSubmitting(true);
    const result = await submitBugReport(payload);
    setIsSubmitting(false);

    if (result.success) {
      // Backend returned valid report and investigation link
      const targetInvId = result.data.investigationId;
      if (targetInvId) {
        if ('requiresClarification' in result.data && Boolean(result.data.requiresClarification)) {
          router.push(`/investigations/${targetInvId}/clarify`);
        } else {
          router.push(`/investigations/${targetInvId}/approve`);
        }
      } else {
        router.push(`/investigations/${result.data.id}`);
      }
    } else {
      // API error (validation, 401 unauthenticated, etc.)
      setSubmissionError(
        `Submission failed (${result.error.code}): ${result.error.message}`
      );
    }
  };

  const handleContinuePreview = () => {
    // Explicit, user-triggered fallback to canonical sample investigation review
    router.push('/investigations/03-await-approval-uuid-00000000003/approve');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
            Submit Bug Report for Autonomous Reproduction
          </h2>
          <p className="text-sm text-brand-muted mt-1">
            Provide reported defect symptoms. GPT-6 Luna (Role 1) will normalize intent and extract deterministic plan steps.
          </p>
        </div>

        <div className="shrink-0">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-lavender-surface text-brand-deepPurple border border-cobalt-action/30 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cobalt-action" />
            <span>Target Catalog: {targetLoadStatus === 'live_database' ? 'Live Database' : 'Synthetic Preview'}</span>
          </span>
        </div>
      </div>

      {validationError && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-control bg-status-confirmedBg border border-red-200 text-xs text-status-confirmed flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="text-status-confirmed font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {submissionError && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-control bg-status-confirmedBg border border-red-300 text-xs text-status-confirmed space-y-3"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{submissionError}</span>
            </div>
            <button
              onClick={() => setSubmissionError(null)}
              className="text-status-confirmed font-semibold hover:underline"
            >
              Dismiss
            </button>
          </div>
          <div className="pt-2 border-t border-red-200 flex items-center justify-between text-neutral-800">
            <span className="text-[11px]">
              Live database insertion requires an authenticated session. You can explore the workflow using the sample preview persona.
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={handleContinuePreview}
              className="text-xs shrink-0 ml-3"
            >
              Explore Sample Approval Review
            </Button>
          </div>
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="text-base flex items-center space-x-2">
              <Bug className="w-4 h-4 text-cobalt-action" />
              <span>Report Intake Details</span>
            </CardTitle>
            <CardDescription>
              Fields marked with an asterisk are required to construct an executable experiment plan.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div>
              <label htmlFor="target-select" className="block text-xs font-semibold text-brand-navy mb-1.5">
                Target Application *
              </label>
              <select
                id="target-select"
                value={formData.targetId}
                onChange={(e) => setFormData({ ...formData, targetId: e.target.value })}
                disabled={isSubmitting}
                className="w-full h-11 rounded-control border border-neutral-divider bg-white px-3.5 py-2 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-cobalt-action"
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.baseUrl}) — {t.isSandbox ? 'Sandbox' : 'Protected Production'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="report-title" className="block text-xs font-semibold text-brand-navy mb-1.5">
                Bug Summary / Title *
              </label>
              <Input
                id="report-title"
                placeholder="e.g. Deleting task with active filter deletes completed item instead"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="report-desc" className="block text-xs font-semibold text-brand-navy mb-1.5">
                Full Problem Description *
              </label>
              <Textarea
                id="report-desc"
                rows={3}
                placeholder="Describe what occurred, including user context, clicks, or any unexpected behavior..."
                value={formData.bugDescription}
                onChange={(e) => setFormData({ ...formData, bugDescription: e.target.value })}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="report-expected" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Expected Correct Behavior *
                </label>
                <Textarea
                  id="report-expected"
                  rows={2}
                  placeholder="What should have happened according to business logic?"
                  value={formData.expectedBehavior}
                  onChange={(e) => setFormData({ ...formData, expectedBehavior: e.target.value })}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label htmlFor="report-observed" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Observed Erroneous Behavior *
                </label>
                <Textarea
                  id="report-observed"
                  rows={2}
                  placeholder="What actual failure or visual defect was observed?"
                  value={formData.observedBehavior}
                  onChange={(e) => setFormData({ ...formData, observedBehavior: e.target.value })}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div>
              <label htmlFor="report-steps" className="block text-xs font-semibold text-brand-navy mb-1.5">
                Suspected Steps to Reproduce (One per line, Optional)
              </label>
              <Textarea
                id="report-steps"
                rows={3}
                placeholder={"1. Navigate to /tasks\n2. Click filter Active\n3. Click delete on first item"}
                value={formData.suspectedSteps}
                onChange={(e) => setFormData({ ...formData, suspectedSteps: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="report-env" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Browser Environment
                </label>
                <Input
                  id="report-env"
                  value={formData.browserEnvironment}
                  onChange={(e) => setFormData({ ...formData, browserEnvironment: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label htmlFor="report-build" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Build / Release Version
                </label>
                <Input
                  id="report-build"
                  value={formData.buildVersion}
                  onChange={(e) => setFormData({ ...formData, buildVersion: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Optional Attachment Simulator */}
            <div className="border border-dashed border-neutral-divider rounded-control p-4 text-center space-y-2 bg-neutral-surface/20">
              <Paperclip className="w-5 h-5 mx-auto text-brand-muted" />
              <div className="text-xs text-brand-navy font-medium">
                {attachedFileName ? (
                  <span className="text-cobalt-action">Selected: {attachedFileName}</span>
                ) : (
                  <span>Attach Screenshot or Log File</span>
                )}
              </div>
              <p className="text-[11px] text-brand-muted">
                Attachment persistence is currently unavailable (object storage upload API pending P1-03). Selected files will NOT be persisted.
              </p>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                disabled={isSubmitting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setAttachedFileName(`${file.name} (${Math.round(file.size / 1024)} KB)`);
                }}
              />
              <label
                htmlFor="file-upload"
                className="inline-block px-3 py-1.5 rounded-control text-xs font-medium bg-white border border-neutral-divider text-brand-navy cursor-pointer hover:bg-neutral-surface"
              >
                Choose Local File
              </label>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between items-center bg-neutral-surface/20">
            <span className="text-xs text-brand-muted flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-cobalt-action" />
              <span>Input validated against CreateReportCommandSchema</span>
            </span>
            <Button
              type="submit"
              variant="primary"
              className="space-x-1.5"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Report...</span>
                </>
              ) : (
                <>
                  <span>Submit & Generate Plan</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
