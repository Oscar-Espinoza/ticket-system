<!--
  One line of issue history: "Ana changed status from Todo to In Progress · 2h".
  issue.updated events expand to one line per
  change; unknown event types use their `data.summary` (the event-bus
  convention), else "updated the issue".
-->
<script module lang="ts">
  import type { IssueChange } from '@/lib/events';
  import type { TimelineActivity } from '@/lib/timeline';

  export interface ActivityLineItem extends TimelineActivity {
    /** Set for lines expanded from an issue.updated event. */
    change?: IssueChange;
  }

  /** One line per issue.updated change; everything else passes through. */
  export function expandActivities(activities: TimelineActivity[]): ActivityLineItem[] {
    return activities.flatMap((activity) => {
      const changes = activity.data.changes;
      if (activity.type !== 'issue.updated' || !Array.isArray(changes) || changes.length === 0) {
        return [activity];
      }
      return (changes as IssueChange[]).map((change, i) => ({
        ...activity,
        id: `${activity.id}:${i}`,
        change,
      }));
    });
  }

  type Named = { id?: string; name?: string | null; key?: string; title?: string; type?: string };
  const asNamed = (value: unknown): Named | null =>
    value && typeof value === 'object' ? (value as Named) : null;

  function listNames(items: unknown[] | undefined): string[] {
    return (items ?? []).map((item) => asNamed(item)?.name).filter(Boolean) as string[];
  }

  const FIXED: Record<string, string> = {
    'issue.created': 'created the issue',
    'issue.archived': 'archived the issue',
    'issue.unarchived': 'restored the issue from the archive',
    'issue.deleted': 'moved the issue to the trash',
    'issue.restored': 'restored the issue',
  };
</script>

<script lang="ts">
  import Bot from '@lucide/svelte/icons/bot';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Avatar, PriorityIcon, StatusIcon } from '@/lib/components/ui-icons';
  import { formatDueDate, isDateString } from '@/lib/dates';
  import { formatEstimate } from '@/lib/estimates';
  import { isPriority, isStateType, PRIORITY_LABEL } from '@/lib/issue-model';
  import Timestamp from './timestamp.svelte';

  let { line }: { line: ActivityLineItem } = $props();

  const data = useProjectData();
  const actorName = $derived(
    line.actor?.name ??
      (typeof line.data.actorName === 'string' && line.data.actorName ? line.data.actorName : 'System'),
  );

  function cycleName(cycle: Named | null): string | null {
    if (!cycle) return null;
    if (cycle.name) return cycle.name;
    const known = data.cycles.find((c) => c.id === cycle.id);
    return known ? `Cycle ${known.number}` : 'a cycle';
  }
</script>

