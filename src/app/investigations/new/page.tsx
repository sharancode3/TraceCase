'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bug, ArrowRight, ShieldCheck, AlertCircle, Paperclip } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SYNTHETIC_TARGETS } from '@/dev/fixtures';
import { CreateReportCommandSchema } from '@/contracts/reports';

export default function NewReportPage() {
  const router = useRouter();
  const [formData, setFormData] = React.useState({
    targetId: SYNTHETIC_TARGETS[0].id,
    title: '',
    bugDescription: '',
    expectedBehavior: '',
    observedBehavior: '',
    suspectedSteps: '',
    browserEnvironment: 'Chrome 128 / macOS',
    buildVersion: 'v1.0.4-staging',
  });
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [attachedFileName, setAttachedFileName] = React.useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const stepsArray = formData.suspectedSteps
      ? formData.suspectedSteps.split('\n').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const payload = {
      targetId: formData.targetId,
      title: formData.title,
      bugDescription: formData.bugDescription,
      expectedBehavior: formData.expectedBehavior,
      observedBehavior: formData.observedBehavior,
      suspectedSteps: stepsArray,
      browserEnvironment: formData.browserEnvironment || undefined,
      buildVersion: formData.buildVersion || undefined,
    };

    const validation = CreateReportCommandSchema.safeParse(payload);
    if (!validation.success) {
      const firstError = validation.error.errors[0]?.message || 'Form validation failed.';
      setValidationError(firstError);
      return;
    }

    // In Stage 0 Preview Mode, redirect to canonical sample investigation review
    router.push('/investigations/03-await-approval-uuid-00000000003/approve');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          Submit Bug Report for Autonomous Reproduction
        </h2>
        <p className="text-sm text-brand-muted mt-1">
          Provide reported defect symptoms. GPT-6 Luna (Role 1) will normalize intent and extract deterministic plan steps.
        </p>
      </div>

      {validationError && (
        <div className="p-4 rounded-control bg-status-confirmedBg border border-red-200 text-xs text-status-confirmed flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
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
              <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                Target Application *
              </label>
              <select
                value={formData.targetId}
                onChange={(e) => setFormData({ ...formData, targetId: e.target.value })}
                className="w-full h-11 rounded-control border border-neutral-divider bg-white px-3.5 py-2 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-cobalt-action"
              >
                {SYNTHETIC_TARGETS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.baseUrl}) — {t.isSandbox ? 'Sandbox' : 'Protected Production'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                Bug Summary / Title *
              </label>
              <Input
                placeholder="e.g. Deleting task with active filter deletes completed item instead"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                Full Problem Description *
              </label>
              <Textarea
                rows={3}
                placeholder="Describe what occurred, including user context, clicks, or any unexpected behavior..."
                value={formData.bugDescription}
                onChange={(e) => setFormData({ ...formData, bugDescription: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Expected Correct Behavior *
                </label>
                <Textarea
                  rows={2}
                  placeholder="What should have happened according to business logic?"
                  value={formData.expectedBehavior}
                  onChange={(e) => setFormData({ ...formData, expectedBehavior: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Observed Erroneous Behavior *
                </label>
                <Textarea
                  rows={2}
                  placeholder="What actual failure or visual defect was observed?"
                  value={formData.observedBehavior}
                  onChange={(e) => setFormData({ ...formData, observedBehavior: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                Suspected Steps to Reproduce (One per line, Optional)
              </label>
              <Textarea
                rows={3}
                placeholder={"1. Navigate to /tasks\n2. Click filter Active\n3. Click delete on first item"}
                value={formData.suspectedSteps}
                onChange={(e) => setFormData({ ...formData, suspectedSteps: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Browser Environment
                </label>
                <Input
                  value={formData.browserEnvironment}
                  onChange={(e) => setFormData({ ...formData, browserEnvironment: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Build / Release Version
                </label>
                <Input
                  value={formData.buildVersion}
                  onChange={(e) => setFormData({ ...formData, buildVersion: e.target.value })}
                />
              </div>
            </div>

            {/* Optional Attachment Simulator */}
            <div className="border border-dashed border-neutral-divider rounded-control p-4 text-center space-y-2 bg-neutral-surface/20">
              <Paperclip className="w-5 h-5 mx-auto text-brand-muted" />
              <div className="text-xs text-brand-navy font-medium">
                {attachedFileName ? (
                  <span className="text-cobalt-action">Attached: {attachedFileName}</span>
                ) : (
                  <span>Attach Screenshot or Log (Local Metadata Display Only)</span>
                )}
              </div>
              <p className="text-[11px] text-brand-muted">
                Stage 0 displays local file metadata. Secure object storage upload will activate in Stage 6.
              </p>
              <input
                type="file"
                id="file-upload"
                className="hidden"
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
            <Button type="submit" variant="primary" className="space-x-1.5">
              <span>Submit & Generate Plan</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
