'use client';

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
      label: project?.name ?? 'Unknown project',
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
                className="truncate rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
