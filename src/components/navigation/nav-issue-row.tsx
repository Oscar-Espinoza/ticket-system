'use client';

// Lightweight, read-only issue row for cross-project lists (My Issues, search,
// archive, trash). IssueRow from components/issues needs useProjectData(), so
// it can't render outside one project. The whole row is a link to the issue's
// permalink; `actions` sit outside the link so buttons stay valid HTML.

import type { ReactNode } from 'react';
import Link from 'next/link';

import { LabelChips, relativeTime } from '@/components/issues/issue-properties';
import { Avatar, LabelChip, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { issuePath } from '@/lib/issue-links';
import { PRIORITY_LABEL, type IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';

export function NavIssueRow({
  issue,
  title,
  below,
  project,
  time,
  actions,
}: {
  issue: IssueRow;
  /** Title override (e.g. with search highlights). */
  title?: ReactNode;
  /** Second line (search snippet). */
  below?: ReactNode;
  /** Project name chip — cross-project lists only. */
  project?: string;
  /** Right-aligned timestamp; defaults to "updated". */
  time?: { date: Date; label: string };
  actions?: ReactNode;
}) {
  const stamp = time ?? { date: issue.updatedAt, label: 'Updated' };
  return (
    <div className="group flex items-center gap-2 rounded-md hover:bg-accent/40 focus-within:bg-accent/40">
      <Link
        href={issuePath(issue.projectId, issue.key)}
        data-nav-row
        aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
        className={cn(
          'flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-sm outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        )}
      >
        <span className="flex h-6 min-w-0 items-center gap-3">
          <span title={PRIORITY_LABEL[issue.priority]} className="flex shrink-0">
            <PriorityIcon priority={issue.priority} size={14} />
          </span>
          <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
            {issue.key}
          </span>
          <StateIcon state={issue.state} size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{title ?? issue.title}</span>
          <LabelChips labels={issue.labels} className="hidden md:flex" />
          {project && (
            <LabelChip dot={false} className="hidden max-w-40 truncate sm:inline-flex">
              {project}
            </LabelChip>
          )}
          {issue.assignee && (
            <Avatar
              name={issue.assignee.name}
              src={issue.assignee.image}
              size={20}
              className="shrink-0"
            />
          )}
          <time
            dateTime={new Date(stamp.date).toISOString()}
            title={`${stamp.label} ${new Date(stamp.date).toLocaleString()}`}
            suppressHydrationWarning
            className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
          >
            {relativeTime(stamp.date)}
          </time>
        </span>
        {below && (
          <span className="block truncate pl-32 text-xs text-muted-foreground">{below}</span>
        )}
      </Link>
      {actions && <div className="flex shrink-0 items-center gap-1 pr-2">{actions}</div>}
    </div>
  );
}
