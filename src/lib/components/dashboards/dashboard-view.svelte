<!--
  A dashboard: header (name, scope, sharing, actions) and a responsive grid of
  widgets. The owner edits in place — every change is applied optimistically
  and saved with updateDashboard (reverted with a toast if it fails).

  The widget list / shared flag are seeded from `dashboard` once (like the React
  useState); mount this inside `{#key dashboard.id}` so another dashboard
  starts fresh.
-->
<script lang="ts">
  import CopyIcon from '@lucide/svelte/icons/copy';
  import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import UsersIcon from '@lucide/svelte/icons/users';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import { duplicateDashboard, updateDashboard } from '@/lib/actions/dashboards';
  // Called without the wrapper's refreshAfterWrite(): that would rerun this route's load for
  // the dashboard just deleted (404 flash). We navigate away with refreshAll instead.
  import { deleteDashboard } from '@/lib/remote/dashboards.remote';
  import FavoriteButton from '@/lib/components/navigation/favorite-button.svelte';
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
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { cn } from '@/lib/utils';
  import {
    MAX_WIDGETS,
    WIDGET_SIZES,
    WIDGET_TYPES,
    WIDGET_TYPE_DESCRIPTION,
    WIDGET_TYPE_LABEL,
    dashboardHref,
    newWidget,
    normalizeWidgets,
    sizeOf,
    type DashboardDataset,
    type DashboardRecord,
    type Widget,
    type WidgetType,
  } from '@/components/dashboards/widget-model';
  import DashboardDetailsDialog from './dashboard-details-dialog.svelte';
  import WidgetBody from './widget-body.svelte';
  import WidgetEditor from './widget-editor.svelte';
  import WidgetMenu from './widget-menu.svelte';

  // Grid: 1 column on phones, 2 from md, 4 from xl; rows are 13rem.
  const SPAN: Record<string, string> = {
    s: 'col-span-1 row-span-1',
    m: 'col-span-1 md:col-span-2 row-span-1',
    l: 'col-span-1 md:col-span-2 row-span-2',
    xl: 'col-span-1 md:col-span-2 xl:col-span-4 row-span-2',
  };

  let {
    dashboard,
    dataset,
    isOwner,
    canShare,
  }: {
    dashboard: DashboardRecord;
    dataset: DashboardDataset;
    isOwner: boolean;
    /** Owner with write access to the dashboard's project. */
    canShare: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  let widgets = $state.raw<Widget[]>(dashboard.widgets);
  // svelte-ignore state_referenced_locally
  let shared = $state(dashboard.shared);
  let editing = $state.raw<Widget | null>(null);
  let details = $state(false);
  let confirmDelete = $state(false);
  // useTransition: true while any save / share / duplicate / delete is in flight.
  let inflight = $state(0);
  const pending = $derived(inflight > 0);
  // One "now" per render pass keeps every widget consistent.
  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 5 * 60_000);
    return () => clearInterval(id);
  });

  async function transition(run: () => Promise<void>) {
    inflight++;
    try {
      await run();
    } finally {
      inflight--;
    }
  }

  const save = (next: Widget[]) => {
    const previous = widgets;
    const normalized = normalizeWidgets(next);
    widgets = normalized;
    transition(async () => {
      const result = await updateDashboard({ id: dashboard.id, widgets: normalized });
      if (!result.ok) {
        widgets = previous;
        toast.error(result.error);
      }
    });
  };

  const addWidget = (type: WidgetType) => {
    if (widgets.length >= MAX_WIDGETS) {
      toast.error(`A dashboard holds up to ${MAX_WIDGETS} widgets.`);
      return;
    }
    const widget = newWidget(type);
    save([...widgets, widget]);
    editing = widget;
  };

  const replace = (widget: Widget) => save(widgets.map((w) => (w.id === widget.id ? widget : w)));
  const remove = (widget: Widget) => save(widgets.filter((w) => w.id !== widget.id));
  const move = (widget: Widget, delta: number) => {
    const index = widgets.findIndex((w) => w.id === widget.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= widgets.length) return;
    const next = [...widgets];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };

  const toggleShared = (value: boolean) => {
    shared = value;
    transition(async () => {
      const result = await updateDashboard({ id: dashboard.id, shared: value });
      if (!result.ok) {
        shared = !value;
        toast.error(result.error);
      } else {
        toast.success(value ? 'Shared with project members' : 'Dashboard is now private');
      }
    });
  };

  const duplicate = () =>
    transition(async () => {
      const result = await duplicateDashboard({ id: dashboard.id });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success('Dashboard duplicated');
        await goto(dashboardHref(result.id));
      }
    });

  $effect(() => {
    if (!isOwner) return;
    return registerPaletteCommands([
      {
        id: 'dashboard-add-widget',
        label: 'Add widget to dashboard',
        section: 'Dashboards',
        keywords: ['chart', 'number', 'insights'],
        run: () => addWidget('number'),
      },
    ]);
  });
</script>

