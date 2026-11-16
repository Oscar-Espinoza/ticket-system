<!--
  Property chips (status, priority, assignee, waiting on, labels, estimate, due
  date, follow-up) for
  forms that build an IssuePatch: the new-issue dialog and the template editor.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Hourglass from '@lucide/svelte/icons/hourglass';
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
    /** Templates have no due date (nor follow-up date). */
    showDueDate?: boolean;
  } = $props();

  const data = useProjectData();
  const state = $derived(data.states.find((s) => s.id === value.stateId) ?? fallbackState);
  const priority = $derived(value.priority ?? 'none');
  const assignee = $derived(data.members.find((m) => m.id === value.assigneeId));
  const waitingOn = $derived(data.members.find((m) => m.id === value.waitingOnId));
  const labelIds = $derived(value.labelIds ?? []);
  const selectedLabels = $derived(data.labels.filter((l) => labelIds.includes(l.id)));

  /** Property chip trigger classes; trigger props (aria-*, handlers) come from the picker. */
  const CHIP = 'max-w-48 font-normal text-muted-foreground aria-expanded:text-foreground';
</script>

<div role="group" aria-label={m.issues_properties()} class="flex flex-wrap gap-1.5">
  <StatePicker value={state?.id ?? null} onChange={(stateId: string) => onChange({ stateId })}>
    {#snippet children({ props })}
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label={m.issues_chip_status_aria({ value: state?.name ?? m.issues_chip_none() })} {...props}>
        {#if state}<StateIcon {state} size={14} />{/if}
        <span class="truncate text-foreground">{state?.name ?? m.common_status()}</span>
      </Button>
    {/snippet}
  </StatePicker>

  <PriorityPicker value={priority} onChange={(next: IssuePatch['priority']) => onChange({ priority: next })}>
    {#snippet children({ props })}
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label={m.issues_chip_priority_aria({ value: PRIORITY_LABEL[priority] })} {...props}>
        <PriorityIcon {priority} size={14} />
        <span class={priority !== 'none' ? 'text-foreground' : undefined}>
          {priority === 'none' ? m.common_priority() : PRIORITY_LABEL[priority]}
        </span>
      </Button>
    {/snippet}
  </PriorityPicker>

  <AssigneePicker
    value={value.assigneeId ?? null}
    onChange={(assigneeId: string | null) => onChange({ assigneeId })}
  >
    {#snippet children({ props })}
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label={m.issues_chip_assignee_aria({ value: assignee?.name ?? m.issues_chip_none() })} {...props}>
        {#if assignee}
          <Avatar name={assignee.name} src={assignee.image} size={20} class="-my-1 size-4" />
          <span class="truncate text-foreground">{assignee.name}</span>
        {:else}
          <UserRound />
          {m.common_assignee()}
        {/if}
      </Button>
    {/snippet}
  </AssigneePicker>

  <AssigneePicker
    value={value.waitingOnId ?? null}
    placeholder={m.issues_waiting_on_placeholder()}
    noneLabel={m.issues_waiting_on_none()}
    onChange={(waitingOnId: string | null) => onChange({ waitingOnId })}
  >
    {#snippet children({ props })}
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label={m.issues_chip_waiting_aria({ value: waitingOn?.name ?? m.issues_chip_no_one() })} {...props}>
        {#if waitingOn}
          <Avatar name={waitingOn.name} src={waitingOn.image} size={20} class="-my-1 size-4" />
          <span class="truncate text-foreground">{waitingOn.name}</span>
        {:else}
          <Hourglass />
          {m.issues_waiting_on()}
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
        aria-label={m.issues_chip_labels_aria({ value: selectedLabels.map((l) => l.name).join(', ') || m.issues_chip_none() })}
        {...props}
      >
        {#if selectedLabels.length === 0}
          <Tag />
          {m.common_labels()}
        {:else}
          {#each selectedLabels.slice(0, 3) as l (l.id)}
            <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background-color={l.color}></span>
          {/each}
          <span class="truncate text-foreground">
            {selectedLabels.length === 1 ? selectedLabels[0].name : m.issues_chip_labels_count({ count: selectedLabels.length })}
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
      <Button type="button" variant="outline" size="xs" class={CHIP} aria-label={m.issues_estimate()} {...props}>
        <Triangle />
        {#if value.estimate != null}
          <span class="text-foreground">{formatEstimate(data.project.estimateScale, value.estimate)}</span>
        {:else}
          {m.issues_estimate()}
        {/if}
      </Button>
    {/snippet}
  </EstimatePicker>

  {#if showDueDate}
    <DueDatePicker value={value.dueDate ?? null} onChange={(dueDate: string | null) => onChange({ dueDate })}>
      {#snippet children({ props })}
        <Button type="button" variant="outline" size="xs" class={CHIP} aria-label={m.common_due_date()} {...props}>
          <CalendarDays />
          {#if value.dueDate}
            <span class="text-foreground">{formatDueDate(value.dueDate)}</span>
          {:else}
            {m.common_due_date()}
          {/if}
        </Button>
      {/snippet}
    </DueDatePicker>
    <DueDatePicker
      value={value.followUp ?? null}
      placeholder={m.issues_followup_placeholder()}
      removeLabel={m.issues_followup_remove()}
      onChange={(followUp: string | null) => onChange({ followUp })}
    >
      {#snippet children({ props })}
        <Button type="button" variant="outline" size="xs" class={CHIP} aria-label={m.issues_followup_date()} {...props}>
          <CalendarClock />
          {#if value.followUp}
            <span class="text-foreground">{formatDueDate(value.followUp)}</span>
          {:else}
            {m.issues_followup()}
          {/if}
        </Button>
      {/snippet}
    </DueDatePicker>
  {/if}
</div>
