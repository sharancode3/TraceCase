'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, ArrowUpRight, Search, ShieldAlert, Loader2, AlertCircle, Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getLifecyclePresentation,
  getVerdictPresentation,
  getEvidencePresentation,
} from '@/contracts/status';
import type { InvestigationSnapshot } from '@/contracts/investigations';
import { fetchInvestigations } from '@/features/investigations/api-client';

export default function DashboardPage() {
  const [investigations, setInvestigations] = React.useState<InvestigationSnapshot[]>([]);
  const [filter, setFilter] = React.useState<string>('ALL');
  const [search, setSearch] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorNotice, setErrorNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setErrorNotice(null);
      const res = await fetchInvestigations();
      if (!isMounted) return;

      if (res.success && res.data.mode === 'live') {
        setInvestigations(res.data.investigations);
      } else {
        setInvestigations([]);
        setErrorNotice(res.success
          ? 'Sample mode is disabled here. Set DEV_PREVIEW_MODE=false to use real investigations.'
          : res.status === 401
            ? 'Sign in using the button above to load your investigations.'
            : `Investigations could not be loaded: ${res.error.message}`);
      }
      setIsLoading(false);
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredItems = React.useMemo(() => {
    return investigations.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.targetName.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (filter === 'CONFIRMED') return item.reproductionVerdict === 'CONFIRMED_REPRODUCED';
      if (filter === 'CLEAN') return item.reproductionVerdict === 'NOT_REPRODUCED';
      if (filter === 'PENDING') return item.reproductionVerdict === 'PENDING';
      if (filter === 'INCONCLUSIVE') return item.reproductionVerdict === 'INCONCLUSIVE';
      return true;
    });
  }, [investigations, filter, search]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
            Investigations Dashboard
          </h2>
          <p className="text-sm text-brand-muted mt-1">
            Register a test target, submit a bug report, review and approve the plan, then start the browser investigation.
          </p>
        </div>
        <Link href="/investigations/new">
          <Button variant="primary" className="space-x-2">
            <Plus className="w-4 h-4" />
            <span>Create Bug Report</span>
          </Button>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-card border border-neutral-divider/80 shadow-subtle">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            placeholder="Search investigations by title or target..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-control border border-neutral-divider text-xs text-brand-navy focus:outline-none focus:ring-2 focus:ring-cobalt-action"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'ALL', label: 'All Cases' },
            { id: 'CONFIRMED', label: 'Confirmed (TC1)' },
            { id: 'CLEAN', label: 'Not Reproduced (TC2)' },
            { id: 'PENDING', label: 'In Progress' },
            { id: 'INCONCLUSIVE', label: 'Inconclusive / Blocked' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                filter === tab.id
                  ? 'bg-cobalt-action text-white shadow-sm'
                  : 'bg-neutral-surface text-brand-navy hover:bg-lavender-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error / Mode Notice */}
      {errorNotice && (
        <div className="p-3 rounded-control bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Investigations Table Card */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-brand-muted flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-cobalt-action" />
            <span>Loading investigations...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-brand-muted flex flex-col items-center justify-center space-y-3">
            <Inbox className="w-8 h-8 text-neutral-divider" />
            <div>
              <p className="font-semibold text-brand-navy">No investigations found</p>
              <p className="mt-1 text-brand-muted">
                {search ? 'Try adjusting your search or filter criteria.' : 'Create a bug report to start reproducing defects.'}
              </p>
            </div>
            {!search && (
              <Link href="/investigations/new">
                <Button size="sm" variant="outline" className="space-x-1.5 mt-2">
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Investigation</span>
                </Button>
              </Link>
            )}
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-lavender-surface/50 border-b border-neutral-divider text-brand-deepPurple font-semibold">
                <th className="py-3 px-4">Title & Target</th>
                <th className="py-3 px-4">Lifecycle State</th>
                <th className="py-3 px-4">Reproduction Verdict</th>
                <th className="py-3 px-4">Evidence Readiness</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-divider/60">
              {filteredItems.map((inv) => {
                const lifecycle = getLifecyclePresentation(inv.lifecycleStatus);
                const verdict = getVerdictPresentation(inv.reproductionVerdict);
                const evidence = getEvidencePresentation(inv.evidenceReadiness);

                return (
                  <tr key={inv.id} className="hover:bg-neutral-surface/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-brand-navy max-w-sm truncate">
                        {inv.title}
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-brand-muted mt-0.5">
                        <span className="truncate max-w-[200px]">{inv.targetName}</span>
                        <span>•</span>
                        <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                        {inv.isSandbox ? (
                          <span className="text-emerald-700 font-medium">Sandbox</span>
                        ) : (
                          <span className="text-amber-700 font-medium flex items-center space-x-1">
                            <ShieldAlert className="w-3 h-3 inline" />
                            <span>Protected Prod</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${lifecycle.badgeClass}`}>
                        {lifecycle.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] ${verdict.badgeClass}`}>
                        {verdict.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] ${evidence.badgeClass}`}>
                        {evidence.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <Link href={`/investigations/${inv.id}`}>
                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                          <span>Inspect</span>
                          <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}
