import * as React from 'react';
import { cn } from './button';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[100px] w-full rounded-control border border-neutral-divider bg-white px-3.5 py-2.5 text-sm text-brand-navy shadow-sm transition-colors placeholder:text-brand-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-action focus-visible:border-cobalt-action disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
