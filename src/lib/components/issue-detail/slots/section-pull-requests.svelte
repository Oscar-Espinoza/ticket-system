<!--
  Owner: B3 / D10b. Pull and merge requests linked to this issue (via the
  GitHub, GitLab and Bitbucket webhooks), with review decision and CI state.
  Quiet by design: renders nothing until loaded and nothing when there are none.
-->
<script module lang="ts">
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import CircleDotIcon from '@lucide/svelte/icons/circle-dot';
  import CircleXIcon from '@lucide/svelte/icons/circle-x';
  import GitMergeIcon from '@lucide/svelte/icons/git-merge';
  import GitPullRequestIcon from '@lucide/svelte/icons/git-pull-request';
  import GitPullRequestClosedIcon from '@lucide/svelte/icons/git-pull-request-closed';
  import GitPullRequestDraftIcon from '@lucide/svelte/icons/git-pull-request-draft';

  import type { PullRequestView } from '@/lib/actions/developer';
  import type { ChecksState, ReviewDecision } from '@/lib/vcs/providers';

  type Status = 'open' | 'draft' | 'merged' | 'closed';
  type Icon = typeof GitPullRequestIcon;

  const STATUS: Record<Status, { label: string; icon: Icon; className: string }> = {
    open: { label: 'Open', icon: GitPullRequestIcon, className: 'text-emerald-600 dark:text-emerald-400' },
    draft: { label: 'Draft', icon: GitPullRequestDraftIcon, className: 'text-muted-foreground' },
    merged: { label: 'Merged', icon: GitMergeIcon, className: 'text-violet-600 dark:text-violet-400' },
    closed: { label: 'Closed', icon: GitPullRequestClosedIcon, className: 'text-red-600 dark:text-red-400' },
  };

  const REVIEW: Record<ReviewDecision, { label: string; className: string }> = {
    approved: { label: 'Approved', className: 'text-emerald-600 dark:text-emerald-400' },
    changes_requested: { label: 'Changes requested', className: 'text-red-600 dark:text-red-400' },
    review_required: { label: 'Review required', className: 'text-muted-foreground' },
  };

  const CHECKS: Record<ChecksState, { label: string; icon: Icon; className: string }> = {
    success: { label: 'Checks passing', icon: CircleCheckIcon, className: 'text-emerald-600 dark:text-emerald-400' },
    failure: { label: 'Checks failing', icon: CircleXIcon, className: 'text-red-600 dark:text-red-400' },
    pending: { label: 'Checks running', icon: CircleDotIcon, className: 'text-amber-500' },
  };

  function statusOf(pr: PullRequestView): Status {
    return pr.state === 'open' && pr.draft ? 'draft' : pr.state;
  }
</script>

<script lang="ts">
  import { getPullRequests } from '@/lib/actions/developer';
  import VcsMark from '@/lib/components/developer/vcs-mark.svelte';
  import { relativeTime } from '@/lib/components/issues/issue-properties';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { prNumberLabel, VCS_PROVIDER_LABEL } from '@/lib/vcs/providers';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  let loaded = $state.raw<{ key: string; list: PullRequestView[] } | null>(null);
  // CI and reviews change without touching the issue: refetch when the tab
  // regains focus. State moves bump updatedAt, which refetches too.
  let focusTick = $state(0);
  const key = $derived(`${issue.id}:${new Date(issue.updatedAt).getTime()}:${focusTick}`);

  $effect(() => {
    const projectId = issue.projectId;
    const ticketId = issue.id;
    const requestKey = key;
    let cancelled = false;
    getPullRequests({ projectId, ticketId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) loaded = { key: requestKey, list: result.pullRequests };
        else console.error('[vcs] linked PRs:', result.error);
      })
      .catch((err) => console.error('[vcs] linked PRs failed', err));
    return () => {
      cancelled = true;
    };
  });

  // Keep showing the previous list while a refetch for the same issue runs.
  const list = $derived(loaded && loaded.key.startsWith(`${issue.id}:`) ? loaded.list : []);
</script>

<svelte:document
  onvisibilitychange={() => {
    if (document.visibilityState === 'visible') focusTick += 1;
  }}
/>

{#if list.length}
  <section aria-label="Pull requests" class="flex flex-col gap-1">
    <div class="flex min-h-7 items-center gap-2">
      <h3 class="text-xs font-medium text-muted-foreground">Pull requests</h3>
      <span class="text-xs text-muted-foreground tabular-nums">{list.length}</span>
    </div>
    <ul class="flex flex-col">
      {#each list as pr (pr.id)}
        {@const status = STATUS[statusOf(pr)]}
        {@const open = pr.state === 'open'}
        {@const review = open && pr.reviewDecision ? REVIEW[pr.reviewDecision] : null}
        {@const checks = open && pr.checksState ? CHECKS[pr.checksState] : null}
        {@const repoName = pr.repo.split('/').at(-1)}
        <li>
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            class="group flex h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
          >
            <status.icon class={cn('size-3.5 shrink-0', status.className)} aria-hidden="true" />
            <span class="shrink-0 font-mono text-xs text-muted-foreground">
              {prNumberLabel(pr.provider, pr.number)}
            </span>
            <span class="min-w-0 flex-1 truncate">{pr.title}</span>
            {#if checks}
              <span title={checks.label} class="flex shrink-0 items-center">
                <checks.icon class={cn('size-3.5', checks.className)} aria-hidden="true" />
                <span class="sr-only">{checks.label}</span>
              </span>
            {/if}
            {#if review}
              <span
                class={cn(
                  'hidden shrink-0 rounded border border-current/20 px-1.5 py-px text-[11px] font-medium sm:inline',
                  review.className,
                )}
              >
                {review.label}
              </span>
            {/if}
            <span class={cn('shrink-0 rounded border border-current/20 px-1.5 py-px text-[11px] font-medium', status.className)}>
              {status.label}
            </span>
            <span
              class="hidden max-w-32 shrink-0 items-center gap-1 truncate text-xs text-muted-foreground sm:flex"
              title={`${VCS_PROVIDER_LABEL[pr.provider]} · ${pr.repo}`}
            >
              {#if pr.provider !== 'github'}<VcsMark provider={pr.provider} class="size-3 shrink-0" />{/if}
              <span class="truncate">{repoName}</span>
            </span>
            {#if pr.authorLogin}
              <span class="hidden shrink-0 text-xs text-muted-foreground md:inline">@{pr.authorLogin}</span>
            {/if}
            <span class="w-14 shrink-0 text-right text-xs text-muted-foreground">
              {relativeTime(pr.updatedAt)}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}
