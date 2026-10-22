'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Target, PlusCircle, ShieldCheck } from 'lucide-react';
import { cn } from '../ui/button';

const NAV_ITEMS = [
  { label: 'Investigations', href: '/', icon: LayoutDashboard },
  { label: 'Target Environments', href: '/targets', icon: Target },
  { label: 'Submit Bug Report', href: '/investigations/new', icon: PlusCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 border-r border-neutral-divider/80 bg-white flex-col justify-between shrink-0 min-h-screen">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-neutral-divider/50 flex items-center space-x-3">
          <div className="w-9 h-9 rounded-control bg-cobalt-action flex items-center justify-center text-white font-bold text-base shadow-sm">
            TC
          </div>
          <div>
            <div className="font-bold text-base text-brand-navy tracking-tight">TraceCase</div>
            <div className="text-[11px] text-brand-muted font-medium">Reproduction Engine</div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1.5" aria-label="Main Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center space-x-3 px-3.5 py-2.5 rounded-control text-sm font-medium transition-all',
                  isActive
                    ? 'bg-lavender-surface text-cobalt-action font-semibold'
                    : 'text-brand-navy hover:bg-neutral-surface hover:text-brand-deepPurple'
                )}
              >
                <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-cobalt-action' : 'text-brand-muted')} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info Box */}
      <div className="p-4 m-4 rounded-card bg-lavender-surface/60 border border-lavender-accent/40 space-y-2">
        <div className="flex items-center space-x-2 text-xs font-semibold text-brand-deepPurple">
          <ShieldCheck className="w-3.5 h-3.5 text-cobalt-action" />
          <span>Approved browser investigations</span>
        </div>
        <p className="text-[11px] text-brand-muted leading-relaxed">
          Review each experiment plan before starting. Destructive tests require a verified sandbox.
        </p>
        <div className="pt-1 flex items-center justify-between text-[10px] text-brand-muted">
          <span>Two attempts required</span>
          <span className="text-cobalt-action font-medium">Evidence captured</span>
        </div>
      </div>
    </aside>
  );
}
