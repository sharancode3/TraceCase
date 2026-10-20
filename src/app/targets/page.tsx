'use client';

import * as React from 'react';
import { ShieldAlert, Plus, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ClientSafeTargetProfile } from '@/contracts/targets';
import { SYNTHETIC_TARGETS } from '@/dev/fixtures';

export default function TargetsPage() {
  const [targets, setTargets] = React.useState<ClientSafeTargetProfile[]>(SYNTHETIC_TARGETS);
  const [formData, setFormData] = React.useState({
    name: '',
    baseUrl: '',
    allowedOrigins: '',
    isSandboxRequested: true,
    testAccountRef: '',
    fixtureResetEndpoint: '',
    environment: 'staging',
  });
  const [notice, setNotice] = React.useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.baseUrl) {
      setNotice('Target Name and Base URL are required fields.');
      return;
    }

    const newTarget: ClientSafeTargetProfile = {
      id: crypto.randomUUID(),
      name: formData.name,
      baseUrl: formData.baseUrl,
      allowedOrigins: formData.allowedOrigins ? formData.allowedOrigins.split(',').map((s) => s.trim()) : [formData.baseUrl],
      isSandbox: formData.isSandboxRequested,
      testAccountRef: formData.testAccountRef || null,
      fixtureResetEndpoint: formData.fixtureResetEndpoint || null,
      environment: formData.environment as 'staging' | 'development' | 'demo' | 'production',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setTargets([newTarget, ...targets]);
    setNotice('Target environment registered in local preview state. (Stage 0: server database persistence is simulated).');
    setFormData({
      name: '',
      baseUrl: '',
      allowedOrigins: '',
      isSandboxRequested: true,
      testAccountRef: '',
      fixtureResetEndpoint: '',
      environment: 'staging',
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          Target Environment Management
        </h2>
        <p className="text-sm text-brand-muted mt-1">
          Configure verified target web applications, sandbox safety flags, and fixture reset hooks.
        </p>
      </div>

      {notice && (
        <div className="p-4 rounded-control bg-lavender-surface border border-cobalt-action/30 text-xs text-brand-deepPurple flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-cobalt-action font-semibold ml-4">Dismiss</button>
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
                <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Application Name *
                </label>
                <Input
                  placeholder="e.g. Acme Staging Portal"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Base URL *
                </label>
                <Input
                  placeholder="https://staging.acme.corp"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Allowed Origins (Comma-separated)
                </label>
                <Input
                  placeholder="https://staging.acme.corp, https://auth.acme.corp"
                  value={formData.allowedOrigins}
                  onChange={(e) => setFormData({ ...formData, allowedOrigins: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-navy mb-1.5">
                  Fixture Reset Hook URL (Optional)
                </label>
                <Input
                  placeholder="https://staging.acme.corp/api/test/reset-fixture"
                  value={formData.fixtureResetEndpoint}
                  onChange={(e) => setFormData({ ...formData, fixtureResetEndpoint: e.target.value })}
                />
              </div>
            </div>

            {/* Sandbox Notice Box */}
            <div className="p-3.5 rounded-control bg-status-pendingBg/50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-semibold flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-700" />
                <span>Sandbox Safety Warning (TC-INV-008)</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Checking the sandbox box does not magically secure a production database. TraceCase strictly blocks Tier 4 destructive operations unless the target application is isolated and confirmed non-production.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="isSandboxRequested"
                checked={formData.isSandboxRequested}
                onChange={(e) => setFormData({ ...formData, isSandboxRequested: e.target.checked })}
                className="w-4 h-4 rounded text-cobalt-action focus:ring-cobalt-action border-neutral-divider"
              />
              <label htmlFor="isSandboxRequested" className="text-xs font-medium text-brand-navy cursor-pointer">
                Declare as Isolated Sandbox Target (Permits Tier 4 Destructive Actions upon Human Approval)
              </label>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between items-center">
            <span className="text-[11px] text-brand-muted">
              Stage 0: Registration validates input locally. Live network probing is deferred to Stage 5.
            </span>
            <Button type="submit" variant="primary" className="space-x-1.5">
              <Plus className="w-4 h-4" />
              <span>Register Target</span>
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Existing Target Profiles List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-brand-navy">Configured Targets</h3>
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
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
