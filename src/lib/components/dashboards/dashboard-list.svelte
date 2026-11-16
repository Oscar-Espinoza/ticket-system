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
  import { formatDate, m } from '@/lib/i18n';
  import { dashboardHref } from '@/lib/widget-model';
  import { relativeTime } from '@/lib/relative-time';

  let { dashboards }: { dashboards: DashboardSummary[] } = $props();

  let deleting = $state<DashboardSummary | null>(null);
  // In-flight counter: true while a duplicate / delete round trip is running.
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
        toast.success(m.editor_dash_deleted());
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
                {dashboard.projectName ?? m.editor_dash_all_projects()}
              </LabelChip>
              {#if dashboard.shared}
                <span
                  class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                  title={m.editor_dash_shared_tip()}
                >
                  <UsersIcon class="size-3.5" aria-hidden="true" />
                  <span class="hidden md:inline">{m.editor_dash_shared()}</span>
                </span>
              {/if}
              <span class="hidden w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums md:block">
                {m.editor_dash_widgets({ count: dashboard.widgetCount })}
              </span>
              <span class="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground md:block">
                {dashboard.isOwner ? m.editor_dash_you() : (dashboard.ownerName ?? m.editor_comment_former_member())}
              </span>
              <time
                datetime={new Date(dashboard.updatedAt).toISOString()}
                title={m.editor_dash_updated({ date: formatDate(dashboard.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
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
                    aria-label={m.editor_dash_actions_for({ name: dashboard.name })}
                    disabled={pending}
                  >
                    <MoreHorizontalIcon />
                  </Button>
                {/snippet}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => duplicate(dashboard)}>
                  <CopyIcon />
                  {m.editor_duplicate()}
                </DropdownMenuItem>
                {#if dashboard.isOwner}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => (deleting = dashboard)}>
                    <Trash2Icon />
                    {m.editor_delete_ellipsis()}
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
    title={m.editor_dash_empty_title()}
    description={m.editor_dash_empty_body()}
  >
    {#snippet icon()}<LayoutDashboardIcon />{/snippet}
  </EmptyState>
{:else}
  {@render section('dashboards-mine', m.editor_dash_yours(), mine)}
  {@render section('dashboards-shared', m.editor_dash_shared_with_you(), shared)}
  <AlertDialog
    open={deleting !== null}
    onOpenChange={(open) => {
      if (!open) deleting = null;
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{m.editor_dash_delete_title({ name: deleting?.name ?? '' })}</AlertDialogTitle>
        <AlertDialogDescription>
          {deleting?.shared ? m.editor_dash_delete_body_shared() : m.editor_dash_delete_body()}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() => {
            const target = deleting;
            if (!target) return;
            remove(target);
          }}
        >
          {m.common_delete()}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
{/if}
