'use client';

// Read-only list of an epic's issues that live in another project. They can't
// go through IssuesView here: its rows, pickers and mutations resolve states,
// labels and members from *this* page's project data. Each row links to the
// issue in its own project, where it's edited.

import Link from 'next/link';

import { Avatar, EmptyState, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { issuePath } from '@/lib/issue-links';
import { PRIORITY_LABEL, PRIORITY_ORDER, STATE_TYPE_ORDER, type IssueRow } from '@/lib/issue-model';
import type { ProjectRef } from './epic-model';

function compare(a: IssueRow, b: IssueRow) {
  return (
    STATE_TYPE_ORDER.indexOf(a.state.type) - STATE_TYPE_ORDER.indexOf(b.state.type) ||
    a.state.position - b.state.position ||
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
    a.number - b.number
  );
}

export function EpicForeignIssues({ project, issues }: { project: ProjectRef; issues: IssueRow[] }) {
  if (issues.length === 0) {
    return <EmptyState title="No issues" description={`No active issues from ${project.name}.`} />;
  }
  return (
    <div className="flex flex-col">
      <p className="mb-2 text-xs text-muted-foreground">
        Issues from {project.name} — open one to edit it in its own project.
      </p>
      <ul aria-label={`Issues from ${project.name}`} className="flex flex-col border-t border-border">
        {[...issues].sort(compare).map((issue) => (
          <li key={issue.id} className="border-b border-border">
            <Link
              href={issuePath(issue.projectId, issue.key)}
              className="flex h-9 items-center gap-3 px-3 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent"
            >
              <PriorityIcon
                priority={issue.priority}
                size={14}
                aria-label={PRIORITY_LABEL[issue.priority]}
                className="shrink-0 text-muted-foreground"
              />
              <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                {issue.key}
              </span>
              <StateIcon state={issue.state} size={14} />
              <span className="min-w-0 flex-1 truncate">{issue.title}</span>
              {issue.assignee && (
                <span title={issue.assignee.name} className="shrink-0">
                  <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