{#snippet addMenu()}
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button {...props} size="sm">
          <PlusIcon />
          Add widget
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-64">
      {#each WIDGET_TYPES as type (type)}
        <DropdownMenuItem onSelect={() => addWidget(type)} class="flex-col items-start gap-0">
          <span>{WIDGET_TYPE_LABEL[type]}</span>
          <span class="text-xs text-muted-foreground">{WIDGET_TYPE_DESCRIPTION[type]}</span>
        </DropdownMenuItem>
      {/each}
    </DropdownMenuContent>
  </DropdownMenu>
{/snippet}

<div class="flex flex-col gap-4 pb-10">
  <header class="flex flex-wrap items-start gap-3">
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <nav aria-label="Breadcrumb" class="text-xs text-muted-foreground">
        <a href="/dashboard/dashboards" class="hover:text-foreground">Dashboards</a>
      </nav>
      <h1 class="flex items-center gap-2 truncate text-xl font-medium">
        <LayoutDashboardIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="truncate">{dashboard.name}</span>
        <FavoriteButton targetType="dashboard" targetId={dashboard.id} />
      </h1>
      <p class="truncate text-xs text-muted-foreground">
        {dashboard.projectName ?? 'All your projects'}{!isOwner
          ? ` · shared by ${dashboard.ownerName ?? 'a former member'}`
          : ''}{dashboard.description ? ` · ${dashboard.description}` : ''}
      </p>
    </div>

    <div class={cn('flex items-center gap-2 transition-opacity', pending && 'opacity-70')}>
      {#if isOwner && dashboard.projectId}
        <div class="flex items-center gap-2" title={canShare ? undefined : 'Needs edit access to the project'}>
          <Switch
            id="dashboard-shared"
            size="sm"
            bind:checked={() => shared, toggleShared}
            disabled={!canShare && !shared}
          />
          <Label for="dashboard-shared" class="flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <UsersIcon class="size-3.5" aria-hidden="true" />
            Shared
          </Label>
        </div>
      {/if}
      {#if isOwner}{@render addMenu()}{/if}
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Dashboard actions">
              <MoreHorizontalIcon />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {#if isOwner}
            <DropdownMenuItem onSelect={() => (details = true)}>
              <PencilIcon />
              Rename…
            </DropdownMenuItem>
          {/if}
          <DropdownMenuItem onSelect={duplicate}>
            <CopyIcon />
            Duplicate
          </DropdownMenuItem>
          {#if isOwner}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => (confirmDelete = true)}>
              <Trash2Icon />
              Delete…
            </DropdownMenuItem>
          {/if}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>

  {#if dataset.truncated}
    <p class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      Showing the most recent 5,000 issues — older issues aren’t counted.
    </p>
  {/if}

  {#if widgets.length === 0}
    <EmptyState
      title="No widgets yet"
      description={isOwner
        ? 'Add numbers, charts and issue lists built from filters.'
        : 'The owner hasn’t added any widgets yet.'}
      action={isOwner ? addMenu : undefined}
    >
      {#snippet icon()}<LayoutDashboardIcon />{/snippet}
    </EmptyState>
  {:else}
    <div class="grid auto-rows-[13rem] grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {#each widgets as widget, index (widget.id)}
        <section
          aria-label={widget.title}
          class={cn(
            'group/widget flex min-w-0 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-4',
            SPAN[sizeOf(widget)],
          )}
        >
          <header class="flex items-center gap-2">
            <h2 class="min-w-0 flex-1 truncate text-sm font-medium">
              {#if isOwner}
                <button
                  type="button"
                  class="max-w-full truncate rounded text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  onclick={() => (editing = widget)}
                >
                  {widget.title}
                </button>
              {:else}
                {widget.title}
              {/if}
            </h2>
            {#if isOwner}
              <WidgetMenu
                {widget}
                first={index === 0}
                last={index === widgets.length - 1}
                onEdit={() => (editing = widget)}
                onResize={(size) => {
                  const preset = WIDGET_SIZES.find((s) => s.id === size)!;
                  replace({ ...widget, w: preset.w, h: preset.h });
                }}
                onMove={(delta) => move(widget, delta)}
                onDuplicate={() => {
                  const copy = { ...widget, id: crypto.randomUUID(), title: `${widget.title} (copy)` };
                  const next = [...widgets];
                  next.splice(index + 1, 0, copy);
                  save(next);
                }}
                onRemove={() => remove(widget)}
              />
            {/if}
          </header>
          <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <WidgetBody {widget} {dataset} {now} />
          </div>
        </section>
      {/each}
    </div>
  {/if}

  <WidgetEditor
    widget={editing}
    {dataset}
    scopeProjectId={dashboard.projectId}
    onOpenChange={(open) => {
      if (!open) editing = null;
    }}
    onSave={(widget) => {
      replace(widget);
      editing = null;
      now = Date.now();
    }}
  />

  {#if isOwner}
    <!-- The updateDashboard wrapper refreshes the page data itself, so no onSaved refresh is needed. -->
    <DashboardDetailsDialog bind:open={details} {dashboard} />
  {/if}

  <AlertDialog bind:open={confirmDelete}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete “{dashboard.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {shared ? 'Project members will lose access too. ' : ''}This can’t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() =>
            transition(async () => {
              const out = await deleteDashboard([{ id: dashboard.id }]);
              if (!out.ok) {
                await goto(out.redirect, { refreshAll: true });
                return;
              }
              if (!out.value.ok) toast.error(out.value.error);
              else {
                toast.success('Dashboard deleted');
                await goto('/dashboard/dashboards', { refreshAll: true });
              }
            })}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
