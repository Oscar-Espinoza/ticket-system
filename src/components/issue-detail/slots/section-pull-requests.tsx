'use client';

// Owner: B3. Pull requests GitHub linked to this issue (via the webhook).
// Quiet by design: renders nothing until loaded and nothing when there are none.

import { useEffect, useState } from 'react';
import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from 'lucide-react';

import { getLinkedPullRequests, type LinkedPullRequest } from '@/app/actions/github';
import { relativeTime } from '@/components/issues/issue-properties';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';

type Status = 'open' | 'draft' | 'merged' | 'closed';

const STATUS: Record<Status, { label: string; icon: typeof GitPullRequest; className: string }> = {
  open: { label: 'Open', icon: GitPullRequest, className: 'text-emerald-600 dark:text-emerald-400' },
  draft: { label: 'Draft', icon: GitPullRequestDraft, className: 'text-muted-foreground' },
  merged: { label: 'Merged', icon: GitMerge, className: 'text-violet-600 dark:text-violet-400' },
  closed: { label: 'Closed', icon: GitPullRequestClosed, className: 'text-red-600 dark:text-red-400' },
};

function statusOf(pr: LinkedPullRequest): Status {
  return pr.state === 'open' && pr.draft ? 'draft' : pr.state;
}

export function SectionPullRequests({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  void mutations;
  const [loaded, setLoaded] = useState<{ key: string; list: LinkedPullRequest[] } | null>(null);
  // Webhook state moves bump updatedAt, so a refreshed issue refetches its PRs.
  const key = `${issue.id}:${new Date(issue.updatedAt).getTime()}`;

  useEffect(() => {
    let cancelled = false;
    getLinkedPullRequests({ projectId: issue.projectId, ticketId: issue.id })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setLoaded({ key, list: result.pullRequests });
        else console.error('[github] linked PRs:', result.error);
      })
      .catch((err) => console.error('[github] linked PRs failed', err));
    return () => {
      cancelled = true;
    };
  }, [issue.projectId, issue.id, key]);

  // Keep showing the previous list while a refetch for the same issue runs.
  const list = loaded && loaded.key.startsWith(`${issue.id}:`) ? loaded.list : [];
  if (!list.length) return null;

  return (
    <section aria-label="Pull requests" className="flex flex-col gap-1">
      <div className="flex min-h-7 items-center gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Pull requests</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
      </div>
      <ul className="flex flex-col">
        {list.map((pr) => {
          const status = STATUS[statusOf(pr)];
          const Icon = status.icon;
          return (
            <li key={pr.id}>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="group flex h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <Icon className={cn('size-3.5 shrink-0', status.className)} aria-hidden="true" />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">#{pr.number}</span>
                <span className="min-w-0 flex-1 truncate">{pr.title}</span>
                <span
                  className={cn(
                    'shrink-0 rounded border border-current/20 px-1.5 py-px text-[11px] font-medium',
                    status.className,
                  )}
                >
                  {status.label}
                </span>
                <span className="hidden max-w-32 shrink-0 truncate text-xs text-muted-foreground sm:inline" title={pr.repo}>
                  {pr.repo.split('/')[1]}
                </span>
                {pr.authorLogin && (
                  <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">@{pr.authorLogin}</span>
                )}
                <span className="w-14 shrink-0 text-right text-xs text-muted-foreground" suppressHydrationWarning>
                  {relativeTime(pr.updatedAt)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
