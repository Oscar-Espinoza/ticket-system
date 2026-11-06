<!-- App shell chrome: sidebar + topbar + main. -->
<script module lang="ts">
  import type { Snippet } from 'svelte';
  import { createSubscriber, MediaQuery } from 'svelte/reactivity';

  import { readStorage, writeStorage } from '@/lib/svelte/storage';
  import type { SidebarProject } from './sidebar-types';

  export type ShellProject = SidebarProject;

  export interface ShellFrameProps {
    projects: ShellProject[];
    sidebarFooter?: Snippet;
    topbarRight?: Snippet;
    /** Slot nodes filled by AppShell (see ./slots). */
    inboxBadge?: Snippet;
    favorites?: Snippet;
    workspaces?: Snippet;
    children?: Snippet;
  }

  const COLLAPSED_KEY = 'sidebar-collapsed';
  const NARROW_QUERY = '(max-width: 767px)';
  const collapseListeners = new Set<() => void>();

  function readCollapsed(): boolean {
    return readStorage(COLLAPSED_KEY) === '1';
  }

  function writeCollapsed(value: boolean) {
    writeStorage(COLLAPSED_KEY, value ? '1' : '0');
    collapseListeners.forEach((listener) => listener());
  }

  const trackCollapsed = createSubscriber((update) => {
    collapseListeners.add(update);
    return () => {
      collapseListeners.delete(update);
    };
  });
</script>

<script lang="ts">
  import { page } from '$app/state';
  import FilePenIcon from '@lucide/svelte/icons/file-pen';
  import InboxIcon from '@lucide/svelte/icons/inbox';
  import LayersIcon from '@lucide/svelte/icons/layers';
  import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
  import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
  import SearchIcon from '@lucide/svelte/icons/search';
  import TargetIcon from '@lucide/svelte/icons/target';

  import { Button } from '@/lib/components/ui/button';
  import Wordmark from '@/lib/components/wordmark.svelte';
  import { readDensity } from '@/lib/density';
  import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';
  import { cn } from '@/lib/utils';
  import Breadcrumb from './breadcrumb.svelte';
  import SidebarLink from './sidebar-link.svelte';
  import SidebarProjects from './sidebar-projects.svelte';

  let { projects, sidebarFooter, topbarRight, inboxBadge, favorites, workspaces, children }: ShellFrameProps =
    $props();

  // Server values (false / false) during SSR and
  // hydration; the browser values from then on.
  let hydrated = $state(isAppHydrated());
  const narrowQuery = new MediaQuery(NARROW_QUERY, false);

  const storedCollapsed = $derived.by(() => {
    if (!hydrated) return false;
    trackCollapsed();
    return readCollapsed();
  });
  const narrow = $derived(hydrated ? narrowQuery.current : false);
  const pathname = $derived(page.url.pathname);

  // On narrow screens the sidebar is an overlay that closes on navigation:
  // it stays open only for the path it was opened on.
  let overlayPath = $state<string | null>(null);

  $effect(() => {
    hydrated = true;
    markAppHydrated();
    // The app.html inline script covers full page loads; this covers arriving
    // via client navigation (e.g. after login), where inline scripts don't run.
    if (readDensity() === 'compact') document.documentElement.dataset.density = 'compact';
  });

  const open = $derived(narrow ? overlayPath === pathname : !storedCollapsed);
  function setOpen(next: boolean) {
    if (narrow) overlayPath = next ? pathname : null;
    else writeCollapsed(!next);
  }
</script>

<div class="flex min-h-screen bg-background">
  {#if open && narrow}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div aria-hidden="true" class="fixed inset-0 z-30 bg-black/40" onclick={() => setOpen(false)}></div>
  {/if}
  {#if open}
    <aside
      id="app-sidebar"
      data-app-sidebar
      class={cn(
        'flex w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar',
        // Pinned to the viewport so a long project list scrolls on its own.
        narrow ? 'fixed inset-y-0 left-0 z-40 shadow-popover' : 'sticky top-0 h-screen',
      )}
    >
      <!-- A div, not <header>: the topbar is the app's only header landmark. -->
      <div class="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
        <Wordmark />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Collapse sidebar"
          aria-expanded="true"
          aria-controls="app-sidebar"
          onclick={() => setOpen(false)}
        >
          <PanelLeftIcon />
        </Button>
      </div>

      <nav aria-label="Primary" class="flex-1 overflow-y-auto p-2">
        <div class="flex flex-col gap-px">
          <SidebarLink href="/dashboard/search" label="Search">
            {#snippet icon()}<SearchIcon />{/snippet}
          </SidebarLink>
          <SidebarLink href="/dashboard/inbox" label="Inbox" trailing={inboxBadge}>
            {#snippet icon()}<InboxIcon />{/snippet}
          </SidebarLink>
          <SidebarLink href="/dashboard/my-issues" label="My issues">
            {#snippet icon()}<TargetIcon />{/snippet}
          </SidebarLink>
          <SidebarLink href="/dashboard/views" label="Views">
            {#snippet icon()}<LayersIcon />{/snippet}
          </SidebarLink>
          <SidebarLink href="/dashboard/drafts" label="Drafts">
            {#snippet icon()}<FilePenIcon />{/snippet}
          </SidebarLink>
          <SidebarLink href="/dashboard/dashboards" label="Dashboards">
            {#snippet icon()}<LayoutDashboardIcon />{/snippet}
          </SidebarLink>
        </div>

        {@render favorites?.()}
        {@render workspaces?.()}
        <SidebarProjects {projects} />
      </nav>

      <div class="border-t border-sidebar-border p-2">{@render sidebarFooter?.()}</div>
    </aside>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col">
    <header data-app-topbar class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      {#if !open}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Expand sidebar"
          aria-expanded="false"
          onclick={() => setOpen(true)}
        >
          <PanelLeftIcon />
        </Button>
      {/if}

      <Breadcrumb {projects} />

      <div class="ml-auto flex items-center gap-2">{@render topbarRight?.()}</div>
    </header>

    <main data-app-main class="flex-1 px-4 py-6 sm:px-6 sm:py-8">
      {@render children?.()}
    </main>
  </div>
</div>
