<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SearchXIcon from '@lucide/svelte/icons/search-x';
  import TargetIcon from '@lucide/svelte/icons/target';

  import EpicProgress from '@/lib/components/epics/epic-progress.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import { Avatar, EmptyState } from '@/lib/components/ui-icons';
  import { formatDueDate } from '@/lib/dates';
  import type { IssueUser } from '@/lib/issue-model';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { setSearchParams, useSearchParams } from '@/lib/svelte/search-params.svelte';
  import {
    INITIATIVE_STATUSES,
    INITIATIVE_STATUS_LABEL,
    initiativesPath,
    type InitiativeRow,
    type InitiativeStatus,
  } from '@/components/initiatives/initiative-model';
  import CreateInitiativeDialog from './create-initiative-dialog.svelte';
  import InitiativeStatusIcon from './initiative-status-icon.svelte';

  type FilterId = 'all' | InitiativeStatus;
  const FILTERS: FilterId[] = ['all', ...INITIATIVE_STATUSES];
  const isFilter = (value: string | null): value is FilterId => FILTERS.includes(value as FilterId);

  let {
    workspace,
    initiatives,
    members,
    viewerId,
  }: {
    workspace: { id: string; slug: string; name: string };
    initiatives: InitiativeRow[];
    members: IssueUser[];
    viewerId: string;
  } = $props();

  const searchParams = useSearchParams();
  const filter: FilterId = $derived.by(() => {
    const param = searchParams.get('status');
    return isFilter(param) ? param : 'all';
  });
  let creating = $state(false);

  const setFilter = (value: string) => {
    if (!isFilter(value)) return;
    setSearchParams({ status: value === 'all' ? null : value });
  };

  $effect(() =>
    registerPaletteCommands([
      {
        id: 'new-initiative',
        label: 'New initiative',
        section: 'Initiatives',
        keywords: ['create', 'goal'],
        run: () => (creating = true),
      },
    ]),
  );

  $effect(() => {
    const move = (delta: number) => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-initiative-row]')];
      if (rows.length === 0) return;
      const index = rows.findIndex((row) => row === document.activeElement);
      const next = index === -1 ? (delta > 0 ? 0 : rows.length - 1) : index + delta;
      rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
    };
    return registerHotkeys([
      { key: 'j', description: 'Next initiative', scope: 'Initiatives', handler: () => move(1) },
      { key: 'k', description: 'Previous initiative', scope: 'Initiatives', handler: () => move(-1) },
    ]);
  });

  const shown = $derived(filter === 'all' ? initiatives : initiatives.filter((i) => i.status === filter));
</script>

<div class="flex min-h-full flex-col">
  <div class="mb-1 text-xs text-muted-foreground">
    <a href={`/dashboard/workspaces/${workspace.slug}`} class="hover:text-foreground">
      {workspace.name}
    </a>
  </div>
  <h1 class="mb-4 text-xl font-medium">Initiatives</h1>
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      bind:value={() => filter, (value: string) => value && setFilter(value)}
      aria-label="Filter initiatives by status"
    >
      {#each FILTERS as f (f)}
        <ToggleGroupItem value={f} class="gap-1.5 px-2.5 text-xs">
          {f === 'all' ? 'All' : INITIATIVE_STATUS_LABEL[f]}
          <span class="text-muted-foreground tabular-nums">
            {f === 'all' ? initiatives.length : initiatives.filter((i) => i.status === f).length}
          </span>
        </ToggleGroupItem>
      {/each}
    </ToggleGroup>
    <Button size="sm" class="ml-auto" onclick={() => (creating = true)}>
      <PlusIcon />
      New initiative
    </Button>
  </div>

  {#if initiatives.length === 0}
    <EmptyState
      title="No initiatives yet"
      description="Initiatives group epics from this workspace’s projects under one goal and roll up their progress."
    >
      {#snippet icon()}<TargetIcon />{/snippet}
      {#snippet action()}
        <Button size="sm" onclick={() => (creating = true)}>
          <PlusIcon />
          New initiative
        </Button>
      {/snippet}
    </EmptyState>
  {:else if shown.length === 0}
    <EmptyState
      title="No initiatives here"
      description={`No ${INITIATIVE_STATUS_LABEL[filter as InitiativeStatus]?.toLowerCase()} initiatives.`}
    >
      {#snippet icon()}<SearchXIcon />{/snippet}
      {#snippet action()}
        <Button size="sm" variant="outline" onclick={() => setFilter('all')}>Show all</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div role="list" aria-label="Initiatives" class="flex flex-col border-t border-border">
      {#each shown as initiative (initiative.id)}
        <!-- same markup as React -->
        <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
        <a
          href={initiativesPath(workspace.slug, initiative.id)}
          role="listitem"
          data-initiative-row={initiative.id}
          class="flex min-h-10 items-center gap-3 border-b border-border px-3 py-1.5 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent"
        >
          <TargetIcon class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate font-medium">{initiative.name}</span>
          <span class="hidden w-12 text-xs text-muted-foreground tabular-nums sm:block">
            {initiative.epicCount} {initiative.epicCount === 1 ? 'epic' : 'epics'}
          </span>
          <span
            class="hidden w-6 md:block"
            title={initiative.owner ? `Owner: ${initiative.owner.name}` : 'No owner'}
          >
            {#if initiative.owner}
              <Avatar name={initiative.owner.name} src={initiative.owner.image} size={20} />
            {/if}
          </span>
          <span class="hidden w-20 text-xs text-muted-foreground md:block">
            {initiative.targetDate ? formatDueDate(initiative.targetDate) : ''}
          </span>
          <span class="flex w-24 items-center gap-1.5 text-xs text-muted-foreground">
            <InitiativeStatusIcon status={initiative.status} />
            {INITIATIVE_STATUS_LABEL[initiative.status]}
          </span>
          <EpicProgress progress={initiative.progress} class="w-24" />
        </a>
      {/each}
    </div>
  {/if}
  <CreateInitiativeDialog
    bind:open={creating}
    onOpenChange={(next) => (creating = next)}
    workspaceId={workspace.id}
    slug={workspace.slug}
    {members}
    {viewerId}
  />
</div>
