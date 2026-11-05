<!--
  Property chips (status, priority, assignee, labels, estimate, due date) for
  forms that build an IssuePatch: the new-issue dialog and the template editor.
-->
<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Tag from '@lucide/svelte/icons/tag';
  import Triangle from '@lucide/svelte/icons/triangle';
  import UserRound from '@lucide/svelte/icons/user-round';

  import {
    AssigneePicker,
    DueDatePicker,
    EstimatePicker,
    LabelPicker,
    PriorityPicker,
    StatePicker,
  } from '@/lib/components/issue-pickers';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { formatDueDate } from '@/lib/dates';
  import { formatEstimate } from '@/lib/estimates';
  import { PRIORITY_LABEL, type IssuePatch, type WorkflowState } from '@/lib/issue-model';

  let {
    value,
    onChange,
    fallbackState,
    showDueDate = true,
  }: {
    value: IssuePatch;
    onChange: (patch: IssuePatch) => void;
    /** Shown when `value.stateId` is unset (the state a new issue would get). */
    fallbackState?: WorkflowState;
    /** Templates have no due date. */
    showDueDate?: boolean;
  } = $props();

  const data = useProjectData();
  const state = $derived(data.states.find((s) => s.id === value.stateId) ?? fallbackState);
  const priority = $derived(value.priority ?? 'none');
  const assignee = $derived(data.members.find((m) => m.id === value.assigneeId));
  const labelIds = $derived(value.labelIds ?? []);
  const selectedLabels = $derived(data.labels.filter((l) => labelIds.includes(l.id)));

  /** Property chip trigger classes; trigger props (aria-*, handlers) come from the picker. */
  const CHIP = 'max-w-48 font-normal text-muted-foreground aria-expanded:text-foreground';
</script>

<div role="group" aria-label="Properties" class="flex flex-wrap gap-1.5">
  <StatePicker value={state?.id ?? null} onChange={(stateId: string) => onChange({ stateId })}>
    {#snippet children({ props })}
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label="Status: {state?.name ?? 'none'}" {...props}>
        {#if state}<StateIcon {state} size={14} />{/if}
        <span class="truncate text-foreground">{state?.name ?? 'Status'}</span>
      </Button>
    {/snippet}
  </StatePicker>

  <PriorityPicker value={priority} onChange={(next: IssuePatch['priority']) => onChange({ priority: next })}>
    {#snippet children({ props })}
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label="Priority: {PRIORITY_LABEL[priority]}" {...props}>
        <PriorityIcon {priority} size={14} />
        <span class={priority !== 'none' ? 'text-foreground' : undefined}>
          {priority === 'none' ? 'Priority' : PRIORITY_LABEL[priority]}
        </span>
      </Button>
    {/snippet}
  </PriorityPicker>

  <AssigneePicker
    value={value.assigneeId ?? null}
    onChange={(assigneeId: string | null) => onChange({ assigneeId })}
  >
    {#snippet children({ props })}
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label="Assignee: {assignee?.name ?? 'none'}" {...props}>
        {#if assignee}
          <Avatar name={assignee.name} src={assignee.image} size={20} class="-my-1 size-4" />
          <span class="truncate text-foreground">{assignee.name}</span>
        {:else}
          <UserRound />
          Assignee
        {/if}
      </Button>
    {/snippet}
  </AssigneePicker>

  <LabelPicker value={labelIds} onChange={(next: string[]) => onChange({ labelIds: next })}>
    {#snippet children({ props })}
      <Button
        type="button"
        variant="outline"
        size="xs"
        class={CHIP}
        aria-label="Labels: {selectedLabels.map((l) => l.name).join(', ') || 'none'}"
        {...props}
      >
        {#if selectedLabels.length === 0}
          <Tag />
          Labels
        {:else}
          {#each selectedLabels.slice(0, 3) as l (l.id)}
            <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background-color={l.color}></span>
          {/each}
          <span class="truncate text-foreground">
            {selectedLabels.length === 1 ? selectedLabels[0].name : `${selectedLabels.length} labels`}
          </span>
        {/if}
      </Button>
    {/snippet}
  </LabelPicker>

  <EstimatePicker
    value={value.estimate ?? null}
    onChange={(estimate: number | null) => onChange({ estimate })}
  >
    {#snippet children({ props })}
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label="Estimate" {...props}>
        <Triangle />
        {#if value.estimate != null}
          <span class="text-foreground">{formatEstimate(data.project.estimateScale, value.estimate)}</span>
        {:else}
          Estimate
        {/if}
      </Button>
    {/snippet}
  </EstimatePicker>

  {#if showDueDate}
    <DueDatePicker value={value.dueDate ?? null} onChange={(dueDate: string | null) => onChange({ dueDate })}>
      {#snippet children({ props })}
        <Button type="button" variant="outline" size="xs" class={CHIP} aria-label="Due date" {...props}>
          <CalendarDays />
          {#if value.dueDate}
            <span class="text-foreground">{formatDueDate(value.dueDate)}</span>
          {:else}
            Due date
          {/if}
        </Button>
      {/snippet}
    </DueDatePicker>
  {/if}
</div>
