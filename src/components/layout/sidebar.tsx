'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Target,
  PlusCircle,
  PlayCircle,
  UserCheck,
  LogIn,
  LogOut,
  HelpCircle,
} from 'lucide-react';
import { cn } from '../ui/button';
import { useTour } from '@/components/guide/tour-context';
import { TraceCaseLogo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';

const NAV_ITEMS = [
  { id: 'nav-investigations', label: 'Investigations', href: '/', icon: LayoutDashboard },
  { id: 'nav-targets', label: 'Target Environments', href: '/targets', icon: Target },
  { id: 'nav-new-report', label: 'Submit Bug Report', href: '/investigations/new', icon: PlusCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const { startTour, openGuide, openPrompt } = useTour();
  const [operator, setOperator] = React.useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    const token = typeof window !== 'undefined' ? localStorage.getItem('tc_operator_token') : null;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch('/api/auth/session', { headers, credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;
        if (data?.token && typeof window !== 'undefined') {
          localStorage.setItem('tc_operator_token', data.token);
        }
        if (data?.principal?.email) {
          setOperator(data.principal.email);
        }
      })
      .catch(() => {});

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
        if (json.token && typeof window !== 'undefined') {
          localStorage.setItem('tc_operator_token', json.token);
        }
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
        localStorage.removeItem('tc_operator_token');
        window.dispatchEvent(new CustomEvent('tracecase:auth-state-change', { detail: { operator: null } }));
      }
    } catch {
      // Best-effort logout
    }
  };

  return (
    <aside className="hidden md:flex md:w-64 border-r border-neutral-divider/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col justify-between shrink-0 h-full max-h-full select-none transition-colors duration-150">
      <div className="flex flex-col min-h-0">
        {/* Brand Header */}
        <div className="px-5 py-4 border-b border-neutral-divider/50 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <TraceCaseLogo size={26} color="#4767DB" />
            <span className="font-bold text-base text-brand-navy dark:text-slate-100 tracking-tight">TraceCase</span>
          </div>
          <ThemeToggle />
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5" aria-label="Main Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                id={item.id}
                href={item.href}
                className={cn(
                  'flex items-center space-x-3 px-3 py-2.5 rounded-control text-sm font-medium transition-all',
                  isActive
                    ? 'bg-lavender-surface dark:bg-indigo-950/60 text-cobalt-action dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-brand-navy dark:text-slate-300 hover:bg-neutral-surface dark:hover:bg-slate-800 hover:text-brand-deepPurple dark:hover:text-slate-100'
                )}
              >
                <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-cobalt-action dark:text-indigo-400' : 'text-brand-muted dark:text-slate-400')} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="pt-2">
            <button
              id="sidebar-guide-btn"
              onClick={() => openGuide(0)}
              className="w-full flex items-center space-x-3 px-3 py-2 rounded-control text-sm font-medium text-brand-navy dark:text-slate-200 bg-neutral-surface dark:bg-slate-800/80 hover:bg-lavender-surface/50 dark:hover:bg-slate-800 border border-neutral-divider dark:border-slate-700 transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-action mb-1.5"
            >
              <HelpCircle className="w-4 h-4 text-brand-muted dark:text-slate-400 shrink-0" />
              <span>First-Use Guide</span>
            </button>
            <button
              id="sidebar-take-demo-btn"
              onClick={() => startTour(0)}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-control text-sm font-semibold text-cobalt-action dark:text-indigo-400 bg-lavender-subtle dark:bg-indigo-950/40 hover:bg-lavender-surface dark:hover:bg-indigo-950/70 border border-lavender-accent/40 dark:border-indigo-800/50 transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-action"
            >
              <PlayCircle className="w-4 h-4 text-cobalt-action dark:text-indigo-400 shrink-0" />
              <span>Product Tour</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Operator Auth Button */}
      <div className="p-3 border-t border-neutral-divider/60 dark:border-slate-800 shrink-0">
        {operator ? (
          <button
            id="sidebar-operator-btn"
            onClick={handleDevSignOut}
            title="Click to sign out"
            aria-label="Sign out of operator session"
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-control bg-lavender-surface/50 dark:bg-slate-800/80 hover:bg-lavender-surface dark:hover:bg-slate-800 border border-lavender-accent/40 dark:border-slate-700 text-xs text-brand-deepPurple dark:text-indigo-300 transition-all cursor-pointer group shadow-xs"
          >
            <div className="flex items-center space-x-2 truncate">
              <UserCheck className="w-4 h-4 text-cobalt-action dark:text-indigo-400 group-hover:text-cobalt-action/80 transition-colors shrink-0" />
              <span className="font-mono text-xs truncate">{operator}</span>
            </div>
            <LogOut className="w-3.5 h-3.5 text-brand-muted dark:text-slate-400 group-hover:text-brand-navy dark:group-hover:text-slate-100 ml-1.5 transition-colors shrink-0" />
          </button>
        ) : (
          <button
            id="sidebar-signin-btn"
            onClick={handleDevSignIn}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 rounded-control bg-cobalt-action hover:bg-cobalt-hover text-white text-sm font-semibold transition-all shadow-sm cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{isSigningIn ? 'Signing in...' : 'Sign In'}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
