'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Plus,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Info,
  ArrowRight,
  Check,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type SafeTargetProfile,
  type CreateTargetCommand,
  parseAndNormalizeTargetUrl,
  sanitizeInternalReturnPath,
} from '@/contracts/targets';
import { fetchTargets, submitTarget } from '@/features/investigations/api-client';

export default function TargetsPage() {
  const [targets, setTargets] = React.useState<SafeTargetProfile[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successNotice, setSuccessNotice] = React.useState<{
    id: string;
    name: string;
    isSandboxVerified: boolean;
    environment: string;
  } | null>(null);
  const [errorNotice, setErrorNotice] = React.useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [returnTo, setReturnTo] = React.useState<string>('/investigations/new');
  const [isIntentionalVariant, setIsIntentionalVariant] = React.useState(false);

  const [formData, setFormData] = React.useState({
    name: '',
    baseUrl: '',
    allowedOrigins: '',
    isSandboxRequested: true,
    testAccountRef: '',
    fixtureResetEndpoint: '',
    environment: 'staging' as 'staging' | 'development' | 'demo' | 'production',
  });

  // Client-side URL normalization preview
  const urlNormalization = React.useMemo(() => {
    if (!formData.baseUrl.trim()) {
      return null;
    }
    return parseAndNormalizeTargetUrl(formData.baseUrl);
  }, [formData.baseUrl]);

  // Duplicate origin detection against existing registered targets
  const duplicateTarget = React.useMemo(() => {
    if (!urlNormalization || !urlNormalization.isValid || !urlNormalization.normalizedOrigin) {
      return null;
    }
    const currentOrigin = urlNormalization.normalizedOrigin;
    return (
      targets.find((t) => {
        const parsed = parseAndNormalizeTargetUrl(t.baseUrl);
        return parsed.isValid && parsed.normalizedOrigin === currentOrigin;
      }) || null
    );
  }, [urlNormalization, targets]);

  // Load targets and read safe returnTo on component mount
  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setErrorNotice(null);

      // Read safe internal return path if provided
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const rawReturnTo = urlParams?.get('returnTo');
      if (rawReturnTo) {
        setReturnTo(sanitizeInternalReturnPath(rawReturnTo, '/investigations/new'));
      }

      const res = await fetchTargets();
      if (!isMounted) return;

      if (res.success) {
        if (res.data.targets.length > 0) {
          setTargets(res.data.targets);
        } else {
          setTargets([]);
        }
      } else {
        setTargets([]);
        if (res.status === 401) {
          setErrorNotice('Sign in using the button in the top navigation to load your targets.');
        } else {
          setErrorNotice(`Live API unavailable (${res.error.message}). No sample targets are displayed.`);
        }
      }
      setIsLoading(false);
    }
    load();

    const handleAuthChange = () => {
      if (isMounted) load();
    };
    window.addEventListener('tracecase:auth-state-change', handleAuthChange);

    return () => {
      isMounted = false;
      window.removeEventListener('tracecase:auth-state-change', handleAuthChange);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessNotice(null);
    setErrorNotice(null);

    // Validate URL upfront using shared contract
    const urlValidation = parseAndNormalizeTargetUrl(formData.baseUrl);
    if (!urlValidation.isValid) {
      setErrorNotice(urlValidation.error || 'Please enter a valid HTTP or HTTPS base URL.');
      return;
    }

    // Phase C: If duplicate origin exists, require explicit variant confirmation to prevent accidental duplicates
    if (duplicateTarget && !isIntentionalVariant) {
      setErrorNotice(
        `A target with origin "${urlValidation.normalizedOrigin}" is already registered as "${duplicateTarget.name}". To reuse it, click "Use existing target" above. To register this as an intentional variant, check "I am intentionally registering a distinct variant".`
      );
      return;
    }

    const origins = formData.allowedOrigins
      ? formData.allowedOrigins
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

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
      setTargets((prev) => [result.data, ...prev]);
      setSuccessNotice({
        id: result.data.id,
        name: result.data.name,
        isSandboxVerified: result.data.isSandboxVerified,
        environment: result.data.environment,
      });

      // Reset form after successful save
      setFormData({
        name: '',
        baseUrl: '',
        allowedOrigins: '',
        isSandboxRequested: true,
        testAccountRef: '',
        fixtureResetEndpoint: '',
        environment: 'staging',
      });
      setShowAdvanced(false);
      setIsIntentionalVariant(false);
    } else {
      // PRESERVE form data on failure so the user does not lose input
      setErrorNotice(
        `Registration rejected (${result.error.code}): ${result.error.message}`
      );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-navy tracking-tight">
            Target Applications
          </h2>
          <p className="text-sm text-brand-muted mt-1 leading-relaxed">
            Add a test site once, then choose it whenever you file a bug report.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {successNotice && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-control bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold text-sm text-emerald-950">
                  Target &ldquo;{successNotice.name}&rdquo; registered successfully!
                </span>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Saved with ID <code className="font-mono text-emerald-900">{successNotice.id.slice(0, 8)}...</code>. Environment: <span className="font-semibold uppercase">{successNotice.environment}</span> ({successNotice.isSandboxVerified ? 'Sandbox Verified' : 'Protected'}).
                </p>
              </div>
            </div>
            <button
              onClick={() => setSuccessNotice(null)}
              className="text-emerald-700 font-semibold ml-4 hover:underline text-xs"
            >
              Dismiss
            </button>
          </div>
          <div className="pt-2 border-t border-emerald-200 flex items-center justify-between">
            <span className="text-xs text-emerald-900">
              Ready to reproduce an issue on this target?
            </span>
            <Link
              href={`${returnTo}?targetId=${encodeURIComponent(successNotice.id)}`}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-control bg-cobalt-action text-white font-medium text-xs shadow-sm hover:bg-cobalt-hover transition-colors"
            >
              <span>Create a report for this target</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
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
      <Card id="target-registration-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-brand-navy">
            Register New Target Application
          </CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Primary Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="target-name" className="block text-sm font-medium text-brand-navy mb-1.5">
                  Application Display Name *
                </label>
                <Input
                  id="target-name"
                  placeholder="e.g. Acme Staging Web App or Demo Target (Port 3005)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={isSubmitting}
                />
                <p className="text-xs text-brand-muted mt-1">
                  A descriptive label shown in bug report dropdowns and plan reviews.
                </p>
              </div>

              <div>
                <label htmlFor="target-base-url" className="block text-sm font-medium text-brand-navy mb-1.5">
                  Base URL *
                </label>
                <Input
                  id="target-base-url"
                  placeholder="http://localhost:3005 or https://staging.acme.corp"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  required
                  disabled={isSubmitting}
                />
                
                {/* Real-time origin preview and duplicate check */}
                {urlNormalization && (
                  <div className="mt-1.5 space-y-1">
                    {urlNormalization.isValid ? (
                      <div className="flex items-center space-x-1.5 text-xs text-cobalt-action">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          Normalized Origin: <code className="font-mono bg-cobalt-action/10 px-1.5 py-0.5 rounded">{urlNormalization.normalizedOrigin}</code>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-xs text-amber-700">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{urlNormalization.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Duplicate Origin Warning Notice with Intentional Variant Confirmation */}
            {duplicateTarget && (
              <div className="p-3.5 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2.5">
                <div className="flex items-center space-x-2 font-semibold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Existing Target Found with this Origin</span>
                </div>
                <p className="leading-relaxed">
                  Target with origin <code className="font-mono font-bold">{urlNormalization?.normalizedOrigin}</code> is already registered as <strong>&ldquo;{duplicateTarget.name}&rdquo;</strong> (<span className="uppercase font-semibold">{duplicateTarget.environment}</span>). TraceCase targets are designed to be added once and reused. You can use this existing profile or confirm registering a distinct variant below.
                </p>
                <div className="pt-0.5">
                  <Link
                    href={`/investigations/new?targetId=${encodeURIComponent(duplicateTarget.id)}`}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-cobalt-action hover:underline"
                  >
                    <span>Use existing target &ldquo;{duplicateTarget.name}&rdquo; for a bug report →</span>
                  </Link>
                </div>
                <div className="pt-2 border-t border-amber-200 flex items-start space-x-2">
                  <input
                    type="checkbox"
                    id="confirm-intentional-variant"
                    checked={isIntentionalVariant}
                    onChange={(e) => setIsIntentionalVariant(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-cobalt-action focus:ring-cobalt-action border-neutral-divider"
                  />
                  <label htmlFor="confirm-intentional-variant" className="text-xs text-amber-950 font-medium cursor-pointer">
                    I am intentionally registering a distinct variant (e.g. separate environment, branch build, or test scope). Existing profiles will not be merged, renamed, or altered.
                  </label>
                </div>
              </div>
            )}

            {/* Target Environment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="target-env" className="block text-sm font-medium text-brand-navy mb-1.5">
                  Target Environment *
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
                  <option value="staging">Staging (Pre-production test environment)</option>
                  <option value="development">Development (Local or team dev build)</option>
                  <option value="demo">Demo (Controlled demonstration instance)</option>
                  <option value="production">Production (Permanently locked against destructive tests)</option>
                </select>
                <p className="text-xs text-brand-muted mt-1">
                  Controls execution safety policies and destructive action boundaries.
                </p>
              </div>

              <div className="flex items-center">
                <div className="p-3 rounded-control bg-neutral-surface border border-neutral-divider/80 text-xs text-brand-muted leading-relaxed w-full">
                  <span className="font-semibold text-brand-navy block mb-0.5">Password Safety Contract:</span>
                  TraceCase profiles never request or store passwords. Any test authentication is handled via mock headers, session tokens, or fixture accounts.
                </div>
              </div>
            </div>

            {/* Optional Configuration Section */}
            <div className="pt-3 border-t border-neutral-divider space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="target-origins" className="block text-sm font-medium text-brand-navy mb-1.5">
                    Extra Allowed Origins (Optional)
                  </label>
                  <Input
                    id="target-origins"
                    placeholder="https://auth.acme.corp, https://cdn.acme.corp"
                    value={formData.allowedOrigins}
                    onChange={(e) => setFormData({ ...formData, allowedOrigins: e.target.value })}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-brand-muted mt-1">
                    Base URL origin is always included automatically.
                  </p>
                </div>

                <div>
                  <label htmlFor="target-reset-hook" className="block text-sm font-medium text-brand-navy mb-1.5">
                    Fixture Reset Hook URL (Optional)
                  </label>
                  <Input
                    id="target-reset-hook"
                    placeholder="http://localhost:3005/api/test/reset-fixture"
                    value={formData.fixtureResetEndpoint}
                    onChange={(e) => setFormData({ ...formData, fixtureResetEndpoint: e.target.value })}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-brand-muted mt-1">
                    HTTP endpoint invoked before test runs to restore clean test data.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="target-account-ref" className="block text-sm font-medium text-brand-navy mb-1.5">
                    Test Account Identifier (Optional)
                  </label>
                  <Input
                    id="target-account-ref"
                    placeholder="e.g. test-operator or demo-user"
                    value={formData.testAccountRef}
                    onChange={(e) => setFormData({ ...formData, testAccountRef: e.target.value })}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-brand-muted mt-1">
                    Public test account label or identifier. Do not enter passwords.
                  </p>
                </div>

                <div className="flex flex-col justify-center">
                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      type="checkbox"
                      id="isSandboxRequested"
                      checked={formData.isSandboxRequested}
                      onChange={(e) => setFormData({ ...formData, isSandboxRequested: e.target.checked })}
                      disabled={isSubmitting}
                      className="w-4 h-4 rounded text-cobalt-action focus:ring-cobalt-action border-neutral-divider"
                    />
                    <label htmlFor="isSandboxRequested" className="text-sm font-medium text-brand-navy cursor-pointer">
                      Request Isolated Sandbox Classification (Optional)
                    </label>
                  </div>
                  <p className="text-xs text-brand-muted mt-1 pl-6">
                    Permits destructive testing actions upon explicit operator approval.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end items-center border-t border-neutral-divider pt-4">
            <Button
              type="submit"
              variant="primary"
              className="space-x-1.5 text-sm"
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering Target...</span>
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

      {/* Configured Target Profiles Catalog */}
      <div id="targets-catalog-section" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-brand-navy">
              Configured Targets ({targets.length})
            </h3>
            <p className="text-xs text-brand-muted mt-0.5">
              Choose any configured target when submitting a new bug report.
            </p>
          </div>
          {isLoading && (
            <span className="text-xs text-brand-muted flex items-center space-x-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cobalt-action" />
              <span>Refreshing targets...</span>
            </span>
          )}
        </div>

        {targets.length === 0 && !isLoading ? (
          <div className="p-8 text-center text-xs text-brand-muted bg-white border border-neutral-divider/80 rounded-card space-y-2">
            <p className="font-semibold text-brand-navy text-sm">No targets configured yet</p>
            <p>Register your first target application above to enable autonomous reproduction runs.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {targets.map((target) => (
              <Card key={target.id} className="p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-brand-navy">{target.name}</h4>
                      <a
                        href={target.baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-cobalt-action hover:underline inline-flex items-center space-x-1 break-all"
                      >
                        <span>{target.baseUrl}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-neutral-100 text-neutral-800 uppercase tracking-wider border border-neutral-200">
                        {target.environment}
                      </span>
                      {target.isSandboxVerified ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Sandbox Verified
                        </span>
                      ) : target.isSandboxRequested ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          Sandbox Requested
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 flex items-center space-x-1">
                          <Lock className="w-3 h-3" />
                          <span>Protected</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Server Readiness Facts (TC-INV-008 & TC-INV-009) */}
                  <div className="text-xs text-brand-muted space-y-1.5 pt-2 border-t border-neutral-divider/60">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Reachability:</span>
                      <span className="text-neutral-800 font-medium" title="Reachability to target base URL is verified inside the isolated, policy-governed Playwright container during authorized investigation execution.">
                        Verified inside container during runs
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Fixture Reset Hook:</span>
                      <span className="font-mono text-neutral-800">
                        {target.hasResetCapability ? (
                          <span className="text-emerald-700 font-medium">Configured</span>
                        ) : (
                          <span className="text-neutral-500">None (Manual state)</span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Test Account Reference:</span>
                      <span className="text-neutral-800">
                        {target.hasTestAccountConfigured ? (
                          <span className="text-emerald-700 font-medium">Configured</span>
                        ) : (
                          <span className="text-neutral-500">None</span>
                        )}
                      </span>
                    </div>

                    {target.allowedOrigins && target.allowedOrigins.length > 1 && (
                      <div className="pt-1">
                        <span className="text-neutral-500 block">Extra Allowed Origins:</span>
                        <div className="font-mono text-[11px] text-neutral-700 break-all">
                          {target.allowedOrigins.slice(1).join(', ')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action: Create Bug Report against this target */}
                <div className="pt-3 border-t border-neutral-divider/80 flex items-center justify-between">
                  <span className="text-[11px] text-brand-muted font-mono">
                    ID: {target.id.slice(0, 8)}...
                  </span>
                  <Link
                    href={`/investigations/new?targetId=${encodeURIComponent(target.id)}`}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-cobalt-action hover:text-cobalt-hover hover:underline"
                  >
                    <span>Create Bug Report</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
