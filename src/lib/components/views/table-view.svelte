<!--
  Spreadsheet layout: one row per issue, one column per visible property,
  inline editing through the shared pickers, sortable headers (= ordering).
-->
<script lang="ts">
  import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';

  import {
    AssigneePicker,
    DueDatePicker,
    EstimatePicker,
    LabelPicker,
    PriorityPicker,
    StatePicker,
  } from '@/lib/components/issue-pickers';
  import { ISSUE_ROW_ATTR, issueAttr } from '@/lib/components/issues/issue-dom';
  import { useDisplayOptions, type DisplayProperty } from '@/lib/components/issues/display-options.svelte';
  import { DueDateChip, EstimateChip, LabelChips } from '@/lib/components/issues/issue-properties';
  import { relativeTime } from '@/lib/relative-time';
  import SelectCheckbox from '@/lib/components/issues/select-checkbox.svelte';
  import {
    handleSelectionClick,
    preventShiftSelect,
    useIssueSelection,
    useSelectedIds,
  } from '@/lib/components/issues/selection.svelte';
  import { isPendingIssue } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Avatar, EmptyState, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import SlaChip from '@/lib/components/sla/sla-chip.svelte';
  import StartDatePicker from '@/lib/components/issue-detail/slots/start-date-picker.svelte';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import type { OrderBy } from '@/lib/issue-grouping';
  import { PRIORITY_LABEL, type IssuePatch, type IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import CycleChip from './cycle-chip.svelte';
  import EpicChip from './epic-chip.svelte';
  import MilestoneChip from './milestone-chip.svelte';
  import StartDateChip from './start-date-chip.svelte';
  import TableCellButton from './table-cell-button.svelte';
  import TableSubIssuesCell from './table-sub-issues-cell.svelte';
  import type { IssueViewProps } from '@/lib/components/issues/views';
  import { focusIssueRow } from '@/lib/components/issues/issue-dom';

  let { issues, mutations, selectedId, onSelect }: IssueViewProps = $props();

  type ColumnId = DisplayProperty | 'title';

  interface Column {
    id: ColumnId;
    label: string;
    className: string;
    orderBy?: OrderBy;
  }

  interface CellEditor {
    canEdit: boolean;
    update: (patch: IssuePatch) => void;
    refocus: (event: Event) => void;
  }

  const ALL_COLUMNS: Column[] = [
    { id: 'id', label: 'ID', className: 'w-24 min-w-24' },
    { id: 'status', label: 'Status', className: 'w-40 min-w-40' },
    { id: 'title', label: 'Title', className: 'w-full min-w-64 max-w-0', orderBy: 'title' },
    { id: 'priority', label: 'Priority', className: 'w-32 min-w-32', orderBy: 'priority' },
    { id: 'assignee', label: 'Assignee', className: 'w-44 min-w-44' },
    { id: 'labels', label: 'Labels', className: 'w-52 min-w-52' },
    { id: 'estimate', label: 'Estimate', className: 'w-28 min-w-28' },
    { id: 'dueDate', label: 'Due date', className: 'w-32 min-w-32', orderBy: 'dueDate' },
    { id: 'startDate', label: 'Start date', className: 'w-32 min-w-32' },
    { id: 'sla', label: 'SLA', className: 'w-28 min-w-28' },
    { id: 'cycle', label: 'Cycle', className: 'w-36 min-w-36' },
    { id: 'epic', label: 'Epic', className: 'w-44 min-w-44' },
    { id: 'milestone', label: 'Milestone', className: 'w-40 min-w-40' },
    { id: 'subIssues', label: 'Sub-issues', className: 'w-28 min-w-28' },
    { id: 'created', label: 'Created', className: 'w-28 min-w-28', orderBy: 'created' },
    { id: 'updated', label: 'Updated', className: 'w-28 min-w-28', orderBy: 'updated' },
  ];

  const displayOptions = useDisplayOptions();
  const display = $derived(displayOptions.current);
  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const columns = $derived(
    ALL_COLUMNS.filter((c) => c.id !== 'estimate' || data.project.estimateScale !== 'none').filter(
      (c) => c.id === 'title' || display.properties[c.id],
    ),
  );
  let cursorId = $state<string | null>(null);
  const rows = new Map<string, HTMLTableRowElement>();
  const selection = useIssueSelection();
  const selectedIds = useSelectedIds();

  function focusRow(id: string) {
    cursorId = id;
    const row = rows.get(id);
    row?.focus();
    row?.scrollIntoView({ block: 'nearest' });
  }

  function step(from: string | null, delta: 1 | -1) {
    if (issues.length === 0) return;
    const index = issues.findIndex((i) => i.id === from);
    const next =
      index === -1
        ? delta === 1
          ? 0
          : issues.length - 1
        : Math.min(issues.length - 1, Math.max(0, index + delta));
    focusRow(issues[next].id);
  }

  $effect(() =>
    registerHotkeys([
      { key: 'j', scope: 'Issues', description: 'Next issue', handler: () => step(cursorId, 1) },
      { key: 'k', scope: 'Issues', description: 'Previous issue', handler: () => step(cursorId, -1) },
    ]),
  );

  const selectableIds = $derived(issues.filter((i) => !isPendingIssue(i)).map((i) => i.id));
  const selectedCount = $derived(selectableIds.filter((id) => selectedIds.current.has(id)).length);
  const allChecked = $derived<boolean | 'mixed'>(
    selectedCount === 0 ? false : selectedCount === selectableIds.length ? true : 'mixed',
  );

  function editorFor(issue: IssueRow): CellEditor {
    return {
      canEdit: canWrite.current && !isPendingIssue(issue),
      update: (patch) => mutations.update(issue, patch),
      // Pickers hand focus back to the row, so j/k keep working.
      refocus: (event) => {
        event.preventDefault();
        focusIssueRow(issue.id, 'tr');
      },
    };
  }

  const trackRow = (id: string) => (el: HTMLTableRowElement) => {
    rows.set(id, el);
    return () => {
      if (rows.get(id) === el) rows.delete(id);
    };
  };
</script>

{#snippet muted()}
  <span class="px-1.5 text-muted-foreground/50">—</span>
{/snippet}

{#snippet timeCell(date: Date, verb: string)}
  <time
    datetime={new Date(date).toISOString()}
    title={`${verb} ${new Date(date).toLocaleString()}`}
    class="px-1.5 text-xs tabular-nums text-muted-foreground"
  >
    {relativeTime(date)}
  </time>
{/snippet}

{#snippet statusContent(issue: IssueRow)}
  <StateIcon state={issue.state} size={14} />
  <span class="truncate">{issue.state.name}</span>
{/snippet}

{#snippet priorityContent(issue: IssueRow)}
  <PriorityIcon priority={issue.priority} size={14} />
  <span class="truncate">{PRIORITY_LABEL[issue.priority]}</span>
{/snippet}

{#snippet assigneeContent(issue: IssueRow)}
  {#if issue.assignee}
    <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
    <span class="truncate">{issue.assignee.name}</span>
  {:else}
    <UserRoundIcon class="size-4 text-muted-foreground/60" />
    <span class="text-muted-foreground">Unassigned</span>
  {/if}
{/snippet}

{#snippet labelsContent(issue: IssueRow)}
  {#if issue.labels.length}
    <LabelChips labels={issue.labels} max={2} />
  {:else}
    {@render muted()}
  {/if}
{/snippet}

{#snippet estimateContent(issue: IssueRow)}
  {#if issue.estimate === null}
    {@render muted()}
  {:else}
    <EstimateChip scale={data.project.estimateScale} value={issue.estimate} />
  {/if}
{/snippet}

{#snippet dueDateContent(issue: IssueRow)}
  {#if issue.dueDate}
    <DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} />
  {:else}
    {@render muted()}
  {/if}
{/snippet}

{#snippet startDateContent(issue: IssueRow)}
  {#if issue.startDate}
    <StartDateChip startDate={issue.startDate} />
  {:else}
    {@render muted()}
  {/if}
{/snippet}

{#snippet cell(column: Column, issue: IssueRow, edit: CellEditor)}
  {#if column.id === 'id'}
    <span class="px-1.5 font-mono text-xs text-muted-foreground">{issue.key}</span>
  {:else if column.id === 'status'}
    {#if edit.canEdit}
      <StatePicker value={issue.stateId} onChange={(stateId: string) => edit.update({ stateId })} onCloseAutoFocus={edit.refocus}>
        {#snippet children({ props }: { props: Record<string, unknown> })}
          <TableCellButton {...props} label={`Change status (${issue.state.name})`}>
            {@render statusContent(issue)}
          </TableCellButton>
        {/snippet}
      </StatePicker>
    {:else}
      <span class="flex items-center gap-1.5 px-1.5">{@render statusContent(issue)}</span>
    {/if}
  {:else if column.id === 'title'}
    <span class="block truncate px-1.5">{issue.title}</span>
  {:else if column.id === 'priority'}
    {#if edit.canEdit}
      <PriorityPicker
        value={issue.priority}
        onChange={(priority: IssueRow['priority']) => edit.update({ priority })}
        onCloseAutoFocus={edit.refocus}
      >
        {#snippet children({ props }: { props: Record<string, unknown> })}
          <TableCellButton {...props} label={`Change priority (${PRIORITY_LABEL[issue.priority]})`}>
            {@render priorityContent(issue)}
          </TableCellButton>
        {/snippet}
      </PriorityPicker>
    {:else}
      <span class="flex items-center gap-1.5 px-1.5">{@render priorityContent(issue)}</span>
    {/if}
  {:else if column.id === 'assignee'}
    {#if edit.canEdit}
      <AssigneePicker
        value={issue.assignee?.id ?? null}
        onChange={(assigneeId: string | null) => edit.update({ assigneeId })}
        onCloseAutoFocus={edit.refocus}
      >
        {#snippet children({ props }: { props: Record<string, unknown> })}
          <TableCellButton {...props} label={issue.assignee ? `Assigned to ${issue.assignee.name}` : 'Assign'}>
            {@render assigneeContent(issue)}
          </TableCellButton>
        {/snippet}
      </AssigneePicker>
    {:else}
      <span class="flex items-center gap-1.5 px-1.5">{@render assigneeContent(issue)}</span>
    {/if}
  {:else if column.id === 'labels'}
    {#if edit.canEdit}
      <LabelPicker
        value={issue.labels.map((l) => l.id)}
        onChange={(labelIds: string[]) => edit.update({ labelIds })}
        onCloseAutoFocus={edit.refocus}
      >
        {#snippet children({ props }: { props: Record<string, unknown> })}
          <TableCellButton {...props} label="Change labels" class="w-full">
            {@render labelsContent(issue)}
          </TableCellButton>
        {/snippet}
      </LabelPicker>
    {:else}
      {@render labelsContent(issue)}
    {/if}
  {:else if column.id === 'estimate'}
    {#if edit.canEdit}
      <EstimatePicker
        value={issue.estimate}
        onChange={(estimate: number | null) => edit.update({ estimate })}
        onCloseAutoFocus={edit.refocus}
      >
        {#snippet children({ props }: { props: Record<string, unknown> })}
          <TableCellButton {...props} label="Change estimate">
            {@render estimateContent(issue)}
          </TableCellButton>
        {/snippet}
      </EstimatePicker>
    {:else}
      {@render estimateContent(issue)}
    {/if}
  {:else if column.id === 'dueDate'}
    {#if edit.canEdit}
      <DueDatePicker
        value={issue.dueDate}
        onChange={(dueDate: string | null) => edit.update({ dueDate })}
        onCloseAutoFocus={edit.refocus}
      >
        {#snippet children({ props }: { props: Record<string, unknown> })}
          <TableCellButton {...props} label="Change due date">
            {@render dueDateContent(issue)}
          </TableCellButton>
        {/snippet}
      </DueDatePicker>
    {:else}
      {@render dueDateContent(issue)}
    {/if}
  {:else if column.id === 'startDate'}
    {#if edit.canEdit}
      <StartDatePicker
        value={issue.startDate}
        onChange={(startDate: string | null) => edit.update({ startDate })}
        onCloseAutoFocus={edit.refocus}
      >
        {#snippet children({ props }: { props: Record<string, unknown> })}
          <TableCellButton {...props} label="Change start date">
            {@render startDateContent(issue)}
          </TableCellButton>
        {/snippet}
      </StartDatePicker>
    {:else}
      {@render startDateContent(issue)}
    {/if}
  {:else if column.id === 'sla'}
    {#if issue.slaDueAt}<SlaChip {issue} />{:else}{@render muted()}{/if}
  {:else if column.id === 'cycle'}
    {#if issue.cycleId}<CycleChip cycleId={issue.cycleId} />{:else}{@render muted()}{/if}
  {:else if column.id === 'epic'}
    {#if issue.epicId}<EpicChip epicId={issue.epicId} />{:else}{@render muted()}{/if}
  {:else if column.id === 'milestone'}
    {#if issue.milestoneId}
      <MilestoneChip epicId={issue.epicId} milestoneId={issue.milestoneId} />
    {:else}
      {@render muted()}
    {/if}
  {:else if column.id === 'subIssues'}
    <TableSubIssuesCell {issue} />
  {:else if column.id === 'created'}
    {@render timeCell(issue.createdAt, 'Created')}
  {:else if column.id === 'updated'}
    {@render timeCell(issue.updatedAt, 'Updated')}
  {/if}
{/snippet}

{#if issues.length === 0}
  <EmptyState title="No issues" description="Nothing to show in this view." />
{:else}
  <div class="max-h-[calc(100dvh-14rem)] min-h-0 overflow-auto rounded-md border border-border">
    <table class="w-full border-separate border-spacing-0 text-sm" aria-label="Issues">
      <thead>
        <tr>
          {#if selection.enabled}
            <th scope="col" class="sticky top-0 z-10 h-8 w-8 min-w-8 border-b border-border bg-background pl-2.5">
              <SelectCheckbox
                checked={allChecked}
                tabIndex={0}
                label={allChecked === true ? 'Deselect all issues' : 'Select all issues'}
                onToggle={() => selection.set(allChecked === true ? [] : selectableIds)}
              />
            </th>
          {/if}
          {#each columns as column (column.id)}
            {@const sorted = column.orderBy !== undefined && display.orderBy === column.orderBy}
            <th
              scope="col"
              aria-sort={sorted
                ? column.orderBy === 'title' || column.orderBy === 'dueDate'
                  ? 'ascending'
                  : 'descending'
                : undefined}
              class={cn(
                'sticky top-0 z-10 h-8 border-b border-border bg-background px-1.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground',
                column.className,
              )}
            >
              {#if column.orderBy}
                {@const orderBy = column.orderBy}
                <button
                  type="button"
                  onclick={() => displayOptions.set({ ...display, orderBy })}
                  class={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                    sorted && 'text-foreground',
                  )}
                >
                  {column.label}
                  {#if sorted}<ArrowDownIcon class="size-3" aria-hidden="true" />{/if}
                </button>
              {:else}
                <span class="px-1.5">{column.label}</span>
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each issues as issue (issue.id)}
          {@const edit = editorFor(issue)}
          {@const active = issue.id === selectedId}
          {@const checked = selectedIds.current.has(issue.id)}
          {@const selectable = selection.enabled && !isPendingIssue(issue)}
          <tr
            {@attach trackRow(issue.id)}
            tabindex="0"
            {...issueAttr(ISSUE_ROW_ATTR, issue.id)}
            aria-current={active ? 'true' : undefined}
            aria-selected={selection.enabled ? checked : undefined}
            aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
            onfocus={() => (cursorId = issue.id)}
            onmousedown={preventShiftSelect}
            onclick={(event) => {
              if (selectable && handleSelectionClick(selection, event, issue.id)) return;
              onSelect?.(issue);
            }}
            onkeydown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                step(issue.id, event.key === 'ArrowDown' ? 1 : -1);
              } else if (event.key === 'Enter' && onSelect) {
                event.preventDefault();
                onSelect(issue);
              }
            }}
            class={cn(
              'group outline-none focus-visible:bg-accent/60 hover:bg-accent/40',
              active && 'bg-accent/40',
              checked && 'bg-primary/10 hover:bg-primary/15',
              onSelect && 'cursor-pointer',
            )}
          >
            {#if selection.enabled}
              <td class="h-9 w-8 min-w-8 border-b border-border/60 pl-2.5">
                {#if selectable}
                  <SelectCheckbox
                    {checked}
                    label={`Select ${issue.key}`}
                    onToggle={(event) =>
                      event.shiftKey ? selection.extendTo(issue.id, event.currentTarget) : selection.toggle(issue.id)}
                    class={cn(
                      selectedIds.current.size === 0 &&
                        'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                    )}
                  />
                {/if}
              </td>
            {/if}
            {#each columns as column (column.id)}
              <td class={cn('h-9 border-b border-border/60 px-1.5 py-0.5', column.className)}>
                <div class="flex min-w-0 items-center">{@render cell(column, issue, edit)}</div>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
