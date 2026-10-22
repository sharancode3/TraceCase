'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, UserCheck, LogIn, LogOut, Menu, X, LayoutDashboard, Target, PlusCircle } from 'lucide-react';
import { Button, cn } from '../ui/button';

const MOBILE_NAV_ITEMS = [
  { label: 'Investigations', href: '/', icon: LayoutDashboard },
  { label: 'Target Environments', href: '/targets', icon: Target },
  { label: 'Submit Bug Report', href: '/investigations/new', icon: PlusCircle },
];

export function Header() {
  const [operator, setOperator] = React.useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    let isMounted = true;
    fetch('/api/dev/session')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (isMounted && data?.authenticated && data?.principal?.email) {
          setOperator(data.principal.email);
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
        setOperator(json.principal?.email || 'operator@tracecase.local');
        window.location.reload();
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
      window.location.reload();
    } catch {
      // Best-effort dev logout
    }
  };

  return (
    <header className="relative border-b border-neutral-divider/80 bg-white">
      <div className="h-16 px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center space-x-3 md:space-x-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-control text-brand-muted hover:text-brand-navy hover:bg-neutral-surface"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h1 className="text-base font-semibold text-brand-navy">
            Investigation Console
          </h1>
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-neutral-surface border border-neutral-divider text-[11px] font-medium text-brand-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Local Development</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 md:space-x-3">
          {operator ? (
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-control bg-lavender-surface/50 border border-lavender-accent/30 text-xs text-brand-deepPurple">
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
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-neutral-surface hover:bg-lavender-surface/50 border border-neutral-divider text-xs text-brand-navy transition-colors"
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
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-divider/80 bg-white px-4 py-3 space-y-2 shadow-md">
          <nav className="space-y-1">
            {MOBILE_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center space-x-3 px-3 py-2 rounded-control text-sm font-medium transition-all',
                    isActive
                      ? 'bg-lavender-surface text-cobalt-action font-semibold'
                      : 'text-brand-navy hover:bg-neutral-surface'
                  )}
                >
                  <Icon className={cn('w-4 h-4', isActive ? 'text-cobalt-action' : 'text-brand-muted')} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-neutral-divider/60">
            {operator ? (
              <div className="flex items-center justify-between py-2 text-xs text-brand-deepPurple">
                <span className="font-mono text-[11px] truncate">{operator}</span>
                <button
                  onClick={() => {
                    handleDevSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="text-xs text-brand-muted hover:text-brand-navy flex items-center space-x-1"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sign out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  handleDevSignIn();
                  setMobileMenuOpen(false);
                }}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded-control bg-neutral-surface hover:bg-lavender-surface/50 border border-neutral-divider text-xs text-brand-navy"
              >
                <LogIn className="w-3.5 h-3.5 text-cobalt-action" />
                <span>{isSigningIn ? 'Signing in...' : 'Sign in (Local Dev)'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

