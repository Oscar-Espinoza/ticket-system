'use client';

// Spreadsheet layout: one row per issue, one column per visible property,
// inline editing through the shared pickers, sortable headers (= ordering).

import { useEffect, useEffectEvent, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ArrowDown, UserRound } from 'lucide-react';

import {
  AssigneePicker,
  DueDatePicker,
  EstimatePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
} from '@/components/issue-pickers';
import { useDisplayOptions, type DisplayProperty } from '@/components/issues/display-options';
import { DueDateChip, EstimateChip, LabelChips, relativeTime } from '@/components/issues/issue-properties';
import type { IssueViewProps } from '@/components/issues/views';
import {
  SelectCheckbox,
  handleSelectionClick,
  preventShiftSelect,
  useIssueSelection,
  useSelectedIds,
} from '@/components/issues/selection';
import { isPendingIssue } from '@/components/issues/use-issue-mutations';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Avatar, EmptyState, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { registerHotkeys } from '@/lib/hotkeys';
import type { OrderBy } from '@/lib/issue-grouping';
import { PRIORITY_LABEL, type IssuePatch, type IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { SlaChip } from '@/components/sla/sla-chip';
import { StartDatePicker } from '@/components/issue-detail/slots/property-start-date';
import { CycleChip, EpicChip, MilestoneChip, StartDateChip, SubIssueChip } from './property-chips';
import { useSubIssueCount } from './view-context';

interface Column {
  id: DisplayProperty | 'title';
  label: string;
  className: string;
  orderBy?: OrderBy;
  cell: (issue: IssueRow, edit: CellEditor) => ReactNode;
}

interface CellEditor {
  canEdit: boolean;
  update: (patch: IssuePatch) => void;
  refocus: (event: Event) => void;
}

// Cell trigger: out of the tab order (the row is the stop), clicks don't open the issue.
function CellButton({ label, onClick, className, ...rest }: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      className={cn(
        'flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...rest}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    />
  );
}

const muted = <span className="px-1.5 text-muted-foreground/50">—</span>;

function SubIssuesCell({ issue }: { issue: IssueRow }) {
  const count = useSubIssueCount(issue.id);
  return count ? <SubIssueChip count={count} /> : muted;
}

function TimeCell({ date, verb }: { date: Date; verb: string }) {
  return (
    <time
      dateTime={new Date(date).toISOString()}
      title={`${verb} ${new Date(date).toLocaleString()}`}
      suppressHydrationWarning
      className="px-1.5 text-xs tabular-nums text-muted-foreground"
    >
      {relativeTime(date)}
    </time>
  );
}

function useColumns(): Column[] {
  const { project } = useProjectData();
  const all: Column[] = [
    {
      id: 'id',
      label: 'ID',
      className: 'w-24 min-w-24',
      cell: (issue) => <span className="px-1.5 font-mono text-xs text-muted-foreground">{issue.key}</span>,
    },
    {
      id: 'status',
      label: 'Status',
      className: 'w-40 min-w-40',
      cell: (issue, edit) => {
        const content = (
          <>
            <StateIcon state={issue.state} size={14} />
            <span className="truncate">{issue.state.name}</span>
          </>
        );
        return edit.canEdit ? (
          <StatePicker value={issue.stateId} onChange={(stateId) => edit.update({ stateId })} onCloseAutoFocus={edit.refocus}>
            <CellButton label={`Change status (${issue.state.name})`}>{content}</CellButton>
          </StatePicker>
        ) : (
          <span className="flex items-center gap-1.5 px-1.5">{content}</span>
        );
      },
    },
    {
      id: 'title',
      label: 'Title',
      className: 'w-full min-w-64 max-w-0',
      orderBy: 'title',
      cell: (issue) => <span className="block truncate px-1.5">{issue.title}</span>,
    },
    {
      id: 'priority',
      label: 'Priority',
      className: 'w-32 min-w-32',
      orderBy: 'priority',
      cell: (issue, edit) => {
        const content = (
          <>
            <PriorityIcon priority={issue.priority} size={14} />
            <span className="truncate">{PRIORITY_LABEL[issue.priority]}</span>
          </>
        );
        return edit.canEdit ? (
          <PriorityPicker value={issue.priority} onChange={(priority) => edit.update({ priority })} onCloseAutoFocus={edit.refocus}>
            <CellButton label={`Change priority (${PRIORITY_LABEL[issue.priority]})`}>{content}</CellButton>
          </PriorityPicker>
        ) : (
          <span className="flex items-center gap-1.5 px-1.5">{content}</span>
        );
      },
    },
    {
      id: 'assignee',
      label: 'Assignee',
      className: 'w-44 min-w-44',
      cell: (issue, edit) => {
        const content = issue.assignee ? (
          <>
            <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
            <span className="truncate">{issue.assignee.name}</span>
          </>
        ) : (
          <>
            <UserRound className="size-4 text-muted-foreground/60" />
            <span className="text-muted-foreground">Unassigned</span>
          </>
        );
        return edit.canEdit ? (
          <AssigneePicker
            value={issue.assignee?.id ?? null}
            onChange={(assigneeId) => edit.update({ assigneeId })}
            onCloseAutoFocus={edit.refocus}
          >
            <CellButton label={issue.assignee ? `Assigned to ${issue.assignee.name}` : 'Assign'}>{content}</CellButton>
          </AssigneePicker>
        ) : (
          <span className="flex items-center gap-1.5 px-1.5">{content}</span>
        );
      },
    },
    {
      id: 'labels',
      label: 'Labels',
      className: 'w-52 min-w-52',
      cell: (issue, edit) => {
        const content = issue.labels.length ? <LabelChips labels={issue.labels} max={2} /> : muted;
        return edit.canEdit ? (
          <LabelPicker
            value={issue.labels.map((l) => l.id)}
            onChange={(labelIds) => edit.update({ labelIds })}
            onCloseAutoFocus={edit.refocus}
          >
            <CellButton label="Change labels" className="w-full">
              {content}
            </CellButton>
          </LabelPicker>
        ) : (
          content
        );
      },
    },
    {
      id: 'estimate',
      label: 'Estimate',
      className: 'w-28 min-w-28',
      cell: (issue, edit) => {
        const content =
          issue.estimate === null ? muted : <EstimateChip scale={project.estimateScale} value={issue.estimate} />;
        return edit.canEdit ? (
          <EstimatePicker value={issue.estimate} onChange={(estimate) => edit.update({ estimate })} onCloseAutoFocus={edit.refocus}>
            <CellButton label="Change estimate">{content}</CellButton>
          </EstimatePicker>
        ) : (
          content
        );
      },
    },
    {
      id: 'dueDate',
      label: 'Due date',
      className: 'w-32 min-w-32',
      orderBy: 'dueDate',
      cell: (issue, edit) => {
        const content = issue.dueDate ? (
          <DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} />
        ) : (
          muted
        );
        return edit.canEdit ? (
          <DueDatePicker value={issue.dueDate} onChange={(dueDate) => edit.update({ dueDate })} onCloseAutoFocus={edit.refocus}>
            <CellButton label="Change due date">{content}</CellButton>
          </DueDatePicker>
        ) : (
          content
        );
      },
    },
    {
      id: 'startDate',
      label: 'Start date',
      className: 'w-32 min-w-32',
      cell: (issue, edit) => {
        const content = issue.startDate ? <StartDateChip startDate={issue.startDate} /> : muted;
        return edit.canEdit ? (
          <StartDatePicker
            value={issue.startDate}
            onChange={(startDate) => edit.update({ startDate })}
            onCloseAutoFocus={edit.refocus}
          >
            <CellButton label="Change start date">{content}</CellButton>
          </StartDatePicker>
        ) : (
          content
        );
      },
    },
    {
      id: 'sla',
      label: 'SLA',
      className: 'w-28 min-w-28',
      cell: (issue) => (issue.slaDueAt ? <SlaChip issue={issue} /> : muted),
    },
    {
      id: 'cycle',
      label: 'Cycle',
      className: 'w-36 min-w-36',
      cell: (issue) => (issue.cycleId ? <CycleChip cycleId={issue.cycleId} /> : muted),
    },
    {
      id: 'epic',
      label: 'Epic',
      className: 'w-44 min-w-44',
      cell: (issue) => (issue.epicId ? <EpicChip epicId={issue.epicId} /> : muted),
    },
    {
      id: 'milestone',
      label: 'Milestone',
      className: 'w-40 min-w-40',
      cell: (issue) =>
        issue.milestoneId ? <MilestoneChip epicId={issue.epicId} milestoneId={issue.milestoneId} /> : muted,
    },
    {
      id: 'subIssues',
      label: 'Sub-issues',
      className: 'w-28 min-w-28',
      cell: (issue) => <SubIssuesCell issue={issue} />,
    },
    {
      id: 'created',
      label: 'Created',
      className: 'w-28 min-w-28',
      orderBy: 'created',
      cell: (issue) => <TimeCell date={issue.createdAt} verb="Created" />,
    },
    {
      id: 'updated',
      label: 'Updated',
      className: 'w-28 min-w-28',
      orderBy: 'updated',
      cell: (issue) => <TimeCell date={issue.updatedAt} verb="Updated" />,
    },
  ];
  return all.filter((c) => c.id !== 'estimate' || project.estimateScale !== 'none');
}

export default function TableView({ issues, mutations, selectedId, onSelect }: IssueViewProps) {
  const [display, setDisplay] = useDisplayOptions();
  const canWrite = useProjectPermission('write');
  const columns = useColumns().filter((c) => c.id === 'title' || display.properties[c.id]);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLTableRowElement>());
  const selection = useIssueSelection();
  const selectedIds = useSelectedIds();

  const focusRow = (id: string) => {
    setCursorId(id);
    const row = rows.current.get(id);
    row?.focus();
    row?.scrollIntoView({ block: 'nearest' });
  };

  const step = (from: string | null, delta: 1 | -1) => {
    if (issues.length === 0) return;
    const index = issues.findIndex((i) => i.id === from);
    const next = index === -1 ? (delta === 1 ? 0 : issues.length - 1) : Math.min(issues.length - 1, Math.max(0, index + delta));
    focusRow(issues[next].id);
  };

  const move = useEffectEvent((delta: 1 | -1) => step(cursorId, delta));
  useEffect(
    () =>
      registerHotkeys([
        { key: 'j', scope: 'Issues', description: 'Next issue', handler: () => move(1) },
        { key: 'k', scope: 'Issues', description: 'Previous issue', handler: () => move(-1) },
      ]),
    [],
  );

  if (issues.length === 0) {
    return <EmptyState title="No issues" description="Nothing to show in this view." />;
  }

  const selectableIds = issues.filter((i) => !isPendingIssue(i)).map((i) => i.id);
  const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length;
  const allChecked =
    selectedCount === 0 ? false : selectedCount === selectableIds.length ? true : 'mixed';

  return (
    <div className="max-h-[calc(100dvh-14rem)] min-h-0 overflow-auto rounded-md border border-border">
      <table className="w-full border-separate border-spacing-0 text-sm" aria-label="Issues">
        <thead>
          <tr>
            {selection.enabled && (
              <th
                scope="col"
                className="sticky top-0 z-10 h-8 w-8 min-w-8 border-b border-border bg-background pl-2.5"
              >
                <SelectCheckbox
                  checked={allChecked}
                  tabIndex={0}
                  label={allChecked === true ? 'Deselect all issues' : 'Select all issues'}
                  onToggle={() => selection.set(allChecked === true ? [] : selectableIds)}
                />
              </th>
            )}
            {columns.map((column) => {
              const sorted = column.orderBy !== undefined && display.orderBy === column.orderBy;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={sorted ? (column.orderBy === 'title' || column.orderBy === 'dueDate' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'sticky top-0 z-10 h-8 border-b border-border bg-background px-1.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground',
                    column.className,
                  )}
                >
                  {column.orderBy ? (
                    <button
                      type="button"
                      onClick={() => setDisplay({ ...display, orderBy: column.orderBy! })}
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                        sorted && 'text-foreground',
                      )}
                    >
                      {column.label}
                      {sorted && <ArrowDown className="size-3" aria-hidden="true" />}
                    </button>
                  ) : (
                    <span className="px-1.5">{column.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => {
            const edit: CellEditor = {
              canEdit: canWrite && !isPendingIssue(issue),
              update: (patch) => mutations.update(issue, patch),
              // Pickers hand focus back to the row, so j/k keep working.
              refocus: (event) => {
                event.preventDefault();
                document.querySelector<HTMLElement>(`tr[data-issue-row="${issue.id}"]`)?.focus();
              },
            };
            const active = issue.id === selectedId;
            const checked = selectedIds.has(issue.id);
            const selectable = selection.enabled && !isPendingIssue(issue);
            return (
              <tr
                key={issue.id}
                ref={(el) => {
                  if (el) rows.current.set(issue.id, el);
                  else rows.current.delete(issue.id);
                }}
                tabIndex={0}
                data-issue-row={issue.id}
                aria-current={active ? 'true' : undefined}
                aria-selected={selection.enabled ? checked : undefined}
                aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
                onFocus={() => setCursorId(issue.id)}
                onMouseDown={preventShiftSelect}
                onClick={(event) => {
                  if (selectable && handleSelectionClick(selection, event, issue.id)) return;
                  onSelect?.(issue);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    step(issue.id, event.key === 'ArrowDown' ? 1 : -1);
                  } else if (event.key === 'Enter' && onSelect) {
                    event.preventDefault();
                    onSelect(issue);
                  }
                }}
                className={cn(
                  'group outline-none focus-visible:bg-accent/60 hover:bg-accent/40',
                  active && 'bg-accent/40',
                  checked && 'bg-primary/10 hover:bg-primary/15',
                  onSelect && 'cursor-pointer',
                )}
              >
                {selection.enabled && (
                  <td className="h-9 w-8 min-w-8 border-b border-border/60 pl-2.5">
                    {selectable && (
                      <SelectCheckbox
                        checked={checked}
                        label={`Select ${issue.key}`}
                        onToggle={(event) =>
                          event.shiftKey
                            ? selection.extendTo(issue.id, event.currentTarget)
                            : selection.toggle(issue.id)
                        }
                        className={cn(
                          selectedIds.size === 0 &&
                            'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                        )}
                      />
                    )}
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn('h-9 border-b border-border/60 px-1.5 py-0.5', column.className)}
                  >
                    <div className="flex min-w-0 items-center">{column.cell(issue, edit)}</div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
