'use client';

// Owner: B3 / D10b. Pull and merge requests linked to this issue (via the
// GitHub, GitLab and Bitbucket webhooks), with review decision and CI state.
// Quiet by design: renders nothing until loaded and nothing when there are none.

import { useEffect, useState } from 'react';
import {
  CircleCheck,
  CircleDot,
  CircleX,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from 'lucide-react';

import { getPullRequests, type PullRequestView } from '@/app/actions/developer';
import { VcsMark } from '@/components/developer/provider-marks';
import { relativeTime } from '@/components/issues/issue-properties';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import {
  prNumberLabel,
  VCS_PROVIDER_LABEL,
  type ChecksState,
  type ReviewDecision,
} from '@/lib/vcs/providers';

type Status = 'open' | 'draft' | 'merged' | 'closed';

const STATUS: Record<Status, { label: string; icon: typeof GitPullRequest; className: string }> = {
  open: { label: 'Open', icon: GitPullRequest, className: 'text-emerald-600 dark:text-emerald-400' },
  draft: { label: 'Draft', icon: GitPullRequestDraft, className: 'text-muted-foreground' },
  merged: { label: 'Merged', icon: GitMerge, className: 'text-violet-600 dark:text-violet-400' },
  closed: { label: 'Closed', icon: GitPullRequestClosed, className: 'text-red-600 dark:text-red-400' },
};

const REVIEW: Record<ReviewDecision, { label: string; className: string }> = {
  approved: { label: 'Approved', className: 'text-emerald-600 dark:text-emerald-400' },
  changes_requested: { label: 'Changes requested', className: 'text-red-600 dark:text-red-400' },
  review_required: { label: 'Review required', className: 'text-muted-foreground' },
};

const CHECKS: Record<ChecksState, { label: string; icon: typeof CircleCheck; className: string }> = {
  success: { label: 'Checks passing', icon: CircleCheck, className: 'text-emerald-600 dark:text-emerald-400' },
  failure: { label: 'Checks failing', icon: CircleX, className: 'text-red-600 dark:text-red-400' },
  pending: { label: 'Checks running', icon: CircleDot, className: 'text-amber-500' },
};

function statusOf(pr: PullRequestView): Status {
  return pr.state === 'open' && pr.draft ? 'draft' : pr.state;
}

export function SectionPullRequests({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  void mutations;
  const [loaded, setLoaded] = useState<{ key: string; list: PullRequestView[] } | null>(null);
  // CI and reviews change without touching the issue: refetch when the tab
  // regains focus. State moves bump updatedAt, which refetches too.
  const [focusTick, setFocusTick] = useState(0);
  const key = `${issue.id}:${new Date(issue.updatedAt).getTime()}:${focusTick}`;

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setFocusTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPullRequests({ projectId: issue.projectId, ticketId: issue.id })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setLoaded({ key, list: result.pullRequests });
        else console.error('[vcs] linked PRs:', result.error);
      })
      .catch((err) => console.error('[vcs] linked PRs failed', err));
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
          const open = pr.state === 'open';
          const review = open && pr.reviewDecision ? REVIEW[pr.reviewDecision] : null;
          const checks = open && pr.checksState ? CHECKS[pr.checksState] : null;
          const repoName = pr.repo.split('/').at(-1);
          return (
            <li key={pr.id}>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="group flex h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <Icon className={cn('size-3.5 shrink-0', status.className)} aria-hidden="true" />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {prNumberLabel(pr.provider, pr.number)}
                </span>
                <span className="min-w-0 flex-1 truncate">{pr.title}</span>
                {checks && (
                  <span title={checks.label} className="flex shrink-0 items-center">
                    <checks.icon className={cn('size-3.5', checks.className)} aria-hidden="true" />
                    <span className="sr-only">{checks.label}</span>
                  </span>
                )}
                {review && (
                  <span
                    className={cn(
                      'hidden shrink-0 rounded border border-current/20 px-1.5 py-px text-[11px] font-medium sm:inline',
                      review.className,
                    )}
                  >
                    {review.label}
                  </span>
                )}
                <span
                  className={cn(
                    'shrink-0 rounded border border-current/20 px-1.5 py-px text-[11px] font-medium',
                    status.className,
                  )}
                >
                  {status.label}
                </span>
                <span
                  className="hidden max-w-32 shrink-0 items-center gap-1 truncate text-xs text-muted-foreground sm:flex"
                  title={`${VCS_PROVIDER_LABEL[pr.provider]} · ${pr.repo}`}
                >
                  {pr.provider !== 'github' && <VcsMark provider={pr.provider} className="size-3 shrink-0" />}
                  <span className="truncate">{repoName}</span>
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
