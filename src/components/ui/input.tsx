import * as React from 'react';
import { cn } from './button';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-control border border-neutral-divider bg-white px-3.5 py-2 text-sm text-brand-navy shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-brand-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-action focus-visible:border-cobalt-action disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
