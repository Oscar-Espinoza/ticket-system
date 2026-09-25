// Provider-neutral pull request automation, shared by the GitHub, GitLab and
// Bitbucket webhooks: links PRs / MRs to the issues they reference (branch
// name, title, magic words), records them in github_pull_request (with
// `provider`), emits the github.* events and moves issue state.
//
// Callers have already verified the delivery against ONE project's secret, so
// everything here is scoped to `project.id` and its own issue key. State
// changes go through the issue service as the system actor, so activity,
// notifications, Slack and outgoing webhooks all see them.
//
// Event types stay `github.*` for every provider (the notification dispatcher
// and Slack already know them); `data.provider` tells them apart and
// `data.actorName` names the integration in the activity line.

import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { githubPullRequests, tickets, workflowStates } from '@/db/schema';
import { emitIssueEvent, type IssueEventInput } from '@/lib/events';
import { SYSTEM_ACTOR, updateIssueFields } from '@/lib/issue-service';
import type { IssueRow, WorkflowState } from '@/lib/issue-model';
import { queryIssues } from '@/lib/tickets';
import {
  defaultPrMergeState,
  defaultPrOpenState,
  resolveAutomationState,
  shouldAdvance,
} from '@/lib/github/automation';
import { classifyPullRequest, closingNumbers } from '@/lib/github/references';
import {
  prNoun,
  prNumberLabel,
  VCS_PROVIDER_LABEL,
  type ChecksState,
  type ReviewDecision,
  type VcsProvider,
} from '@/lib/vcs/providers';

export const PR_EVENT = {
  branchCreated: 'github.branch_created',
  prLinked: 'github.pr_linked',
  prMerged: 'github.pr_merged',
  prClosed: 'github.pr_closed',
  commitClosed: 'github.commit_closed',
} as const;

export interface VcsProject {
  id: string;
  ticketKey: string;
  /** The project's PR automation settings (Settings → GitHub), shared by every provider. */
  prOpenStateId: string | null;
  prMergeStateId: string | null;
}

export interface VcsPullRequest {
  provider: VcsProvider;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  branch: string | null;
  /** null = unknown in this delivery (keeps the stored author). */
  author: string | null;
  mergedAt: Date | null;
  /** null = not in this delivery (keeps the stored decision). */
  reviewDecision?: ReviewDecision | null;
}

/**
 * What the delivery means for automation:
 * - `opened`: opened / reopened / marked ready — linked issues move to the "opened" state.
 * - `updated`: edits, pushes, reviews — only issues linked for the first time move.
 * - `closed`: closed or merged by this delivery — merged moves to the "merged" state.
 */
export type PrTrigger = 'opened' | 'updated' | 'closed';

async function loadStates(projectId: string): Promise<WorkflowState[]> {
  return db
    .select({
      id: workflowStates.id,
      name: workflowStates.name,
      type: workflowStates.type,
      color: workflowStates.color,
      position: workflowStates.position,
      description: workflowStates.description,
    })
    .from(workflowStates)
    .where(eq(workflowStates.projectId, projectId));
}

/** Non-deleted issues of the project by number and/or stored branch name. */
async function findIssues(projectId: string, numbers: number[], branch?: string | null): Promise<IssueRow[]> {
  const match: SQL[] = [];
  if (numbers.length) match.push(inArray(tickets.ticketNumber, numbers));
  if (branch) match.push(eq(tickets.githubBranch, branch));
  if (!match.length) return [];
  return queryIssues(and(eq(tickets.projectId, projectId), isNull(tickets.deletedAt), or(...match)));
}

async function moveIssues(
  project: VcsProject,
  issues: IssueRow[],
  target: WorkflowState | null,
  states: WorkflowState[],
  eventData?: (issue: IssueRow) => Record<string, unknown> | undefined,
) {
  if (!target) return;
  for (const issue of issues) {
    if (!shouldAdvance(issue.state, target, states)) continue;
    const result = await updateIssueFields(
      SYSTEM_ACTOR,
      project.id,
      issue.id,
      { stateId: target.id },
      { eventData: eventData?.(issue) },
    );
    if (!result.ok) console.error(`[vcs] could not move ${issue.key}: ${result.error}`);
  }
}

