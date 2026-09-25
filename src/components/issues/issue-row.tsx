'use client';

import type { ComponentProps, Ref } from 'react';
import { UserRound } from 'lucide-react';

import { AssigneePicker, PriorityPicker, StatePicker } from '@/components/issue-pickers';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { PRIORITY_LABEL, type IssuePatch, type IssueRow as Issue } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { CycleChip, EpicChip, MilestoneChip, SubIssueChip } from '@/components/views/property-chips';
import { useSubIssueCount } from '@/components/views/view-context';
import { useDisplayOptions } from './display-options';
import { DueDateChip, EstimateChip, LabelChips, relativeTime } from './issue-properties';

export { relativeTime };

export interface IssueRowProps {
  issue: Issue;
  active: boolean;
  /** Controlled status picker (the list's `s` hotkey opens it). */
  statusMenuOpen: boolean;
  onStatusMenuOpenChange: (open: boolean) => void;
  onUpdate: (patch: IssuePatch) => void;
  onFocus: () => void;
  onSelect?: () => void;
  ref?: Ref<HTMLDivElement>;
}

// Icon buttons inside the row: out of the tab order (the row is the stop) and
// they don't open the issue when clicked. Trigger props (ref, onClick, aria-*)
// arrive via the picker's asChild and are forwarded.
function RowButton({ label, onClick, ...rest }: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      className="-m-1 flex shrink-0 rounded p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      {...rest}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    />
  );
}

export function IssueRow({
  issue,
  active,
  statusMenuOpen,
  onStatusMenuOpenChange,
  onUpdate,
  onFocus,
  onSelect,
  ref,
}: IssueRowProps) {
  const { project } = useProjectData();
  const canWrite = useProjectPermission('write');
  const [{ properties: show, showSubIssues }] = useDisplayOptions();
  const subIssues = useSubIssueCount(issue.id);

  // Pickers hand focus back to the row, not their trigger, so j/k keep working.
  const refocusRow = (event: Event) => {
    event.preventDefault();
    document.querySelector<HTMLElement>(`[data-issue-row="${issue.id}"]`)?.focus();
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      data-issue-row={issue.id}
      data-active={active}
      aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
      aria-current={active ? 'true' : undefined}
      onFocus={onFocus}
      onClick={onSelect}
      className={cn(
        'group flex h-9 items-center gap-3 rounded-md px-2 text-sm outline-none transition-colors',
        'hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        active && 'bg-accent/40',
        onSelect && 'cursor-pointer',
      )}
    >
      {show.priority && !canWrite && <PriorityIcon priority={issue.priority} size={14} />}
      {show.priority && canWrite && (
        <PriorityPicker
          value={issue.priority}
          onChange={(priority) => onUpdate({ priority })}
          onCloseAutoFocus={refocusRow}
        >
          <RowButton label={`Change priority (${PRIORITY_LABEL[issue.priority]})`}>
            <PriorityIcon priority={issue.priority} size={14} />
          </RowButton>
        </PriorityPicker>
      )}

      {show.id && (
        <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
      )}

      {show.status && !canWrite && <StateIcon state={issue.state} size={14} />}
      {show.status && canWrite && (
        <StatePicker
          value={issue.stateId}
          onChange={(stateId) => onUpdate({ stateId })}
          open={statusMenuOpen}
          onOpenChange={onStatusMenuOpenChange}
          onCloseAutoFocus={refocusRow}
        >
          <RowButton label={`Change status (${issue.state.name})`}>
            <StateIcon state={issue.state} size={14} />
          </RowButton>
        </StatePicker>
      )}

      <span className="min-w-0 flex-1 truncate">{issue.title}</span>

      {(show.subIssues || !showSubIssues) && <SubIssueChip count={subIssues} />}
      {show.labels && <LabelChips labels={issue.labels} className="hidden md:flex" />}
      {show.epic && <EpicChip epicId={issue.epicId} className="hidden lg:inline-flex" />}
      {show.milestone && (
        <MilestoneChip epicId={issue.epicId} milestoneId={issue.milestoneId} className="hidden lg:inline-flex" />
      )}
      {show.cycle && <CycleChip cycleId={issue.cycleId} className="hidden lg:inline-flex" />}
      {show.estimate && <EstimateChip scale={project.estimateScale} value={issue.estimate} />}
      {show.dueDate && <DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} />}

      {show.assignee && !canWrite && issue.assignee && (
        <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} className="shrink-0" />
      )}
      {show.assignee && canWrite && (
        <AssigneePicker
          value={issue.assignee?.id ?? null}
          onChange={(assigneeId) => onUpdate({ assigneeId })}
          align="end"
          onCloseAutoFocus={refocusRow}
        >
          <RowButton
            label={issue.assignee ? `Assigned to ${issue.assignee.name}` : 'Assign'}
          >
            {issue.assignee ? (
              <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
            ) : (
              <UserRound className="size-5 p-0.5 text-muted-foreground/60" />
            )}
          </RowButton>
        </AssigneePicker>
      )}

      {show.created && (
        <time
          dateTime={new Date(issue.createdAt).toISOString()}
          title={`Created ${new Date(issue.createdAt).toLocaleString()}`}
          suppressHydrationWarning
          className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
        >
          {relativeTime(issue.createdAt)}
        </time>
      )}
      {show.updated && (
        <time
          dateTime={new Date(issue.updatedAt).toISOString()}
          title={`Updated ${new Date(issue.updatedAt).toLocaleString()}`}
          suppressHydrationWarning
          className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
        >
          {relativeTime(issue.updatedAt)}
        </time>
      )}
    </div>
  );
}
