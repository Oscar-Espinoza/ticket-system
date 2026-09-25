'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { FilePen, Inbox, Layers, LayoutDashboard, PanelLeft, Search, Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { readDensity } from '@/lib/density';
import { cn } from '@/lib/utils';
import { Breadcrumb } from './breadcrumb';
import { SidebarLink } from './sidebar-nav';
import { SidebarProjects, type SidebarProject } from './sidebar-projects';

export type ShellProject = SidebarProject;

export interface ShellFrameProps {
  projects: ShellProject[];
  sidebarFooter: React.ReactNode;
  topbarRight: React.ReactNode;
  /** Slot nodes rendered server-side by AppShell (see ./slots). */
  inboxBadge?: React.ReactNode;
  favorites?: React.ReactNode;
  workspaces?: React.ReactNode;
  children: React.ReactNode;
}

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
  inboxBadge,
  favorites,
  workspaces,
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

  // AppShell's inline script covers full page loads; this covers arriving via
  // client navigation (e.g. after login), where inline scripts don't run.
  useEffect(() => {
    if (readDensity() === 'compact') document.documentElement.dataset.density = 'compact';
  }, []);

  const open = narrow ? overlayPath === pathname : !storedCollapsed;
  const setOpen = (next: boolean) => {
    if (narrow) setOverlayPath(next ? pathname : null);
    else writeCollapsed(!next);
  };

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
            'flex w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar',
            // Pinned to the viewport so a long project list scrolls on its own.
            narrow ? 'fixed inset-y-0 left-0 z-40 shadow-popover' : 'sticky top-0 h-screen',
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
            <div className="flex flex-col gap-px">
              <SidebarLink href="/dashboard/search" label="Search" icon={<Search />} />
              <SidebarLink
                href="/dashboard/inbox"
                label="Inbox"
                icon={<Inbox />}
                trailing={inboxBadge}
              />
              <SidebarLink href="/dashboard/my-issues" label="My issues" icon={<Target />} />
              <SidebarLink href="/dashboard/views" label="Views" icon={<Layers />} />
              <SidebarLink href="/dashboard/drafts" label="Drafts" icon={<FilePen />} />
              <SidebarLink href="/dashboard/dashboards" label="Dashboards" icon={<LayoutDashboard />} />
            </div>

            {favorites}
            {workspaces}
            <SidebarProjects projects={projects} />
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
