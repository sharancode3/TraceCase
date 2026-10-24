'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserCheck, LogIn, LogOut, Menu, X, LayoutDashboard, Target, PlusCircle, PlayCircle } from 'lucide-react';
import { cn } from '../ui/button';
import { useTour } from '@/components/guide/tour-context';
import { TraceCaseLogo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';

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
    fetch('/api/auth/session')
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
        // Auth not active or offline
      });

    const handleAuthChange = (e: Event) => {
      const custom = e as CustomEvent<{ operator: string | null }>;
      if (isMounted) {
        setOperator(custom.detail?.operator || null);
      }
    };
    window.addEventListener('tracecase:auth-state-change', handleAuthChange);

    return () => {
      isMounted = false;
      window.removeEventListener('tracecase:auth-state-change', handleAuthChange);
    };
  }, []);

  const { startTour, openPrompt } = useTour();

  const handleDevSignIn = async () => {
    setIsSigningIn(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'operator@tracecase.local', role: 'operator' }),
      });
      if (res.ok) {
        const json = await res.json();
        const email = json.principal?.email || 'operator@tracecase.local';
        setOperator(email);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tracecase:auth-state-change', { detail: { operator: email } }));
        }
        openPrompt();
      }
    } catch {
      // Best-effort login
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDevSignOut = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      setOperator(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tracecase:auth-state-change', { detail: { operator: null } }));
      }
    } catch {
      // Best-effort logout
    }
  };

  return (
    <header className="md:hidden relative border-b border-neutral-divider/80 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-150">
      <div className="h-16 px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center space-x-3 md:space-x-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-control text-brand-muted hover:text-brand-navy dark:hover:text-slate-100 hover:bg-neutral-surface dark:hover:bg-slate-800"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center space-x-2">
            <TraceCaseLogo size={22} color="#4767DB" />
            <span className="font-bold text-sm text-brand-navy dark:text-slate-100 tracking-tight">TraceCase</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 md:space-x-3">
          <ThemeToggle />

          {operator ? (
            <button
              id="header-operator-badge"
              onClick={handleDevSignOut}
              title="Click to sign out"
              aria-label="Sign out of operator session"
              className="flex items-center space-x-2 px-3 py-1.5 rounded-control bg-lavender-surface/50 dark:bg-slate-800 hover:bg-lavender-surface dark:hover:bg-slate-700 border border-lavender-accent/30 dark:border-slate-700 text-xs text-brand-deepPurple dark:text-indigo-300 transition-all cursor-pointer group"
            >
              <UserCheck className="w-4 h-4 text-cobalt-action dark:text-indigo-400 group-hover:text-cobalt-action/80 transition-colors" />
              <span className="font-medium font-mono text-xs group-hover:underline">{operator}</span>
              <LogOut className="w-3.5 h-3.5 text-brand-muted dark:text-slate-400 group-hover:text-brand-navy dark:group-hover:text-slate-100 ml-1 transition-colors" />
            </button>
          ) : (
            <button
              id="header-signin-btn"
              onClick={handleDevSignIn}
              disabled={isSigningIn}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-neutral-surface dark:bg-slate-800 hover:bg-lavender-surface/50 dark:hover:bg-slate-700 border border-neutral-divider dark:border-slate-700 text-sm text-brand-navy dark:text-slate-200 transition-colors font-medium cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-cobalt-action dark:text-indigo-400" />
              <span>{isSigningIn ? 'Signing in...' : 'Sign In'}</span>
            </button>
          )}
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
            <button
              id="header-mobile-take-demo-btn"
              onClick={() => {
                setMobileMenuOpen(false);
                startTour(0);
              }}
              className="w-full flex items-center space-x-3 px-3 py-2 rounded-control text-sm font-semibold text-cobalt-action bg-lavender-subtle hover:bg-lavender-surface border border-lavender-accent/40 transition-all cursor-pointer"
            >
              <PlayCircle className="w-4 h-4 text-cobalt-action shrink-0" />
              <span>Take a Demo</span>
            </button>
          </nav>

          <div className="pt-2 border-t border-neutral-divider/60">
            {operator ? (
              <button
                onClick={() => {
                  handleDevSignOut();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between py-2 px-3 rounded-control bg-lavender-surface/50 hover:bg-lavender-surface text-xs text-brand-deepPurple transition-all cursor-pointer"
                title="Click to sign out"
              >
                <div className="flex items-center space-x-2">
                  <UserCheck className="w-4 h-4 text-cobalt-action" />
                  <span className="font-mono text-xs truncate">{operator}</span>
                </div>
                <span className="text-xs text-brand-muted hover:text-brand-navy flex items-center space-x-1">
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </span>
              </button>
            ) : (
              <button
                onClick={() => {
                  handleDevSignIn();
                  setMobileMenuOpen(false);
                }}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded-control bg-neutral-surface hover:bg-lavender-surface/50 border border-neutral-divider text-sm font-medium text-brand-navy"
              >
                <LogIn className="w-4 h-4 text-cobalt-action" />
                <span>{isSigningIn ? 'Signing in...' : 'Sign in (Local Dev)'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

