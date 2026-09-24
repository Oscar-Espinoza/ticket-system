'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { cn } from '@/lib/utils';
import { Breadcrumb } from './breadcrumb';

export interface ShellProject {
  id: string;
  name: string;
}

export interface ShellFrameProps {
  projects: ShellProject[];
  sidebarFooter: React.ReactNode;
  topbarRight: React.ReactNode;
  children: React.ReactNode;
}

const PRIMARY_NAV = [{ label: 'Projects', href: '/dashboard' }] as const;

const navIdle = 'text-sidebar-foreground hover:bg-sidebar-accent/60';
const navActive = 'bg-sidebar-accent font-medium text-sidebar-accent-foreground';
const navLinkClass = cn(
  'flex items-center rounded-md px-2 py-1.5 text-sm outline-none',
  'transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
);

const COLLAPSED_KEY = 'sidebar-collapsed';
const NARROW_QUERY = '(max-width: 767px)';
const collapseListeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    // Storage unavailable (private mode): the choice just isn't remembered.
  }
  collapseListeners.forEach((listener) => listener());
}

function subscribeCollapsed(listener: () => void) {
  collapseListeners.add(listener);
  return () => {
    collapseListeners.delete(listener);
  };
}

function subscribeNarrow(listener: () => void) {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export function ShellFrame({
  projects,
  sidebarFooter,
  topbarRight,
  children,
}: ShellFrameProps) {
  const pathname = usePathname();
  const storedCollapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
  // On narrow screens the sidebar is an overlay that closes on navigation:
  // it stays open only for the path it was opened on.
  const [overlayPath, setOverlayPath] = useState<string | null>(null);

  const open = narrow ? overlayPath === pathname : !storedCollapsed;
  const setOpen = (next: boolean) => {
    if (narrow) setOverlayPath(next ? pathname : null);
    else writeCollapsed(!next);
  };

  const navLink = (href: string, label: string, active: boolean, indent = false) => (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(navLinkClass, indent && 'pl-4', active ? navActive : navIdle)}
    >
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {open && narrow && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <aside
          id="app-sidebar"
          data-app-sidebar
          className={cn(
            'flex w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar',
            narrow && 'fixed inset-y-0 left-0 z-40 shadow-popover',
          )}
        >
          {/* A div, not <header>: the topbar is the app's only header landmark. */}
          <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
            <Wordmark />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Collapse sidebar"
              aria-expanded="true"
              aria-controls="app-sidebar"
              onClick={() => setOpen(false)}
            >
              <PanelLeft />
            </Button>
          </div>

          <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2">
            {PRIMARY_NAV.map((item) => (
              <div key={item.href}>
                {navLink(item.href, item.label, pathname === item.href)}
              </div>
            ))}

            {projects.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {projects.map((p) => {
                  const href = `/dashboard/projects/${p.id}`;
                  return (
                    <li key={p.id}>
                      {navLink(
                        href,
                        p.name,
                        pathname === href || pathname.startsWith(`${href}/`),
                        true,
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          <div className="border-t border-sidebar-border p-2">{sidebarFooter}</div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-app-topbar
          className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4"
        >
          {!open && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Expand sidebar"
              aria-expanded="false"
              onClick={() => setOpen(true)}
            >
              <PanelLeft />
            </Button>
          )}

          <Breadcrumb projects={projects} />

          <div className="ml-auto flex items-center gap-2">{topbarRight}</div>
        </header>

        <main data-app-main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
