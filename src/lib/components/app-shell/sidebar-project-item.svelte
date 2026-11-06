<!-- One project row of the sidebar. -->
<script module lang="ts">
  import { createSubscriber } from 'svelte/reactivity';

  import type { SidebarProject } from './sidebar-types';

  // Guards against bad data: a cycle or absurd depth just stops nesting.
  export const MAX_DEPTH = 4;

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

  const trackOpen = createSubscriber((update) => {
    openListeners.add(update);
    return () => {
      openListeners.delete(update);
    };
  });

  export interface SidebarProjectItemProps {
    project: SidebarProject;
    childrenOf: Map<string, SidebarProject[]>;
    depth?: number;
  }
</script>

<script lang="ts">
  import { page } from '$app/state';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import FileTextIcon from '@lucide/svelte/icons/file-text';
  import LayersIcon from '@lucide/svelte/icons/layers';
  import ListTodoIcon from '@lucide/svelte/icons/list-todo';
  import PackageIcon from '@lucide/svelte/icons/package';
  import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import SplitIcon from '@lucide/svelte/icons/split';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/lib/components/ui/collapsible';
  import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';
  import { cn } from '@/lib/utils';
  import SidebarLink from './sidebar-link.svelte';
  import SidebarProjectItem from './sidebar-project-item.svelte';
  import { isActivePath, sidebarRowClass } from './sidebar-row';

  const SUB_LINKS = [
    { segment: '', label: 'Issues', icon: ListTodoIcon },
    { segment: 'triage', label: 'Triage', icon: SplitIcon },
    { segment: 'cycles', label: 'Cycles', icon: RefreshCcwIcon },
    { segment: 'epics', label: 'Epics', icon: PackageIcon },
    { segment: 'views', label: 'Views', icon: LayersIcon },
    { segment: 'docs', label: 'Docs', icon: FileTextIcon },
    { segment: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  let { project, childrenOf, depth = 0 }: SidebarProjectItemProps = $props();

  // useSyncExternalStore's server snapshot is null, so SSR and hydration agree
  // on the default; a row mounted after hydration reads storage right away.
  let hydrated = $state(isAppHydrated());
  $effect(() => {
    hydrated = true;
    markAppHydrated();
  });

  const subTeams = $derived(depth < MAX_DEPTH ? (childrenOf.get(project.id) ?? []) : []);
  const pathname = $derived(page.url.pathname);
  const base = $derived(projectHref(project.id));
  const inProject = $derived(isActivePath(pathname, base));
  const stored = $derived.by(() => {
    if (!hydrated) return null;
    trackOpen();
    return readOpen(project.id);
  });
  const open = $derived(stored === null ? inProject : stored === '1');

  // The issues page is the project root, so it must not claim sub-routes that
  // have their own entry (triage, cycles, …); issue permalinks still count.
  const issuesActive = $derived(pathname === base || pathname.startsWith(`${base}/issues/`));
</script>

<Collapsible {open} onOpenChange={(next) => writeOpen(project.id, next)}>
  <CollapsibleTrigger class={cn(sidebarRowClass, 'w-full text-sidebar-foreground hover:bg-sidebar-accent/60')}>
    <span
      aria-hidden="true"
      class="flex size-4 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-semibold text-primary"
    >
      {project.name.charAt(0).toUpperCase()}
    </span>
    <span class={cn('min-w-0 flex-1 truncate text-left', inProject && 'font-medium')}>
      {project.name}
    </span>
    <ChevronRightIcon aria-hidden="true" class={cn('!size-3 transition-transform', open && 'rotate-90')} />
  </CollapsibleTrigger>
  <CollapsibleContent class="flex flex-col gap-px py-px">
    {#each SUB_LINKS as link (link.segment)}
      <SidebarLink
        href={projectHref(project.id, link.segment)}
        label={link.label}
        indent
        active={link.segment === '' ? issuesActive : undefined}
      >
        {#snippet icon()}<link.icon />{/snippet}
      </SidebarLink>
    {/each}
    {#if subTeams.length > 0}
      <div class="ml-3.5 flex flex-col gap-px border-l border-sidebar-border pl-1">
        {#each subTeams as child (child.id)}
          <SidebarProjectItem project={child} {childrenOf} depth={depth + 1} />
        {/each}
      </div>
    {/if}
  </CollapsibleContent>
</Collapsible>
