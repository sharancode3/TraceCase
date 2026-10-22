'use client';

import * as React from 'react';
import { X } from 'lucide-react';

export interface PreviewBannerProps {
  isSyntheticPreview?: boolean;
}

export function PreviewBanner({ isSyntheticPreview = false }: PreviewBannerProps) {
  const [dismissed, setDismissed] = React.useState(false);

  if (!isSyntheticPreview || dismissed) return null;

  return (
    <div className="bg-lavender-surface border-b border-lavender-accent/50 px-4 py-2.5 text-xs text-brand-navy">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full font-semibold bg-cobalt-action text-white text-[10px] tracking-wide uppercase">
            Synthetic Preview Mode
          </span>
          <span className="font-medium text-brand-deepPurple">
            Synthetic Data Active
          </span>
          <span className="text-brand-muted hidden sm:inline">
            Demonstration preview with isolated synthetic records. Set DEV_PREVIEW_MODE=false for real browser execution and local persistence.
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-brand-muted hover:text-brand-navy p-1 rounded-full hover:bg-white/50 transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
