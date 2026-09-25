'use client';

// Project-level navigation, rendered by the project layout above every page.
// Links styled as a line tab bar (they're routes, not in-page panels).

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, MoreHorizontal, Settings, Trash2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { projectHref } from '@/components/app-shell/routes';
import { cn } from '@/lib/utils';

const TABS = [
  { segment: '', label: 'Issues' },
  { segment: 'triage', label: 'Triage' },
  { segment: 'cycles', label: 'Cycles' },
  { segment: 'epics', label: 'Epics' },
  { segment: 'roadmap', label: 'Roadmap' },
  { segment: 'views', label: 'Views' },
  { segment: 'docs', label: 'Docs' },
  { segment: 'customers', label: 'Customers' },
  { segment: 'insights', label: 'Insights' },
];

const MORE = [
  { segment: 'archive', label: 'Archive', icon: <Archive /> },
  { segment: 'trash', label: 'Trash', icon: <Trash2 /> },
  { segment: 'settings/members', label: 'Members', icon: <Users /> },
  { segment: 'settings', label: 'Settings', icon: <Settings /> },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = projectHref(projectId);
  const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : '';
  const section = rest.split('/')[0];

  // Issue permalinks (/issues/APP-1) belong to the Issues tab.
  const activeTab = section === 'issues' ? '' : section;
  const inMore = MORE.some((item) => item.segment.split('/')[0] === section);

  return (
    <nav
      aria-label="Project"
      data-project-tabs
      className="mb-4 flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
    >
      {TABS.map((tab) => {
        const active = tab.segment === activeTab;
        return (
          <Link
            key={tab.segment}
            href={projectHref(projectId, tab.segment)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-2 py-2 text-sm outline-none transition-colors',
              'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="More project pages"
            className={cn('ml-1 shrink-0', inMore && 'text-foreground')}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {MORE.map((item, i) => (
            <Fragment key={item.segment}>
              {i === 2 && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild>
                <Link href={projectHref(projectId, item.segment)}>
                  {item.icon}
                  {item.label}
                </Link>
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
