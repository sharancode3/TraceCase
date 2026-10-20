'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, UserCheck } from 'lucide-react';
import { Button } from '../ui/button';

export function Header() {
  return (
    <header className="h-16 border-b border-neutral-divider/80 bg-white px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center space-x-4">
        <h1 className="text-base font-semibold text-brand-navy">
          Investigation Console
        </h1>
        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-neutral-surface border border-neutral-divider text-[11px] font-medium text-brand-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Local Development</span>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-control bg-lavender-surface/50 border border-lavender-accent/30 text-xs text-brand-deepPurple">
          <UserCheck className="w-3.5 h-3.5 text-cobalt-action" />
          <span className="font-medium">Operator Persona (Preview)</span>
        </div>

        <Link href="/investigations/new">
          <Button size="sm" variant="primary" className="space-x-1.5">
            <Plus className="w-4 h-4" />
            <span>New Report</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}
