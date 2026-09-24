'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronRight,
  Layers,
  ListTodo,
  Package,
  RefreshCcw,
  Settings,
  Split,
} from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { projectHref } from './routes';
import { SidebarLink, SidebarSection, isActivePath, sidebarRowClass } from './sidebar-nav';

export interface SidebarProject {
  id: string;
  name: string;
  ticketKey: string;
}

const SUB_LINKS = [
  { segment: '', label: 'Issues', icon: <ListTodo /> },
  { segment: 'triage', label: 'Triage', icon: <Split /> },
  { segment: 'cycles', label: 'Cycles', icon: <RefreshCcw /> },
  { segment: 'epics', label: 'Epics', icon: <Package /> },
  { segment: 'views', label: 'Views', icon: <Layers /> },
  { segment: 'settings', label: 'Settings', icon: <Settings /> },
];

// Per-project open state lives in localStorage; one shared listener set lets
// every row re-read after a toggle (storage events don't fire in the same tab).
const OPEN_PREFIX = 'sidebar-project:';
const openListeners = new Set<() => void>();

function readOpen(id: string): string | null {
  try {
    return localStorage.getItem(OPEN_PREFIX + id);
  } catch {
    return null;
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    localStorage.setItem(OPEN_PREFIX + id, open ? '1' : '0');
  } catch {
    // Storage unavailable: the row still toggles, it just isn't remembered.
  }
  openListeners.forEach((listener) => listener());
}

function subscribeOpen(listener: () => void) {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

function ProjectItem({ project }: { project: SidebarProject }) {
  const pathname = usePathname();
  const base = projectHref(project.id);
  const inProject = isActivePath(pathname, base);
  // Server snapshot is null, so SSR and hydration agree on the default.
  const stored = useSyncExternalStore(
    subscribeOpen,
    () => readOpen(project.id),
    () => null,
  );
  const open = stored === null ? inProject : stored === '1';

  // The issues page is the project root, so it must not claim sub-routes that
  // have their own entry (triage, cycles, …); issue permalinks still count.
  const issuesActive =
    pathname === base || pathname.startsWith(`${base}/issues/`);

  return (
    <Collapsible open={open} onOpenChange={(next) => writeOpen(project.id, next)}>
      <CollapsibleTrigger
        className={cn(
          sidebarRowClass,
          'w-full text-sidebar-foreground hover:bg-sidebar-accent/60',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-4 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-semibold text-primary"
        >
          {project.name.charAt(0).toUpperCase()}
        </span>
        <span className={cn('min-w-0 flex-1 truncate text-left', inProject && 'font-medium')}>
          {project.name}
        </span>
        <ChevronRight
          aria-hidden="true"
          className={cn('!size-3 transition-transform', open && 'rotate-90')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-px py-px">
        {SUB_LINKS.map((link) => (
          <SidebarLink
            key={link.segment}
            href={projectHref(project.id, link.segment)}
            label={link.label}
            icon={link.icon}
            indent
            active={link.segment === '' ? issuesActive : undefined}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SidebarProjects({ projects }: { projects: SidebarProject[] }) {
  return (
    <SidebarSection
      title={
        <Link
          href="/dashboard"
          className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Your projects
        </Link>
      }
    >
      {projects.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">No projects yet.</p>
      ) : (
        projects.map((project) => <ProjectItem key={project.id} project={project} />)
      )}
    </SidebarSection>
  );
}
