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
// Event types stay `github.*` for every provider (see PR_EVENT); `data.provider`
// tells them apart and `data.actorName` names the integration in the activity line.

import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { githubPullRequests, tickets } from '@/db/schema';
import { projectStatesQuery } from '@/lib/workflow-server';
import { PR_EVENT } from '@/lib/event-names';
import { insertEventIf, publishWrittenEvents, toStored, type IssueEventInput } from '@/lib/events';
import { SYSTEM_ACTOR, updateIssueFields } from '@/lib/issue-service';
import type { IssueRow, WorkflowState } from '@/lib/issue-model';
import { queryIssues } from '@/lib/tickets';
import {
  defaultPrMergeState,
  defaultPrOpenState,
  resolveAutomationState,
  shouldAdvance,
} from '@/lib/vcs/automation-state';
import type { VcsProject } from '@/lib/vcs/project';
import { classifyPullRequest, closingNumbers } from '@/lib/vcs/references';
import {
  prNoun,
  prNumberLabel,
  VCS_PROVIDER_LABEL,
  type ChecksState,
  type ReviewDecision,
  type VcsProvider,
} from '@/lib/vcs/providers';

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
  /**
   * The provider's "last updated" time of this snapshot; null = the payload
   * has none. A snapshot older than the stored one is not applied.
   */
  updatedAt: Date | null;
  /** null = not in this delivery (keeps the stored decision). */
  reviewDecision?: ReviewDecision | null;
}

/** A provider timestamp from a payload; null when missing or unparseable. */
export function providerTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * What the delivery means for automation:
 * - `opened`: opened / reopened / marked ready — linked issues move to the "opened" state.
 * - `updated`: edits, pushes, reviews — only issues linked for the first time move.
 * - `closed`: closed or merged by this delivery — merged moves to the "merged" state.
 */
export type PrTrigger = 'opened' | 'updated' | 'closed';

