'use client';

// Compact one-line issue reference (sub-issues, relations): state glyph, key,
// title, optional trailing content, and a hover remove button.

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { isPendingIssue } from '@/components/issues/use-issue-mutations';
import { Button } from '@/components/ui/button';
import { Avatar, StateIcon } from '@/components/ui-icons';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { useOpenIssue } from './open-issue';

export function IssueRefRow({
  issue,
  onRemove,
  removeLabel = 'Remove',
  trailing,
  className,
}: {
  issue: IssueRow;
  /** Shows a hover × button when set. */
  onRemove?: () => void;
  removeLabel?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  const open = useOpenIssue();
  const pending = isPendingIssue(issue);
  const inactive = Boolean(issue.archivedAt || issue.deletedAt);

  return (
    <div
      className={cn(
        'group/ref flex h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-muted/60',
        pending && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => open(issue)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <StateIcon state={issue.state} size={14} />
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
        <span className={cn('truncate', inactive && 'text-muted-foreground line-through')}>
          {issue.title}
        </span>
      </button>
      {trailing}
      {issue.assignee && <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />}
      {onRemove && !pending && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`${removeLabel} ${issue.key}`}
          title={removeLabel}
          onClick={onRemove}
          className="opacity-0 group-hover/ref:opacity-100 focus-visible:opacity-100"
        >
          <X />
        </Button>
      )}
    </div>
  );
}

/** Section header used by the B4 sections: title, optional meta, actions. */
export function SectionHeader({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {meta}
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  );
}
