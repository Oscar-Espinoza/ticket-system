<!--
  "Epic" + "Milestone" property rows of IssueDetail. This
  project's epics come from project data (non-archived); epics of sibling
  projects in the workspace (cross-project epics) load lazily from the server
  — on picker open, or when the issue already points at a non-local epic.
  Clearing or changing the epic drops the milestone — the issue service and
  applyIssuePatch both do it.
-->
<script module lang="ts">
  import type { ForeignEpicOption } from '@/lib/epic-model';

  function groupByProject(epics: ForeignEpicOption[]) {
    const groups = new Map<string, { project: ForeignEpicOption['project']; epics: ForeignEpicOption[] }>();
    for (const epic of epics) {
      const group = groups.get(epic.project.id) ?? { project: epic.project, epics: [] };
      group.epics.push(epic);
      groups.set(epic.project.id, group);
    }
    return [...groups.values()];
  }
</script>

<script lang="ts">
  import BoxesIcon from '@lucide/svelte/icons/boxes';

  import { epicPath } from '@/lib/epic-model';
  import EpicIcon from '@/lib/components/epics/epic-icon.svelte';
  import EpicPicker from '@/lib/components/epics/epic-picker.svelte';
  import MilestoneGlyph from '@/lib/components/epics/milestone-glyph.svelte';
  import MilestonePicker from '@/lib/components/epics/milestone-picker.svelte';
  import { useForeignEpics } from '@/lib/components/epics/foreign-epics-store.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import type { IssueRow } from '@/lib/issue-model';
  import PropertyRow from '../property-row.svelte';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const data = useProjectData();
  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  let pickerOpen = $state(false);

  const localEpic = $derived(data.epics.find((e) => e.id === issue.epicId) ?? null);
  const inWorkspace = $derived(Boolean(data.project.workspaceId));
  const needsForeign = $derived(inWorkspace && Boolean(issue.epicId) && !localEpic);
  // Without local epics the row's visibility depends on the foreign list.
  const foreignEpics = useForeignEpics(
    () => data.project.id,
    () => inWorkspace && (pickerOpen || needsForeign || data.epics.length === 0),
  );
  const foreign = $derived(foreignEpics.current);
  const foreignEpic = $derived(needsForeign ? (foreign?.find((e) => e.id === issue.epicId) ?? null) : null);
  const epic = $derived(localEpic ?? foreignEpic);
  const milestone = $derived(epic?.milestones.find((m) => m.id === issue.milestoneId) ?? null);

  // Local epics (archived ones included) live under this project; a foreign
  // one only links once we know its project.
  const epicHref = $derived(
    foreignEpic
      ? epicPath(foreignEpic.project.id, foreignEpic.id)
      : issue.epicId && (localEpic || !inWorkspace)
        ? epicPath(data.project.id, issue.epicId)
        : null,
  );

  const propertyButton = '-ml-2 max-w-full gap-2 font-normal';
</script>

{#snippet epicTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButton} disabled={!canWrite}>
    {#if epic}
      <EpicIcon color={epic.color} />
      <span class="truncate">{epic.name}</span>
      {#if foreignEpic}
        <span class="shrink-0 font-mono text-[10px] text-muted-foreground" title={`Epic in ${foreignEpic.project.name}`}>
          {foreignEpic.project.ticketKey}
        </span>
      {/if}
    {:else}
      <BoxesIcon class="text-muted-foreground" />
      <span class="text-muted-foreground">
        {!issue.epicId
          ? 'Add to epic'
          : needsForeign && foreign === undefined
            ? 'Loading…'
            : // Archived (not in project data), or an epic of a project the viewer can't see.
              'Archived epic'}
      </span>
    {/if}
  </Button>
{/snippet}

{#snippet milestoneTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButton} disabled={!canWrite}>
    <MilestoneGlyph class="text-muted-foreground" />
    {#if milestone}
      <span class="truncate">{milestone.name}</span>
    {:else}
      <span class="text-muted-foreground">Add milestone</span>
    {/if}
  </Button>
{/snippet}

<!-- Nothing to show or pick: keep the panel quiet. -->
{#if issue.epicId || data.epics.length > 0 || foreign?.length}
  <PropertyRow label="Epic">
    <div class="flex min-w-0 items-center">
      {#if canWrite}
        <EpicPicker
          value={issue.epicId}
          epics={data.epics}
          otherProjects={groupByProject(foreign ?? [])}
          loadingOthers={inWorkspace && foreign === undefined}
          onOpenChange={(open) => (pickerOpen = open)}
          onChange={(epicId) => mutations.update(issue, { epicId })}
        >
          {#snippet children({ props })}{@render epicTrigger(props)}{/snippet}
        </EpicPicker>
      {:else}
        {@render epicTrigger({})}
      {/if}
      {#if epicHref}
        <a href={epicHref} class="ml-1 shrink-0 text-xs text-muted-foreground hover:text-foreground">
          Open
        </a>
      {/if}
    </div>
  </PropertyRow>

  {#if epic && (epic.milestones.length > 0 || milestone)}
    <PropertyRow label="Milestone">
      {#if canWrite}
        <MilestonePicker
          value={issue.milestoneId}
          milestones={epic.milestones}
          onChange={(milestoneId) => mutations.update(issue, { milestoneId })}
        >
          {#snippet children({ props })}{@render milestoneTrigger(props)}{/snippet}
        </MilestonePicker>
      {:else}
        {@render milestoneTrigger({})}
      {/if}
    </PropertyRow>
  {/if}
{/if}
