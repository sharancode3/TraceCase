import * as React from 'react';
import { cn } from './button';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'confirmed' | 'notReproduced' | 'pending';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-lavender-surface text-brand-deepPurple border-lavender-accent',
    secondary: 'bg-neutral-surface text-brand-navy border-neutral-divider',
    outline: 'border border-neutral-divider text-brand-navy',
    confirmed: 'bg-status-confirmedBg text-status-confirmed border-red-200',
    notReproduced: 'bg-status-notReproducedBg text-status-notReproduced border-emerald-200',
    pending: 'bg-status-pendingBg text-status-pending border-amber-200',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
