'use client';

import * as React from 'react';
import { ShieldAlert, Plus, Lock, AlertCircle, CheckCircle2, Loader2, Database, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ClientSafeTargetProfile, SafeTargetProfile, CreateTargetCommand } from '@/contracts/targets';
import { fetchTargets, submitTarget } from '@/features/investigations/api-client';

export default function TargetsPage() {
  const [targets, setTargets] = React.useState<ClientSafeTargetProfile[]>([]);
  const [catalogMode, setCatalogMode] = React.useState<string>('loading');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);
  const [errorNotice, setErrorNotice] = React.useState<string | null>(null);

  const [formData, setFormData] = React.useState({
    name: '',
    baseUrl: '',
    allowedOrigins: '',
    isSandboxRequested: true,
    testAccountRef: '',
    fixtureResetEndpoint: '',
    environment: 'staging' as 'staging' | 'development' | 'demo' | 'production',
  });

  // Load targets on component mount
  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setErrorNotice(null);
      const res = await fetchTargets();
      if (!isMounted) return;

      if (res.success) {
        if (res.data.targets.length > 0) {
          setTargets(
            res.data.targets.map((t: SafeTargetProfile) => ({
              ...t,
              isSandbox: Boolean(t.isSandboxVerified),
            }))
          );
        } else if (res.data.mode === 'live') {
          // Live mode with 0 targets: truthfully report empty catalog
          setTargets([]);
        } else {
          setTargets([]);
        }
        setCatalogMode(res.data.mode);
      } else {
        // Safe fallback with informative error
        setTargets([]);
        setCatalogMode('unavailable');
        if (res.status === 401) {
          setErrorNotice('Sign in using the button above to load your targets.');
        } else {
          setErrorNotice(`Live API unavailable (${res.error.message}). No sample targets are displayed.`);
        }
      }
      setIsLoading(false);
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessNotice(null);
    setErrorNotice(null);

    const origins = formData.allowedOrigins
      ? formData.allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean)
      : [formData.baseUrl.trim()];

    const command: CreateTargetCommand = {
      name: formData.name.trim(),
      baseUrl: formData.baseUrl.trim(),
      allowedOrigins: origins,
      isSandboxRequested: formData.isSandboxRequested,
      testAccountRef: formData.testAccountRef.trim() || undefined,
      fixtureResetEndpoint: formData.fixtureResetEndpoint.trim() || undefined,
      environment: formData.environment,
    };

    setIsSubmitting(true);
    const result = await submitTarget(command);
    setIsSubmitting(false);

    if (result.success) {
      const clientTarget: ClientSafeTargetProfile = {
        id: result.data.id,
        name: result.data.name,
        baseUrl: result.data.baseUrl,
        allowedOrigins: result.data.allowedOrigins,
        isSandbox: result.data.isSandboxVerified,
        environment: result.data.environment,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
      };
      setTargets((prev) => [clientTarget, ...prev]);
      setSuccessNotice(
        `Successfully registered target "${result.data.name}". Environment configured as ${
          result.data.isSandboxVerified ? 'sandbox' : 'protected'
        }.`
      );
      setFormData({
        name: '',
        baseUrl: '',
        allowedOrigins: '',
        isSandboxRequested: true,
        testAccountRef: '',
        fixtureResetEndpoint: '',
        environment: 'staging',
      });
    } else {
      setErrorNotice(
        `Registration rejected (${result.error.code}): ${result.error.message}`
      );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
            Target Environment Management
          </h2>
          <p className="text-sm text-brand-muted mt-1">
            Configure verified target web applications, sandbox safety flags, and fixture reset hooks.
          </p>
        </div>

        <div className="shrink-0 flex items-center space-x-2">
          {catalogMode === 'live' ? (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center space-x-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Live Database Mode</span>
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-lavender-surface text-brand-deepPurple border border-cobalt-action/30 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cobalt-action" />
              <span>{catalogMode === 'loading' ? 'Loading targets' : 'Targets unavailable'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successNotice && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-control bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 font-semibold ml-4 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorNotice && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-control bg-status-confirmedBg border border-red-200 text-xs text-status-confirmed flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-status-confirmed shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button
            onClick={() => setErrorNotice(null)}
            className="text-status-confirmed font-semibold ml-4 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Target Registration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Register New Target Application</CardTitle>
          <CardDescription>
            Target profiles define origin boundaries and authorization for Playwright browser execution.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="target-name" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Application Name *
                </label>
                <Input
                  id="target-name"
                  placeholder="e.g. Acme Staging Portal"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label htmlFor="target-base-url" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Base URL *
                </label>
                <Input
                  id="target-base-url"
                  placeholder="https://staging.acme.corp"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="target-origins" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Allowed Origins (Comma-separated)
                </label>
                <Input
                  id="target-origins"
                  placeholder="https://staging.acme.corp, https://auth.acme.corp"
                  value={formData.allowedOrigins}
                  onChange={(e) => setFormData({ ...formData, allowedOrigins: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label htmlFor="target-reset-hook" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Fixture Reset Hook URL (Optional)
                </label>
                <Input
                  id="target-reset-hook"
                  placeholder="https://staging.acme.corp/api/test/reset-fixture"
                  value={formData.fixtureResetEndpoint}
                  onChange={(e) => setFormData({ ...formData, fixtureResetEndpoint: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="target-env" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Target Environment
                </label>
                <select
                  id="target-env"
                  value={formData.environment}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      environment: e.target.value as 'staging' | 'development' | 'demo' | 'production',
                    })
                  }
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-control border border-neutral-divider bg-white px-3.5 py-2 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-cobalt-action"
                >
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                  <option value="demo">Demo</option>
                  <option value="production">Production</option>
                </select>
              </div>

              <div>
                <label htmlFor="target-account-ref" className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Test Account Identifier (Optional)
                </label>
                <Input
                  id="target-account-ref"
                  placeholder="e.g. test-operator-sandbox-account"
                  value={formData.testAccountRef}
                  onChange={(e) => setFormData({ ...formData, testAccountRef: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Sandbox Notice Box */}
            <div className="p-3.5 rounded-control bg-status-pendingBg/50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-semibold flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-700" />
                <span>Sandbox Safety Invariant (TC-INV-008)</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Checking the sandbox declaration requests sandbox classification; server policy strictly governs whether Tier 4 destructive operations are authorized. Production targets are permanently locked against automated deletion.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="isSandboxRequested"
                checked={formData.isSandboxRequested}
                onChange={(e) => setFormData({ ...formData, isSandboxRequested: e.target.checked })}
                disabled={isSubmitting}
                className="w-4 h-4 rounded text-cobalt-action focus:ring-cobalt-action border-neutral-divider"
              />
              <label htmlFor="isSandboxRequested" className="text-xs font-medium text-brand-navy cursor-pointer">
                Request Isolated Sandbox Classification (Permits Tier 4 Destructive Actions upon Human Approval)
              </label>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between items-center">
            <span className="text-[11px] text-brand-muted">
              Live registration invokes POST /api/v1/targets and requires valid operator authorization.
            </span>
            <Button
              type="submit"
              variant="primary"
              className="space-x-1.5"
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting to API...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Register Target</span>
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Existing Target Profiles List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-navy">Configured Targets ({targets.length})</h3>
          {isLoading && (
            <span className="text-xs text-brand-muted flex items-center space-x-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cobalt-action" />
              <span>Refreshing targets...</span>
            </span>
          )}
        </div>

        {targets.length === 0 && !isLoading ? (
          <div className="p-8 text-center text-xs text-brand-muted bg-white border border-neutral-divider/80 rounded-card">
            No targets configured yet. Register a target above to enable investigation runs.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {targets.map((target) => (
            <Card key={target.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-sm text-brand-navy">{target.name}</h4>
                  <a
                    href={target.baseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-cobalt-action hover:underline break-all"
                  >
                    {target.baseUrl}
                  </a>
                </div>
                {target.isSandbox ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Sandbox
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1">
                    <Lock className="w-3 h-3" />
                    <span>Protected</span>
                  </span>
                )}
              </div>

              <div className="text-[11px] text-brand-muted space-y-1">
                <div>Environment: <span className="font-medium text-brand-navy uppercase">{target.environment}</span></div>
                <div>Reset Hook: <span className="font-mono text-[10px]">{target.fixtureResetEndpoint || 'None configured'}</span></div>
                {target.allowedOrigins && target.allowedOrigins.length > 0 && (
                  <div>Allowed Origins: <span className="font-mono text-[10px]">{target.allowedOrigins.join(', ')}</span></div>
                )}
              </div>
            </Card>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
