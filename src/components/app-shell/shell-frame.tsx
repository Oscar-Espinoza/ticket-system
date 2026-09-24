'use client';

// ShellFrame — the client half of C2 (docs/mimo-refactor/M2-app-shell.md).
//
// Owns exactly two concerns, both pure chrome:
//   1. collapsed-sidebar state (simple useState — NO persistence; M8 audits
//      persistence, M2 keeps it minimal per the milestone's out-of-scope list).
//   2. route-derived active states. Layouts do NOT re-render on navigation and
//      cannot read the pathname (Next.js docs), so usePathname() lives here and
//      in <Breadcrumb>, which re-render on every client navigation.
//
// All data arrives as props from the server AppShell — this component never
// fetches. The single <header> landmark of the app is the topbar below; the
// sidebar's workspace row is deliberately a plain <div> so the app ships
// exactly one <header> (M2 acceptance).

import { useState } from 'react';
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

// C2 nav model — sidebar entries are declared HERE and nowhere else. M5 adds
// project-scoped nav by extending this model, never by editing shell internals
// (M2 "Allowed future touches").
const PRIMARY_NAV = [{ label: 'Projects', href: '/dashboard' }] as const;

const navIdle =
  'text-sidebar-foreground hover:bg-sidebar-accent/60';
const navActive =
  'bg-sidebar-accent font-medium text-sidebar-accent-foreground';
const navLinkClass = cn(
  'flex items-center rounded-md px-2 py-1.5 text-sm outline-none',
  'transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
);

export function ShellFrame({
  projects,
  sidebarFooter,
  topbarRight,
  children,
}: ShellFrameProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — ~220px, Linear-style (C1 sidebar tokens) */}
      {!collapsed && (
        <aside
          id="app-sidebar"
          data-app-sidebar
          className="flex w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
        >
          {/* Workspace row (div, not <header> — the topbar is the app's only
              header landmark) */}
          <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
            <Wordmark />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Collapse sidebar"
              aria-expanded="true"
              aria-controls="app-sidebar"
              onClick={() => setCollapsed(true)}
            >
              <PanelLeft />
            </Button>
          </div>

          <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2">
            {PRIMARY_NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-nav={item.label}
                  data-active={active}
                  className={cn(navLinkClass, active ? navActive : navIdle)}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* Server-rendered project list — same getProjectsForUser query as
                the main list, so both can never disagree (M2 acceptance). */}
            {projects.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {projects.map((p) => {
                  const active = pathname.startsWith(
                    `/dashboard/projects/${p.id}`,
                  );
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/dashboard/projects/${p.id}`}
                        data-active={active}
                        className={cn(
                          navLinkClass,
                          'pl-4',
                          active ? navActive : navIdle,
                        )}
                      >
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {/* sidebarFooter composition slot (C2) */}
          <div className="border-t border-sidebar-border p-2">
            {sidebarFooter}
          </div>
        </aside>
      )}

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-app-topbar
          className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4"
        >
          {collapsed && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Expand sidebar"
              aria-expanded="false"
              onClick={() => setCollapsed(false)}
            >
              <PanelLeft />
            </Button>
          )}

          <Breadcrumb projects={projects} />

          {/* topbarRight composition slot (C2) — ships empty; M3 fills it */}
          <div className="ml-auto flex items-center gap-2">{topbarRight}</div>
        </header>

        {/* Full-width content area — replaces the old max-w-4xl centering */}
        <main data-app-main className="flex-1 px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
