<!--
  Project-level navigation, rendered by the project layout above every page.
  Links styled as a line tab bar (they're routes, not in-page panels).
  Port of src/components/project/project-tabs.tsx.
-->
<script module lang="ts">
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import UsersIcon from '@lucide/svelte/icons/users';

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
    { segment: 'archive', label: 'Archive', icon: ArchiveIcon },
    { segment: 'trash', label: 'Trash', icon: Trash2Icon },
    { segment: 'settings/members', label: 'Members', icon: UsersIcon },
    { segment: 'settings', label: 'Settings', icon: SettingsIcon },
  ];
</script>

<script lang="ts">
  import { page } from '$app/state';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';

  import { projectHref } from '@/components/app-shell/routes';
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
  aria-label="Project"
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
          aria-label="More project pages"
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
