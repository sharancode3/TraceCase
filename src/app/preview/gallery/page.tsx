'use client';

import * as React from 'react';
import Link from 'next/link';
import { Layers, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getLifecyclePresentation,
  getVerdictPresentation,
  getEvidencePresentation,
} from '@/contracts/status';
import { SYNTHETIC_INVESTIGATIONS_CATALOG } from '@/dev/fixtures';

export default function PreviewGalleryPage() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <div className="flex items-center space-x-2 text-xs font-bold text-cobalt-action uppercase tracking-wider mb-1">
          <Layers className="w-4 h-4" />
          <span>Stage 0 Comprehensive State Gallery</span>
        </div>
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          17 Canonical Investigation States
        </h2>
        <p className="text-sm text-brand-muted mt-1">
          Inspect every operational edge case, failure condition, and verified outcome mandated by Section 11 of the specification.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SYNTHETIC_INVESTIGATIONS_CATALOG.map((inv, idx) => {
          const lifecycle = getLifecyclePresentation(inv.lifecycleStatus);
          const verdict = getVerdictPresentation(inv.reproductionVerdict);
          const evidence = getEvidencePresentation(inv.evidenceReadiness);

          return (
            <Card key={inv.id} className="p-4 flex flex-col justify-between space-y-4 hover:shadow-cardHover transition-all">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-cobalt-action">State #{idx + 1}</span>
                  <span className="text-brand-muted truncate max-w-[120px]">{inv.targetName}</span>
                </div>

                <h3 className="font-bold text-sm text-brand-navy leading-snug line-clamp-2">
                  {inv.title}
                </h3>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-brand-muted font-medium">Lifecycle:</span>
                    <span className={`px-2 py-0.5 rounded-full border ${lifecycle.badgeClass}`}>
                      {lifecycle.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-brand-muted font-medium">Verdict:</span>
                    <span className={`px-2 py-0.5 rounded-full border ${verdict.badgeClass}`}>
                      {verdict.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-brand-muted font-medium">Evidence:</span>
                    <span className={`px-2 py-0.5 rounded-full border ${evidence.badgeClass}`}>
                      {evidence.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-divider/60">
                <Link href={`/investigations/${inv.id}`}>
                  <Button size="sm" variant="outline" className="w-full text-xs justify-between">
                    <span>Inspect State #{idx + 1}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
