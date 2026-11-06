<!--
  One list row (`ref` is bindable). Attachments put on <IssueRow> ({@attach …},
  e.g. the list's sortable) land on the row element.
-->
<script module lang="ts">
  import type { IssuePatch, IssueRow as Issue } from '@/lib/issue-model';

  export interface IssueRowProps {
    issue: Issue;
    active: boolean;
    /** Controlled status picker (the list's `s` hotkey opens it). */
    statusMenuOpen: boolean;
    onStatusMenuOpenChange: (open: boolean) => void;
    onUpdate: (patch: IssuePatch) => void;
    onFocus: () => void;
    onSelect?: () => void;
    ref?: HTMLDivElement | null;
  }
</script>

<script lang="ts">
  import UserRoundIcon from '@lucide/svelte/icons/user-round';

  import { ISSUE_ROW_ATTR, issueAttr } from '@/lib/components/issues/issue-dom';
  import { AssigneePicker, PriorityPicker, StatePicker } from '@/lib/components/issue-pickers';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import SlaChip from '@/lib/components/sla/sla-chip.svelte';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import CycleChip from '@/lib/components/views/cycle-chip.svelte';
  import EpicChip from '@/lib/components/views/epic-chip.svelte';
  import MilestoneChip from '@/lib/components/views/milestone-chip.svelte';
  import StartDateChip from '@/lib/components/views/start-date-chip.svelte';
  import SubIssueChip from '@/lib/components/views/sub-issue-chip.svelte';
  import { useSubIssueCount } from '@/lib/components/views/view-context.svelte';
  import { PRIORITY_LABEL } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { useDisplayOptions } from './display-options.svelte';
  import DueDateChip from './due-date-chip.svelte';
  import { focusIssueRow } from './issue-dom';
  import EstimateChip from './estimate-chip.svelte';
  import { relativeTime } from '@/lib/relative-time';
  import LabelChips from './label-chips.svelte';
  import RowButton from './row-button.svelte';
  import SelectCheckbox from './select-checkbox.svelte';
  import {
    handleSelectionClick,
    preventShiftSelect,
    useHasSelection,
    useIsSelected,
    useIssueSelection,
  } from './selection.svelte';
  import { isPendingIssue } from './use-issue-mutations.svelte';

  let {
    issue,
    active,
    statusMenuOpen,
    onStatusMenuOpenChange,
    onUpdate,
    onFocus,
    onSelect,
    ref = $bindable(null),
    ...rest
  }: IssueRowProps = $props();

  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const display = useDisplayOptions();
  const show = $derived(display.current.properties);
  const subIssues = useSubIssueCount(() => issue.id);
  const selection = useIssueSelection();
  const selected = useIsSelected(() => issue.id);
  const anySelected = useHasSelection();
  const selectable = $derived(selection.enabled && !isPendingIssue(issue));

  // Pickers hand focus back to the row, not their trigger, so j/k keep working.
  const refocusRow = (event: Event) => {
    event.preventDefault();
    focusIssueRow(issue.id);
  };
</script>

<!-- The row is the tab stop and a click target (role-less div). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={ref}
  {...rest}
  tabindex={0}
  {...issueAttr(ISSUE_ROW_ATTR, issue.id)}
  data-active={active}
  aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
  aria-current={active ? 'true' : undefined}
  aria-selected={selection.enabled ? selected.current : undefined}
  onfocusin={onFocus}
  onmousedown={preventShiftSelect}
  onclick={(event) => {
    if (selectable && handleSelectionClick(selection, event, issue.id)) return;
    onSelect?.();
  }}
  class={cn(
    'group flex h-9 items-center gap-3 rounded-md px-2 text-sm outline-none transition-colors',
    'hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
    active && 'bg-accent/40',
    selected.current && 'bg-primary/10 hover:bg-primary/15',
    onSelect && 'cursor-pointer',
  )}
>
  {#if selection.enabled && !selectable}<span aria-hidden="true" class="size-4 shrink-0"></span>{/if}
  {#if selectable}
    <SelectCheckbox
      checked={selected.current}
      label={`Select ${issue.key}`}
      onToggle={(event) =>
        event.shiftKey ? selection.extendTo(issue.id, event.currentTarget) : selection.toggle(issue.id)}
      class={cn(!anySelected.current && 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100')}
    />
  {/if}
  {#if show.priority && !canWrite.current}<PriorityIcon priority={issue.priority} size={14} />{/if}
  {#if show.priority && canWrite.current}
    <PriorityPicker
      value={issue.priority}
      onChange={(priority) => onUpdate({ priority })}
      onCloseAutoFocus={refocusRow}
    >
      {#snippet children({ props })}
        <RowButton {...props} label={`Change priority (${PRIORITY_LABEL[issue.priority]})`}>
          <PriorityIcon priority={issue.priority} size={14} />
        </RowButton>
      {/snippet}
    </PriorityPicker>
  {/if}

  {#if show.id}
    <span class="w-16 shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
  {/if}

  {#if show.status && !canWrite.current}<StateIcon state={issue.state} size={14} />{/if}
  {#if show.status && canWrite.current}
    <StatePicker
      value={issue.stateId}
      onChange={(stateId) => onUpdate({ stateId })}
      open={statusMenuOpen}
      onOpenChange={onStatusMenuOpenChange}
      onCloseAutoFocus={refocusRow}
    >
      {#snippet children({ props })}
        <RowButton {...props} label={`Change status (${issue.state.name})`}>
          <StateIcon state={issue.state} size={14} />
        </RowButton>
      {/snippet}
    </StatePicker>
  {/if}

  <span class="min-w-0 flex-1 truncate">{issue.title}</span>

  {#if show.subIssues || !display.current.showSubIssues}<SubIssueChip count={subIssues.current} />{/if}
  {#if show.labels}<LabelChips labels={issue.labels} class="hidden md:flex" />{/if}
  {#if show.epic}<EpicChip epicId={issue.epicId} class="hidden lg:inline-flex" />{/if}
  {#if show.milestone}
    <MilestoneChip epicId={issue.epicId} milestoneId={issue.milestoneId} class="hidden lg:inline-flex" />
  {/if}
  {#if show.cycle}<CycleChip cycleId={issue.cycleId} class="hidden lg:inline-flex" />{/if}
  {#if show.estimate}<EstimateChip scale={data.project.estimateScale} value={issue.estimate} />{/if}
  {#if show.startDate}<StartDateChip startDate={issue.startDate} class="hidden sm:inline-flex" />{/if}
  {#if show.dueDate}<DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} />{/if}
  {#if show.sla}<SlaChip {issue} />{/if}

  {#if show.assignee && !canWrite.current && issue.assignee}
    <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} class="shrink-0" />
  {/if}
  {#if show.assignee && canWrite.current}
    <AssigneePicker
      value={issue.assignee?.id ?? null}
      onChange={(assigneeId) => onUpdate({ assigneeId })}
      align="end"
      onCloseAutoFocus={refocusRow}
    >
      {#snippet children({ props })}
        <RowButton {...props} label={issue.assignee ? `Assigned to ${issue.assignee.name}` : 'Assign'}>
          {#if issue.assignee}
            <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
          {:else}
            <UserRoundIcon class="size-5 p-0.5 text-muted-foreground/60" />
          {/if}
        </RowButton>
      {/snippet}
    </AssigneePicker>
  {/if}

  {#if show.created}
    <time
      datetime={new Date(issue.createdAt).toISOString()}
      title={`Created ${new Date(issue.createdAt).toLocaleString()}`}
      class="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
    >
      {relativeTime(issue.createdAt)}
    </time>
  {/if}
  {#if show.updated}
    <time
      datetime={new Date(issue.updatedAt).toISOString()}
      title={`Updated ${new Date(issue.updatedAt).toLocaleString()}`}
      class="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
    >
      {relativeTime(issue.updatedAt)}
    </time>
  {/if}
</div>
