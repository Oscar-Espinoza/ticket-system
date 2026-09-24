'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

import {
  ACCOUNT_SETTINGS_NAV,
  PROJECT_SECTIONS,
  PROJECT_SETTINGS_NAV,
  TOP_LEVEL_PAGES,
  labelFor,
  projectHref,
} from './routes';

interface BreadcrumbProject {
  id: string;
  name: string;
}

interface Crumb {
  label: string;
  href?: string;
}

// Detail pages under these sections carry an opaque id in the URL; the crumb
// shows a generic noun rather than fetching the record's name.
const DETAIL_NOUN: Record<string, string> = {
  cycles: 'Cycle',
  epics: 'Epic',
  views: 'View',
  initiatives: 'Initiative',
};

function projectCrumbs(rest: string[], base: string): Crumb[] {
  const [section, detail, sub] = rest;
  if (!section) return [{ label: 'Issues' }];
  // Issue permalink: the key itself (e.g. "APP-12") is the best label.
  if (section === 'issues' && detail) {
    return [{ label: 'Issues', href: base }, { label: decodeURIComponent(detail).toUpperCase() }];
  }
  const crumbs: Crumb[] = [
    { label: labelFor(PROJECT_SECTIONS, section) ?? section, href: `${base}/${section}` },
  ];
  if (section === 'settings' && detail) {
    crumbs.push({ label: labelFor(PROJECT_SETTINGS_NAV, detail) ?? detail });
  } else if (detail) {
    crumbs.push({ label: DETAIL_NOUN[section] ?? detail });
  }
  if (sub) crumbs.push({ label: sub });
  return crumbs;
}

export function Breadcrumb({ projects }: { projects: BreadcrumbProject[] }) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'dashboard') return null;
  const [, area, id, ...rest] = segments;

  const crumbs: Crumb[] = [];

  if (!area) {
    crumbs.push({ label: 'Projects' });
  } else if (area === 'projects' && id) {
    const project = projects.find((p) => p.id === id);
    const base = projectHref(id);
    crumbs.push({ label: project?.name ?? 'Unknown project', href: base });
    crumbs.push(...projectCrumbs(rest, base));
  } else if (area === 'settings') {
    crumbs.push({ label: 'Settings', href: '/dashboard/settings' });
    if (id) crumbs.push({ label: labelFor(ACCOUNT_SETTINGS_NAV, id) ?? id });
  } else if (area === 'workspaces' && id) {
    crumbs.push({ label: decodeURIComponent(id), href: `/dashboard/workspaces/${id}` });
    if (rest[0] === 'initiatives') {
      crumbs.push({ label: 'Initiatives', href: `/dashboard/workspaces/${id}/initiatives` });
      if (rest[1]) crumbs.push({ label: DETAIL_NOUN.initiatives });
    }
  } else if (area === 'people') {
    crumbs.push({ label: 'People' });
    if (id) crumbs.push({ label: 'Profile' });
  } else {
    const label = labelFor(TOP_LEVEL_PAGES, area) ?? area;
    crumbs.push({ label, href: `/dashboard/${area}` });
    if (id) crumbs.push({ label: DETAIL_NOUN[area] ?? id });
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
          <Fragment key={i}>
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
