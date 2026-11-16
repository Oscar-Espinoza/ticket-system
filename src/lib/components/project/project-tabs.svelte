<!--
  Project-level navigation, rendered by the project layout above every page.
  Links styled as a line tab bar (they're routes, not in-page panels).
-->
<script module lang="ts">
  import { m } from '@/lib/i18n';

  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import UsersIcon from '@lucide/svelte/icons/users';

  const TABS = [
    { segment: '', get label() { return m.projects_tab_issues(); } },
    { segment: 'triage', get label() { return m.projects_tab_triage(); } },
    { segment: 'cycles', get label() { return m.projects_tab_cycles(); } },
    { segment: 'epics', get label() { return m.projects_tab_epics(); } },
    { segment: 'roadmap', get label() { return m.projects_tab_roadmap(); } },
    { segment: 'views', get label() { return m.projects_tab_views(); } },
    { segment: 'docs', get label() { return m.projects_tab_docs(); } },
    { segment: 'customers', get label() { return m.projects_tab_customers(); } },
    { segment: 'insights', get label() { return m.projects_tab_insights(); } },
  ];

  const MORE = [
    { segment: 'archive', get label() { return m.projects_tab_archive(); }, icon: ArchiveIcon },
    { segment: 'trash', get label() { return m.projects_tab_trash(); }, icon: Trash2Icon },
    { segment: 'settings/members', get label() { return m.projects_tab_members(); }, icon: UsersIcon },
    { segment: 'settings', get label() { return m.projects_tab_settings(); }, icon: SettingsIcon },
  ];
</script>

<script lang="ts">
  import { page } from '$app/state';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { cn } from '@/lib/utils';

  let { projectId }: { projectId: string } = $props();

  const base = $derived(projectHref(projectId));
  const section = $derived.by(() => {
    const pathname = page.url.pathname;
    const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : '';
    return rest.split('/')[0];
  });
  // Issue permalinks (/issues/APP-1) belong to the Issues tab.
  const activeTab = $derived(section === 'issues' ? '' : section);
  const inMore = $derived(MORE.some((item) => item.segment.split('/')[0] === section));
</script>

<nav
  aria-label={m.projects_tabs_nav()}
  data-project-tabs
  class="mb-4 flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
>
  {#each TABS as tab (tab.segment)}
    {@const active = tab.segment === activeTab}
    <a
      href={projectHref(projectId, tab.segment)}
      aria-current={active ? 'page' : undefined}
      class={cn(
        '-mb-px shrink-0 border-b-2 px-2 py-2 text-sm outline-none transition-colors',
        'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-foreground font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {tab.label}
    </a>
  {/each}

  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon-sm"
          aria-label={m.projects_tabs_more()}
          class={cn('ml-1 shrink-0', inMore && 'text-foreground')}
        >
          <MoreHorizontalIcon />
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-44">
      {#each MORE as item, i (item.segment)}
        {#if i === 2}<DropdownMenuSeparator />{/if}
        <DropdownMenuItem>
          {#snippet child({ props })}
            <a {...props} href={projectHref(projectId, item.segment)}>
              <item.icon />
              {item.label}
            </a>
          {/snippet}
        </DropdownMenuItem>
      {/each}
    </DropdownMenuContent>
  </DropdownMenu>
</nav>
