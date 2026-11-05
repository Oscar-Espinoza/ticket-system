<!--
  Project roadmap: the epics timeline with a zoom toggle (`?zoom=`), optimistic
  rescheduling, dependency connectors (with a scheduling-conflict count), and
  a side list of epics that have no dates yet.
-->
<script lang="ts">
  import CalendarRangeIcon from '@lucide/svelte/icons/calendar-range';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
  import { toast } from 'svelte-sonner';

  import { updateEpic } from '@/lib/actions/epics';
  import EpicIcon from '@/lib/components/epics/epic-icon.svelte';
  import EpicStatusIcon from '@/lib/components/epics/epic-status-icon.svelte';
  import { Optimistic } from '@/lib/components/epics/optimistic.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { setSearchParams, useSearchParams } from '@/lib/svelte/search-params.svelte';
  import {
    epicPath,
    isScheduleConflict,
    type EpicDependency,
    type EpicRow,
    type MilestoneRow,
  } from '@/lib/components/epics/epic-model';
  import Timeline, { ZOOMS, type TimelineItem, type Zoom } from './timeline.svelte';

  type DatePatch = { id: string; startDate?: string; targetDate?: string };

  let {
    epics: serverEpics,
    milestones,
    dependencies = [],
  }: {
    /** Non-archived epics. */
    epics: EpicRow[];
    milestones: MilestoneRow[];
    /** `blocks` edges between those epics. */
    dependencies?: EpicDependency[];
  } = $props();

  const data = useProjectData();
  const project = $derived(data.project);
  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  const searchParams = useSearchParams();
  const zoom: Zoom = $derived.by(() => {
    const zoomParam = searchParams.get('zoom');
    return ZOOMS.some((z) => z.id === zoomParam) ? (zoomParam as Zoom) : 'months';
  });
  const optimistic = new Optimistic(
    () => serverEpics,
    (list: EpicRow[], patch: DatePatch) =>
      list.map((epic) => (epic.id === patch.id ? { ...epic, ...patch } : epic)),
  );
  const epics = $derived(optimistic.current);

  const setZoom = (value: string) => {
    if (!ZOOMS.some((z) => z.id === value)) return;
    setSearchParams({ zoom: value === 'months' ? null : value });
  };

  const onChangeDates = (id: string, dates: { startDate?: string; targetDate?: string }) =>
    void optimistic.transition(async () => {
      optimistic.apply({ id, ...dates });
      const result = await updateEpic({ projectId: project.id, id, patch: dates });
      if (!result.ok) toast.error(result.error);
    });

  const milestonesByEpic = $derived.by(() => {
    const map = new Map<string, MilestoneRow[]>();
    for (const milestone of milestones) {
      const list = map.get(milestone.epicId) ?? [];
      list.push(milestone);
      map.set(milestone.epicId, list);
    }
    return map;
  });

  const items: TimelineItem[] = $derived(
    epics
      .filter((epic) => epic.startDate || epic.targetDate)
      .map((epic) => ({
        id: epic.id,
        name: epic.name,
        color: epic.color,
        status: epic.status,
        startDate: epic.startDate,
        targetDate: epic.targetDate,
        progress: epic.progress,
        href: epicPath(project.id, epic.id),
        milestones: milestonesByEpic.get(epic.id) ?? [],
        editable: canWrite,
      }))
      // Earliest first, like a Gantt chart reads.
      .sort((a, b) =>
        (a.startDate ?? a.targetDate ?? '').localeCompare(b.startDate ?? b.targetDate ?? ''),
      ),
  );
  const undated = $derived(epics.filter((epic) => !epic.startDate && !epic.targetDate));

  const byId = $derived(new Map(epics.map((epic) => [epic.id, epic])));
  const conflicts = $derived(
    dependencies.filter((dep) => {
      const blocker = byId.get(dep.blockerId);
      const blocked = byId.get(dep.blockedId);
      return blocker && blocked && isScheduleConflict(blocker, blocked);
    }),
  );
  const timelineDependencies = $derived(
    dependencies.map((dep) => ({ id: dep.id, from: dep.blockerId, to: dep.blockedId })),
  );
</script>

{#if epics.length === 0}
  <EmptyState
    title="Nothing on the roadmap yet"
    description="Create epics with start and target dates to see them on a timeline."
  >
    {#snippet icon()}<CalendarRangeIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" href={`/dashboard/projects/${project.id}/epics`}>
        <PlusIcon />
        Go to epics
      </Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        spacing={0}
        bind:value={() => zoom, (value: string) => setZoom(value)}
        aria-label="Zoom"
      >
        {#each ZOOMS as z (z.id)}
          <ToggleGroupItem value={z.id} class="px-2.5 text-xs">{z.label}</ToggleGroupItem>
        {/each}
      </ToggleGroup>
      {#if canWrite}
        <span class="text-xs text-muted-foreground">
          Drag bars or their edges to reschedule (snaps to weeks)
        </span>
      {/if}
      {#if conflicts.length > 0}
        <span
          class="ml-auto flex items-center gap-1 text-xs text-destructive"
          title={conflicts
            .map(
              (dep) =>
                `${byId.get(dep.blockedId)?.name} starts before ${byId.get(dep.blockerId)?.name} ends`,
            )
            .join('\n')}
        >
          <TriangleAlertIcon class="size-3.5" />
          {conflicts.length} scheduling {conflicts.length === 1 ? 'conflict' : 'conflicts'}
        </span>
      {/if}
    </div>

    <div class="flex min-h-0 flex-col gap-4 xl:flex-row">
      <div class="min-w-0 flex-1">
        {#if items.length > 0}
          <Timeline
            {items}
            {zoom}
            onChangeDates={canWrite ? onChangeDates : undefined}
            dependencies={timelineDependencies}
          />
        {:else}
          <EmptyState
            title="No dated epics"
            description="Give an epic a start or target date to place it on the timeline."
            class="rounded-md border border-border"
          >
            {#snippet icon()}<CalendarRangeIcon />{/snippet}
          </EmptyState>
        {/if}
      </div>

      {#if undated.length > 0}
        <aside aria-labelledby="undated-heading" class="flex shrink-0 flex-col gap-2 xl:w-64">
          <h2 id="undated-heading" class="text-xs font-medium text-muted-foreground">
            No dates · {undated.length}
          </h2>
          <ul class="flex flex-col rounded-md border border-border">
            {#each undated as epic (epic.id)}
              <li class="border-b border-border last:border-b-0">
                <a
                  href={epicPath(project.id, epic.id)}
                  class="flex h-9 items-center gap-2 px-3 text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <EpicIcon color={epic.color} />
                  <span class="min-w-0 flex-1 truncate">{epic.name}</span>
                  <EpicStatusIcon status={epic.status} />
                </a>
              </li>
            {/each}
          </ul>
        </aside>
      {/if}
    </div>
  </div>
{/if}
