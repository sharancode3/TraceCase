'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, ArrowUpRight, Search, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getLifecyclePresentation,
  getVerdictPresentation,
  getEvidencePresentation,
} from '@/contracts/status';
import { SYNTHETIC_INVESTIGATIONS_CATALOG } from '@/dev/fixtures';

export default function DashboardPage() {
  const [filter, setFilter] = React.useState<string>('ALL');
  const [search, setSearch] = React.useState<string>('');

  const filteredItems = React.useMemo(() => {
    return SYNTHETIC_INVESTIGATIONS_CATALOG.filter((item) => {
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
  }, [filter, search]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
            Investigations Dashboard
          </h2>
          <p className="text-sm text-brand-muted mt-1">
            Deterministic two-run reproduction tracking with synchronized evidence audits.
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

      {/* Investigations Table Card */}
      <Card className="p-0 overflow-hidden">
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
      </Card>
    </div>
  );
}
