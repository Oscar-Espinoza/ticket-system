'use client';

// Topbar breadcrumb — derived from the route (C2; M2 scope item 1).
//
// Layouts do not re-render on navigation and cannot read the pathname, so this
// lives in a client component using usePathname() (Next.js docs). The id→name
// map comes from the AppShell's single getProjectsForUser() query — the same
// data the sidebar renders — so the crumb always matches the project list.
//
//   /dashboard                          → Projects
//   /dashboard/projects/[id]            → Projects / <project name>
//   /dashboard/projects/[id]/members    → Projects / <project name> / Members

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BreadcrumbProject {
  id: string;
  name: string;
}

interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ projects }: { projects: BreadcrumbProject[] }) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const crumbs: Crumb[] = [];

  if (segments[0] === 'dashboard') {
    crumbs.push({ label: 'Projects', href: '/dashboard' });
  }
  if (segments[1] === 'projects' && segments[2]) {
    const project = projects.find((p) => p.id === segments[2]);
    crumbs.push({
      // Fallback to the raw id if the project is not in the map (e.g. it was
      // deleted in another tab) — the crumb never renders empty.
      label: project?.name ?? segments[2],
      href: `/dashboard/projects/${segments[2]}`,
    });
  }
  if (segments[3] === 'members') {
    crumbs.push({ label: 'Members' });
  }

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      data-app-breadcrumb
      className="flex min-w-0 items-center gap-1.5 text-sm"
    >
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={`${crumb.label}-${crumb.href ?? ''}`}>
            {i > 0 && (
              <ChevronRight
                aria-hidden="true"
                className="size-3 shrink-0 text-muted-foreground"
              />
            )}
            {crumb.href && !last ? (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={last ? 'page' : undefined}
                className={cn(
                  'truncate',
                  last ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