/** Non-deleted issues of the project by number and/or stored branch name. */
async function findIssues(projectId: string, numbers: number[], branch: string | null): Promise<IssueRow[]> {
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
  opts: {
    eventData?: (issue: IssueRow) => Record<string, unknown> | undefined;
    /** Events about the move, committed with it (e.g. github.commit_closed). */
    extraEvents?: (issue: IssueRow) => IssueEventInput[];
  } = {},
) {
  if (!target) return;
  for (const issue of issues) {
    if (!shouldAdvance(issue.state, target, states)) continue;
    const extra = opts.extraEvents;
    const result = await updateIssueFields(
      SYSTEM_ACTOR,
      project.id,
      issue.id,
      { stateId: target.id },
      {
        eventData: opts.eventData?.(issue),
        ...(extra ? { extraEvents: () => extra(issue) } : {}),
      },
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
      .select({ ticketId: githubPullRequests.ticketId })
      .from(githubPullRequests)
      .where(and(samePullRequest(project.id, pr.provider, pr.repo), eq(githubPullRequests.number, pr.number))),
  ]);

  // Once linked, a PR stays linked even if the reference is edited away.
  const missing = [...new Set(existing.map((row) => row.ticketId))].filter(
    (id) => !referenced.some((i) => i.id === id),
  );
  const stillLinked = missing.length
    ? await queryIssues(
        and(eq(tickets.projectId, project.id), isNull(tickets.deletedAt), inArray(tickets.id, missing)),
      )
    : [];
  const linked = [...referenced, ...stillLinked];
  if (!linked.length) return;

  let autoIssues = referenced.filter(
    (issue) => auto.has(issue.number) || (!!pr.branch && issue.githubBranch === pr.branch),
  );

  // Two deliveries for one PR can arrive at once (GitHub sends several events
  // per action). ONE transaction, serialized per PR by an advisory lock: each
  // event is written only if the stored link, read after the lock, does not
  // already show its transition; then the links are updated, and created only
  // for issues with no link to this PR in any letter case (the lookup above
  // and the write agree on lower(repo)). Events commit with the links: a crash
  // in between would otherwise turn the redelivery into a no-op and lose them.
  const now = new Date();
  const thisPr = and(samePullRequest(project.id, pr.provider, pr.repo), eq(githubPullRequests.number, pr.number));
  const linkOf = (ticketId: string, extra?: SQL) =>
    sql`exists (select 1 from ${githubPullRequests} where ${and(thisPr, eq(githubPullRequests.ticketId, ticketId), extra)})`;
  const lock = db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`pr:${project.id}:${pr.provider}:${pr.repo.toLowerCase()}:${pr.number}`}, 0))`,
  );
  const title = pr.title.slice(0, 500);
  // Deliveries are retried (vcs/inbound.ts), so an older snapshot can arrive
  // after a newer one. A link moves only forward: never away from `merged`
  // (terminal on every provider), and never to a snapshot older than the
  // stored one when both carry the provider's timestamp. A stale snapshot
  // writes no event and moves no issue either.
  const providerAt = pr.updatedAt?.toISOString() ?? null;
  const mergedAt = pr.mergedAt?.toISOString() ?? null;
  const stale = sql`(
    (${githubPullRequests.state} = 'merged' and ${pr.state}::text <> 'merged')
    or (${githubPullRequests.providerUpdatedAt} is not null and ${providerAt}::timestamp is not null
        and ${githubPullRequests.providerUpdatedAt} > ${providerAt}::timestamp)
  )`;
  const update = db
    .update(githubPullRequests)
    .set({
      provider: pr.provider,
      title,
      url: pr.url,
      state: pr.state,
      draft: pr.draft,
      branch: pr.branch,
      authorLogin: sql`coalesce(${pr.author}, ${githubPullRequests.authorLogin})`,
      reviewDecision: sql`coalesce(${pr.reviewDecision ?? null}, ${githubPullRequests.reviewDecision})`,
      // A merged link keeps its first merge time (Bitbucket sends none of its own).
      mergedAt: sql`case when ${githubPullRequests.state} = 'merged'
        then coalesce(${githubPullRequests.mergedAt}, ${mergedAt}::timestamp) else ${mergedAt}::timestamp end`,
      providerUpdatedAt: sql`coalesce(${providerAt}::timestamp, ${githubPullRequests.providerUpdatedAt})`,
      updatedAt: now,
    })
    .where(and(thisPr, inArray(githubPullRequests.ticketId, linked.map((issue) => issue.id)), sql`not ${stale}`));
  const inserts = linked.map(
    (issue) => db.execute(sql`
      insert into ${githubPullRequests}
        (id, project_id, ticket_id, provider, repo, number, title, url, state, draft, branch,
         author_login, review_decision, merged_at, provider_updated_at, created_at, updated_at)
      select ${crypto.randomUUID()}, ${project.id}, ${issue.id}, ${pr.provider}, ${pr.repo}, ${pr.number}::int,
        ${title}, ${pr.url}, ${pr.state}, ${pr.draft}::boolean, ${pr.branch}, ${pr.author},
        ${pr.reviewDecision ?? null}, ${mergedAt}::timestamp, ${providerAt}::timestamp,
        ${now.toISOString()}::timestamp, ${now.toISOString()}::timestamp
      where not ${linkOf(issue.id)}
      on conflict do nothing
    `),
  );

  const label = `${prNoun(pr.provider)} ${prNumberLabel(pr.provider, pr.number)}`;
  const planned: { event: IssueEventInput; when: SQL }[] = [];
  const base = { provider: pr.provider, number: pr.number, url: pr.url, repo: pr.repo, title: pr.title };
  for (const issue of linked) {
    const common = { projectId: project.id, ticketId: issue.id, actorId: null };
    const about = {
      key: issue.key,
      title: issue.title,
      provider: pr.provider,
      actorName: VCS_PROVIDER_LABEL[pr.provider],
      pullRequest: base,
    };
    planned.push({
      event: { ...common, type: PR_EVENT.prLinked, data: { ...about, summary: `linked ${label}` } },
      when: sql`not ${linkOf(issue.id)}`,
    });
    if (pr.state === 'merged') {
      planned.push({
        event: { ...common, type: PR_EVENT.prMerged, data: { ...about, summary: `merged ${label}` } },
        when: sql`not ${linkOf(issue.id, eq(githubPullRequests.state, 'merged'))} and not ${linkOf(issue.id, stale)}`,
      });
    } else if (pr.state === 'closed') {
      planned.push({
        event: { ...common, type: PR_EVENT.prClosed, data: { ...about, summary: `closed ${label} without merging` } },
        when: sql`not ${linkOf(issue.id, eq(githubPullRequests.state, 'closed'))} and not ${linkOf(issue.id, stale)}`,
      });
    }
  }
  const stored = toStored(planned.map((p) => p.event));
  await db.batch([
    lock,
    ...stored.map((event, i) => insertEventIf(event, planned[i].when)),
    update,
    ...inserts,
  ]);
  const written = await publishWrittenEvents(stored);
  const wrote = (type: string) => new Set(written.filter((e) => e.type === type).map((e) => e.ticketId));
  const linkedNow = wrote(PR_EVENT.prLinked);
  const mergedNow = wrote(PR_EVENT.prMerged);

  if (!autoIssues.length) return;
  // Only issues whose link now holds THIS snapshot's state: a stale one (not
  // applied above) must not move an issue backwards.
  const current = await db
    .select({ ticketId: githubPullRequests.ticketId, state: githubPullRequests.state })
    .from(githubPullRequests)
    .where(and(thisPr, inArray(githubPullRequests.ticketId, autoIssues.map((issue) => issue.id))));
  const applied = new Set(current.filter((row) => row.state === pr.state).map((row) => row.ticketId));
  autoIssues = autoIssues.filter((issue) => applied.has(issue.id));
  if (!autoIssues.length) return;
  const states = await projectStatesQuery(project.id);
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
    await moveIssues(project, autoIssues, target, states, {
      eventData: (issue) => (mergedNow.has(issue.id) ? { viaPullRequest: via } : undefined),
    });
  } else if (pr.state === 'open' && !pr.draft) {
    // Edits / pushes only move issues this delivery linked for the first time —
    // otherwise every push would undo a manual move back to In Progress.
    const candidates = trigger === 'opened' ? autoIssues : autoIssues.filter((issue) => linkedNow.has(issue.id));
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
    findIssues(project.id, [...closedBy.keys()], null),
    projectStatesQuery(project.id),
  ]);
  const target = resolveAutomationState(project.prMergeStateId, states, defaultPrMergeState);
  if (!target) return;

  const moved = issues.filter((issue) => shouldAdvance(issue.state, target, states));
  if (!moved.length) return;
  // The "closed by commit" line commits with the state change it explains.
  await moveIssues(project, moved, target, states, {
    extraEvents: (issue) => {
      const commit = closedBy.get(issue.number)!;
      return [
        {
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
        },
      ];
    },
  });
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
