'use client';

import { useSortable } from '@dnd-kit/react/sortable';

import { useDisplayOptions } from '@/components/issues/display-options';
import { DueDateChip, EstimateChip, LabelChips } from '@/components/issues/issue-properties';
import {
  handleSelectionClick,
  preventShiftSelect,
  useIsSelected,
  useIssueSelection,
} from '@/components/issues/selection';
import { isPendingIssue } from '@/components/issues/use-issue-mutations';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { CycleChip, EpicChip, MilestoneChip, SubIssueChip } from '@/components/views/property-chips';
import { useSubIssueCount } from '@/components/views/view-context';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';

export function BoardCardContent({
  issue,
  className,
}: {
  issue: IssueRow;
  className?: string;
}) {
  const { project } = useProjectData();
  const [{ properties: show, showSubIssues }] = useDisplayOptions();
  const subIssues = useSubIssueCount(issue.id);
  const showSubCount = (show.subIssues || !showSubIssues) && subIssues !== null;
  const footer =
    (show.priority && issue.priority !== 'none') ||
    (show.labels && issue.labels.length > 0) ||
    (show.estimate && issue.estimate !== null && project.estimateScale !== 'none') ||
    (show.dueDate && issue.dueDate !== null) ||
    (show.cycle && issue.cycleId !== null) ||
    (show.epic && issue.epicId !== null) ||
    (show.milestone && issue.milestoneId !== null) ||
    showSubCount;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {show.status && <StateIcon state={issue.state} size={14} />}
        {show.id && <span className="font-mono">{issue.key}</span>}
        {show.assignee && issue.assignee && (
          <Avatar
            name={issue.assignee.name}
            src={issue.assignee.image}
            size={20}
            className="ml-auto"
          />
        )}
      </div>
      <p className="line-clamp-2 text-card-foreground">{issue.title}</p>
      {footer && (
        <div className="flex flex-wrap items-center gap-1.5">
          {show.priority && issue.priority !== 'none' && (
            <span className="inline-flex h-5 items-center rounded border border-border px-1">
              <PriorityIcon priority={issue.priority} size={14} />
            </span>
          )}
          {showSubCount && <SubIssueChip count={subIssues} />}
          {show.estimate && <EstimateChip scale={project.estimateScale} value={issue.estimate} />}
          {show.dueDate && <DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} />}
          {show.cycle && <CycleChip cycleId={issue.cycleId} />}
          {show.epic && <EpicChip epicId={issue.epicId} />}
          {show.milestone && <MilestoneChip epicId={issue.epicId} milestoneId={issue.milestoneId} />}
          {show.labels && <LabelChips labels={issue.labels} max={2} />}
        </div>
      )}
    </div>
  );
}

export function BoardCard({
  id,
  index,
  container,
  issue,
  active,
  onSelect,
}: {
  /** Sortable id (unique per container — an issue can sit in several label columns). */
  id: string;
  index: number;
  /** Column / cell the card is in. */
  container: string;
  issue: IssueRow;
  active: boolean;
  onSelect?: () => void;
}) {
  const canWrite = useProjectPermission('write');
  const selection = useIssueSelection();
  const selected = useIsSelected(issue.id);
  const { ref, isDragSource } = useSortable({
    id,
    index,
    group: container,
    type: 'issue',
    accept: 'issue',
    disabled: !canWrite || isPendingIssue(issue),
  });

  return (
    <div
      ref={ref}
      tabIndex={0}
      data-board-card={issue.id}
      aria-label={`${issue.key} ${issue.title}, ${issue.state.name}.${canWrite ? ' Press Space to move.' : ''}`}
      aria-current={active ? 'true' : undefined}
      aria-selected={selection.enabled ? selected : undefined}
      onMouseDown={preventShiftSelect}
      onClick={(event) => {
        // ⌘/Ctrl+click toggles, Shift+click selects the range (board order: column by column).
        if (!isPendingIssue(issue) && handleSelectionClick(selection, event, issue.id)) return;
        onSelect?.();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onSelect && event.target === event.currentTarget) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'rounded-md outline-none transition-shadow',
        'hover:ring-1 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring',
        active && 'ring-2 ring-ring',
        selected && 'ring-2 ring-primary/70 [&>div]:bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]',
        onSelect && 'cursor-pointer',
        isDragSource && 'opacity-40',
      )}
    >
      <BoardCardContent issue={issue} />
    </div>
  );
}
