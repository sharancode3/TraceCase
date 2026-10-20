import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-action focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';

    const variants = {
      primary: 'bg-cobalt-action text-white hover:bg-cobalt-hover shadow-sm',
      secondary: 'bg-lavender-surface text-brand-deepPurple hover:bg-[#E2E7FE]',
      outline: 'border border-neutral-divider bg-white text-brand-navy hover:bg-neutral-surface',
      ghost: 'bg-transparent text-brand-navy hover:bg-neutral-surface',
      destructive: 'bg-status-confirmed text-white hover:bg-[#C22F31]',
    };

    const sizes = {
      sm: 'h-9 px-3 text-xs rounded-control',
      md: 'h-11 px-5 text-sm rounded-control',
      lg: 'h-12 px-6 text-base rounded-control',
      icon: 'h-10 w-10 rounded-full p-0 flex items-center justify-center', // Circular icon button per UI spec
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
