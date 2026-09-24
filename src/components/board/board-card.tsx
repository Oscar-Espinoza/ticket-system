'use client';

import { useDraggable } from '@dnd-kit/react';

import { Avatar, StatusIcon } from '@/components/ui-icons';
import { STATUS_LABEL, type IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { isPendingIssue } from '@/components/issues/use-issue-mutations';

export function BoardCardContent({
  issue,
  className,
}: {
  issue: IssueRow;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <StatusIcon status={issue.status} size={14} />
        <span className="font-mono">{issue.key}</span>
        {issue.assignee && (
          <Avatar
            name={issue.assignee.name}
            src={issue.assignee.image}
            size={20}
            className="ml-auto"
          />
        )}
      </div>
      <p className="line-clamp-2 text-card-foreground">{issue.title}</p>
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
    data: { status: issue.status },
    disabled: isPendingIssue(issue),
  });

  return (
    <div
      ref={ref}
      tabIndex={0}
      data-board-card={issue.id}
      aria-label={`${issue.key} ${issue.title}, ${STATUS_LABEL[issue.status]}. Press Space to move.`}
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