{#snippet v(text: string | null | undefined)}
  <span class="font-medium text-foreground">{text}</span>
{/snippet}

{#snippet names(items: unknown[] | undefined)}
  {#each listNames(items) as name, i (`${name}-${i}`)}
    <span>{#if i > 0}, {/if}{@render v(name)}</span>
  {/each}
{/snippet}

{#snippet glyph(state: Named | null)}
  {#if state && isStateType(state.type)}
    <StatusIcon
      type={state.type}
      color={data.states.find((s) => s.id === state.id)?.color}
      size={14}
      class="mr-1 inline align-[-2px]"
    />
  {/if}
{/snippet}

{#snippet describeChange(change: IssueChange, actorId: string | null)}
  {@const from = asNamed(change.from)}
  {@const to = asNamed(change.to)}
  {#if change.field === 'stateId'}
    changed status from {@render glyph(from)}{@render v(from?.name ?? 'unknown')} to {@render glyph(to)}{@render v(
      to?.name ?? 'unknown',
    )}
  {:else if change.field === 'priority'}
    {@const value = change.to}
    {#if !isPriority(value) || value === 'none'}
      removed the priority
    {:else}
      set priority to <PriorityIcon priority={value} size={14} class="mr-1 inline align-[-2px]" />{@render v(
        PRIORITY_LABEL[value],
      )}
    {/if}
  {:else if change.field === 'assigneeId'}
    {#if !to}
      {#if from?.name}unassigned {@render v(from.name)}{:else}unassigned the issue{/if}
    {:else if to.id && to.id === actorId}
      self-assigned the issue
    {:else if from}
      reassigned from {@render v(from.name)} to {@render v(to.name)}
    {:else}
      assigned the issue to {@render v(to.name)}
    {/if}
  {:else if change.field === 'labelIds'}
    {@const added = change.added ?? []}
    {@const removed = change.removed ?? []}
    {#if added.length > 0}added {added.length > 1 ? 'labels' : 'label'} {@render names(added)}{/if}{#if added.length > 0 && removed.length > 0}{' and '}{/if}{#if removed.length > 0}removed {removed.length > 1 ? 'labels' : 'label'} {@render names(removed)}{/if}
  {:else if change.field === 'estimate'}
    {#if typeof change.to === 'number'}
      set the estimate to {@render v(formatEstimate(data.project.estimateScale, change.to))}
    {:else}
      removed the estimate
    {/if}
  {:else if change.field === 'dueDate'}
    {#if isDateString(change.to)}
      set the due date to {@render v(formatDueDate(change.to))}
    {:else}
      removed the due date
    {/if}
  {:else if change.field === 'waitingOnId'}
    {#if to?.name}
      set waiting on to {@render v(to.name)}
    {:else}
      {#if from?.name}stopped waiting on {@render v(from.name)}{:else}removed waiting on{/if}
    {/if}
  {:else if change.field === 'followUp'}
    {#if isDateString(change.to)}
      set the follow-up date to {@render v(formatDueDate(change.to))}
    {:else}
      removed the follow-up date
    {/if}
  {:else if change.field === 'startDate'}
    {#if isDateString(change.to)}
      set the start date to {@render v(formatDueDate(change.to))}
    {:else}
      removed the start date
    {/if}
  {:else if change.field === 'parentId'}
    {#if to}
      set the parent issue to {@render v(to.key ? `${to.key} ${to.title ?? ''}`.trim() : 'another issue')}
    {:else}
      removed the parent issue
    {/if}
  {:else if change.field === 'cycleId'}
    {#if to}
      added the issue to {@render v(cycleName(to))}
    {:else}
      removed the issue from {@render v(cycleName(from) ?? 'its cycle')}
    {/if}
  {:else if change.field === 'epicId'}
    {#if to}
      moved the issue to epic {@render v(to.name ?? 'an epic')}
    {:else}
      removed the issue from epic {@render v(from?.name ?? '')}
    {/if}
  {:else if change.field === 'milestoneId'}
    {#if to}
      set the milestone to {@render v(to.name ?? 'a milestone')}
    {:else}
      removed the milestone
    {/if}
  {:else if change.field === 'title'}
    changed the title to {@render v(String(change.to ?? ''))}
  {:else if change.field === 'description'}
    updated the description
  {:else}
    updated the issue
  {/if}
{/snippet}

{#snippet describe(item: ActivityLineItem)}
  {#if item.change}
    {@render describeChange(item.change, item.actor?.id ?? null)}
  {:else if FIXED[item.type]}
    {FIXED[item.type]}
  {:else}
    {@const summary = item.data.summary}
    {typeof summary === 'string' && summary.trim() ? summary : 'updated the issue'}
  {/if}
{/snippet}

<div class="flex items-start gap-2 py-1 pl-0.5 text-xs text-muted-foreground">
  <span class="mt-px flex size-4 shrink-0 items-center justify-center">
    {#if line.actor}
      <Avatar name={line.actor.name} src={line.actor.image} size={20} class="size-4 text-[8px]" />
    {:else}
      <Bot class="size-3.5" aria-hidden="true" />
    {/if}
  </span>
  <p class="min-w-0 leading-5">
    {@render v(actorName)}
    {@render describe(line)}
    <span aria-hidden="true"> · </span>
    <Timestamp date={line.createdAt} />
  </p>
</div>
