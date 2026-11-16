<!--
  Epics list: dense Linear-style rows, a status filter kept in `?status=`, a
  label filter in `?label=a,b` (any match), j/k to move between rows (Enter
  follows the focused link), a create dialog and the epic-labels dialog.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import BoxesIcon from '@lucide/svelte/icons/boxes';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SearchXIcon from '@lucide/svelte/icons/search-x';
  import { toast } from 'svelte-sonner';

  import { setEpicLabels } from '@/lib/actions/epic-labels';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { setSearchParams, useSearchParams } from '@/lib/svelte/search-params.svelte';
  import type { EpicLabelRow, EpicRow, EpicStatus } from '@/lib/epic-model';
  import CreateEpicDialog from './create-epic-dialog.svelte';
  import EpicLabelFilter from './epic-label-filter.svelte';
  import EpicLabelsDialog from './epic-labels-dialog.svelte';
  import EpicListRow from './epic-list-row.svelte';
  import { Optimistic } from './optimistic.svelte';

  const FILTERS = [
    { id: 'all', label: m.projects_filter_all() },
    { id: 'active', label: m.projects_filter_active() },
    { id: 'planned', label: m.projects_filter_planned() },
    { id: 'completed', label: m.projects_filter_completed() },
    { id: 'archived', label: m.projects_filter_archived() },
  ] as const;
  type FilterId = (typeof FILTERS)[number]['id'];
  const noEpicsText = (id: FilterId) =>
    ({
      all: m.projects_epics_none_all,
      active: m.projects_epics_none_active,
      planned: m.projects_epics_none_planned,
      completed: m.projects_epics_none_completed,
      archived: m.projects_epics_none_archived,
    })[id]();

  const FILTER_STATUSES: Record<Exclude<FilterId, 'all' | 'archived'>, EpicStatus[]> = {
    active: ['started', 'paused'],
    planned: ['backlog', 'planned'],
    completed: ['completed', 'canceled'],
  };

  function matches(epic: EpicRow, filter: FilterId) {
    if (filter === 'archived') return epic.archivedAt !== null;
    if (epic.archivedAt) return false;
    return filter === 'all' || FILTER_STATUSES[filter].includes(epic.status);
  }

  function isFilterId(value: string | null): value is FilterId {
    return FILTERS.some((f) => f.id === value);
  }

  const setParam = (name: string, value: string | null) => setSearchParams({ [name]: value });

  let {
    epics: serverEpics,
    labels,
  }: {
    epics: EpicRow[];
    /** The project's epic labels. */
    labels: EpicLabelRow[];
  } = $props();

  const data = useProjectData();
  const project = $derived(data.project);
  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  const searchParams = useSearchParams();
  const filter: FilterId = $derived.by(() => {
    const param = searchParams.get('status');
    return isFilterId(param) ? param : 'all';
  });
  // Unknown (e.g. deleted) label ids are dropped.
  const labelFilter = $derived(
    (searchParams.get('label') ?? '').split(',').filter((id) => labels.some((l) => l.id === id)),
  );
  let creating = $state(false);
  let managing = $state(false);
  const optimistic = new Optimistic(
    () => serverEpics,
    (list: EpicRow[], patch: { id: string; labelIds: string[] }) =>
      list.map((epic) => (epic.id === patch.id ? { ...epic, labelIds: patch.labelIds } : epic)),
  );
  const epics = $derived(optimistic.current);

  const setFilter = (next: string) => {
    if (isFilterId(next)) setParam('status', next === 'all' ? null : next);
  };
  const setLabelFilter = (ids: string[]) => setParam('label', ids.length ? ids.join(',') : null);

  const setLabels = (epic: EpicRow, labelIds: string[]) =>
    void optimistic.transition(async () => {
      optimistic.apply({ id: epic.id, labelIds });
      const result = await setEpicLabels({ projectId: project.id, epicId: epic.id, labelIds });
      if (!result.ok) toast.error(result.error);
    });

  $effect(() => {
    if (!canWrite) return;
    return registerPaletteCommands([
      {
        id: 'new-epic',
        label: m.projects_epics_new_palette(),
        section: m.projects_epics_section(),
        keywords: ['create', 'project'],
        run: () => (creating = true),
      },
      {
        id: 'manage-epic-labels',
        label: m.projects_epics_manage_labels_palette(),
        section: m.projects_epics_section(),
        keywords: ['project labels', 'tags'],
        run: () => (managing = true),
      },
    ]);
  });

  // j / k walk the rows; the focused row is a link, so Enter opens it natively.
  $effect(() => {
    const move = (delta: number) => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-epic-row]')];
      if (rows.length === 0) return;
      const index = rows.findIndex((row) => row === document.activeElement);
      const next = index === -1 ? (delta > 0 ? 0 : rows.length - 1) : index + delta;
      rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
    };
    return registerHotkeys([
      { key: 'j', description: m.projects_hotkey_next_epic(), scope: m.projects_epics_section(), handler: () => move(1) },
      { key: 'k', description: m.projects_hotkey_prev_epic(), scope: m.projects_epics_section(), handler: () => move(-1) },
    ]);
  });

  const countByLabel = (list: EpicRow[]) => {
    const map = new Map<string, number>();
    for (const epic of list) {
      for (const id of epic.labelIds ?? []) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  };

  const labelled = $derived(
    labelFilter.length
      ? epics.filter((epic) => epic.labelIds?.some((id) => labelFilter.includes(id)))
      : epics,
  );
  const shown = $derived(labelled.filter((epic) => matches(epic, filter)));
  const counts = $derived(
    Object.fromEntries(
      FILTERS.map((f) => [f.id, labelled.filter((epic) => matches(epic, f.id)).length]),
    ) as Record<FilterId, number>,
  );
  const labelCounts = $derived(countByLabel(epics.filter((epic) => matches(epic, filter))));
</script>

{#snippet newEpicAction()}
  <Button size="sm" onclick={() => (creating = true)}>
    <PlusIcon />
    {m.projects_epic_new()}
  </Button>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      bind:value={() => filter, (value: string) => value && setFilter(value)}
      aria-label={m.projects_epics_filter_by_status()}
    >
      {#each FILTERS as f (f.id)}
        <ToggleGroupItem value={f.id} class="gap-1.5 px-2.5 text-xs">
          {f.label}
          <span class="text-muted-foreground tabular-nums">{counts[f.id]}</span>
        </ToggleGroupItem>
      {/each}
    </ToggleGroup>
    {#if labels.length > 0 || canWrite}
      <EpicLabelFilter
        {labels}
        counts={labelCounts}
        value={labelFilter}
        onChange={setLabelFilter}
        onManage={canWrite ? () => (managing = true) : undefined}
      />
    {/if}
    {#if canWrite}
      <Button size="sm" class="ml-auto" onclick={() => (creating = true)}>
        <PlusIcon />
        {m.projects_epic_new()}
      </Button>
    {/if}
  </div>

  {#if epics.length === 0}
    <EmptyState
      title={m.projects_epics_empty_title()}
      description={m.projects_epics_empty_desc()}
      action={canWrite ? newEpicAction : undefined}
    >
      {#snippet icon()}<BoxesIcon />{/snippet}
    </EmptyState>
  {:else if shown.length === 0}
    <EmptyState
      title={m.projects_epics_here_title()}
      description={labelFilter.length ? m.projects_epics_none_filters() : noEpicsText(filter)}
    >
      {#snippet icon()}<SearchXIcon />{/snippet}
      {#snippet action()}
        <Button
          size="sm"
          variant="outline"
          onclick={() => {
            setFilter('all');
            setLabelFilter([]);
          }}
        >
          {m.projects_show_all_epics()}
        </Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div role="list" aria-label={m.projects_epics_section()} class="flex flex-col border-t border-border">
      <div
        aria-hidden="true"
        class="hidden items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground md:flex"
      >
        <span class="flex-1">{m.projects_col_name()}</span>
        <span class="w-24">{m.projects_col_health()}</span>
        <span class="w-6">{m.projects_col_lead()}</span>
        <span class="w-20">{m.projects_col_target()}</span>
        <span class="w-28">{m.projects_col_status()}</span>
        <span class="w-24">{m.projects_col_progress()}</span>
        <span class="hidden w-16 text-right lg:block">{m.projects_col_points()}</span>
        <span class="w-12 text-right">{m.projects_col_issues()}</span>
      </div>
      {#each shown as epic (epic.id)}
        <EpicListRow
          {epic}
          {labels}
          projectId={project.id}
          {canWrite}
          onSetLabels={(labelIds) => setLabels(epic, labelIds)}
        />
      {/each}
    </div>
  {/if}

  {#if canWrite}
    <CreateEpicDialog bind:open={creating} onOpenChange={(next) => (creating = next)} />
    <EpicLabelsDialog
      bind:open={managing}
      onOpenChange={(next) => (managing = next)}
      projectId={project.id}
      {labels}
      usage={countByLabel(epics)}
    />
  {/if}
</div>
