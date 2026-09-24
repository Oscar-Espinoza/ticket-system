'use client';

import { useDraggable } from '@dnd-kit/react';

import { useDisplayOptions } from '@/components/issues/display-options';
import { DueDateChip, EstimateChip, LabelChips } from '@/components/issues/issue-properties';
import { isPendingIssue } from '@/components/issues/use-issue-mutations';
import { useProjectData } from '@/components/project/project-data';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
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
  const [{ properties: show }] = useDisplayOptions();
  const footer =
    (show.priority && issue.priority !== 'none') ||
    (show.labels && issue.labels.length > 0) ||
    (show.estimate && issue.estimate !== null && project.estimateScale !== 'none') ||
    (show.dueDate && issue.dueDate !== null);

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
          {show.estimate && <EstimateChip scale={project.estimateScale} value={issue.estimate} />}
          {show.dueDate && <DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} />}
          {show.labels && <LabelChips labels={issue.labels} max={2} />}
        </div>
      )}
    </div>
  );
}

export function BoardCard({
  issue,
  active,
  onSelect,
}: {
  issue: IssueRow;
  active: boolean;
  onSelect?: () => void;
}) {
  const { ref, isDragSource } = useDraggable({
    id: issue.id,
    type: 'issue',
    data: { stateId: issue.stateId },
    disabled: isPendingIssue(issue),
  });

  return (
    <div
      ref={ref}
      tabIndex={0}
      data-board-card={issue.id}
      aria-label={`${issue.key} ${issue.title}, ${issue.state.name}. Press Space to move.`}
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
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
        onSelect && 'cursor-pointer',
        isDragSource && 'opacity-40',
      )}
    >
      <BoardCardContent issue={issue} />
    </div>
  );
}
