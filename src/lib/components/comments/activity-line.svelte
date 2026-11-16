<!--
  One line of issue history: "Ana changed status from Todo to In Progress · 2h".
  issue.updated events expand to one line per
  change; unknown event types use their `data.summary` (the event-bus
  convention), else "updated the issue".
-->
<script module lang="ts">
  import type { IssueChange } from '@/lib/events';
  import { m } from '@/lib/i18n';
  import type { Priority } from '@/lib/issue-model';
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

  const FIXED: Record<string, () => string> = {
    'issue.created': () => m.editor_activity_created(),
    'issue.archived': () => m.editor_activity_archived(),
    'issue.unarchived': () => m.editor_activity_unarchived(),
    'issue.deleted': () => m.editor_activity_deleted(),
    'issue.restored': () => m.editor_activity_restored(),
  };

  // Messages are built with placeholder tokens for the highlighted values
  // (names, dates, icons), then split back into text and rich parts, so word
  // order stays up to each language.
  type Slot = { text: string; list?: unknown[]; state?: Named | null; priority?: Priority };
  const SLOT_SPLIT = /\uE000(\w+)\uE000/;
  const tok = (name: string) => `\uE000${name}\uE000`;
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
      (typeof line.data.actorName === 'string' && line.data.actorName ? line.data.actorName : m.editor_activity_system()),
  );

  function cycleName(cycle: Named | null): string | null {
    if (!cycle) return null;
    if (cycle.name) return cycle.name;
    const known = data.cycles.find((c) => c.id === cycle.id);
    return known ? m.editor_activity_cycle_n({ number: known.number }) : m.editor_activity_a_cycle();
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

{#snippet fmt(template: string, slots: Record<string, Slot>)}
  {#each template.split(SLOT_SPLIT) as part, i (i)}
    {#if i % 2 === 0}{part}{:else}
      {@const slot = slots[part]}
      {#if slot.state}{@render glyph(slot.state)}{/if}
      {#if slot.priority}<PriorityIcon priority={slot.priority} size={14} class="mr-1 inline align-[-2px]" />{/if}
      {#if slot.list}{@render names(slot.list)}{:else}{@render v(slot.text)}{/if}
    {/if}
  {/each}
{/snippet}

{#snippet describeChange(change: IssueChange, actorId: string | null)}
  {@const from = asNamed(change.from)}
  {@const to = asNamed(change.to)}
  {#if change.field === 'stateId'}
    {@render fmt(
      m.editor_activity_status({ from: tok('from'), to: tok('to') }),
      {
        from: { text: from?.name ?? m.editor_activity_unknown(), state: from },
        to: { text: to?.name ?? m.editor_activity_unknown(), state: to },
      },
    )}
  {:else if change.field === 'priority'}
    {@const value = change.to}
    {#if !isPriority(value) || value === 'none'}
      {m.editor_activity_priority_removed()}
    {:else}
      {@render fmt(m.editor_activity_priority_set({ value: tok('value') }), {
        value: { text: PRIORITY_LABEL[value], priority: value },
      })}
    {/if}
  {:else if change.field === 'assigneeId'}
    {#if !to}
      {#if from?.name}
        {@render fmt(m.editor_activity_unassigned_name({ name: tok('name') }), { name: { text: from.name } })}
      {:else}
        {m.editor_activity_unassigned()}
      {/if}
    {:else if to.id && to.id === actorId}
      {m.editor_activity_self_assigned()}
    {:else if from}
      {@render fmt(m.editor_activity_reassigned({ from: tok('from'), to: tok('to') }), {
        from: { text: from.name ?? '' },
        to: { text: to.name ?? '' },
      })}
    {:else}
      {@render fmt(m.editor_activity_assigned({ to: tok('to') }), { to: { text: to.name ?? '' } })}
    {/if}
  {:else if change.field === 'labelIds'}
    {@const added = change.added ?? []}
    {@const removed = change.removed ?? []}
    {#if added.length > 0}{@render fmt(m.editor_activity_labels_added({ count: added.length, names: tok('names') }), { names: { text: '', list: added } })}{/if}{#if added.length > 0 && removed.length > 0}{m.editor_activity_labels_and()}{/if}{#if removed.length > 0}{@render fmt(m.editor_activity_labels_removed({ count: removed.length, names: tok('names') }), { names: { text: '', list: removed } })}{/if}
  {:else if change.field === 'estimate'}
    {#if typeof change.to === 'number'}
      {@render fmt(m.editor_activity_estimate_set({ value: tok('value') }), {
        value: { text: formatEstimate(data.project.estimateScale, change.to) },
      })}
    {:else}
      {m.editor_activity_estimate_removed()}
    {/if}
  {:else if change.field === 'dueDate'}
    {#if isDateString(change.to)}
      {@render fmt(m.editor_activity_due_set({ date: tok('date') }), { date: { text: formatDueDate(change.to) } })}
    {:else}
      {m.editor_activity_due_removed()}
    {/if}
  {:else if change.field === 'waitingOnId'}
    {#if to?.name}
      {@render fmt(m.editor_activity_waiting_set({ name: tok('name') }), { name: { text: to.name } })}
    {:else if from?.name}
      {@render fmt(m.editor_activity_waiting_stopped({ name: tok('name') }), { name: { text: from.name } })}
    {:else}
      {m.editor_activity_waiting_removed()}
    {/if}
  {:else if change.field === 'followUp'}
    {#if isDateString(change.to)}
      {@render fmt(m.editor_activity_followup_set({ date: tok('date') }), { date: { text: formatDueDate(change.to) } })}
    {:else}
      {m.editor_activity_followup_removed()}
    {/if}
  {:else if change.field === 'startDate'}
    {#if isDateString(change.to)}
      {@render fmt(m.editor_activity_start_set({ date: tok('date') }), { date: { text: formatDueDate(change.to) } })}
    {:else}
      {m.editor_activity_start_removed()}
    {/if}
  {:else if change.field === 'parentId'}
    {#if to}
      {@render fmt(m.editor_activity_parent_set({ name: tok('name') }), {
        name: { text: to.key ? `${to.key} ${to.title ?? ''}`.trim() : m.editor_activity_another_issue() },
      })}
    {:else}
      {m.editor_activity_parent_removed()}
    {/if}
  {:else if change.field === 'cycleId'}
    {#if to}
      {@render fmt(m.editor_activity_cycle_added({ name: tok('name') }), { name: { text: cycleName(to) ?? '' } })}
    {:else}
      {@render fmt(m.editor_activity_cycle_removed({ name: tok('name') }), {
        name: { text: cycleName(from) ?? m.editor_activity_its_cycle() },
      })}
    {/if}
  {:else if change.field === 'epicId'}
    {#if to}
      {@render fmt(m.editor_activity_epic_set({ name: tok('name') }), {
        name: { text: to.name ?? m.editor_activity_an_epic() },
      })}
    {:else}
      {@render fmt(m.editor_activity_epic_removed({ name: tok('name') }), { name: { text: from?.name ?? '' } })}
    {/if}
  {:else if change.field === 'milestoneId'}
    {#if to}
      {@render fmt(m.editor_activity_milestone_set({ name: tok('name') }), {
        name: { text: to.name ?? m.editor_activity_a_milestone() },
      })}
    {:else}
      {m.editor_activity_milestone_removed()}
    {/if}
  {:else if change.field === 'title'}
    {@render fmt(m.editor_activity_title({ title: tok('title') }), { title: { text: String(change.to ?? '') } })}
  {:else if change.field === 'description'}
    {m.editor_activity_description()}
  {:else}
    {m.editor_activity_updated()}
  {/if}
{/snippet}

{#snippet describe(item: ActivityLineItem)}
  {#if item.change}
    {@render describeChange(item.change, item.actor?.id ?? null)}
  {:else if FIXED[item.type]}
    {FIXED[item.type]()}
  {:else}
    {@const summary = item.data.summary}
    {typeof summary === 'string' && summary.trim() ? summary : m.editor_activity_updated()}
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
