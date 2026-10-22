'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, UserCheck, LogIn, LogOut } from 'lucide-react';
import { Button } from '../ui/button';

export function Header() {
  const [operator, setOperator] = React.useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    fetch('/api/dev/session')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (isMounted && data?.data?.authenticated && data?.data?.email) {
          setOperator(data.data.email);
        }
      })
      .catch(() => {
        // Dev auth not active or offline
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDevSignIn = async () => {
    setIsSigningIn(true);
    try {
      const res = await fetch('/api/dev/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'operator@tracecase.local', role: 'operator' }),
      });
      if (res.ok) {
        const json = await res.json();
        setOperator(json.data?.email || 'operator@tracecase.local');
      }
    } catch {
      // Best-effort dev login
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDevSignOut = async () => {
    try {
      await fetch('/api/dev/session', { method: 'DELETE' });
      setOperator(null);
    } catch {
      // Best-effort dev logout
    }
  };

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
        {operator ? (
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-control bg-lavender-surface/50 border border-lavender-accent/30 text-xs text-brand-deepPurple">
            <UserCheck className="w-3.5 h-3.5 text-cobalt-action" />
            <span className="font-medium font-mono text-[11px]">{operator}</span>
            <button
              onClick={handleDevSignOut}
              title="Sign out of local operator session"
              className="text-brand-muted hover:text-brand-navy ml-1.5"
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleDevSignIn}
            disabled={isSigningIn}
            className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-neutral-surface hover:bg-lavender-surface/50 border border-neutral-divider text-xs text-brand-navy transition-colors"
          >
            <LogIn className="w-3.5 h-3.5 text-cobalt-action" />
            <span>{isSigningIn ? 'Signing in...' : 'Sign in (Local Dev)'}</span>
          </button>
        )}

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
