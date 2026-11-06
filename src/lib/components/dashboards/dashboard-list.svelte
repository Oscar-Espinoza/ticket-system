<!--
  /dashboard/dashboards: the viewer's dashboards, then ones shared into their
  projects. (`NewDashboardButton` is new-dashboard-button.svelte.)
-->
<script lang="ts">
  import CopyIcon from '@lucide/svelte/icons/copy';
  import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import UsersIcon from '@lucide/svelte/icons/users';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import { deleteDashboard, duplicateDashboard } from '@/lib/actions/dashboards';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { EmptyState, LabelChip } from '@/lib/components/ui-icons';
  import type { DashboardSummary } from '@/lib/dashboards';
  import { dashboardHref } from '@/lib/widget-model';
  import { relativeTime } from '@/lib/relative-time';

  let { dashboards }: { dashboards: DashboardSummary[] } = $props();

  let deleting = $state<DashboardSummary | null>(null);
  // useTransition: true while a duplicate / delete round trip is running.
  let inflight = $state(0);
  const pending = $derived(inflight > 0);

  async function transition(run: () => Promise<void>) {
    inflight++;
    try {
      await run();
    } finally {
      inflight--;
    }
  }

  const mine = $derived(dashboards.filter((d) => d.isOwner));
  const shared = $derived(dashboards.filter((d) => !d.isOwner));

  const duplicate = (dashboard: DashboardSummary) =>
    transition(async () => {
      const result = await duplicateDashboard({ id: dashboard.id });
      if (!result.ok) toast.error(result.error);
      else await goto(dashboardHref(result.id));
    });

  const remove = (target: DashboardSummary) =>
    transition(async () => {
      const result = await deleteDashboard({ id: target.id });
      if (!result.ok) toast.error(result.error);
      else {
        // The action wrapper already refreshed the page data (refreshesData()).
        toast.success('Dashboard deleted');
      }
    });
</script>

{#snippet section(id: string, title: string, items: DashboardSummary[])}
  {#if items.length > 0}
    <section aria-labelledby={id} class="flex flex-col gap-1">
      <h2 {id} class="px-2 text-xs font-medium text-muted-foreground">
        {title}
      </h2>
      <ul class="flex flex-col gap-px">
        {#each items as dashboard (dashboard.id)}
          <li class="group flex items-center gap-2 rounded-md pr-1 hover:bg-accent/40 focus-within:bg-accent/40">
            <a
              href={dashboardHref(dashboard.id)}
              class="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <LayoutDashboardIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-medium">{dashboard.name}</span>
                {#if dashboard.description}
                  <span class="truncate text-xs text-muted-foreground">{dashboard.description}</span>
                {/if}
              </span>
              <LabelChip dot={false} class="hidden max-w-40 truncate sm:inline-flex">
                {dashboard.projectName ?? 'All projects'}
              </LabelChip>
              {#if dashboard.shared}
                <span
                  class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                  title="Shared with project members"
                >
                  <UsersIcon class="size-3.5" aria-hidden="true" />
                  <span class="hidden md:inline">Shared</span>
                </span>
              {/if}
              <span class="hidden w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums md:block">
                {dashboard.widgetCount} widget{dashboard.widgetCount === 1 ? '' : 's'}
              </span>
              <span class="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground md:block">
                {dashboard.isOwner ? 'You' : (dashboard.ownerName ?? 'Former member')}
              </span>
              <time
                datetime={new Date(dashboard.updatedAt).toISOString()}
                title={`Updated ${new Date(dashboard.updatedAt).toLocaleString()}`}
                class="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
              >
                {relativeTime(dashboard.updatedAt)}
              </time>
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${dashboard.name}`}
                    disabled={pending}
                  >
                    <MoreHorizontalIcon />
                  </Button>
                {/snippet}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => duplicate(dashboard)}>
                  <CopyIcon />
                  Duplicate
                </DropdownMenuItem>
                {#if dashboard.isOwner}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => (deleting = dashboard)}>
                    <Trash2Icon />
                    Delete…
                  </DropdownMenuItem>
                {/if}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

{#if dashboards.length === 0}
  <EmptyState
    title="No dashboards yet"
    description="Build numbers, charts and issue lists from filters — for one project or across all of yours."
  >
    {#snippet icon()}<LayoutDashboardIcon />{/snippet}
  </EmptyState>
{:else}
  {@render section('dashboards-mine', 'Your dashboards', mine)}
  {@render section('dashboards-shared', 'Shared with you', shared)}
  <AlertDialog
    open={deleting !== null}
    onOpenChange={(open) => {
      if (!open) deleting = null;
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {deleting?.shared ? 'Project members will lose access too. ' : ''}This can’t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() => {
            const target = deleting;
            if (!target) return;
            remove(target);
          }}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
{/if}