const samePullRequest = (projectId: string, provider: VcsProvider, repo: string) =>
  and(
    eq(githubPullRequests.projectId, projectId),
    eq(githubPullRequests.provider, provider),
    sql`lower(${githubPullRequests.repo}) = lower(${repo})`,
  );

export async function syncPullRequest(project: VcsProject, pr: VcsPullRequest, trigger: PrTrigger) {
  const { auto, linkOnly } = classifyPullRequest(
    { branch: pr.branch, title: pr.title, body: pr.body },
    project.ticketKey,
  );

  const [referenced, existing] = await Promise.all([
    findIssues(project.id, [...auto, ...linkOnly], pr.branch),
    db
      .select({ ticketId: githubPullRequests.ticketId, state: githubPullRequests.state })
      .from(githubPullRequests)
      .where(and(samePullRequest(project.id, pr.provider, pr.repo), eq(githubPullRequests.number, pr.number))),
  ]);
  const previous = new Map(existing.map((row) => [row.ticketId, row.state]));

  // Once linked, a PR stays linked even if the reference is edited away.
  const missing = [...previous.keys()].filter((id) => !referenced.some((i) => i.id === id));
  const stillLinked = missing.length
    ? await queryIssues(
        and(eq(tickets.projectId, project.id), isNull(tickets.deletedAt), inArray(tickets.id, missing)),
      )
    : [];
  const linked = [...referenced, ...stillLinked];
  if (!linked.length) return;

  const autoIssues = referenced.filter(
    (issue) => auto.has(issue.number) || (!!pr.branch && issue.githubBranch === pr.branch),
  );

  const now = new Date();
  await db
    .insert(githubPullRequests)
    .values(
      linked.map((issue) => ({
        id: crypto.randomUUID(),
        projectId: project.id,
        ticketId: issue.id,
        provider: pr.provider,
        repo: pr.repo,
        number: pr.number,
        title: pr.title.slice(0, 500),
        url: pr.url,
        state: pr.state,
        draft: pr.draft,
        branch: pr.branch,
        authorLogin: pr.author,
        reviewDecision: pr.reviewDecision ?? null,
        mergedAt: pr.mergedAt,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [githubPullRequests.ticketId, githubPullRequests.repo, githubPullRequests.number],
      set: {
        provider: sql`excluded.provider`,
        title: sql`excluded.title`,
        url: sql`excluded.url`,
        state: sql`excluded.state`,
        draft: sql`excluded.draft`,
        branch: sql`excluded.branch`,
        authorLogin: sql`coalesce(excluded.author_login, ${githubPullRequests.authorLogin})`,
        reviewDecision: sql`coalesce(excluded.review_decision, ${githubPullRequests.reviewDecision})`,
        mergedAt: sql`excluded.merged_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  // Events only on transitions, so redeliveries stay idempotent.
  const label = `${prNoun(pr.provider)} ${prNumberLabel(pr.provider, pr.number)}`;
  const events: IssueEventInput[] = [];
  const base = { provider: pr.provider, number: pr.number, url: pr.url, repo: pr.repo, title: pr.title };
  const mergedNow = new Set<string>();
  for (const issue of linked) {
    const before = previous.get(issue.id);
    const common = { projectId: project.id, ticketId: issue.id, actorId: null };
    const about = {
      key: issue.key,
      title: issue.title,
      provider: pr.provider,
      actorName: VCS_PROVIDER_LABEL[pr.provider],
      pullRequest: base,
    };
    if (before === undefined) {
      events.push({ ...common, type: PR_EVENT.prLinked, data: { ...about, summary: `linked ${label}` } });
    }
    if (pr.state === 'merged' && before !== 'merged') {
      mergedNow.add(issue.id);
      events.push({ ...common, type: PR_EVENT.prMerged, data: { ...about, summary: `merged ${label}` } });
    } else if (pr.state === 'closed' && before !== 'closed') {
      events.push({
        ...common,
        type: PR_EVENT.prClosed,
        data: { ...about, summary: `closed ${label} without merging` },
      });
    }
  }
  if (events.length) await emitIssueEvent(events);

  if (!autoIssues.length) return;
  const states = await loadStates(project.id);
  if (pr.state === 'merged') {
    // Only on the merge itself: a later edit of a merged PR must not re-close
    // an issue someone reopened by hand.
    if (trigger !== 'closed') return;
    const target = resolveAutomationState(project.prMergeStateId, states, defaultPrMergeState);
    // Subscribers were just notified "merged PR #N" (github.pr_merged above);
    // viaPullRequest tells the notification dispatcher not to send a second
    // "marked it Done" for the move. Only for merges announced in THIS
    // delivery — a redelivery that re-closes a reopened issue still notifies.
    const via = { provider: pr.provider, number: pr.number, url: pr.url, repo: pr.repo };
    await moveIssues(project, autoIssues, target, states, (issue) =>
      mergedNow.has(issue.id) ? { viaPullRequest: via } : undefined,
    );
  } else if (pr.state === 'open' && !pr.draft) {
    // Edits / pushes only move issues this delivery linked for the first time —
    // otherwise every push would undo a manual move back to In Progress.
    const candidates =
      trigger === 'opened' ? autoIssues : autoIssues.filter((issue) => !previous.has(issue.id));
    const target = resolveAutomationState(project.prOpenStateId, states, defaultPrOpenState);
    await moveIssues(project, candidates, target, states);
  }
}

export interface PushedCommit {
  id: string;
  message: string;
  url: string;
}

/**
 * Commits that landed on the default branch close the issues they reference
 * with closing words. The caller checks the branch.
 */
export async function syncClosingCommits(
  project: VcsProject,
  input: { provider: VcsProvider; repo: string; commits: PushedCommit[] },
) {
  const closedBy = new Map<number, PushedCommit>();
  for (const commit of input.commits) {
    for (const number of closingNumbers(commit.message, project.ticketKey)) {
      if (!closedBy.has(number)) closedBy.set(number, commit);
    }
  }
  if (!closedBy.size) return;

  const [issues, states] = await Promise.all([
    findIssues(project.id, [...closedBy.keys()]),
    loadStates(project.id),
  ]);
  const target = resolveAutomationState(project.prMergeStateId, states, defaultPrMergeState);
  if (!target) return;

  const moved = issues.filter((issue) => shouldAdvance(issue.state, target, states));
  if (!moved.length) return;
  await emitIssueEvent(
    moved.map((issue) => {
      const commit = closedBy.get(issue.number)!;
      return {
        projectId: project.id,
        ticketId: issue.id,
        actorId: null,
        type: PR_EVENT.commitClosed,
        data: {
          key: issue.key,
          title: issue.title,
          summary: `closed by commit ${commit.id.slice(0, 7)}`,
          provider: input.provider,
          actorName: VCS_PROVIDER_LABEL[input.provider],
          commit: { sha: commit.id, url: commit.url },
          repo: input.repo,
        },
      };
    }),
  );
  await moveIssues(project, moved, target, states);
}

/**
 * Review / CI state of linked PRs, matched by number and/or head branch. No
 * activity: these flip often and the pull request section shows them.
 * `openOnly` keeps a branch match from touching old merged PRs of the branch.
 */
export async function updatePullRequestStatus(
  projectId: string,
  match: {
    provider: VcsProvider;
    repo: string;
    numbers?: number[];
    branches?: string[];
    openOnly?: boolean;
  },
  set: { reviewDecision?: ReviewDecision | null; checksState?: ChecksState | null },
): Promise<void> {
  const which: SQL[] = [];
  if (match.numbers?.length) which.push(inArray(githubPullRequests.number, match.numbers));
  if (match.branches?.length) which.push(inArray(githubPullRequests.branch, match.branches));
  if (!which.length || (set.reviewDecision === undefined && set.checksState === undefined)) return;
  await db
    .update(githubPullRequests)
    .set({ ...set, updatedAt: new Date() })
    .where(
      and(
        samePullRequest(projectId, match.provider, match.repo),
        or(...which),
        match.openOnly ? eq(githubPullRequests.state, 'open') : undefined,
      ),
    );
}

/** Rows of this PR that already have a CI state (so a new push can reset it to pending). */
export async function resetChecks(
  projectId: string,
  match: { provider: VcsProvider; repo: string; number: number },
): Promise<void> {
  await db
    .update(githubPullRequests)
    .set({ checksState: 'pending' })
    .where(
      and(
        samePullRequest(projectId, match.provider, match.repo),
        eq(githubPullRequests.number, match.number),
        sql`${githubPullRequests.checksState} is not null`,
      ),
    );
}
