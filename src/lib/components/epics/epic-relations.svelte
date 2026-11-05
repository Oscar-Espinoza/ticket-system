<!--
  Epic dependencies on the epic Overview: "Blocked by" / "Blocking" /
  "Related" groups, a two-step picker (kind → epic) to add one, and remove
  buttons. Conflicts (the blocked epic starts before its blocker's target
  date) are flagged inline, like the roadmap does.
  (React export: EpicDependencies.)
-->
<script module lang="ts">
  import type { EpicStatus } from '@/components/epics/epic-model';

  export interface DependencyCandidate {
    id: string;
    name: string;
    color: string | null;
    status: EpicStatus;
  }
</script>

<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
  import XIcon from '@lucide/svelte/icons/x';
  import { toast } from 'svelte-sonner';

  import { addEpicRelation, removeEpicRelation } from '@/lib/actions/epic-relations';
  import { Button } from '@/lib/components/ui/button';
  import { formatDueDate } from '@/lib/dates';
  import {
    EPIC_RELATION_KINDS,
    EPIC_RELATION_LABEL,
    epicPath,
    isScheduleConflict,
    type EpicRelationKind,
    type EpicRelationRow,
  } from '@/components/epics/epic-model';
  import AddDependency from './add-dependency.svelte';
  import EpicIcon from './epic-icon.svelte';
  import EpicStatusIcon from './epic-status-icon.svelte';
  import { Optimistic } from './optimistic.svelte';

  let {
    projectId,
    epic,
    relations: serverRelations,
    candidates,
    canWrite,
  }: {
    projectId: string;
    epic: { id: string; startDate: string | null; targetDate: string | null };
    relations: EpicRelationRow[];
    /** The project's non-archived epics. */
    candidates: DependencyCandidate[];
    canWrite: boolean;
  } = $props();

  const optimistic = new Optimistic(
    () => serverRelations,
    (list: EpicRelationRow[], id: string) => list.filter((r) => r.id !== id),
  );
  const relations = $derived(optimistic.current);

  const remove = (relation: EpicRelationRow) =>
    void optimistic.transition(async () => {
      optimistic.apply(relation.id);
      const result = await removeEpicRelation({ projectId, id: relation.id });
      if (!result.ok) toast.error(result.error);
    });

  const add = (kind: EpicRelationKind, otherEpicId: string) =>
    void optimistic.transition(async () => {
      const result = await addEpicRelation({ projectId, epicId: epic.id, otherEpicId, kind });
      if (!result.ok) toast.error(result.error);
    });

  const available = $derived.by(() => {
    const linked = new Set(relations.map((r) => r.epic.id));
    return candidates.filter((c) => c.id !== epic.id && !linked.has(c.id));
  });
</script>

<section aria-labelledby="dependencies-heading" class="flex flex-col gap-2">
  <div class="flex items-center gap-2">
    <h2 id="dependencies-heading" class="text-sm font-medium">Dependencies</h2>
    {#if canWrite}
      <AddDependency candidates={available} disabled={optimistic.pending} onAdd={add}>
        {#snippet children({ props })}
          <Button {...props} variant="ghost" size="xs" class="ml-auto text-muted-foreground">
            <PlusIcon />
            Add dependency
          </Button>
        {/snippet}
      </AddDependency>
    {/if}
  </div>

  {#if relations.length === 0}
    <p class="text-sm text-muted-foreground">
      No dependencies. Mark epics this one is blocked by or blocking to see them on the roadmap.
    </p>
  {:else}
    <div class="flex flex-col gap-3">
      {#each EPIC_RELATION_KINDS as kind (kind)}
        {@const group = relations.filter((r) => r.kind === kind)}
        {#if group.length > 0}
          <div class="flex flex-col">
            <h3 class="mb-1 text-xs text-muted-foreground">
              {EPIC_RELATION_LABEL[kind]} · {group.length}
            </h3>
            <ul class="flex flex-col rounded-md border border-border">
              {#each group as relation (relation.id)}
                {@const conflict =
                  (kind === 'blocked_by' && isScheduleConflict(relation.epic, epic)) ||
                  (kind === 'blocks' && isScheduleConflict(epic, relation.epic))}
                <li
                  class="group flex h-9 items-center gap-2 border-b border-border px-3 text-sm last:border-b-0"
                >
                  <a
                    href={epicPath(relation.epic.projectId, relation.epic.id)}
                    class="flex min-w-0 flex-1 items-center gap-2 outline-none hover:underline focus-visible:underline"
                  >
                    <EpicIcon color={relation.epic.color} />
                    <span class="truncate">{relation.epic.name}</span>
                    {#if relation.epic.archivedAt}
                      <span class="shrink-0 text-xs text-muted-foreground">Archived</span>
                    {/if}
                  </a>
                  {#if conflict}
                    <span
                      class="flex shrink-0 items-center gap-1 text-xs text-destructive"
                      title={kind === 'blocked_by'
                        ? 'This epic starts before its blocker’s target date.'
                        : 'The blocked epic starts before this epic’s target date.'}
                    >
                      <TriangleAlertIcon class="size-3.5" />
                      <span class="hidden sm:inline">Schedule conflict</span>
                    </span>
                  {/if}
                  {#if relation.epic.targetDate}
                    <span class="shrink-0 text-xs text-muted-foreground">
                      {formatDueDate(relation.epic.targetDate)}
                    </span>
                  {/if}
                  <EpicStatusIcon status={relation.epic.status} />
                  {#if canWrite}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove dependency on ${relation.epic.name}`}
                      class="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onclick={() => remove(relation)}
                    >
                      <XIcon />
                    </Button>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</section>
