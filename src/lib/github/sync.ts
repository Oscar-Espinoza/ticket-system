// Applies verified GitHub webhook deliveries to one project: links pull
// requests to the issues they reference, records them in github_pull_request,
// emits github.* events and moves issue state (GH-04 / GH-05, magic words).
//
// The caller (the webhook route) has already verified the delivery's signature
// against THIS project's secret, so everything here is scoped to `project.id`
// and to the project's own issue key. State changes go through the issue
// service as the system actor, so activity, notifications, Slack and outgoing
// webhooks all see them.

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

export const GITHUB_EVENT = {
  branchCreated: 'github.branch_created',
  prLinked: 'github.pr_linked',
  prMerged: 'github.pr_merged',
  prClosed: 'github.pr_closed',
  commitClosed: 'github.commit_closed',
} as const;

export interface SyncProject {
  id: string;
  ticketKey: string;
  githubPrOpenStateId: string | null;
  githubPrMergeStateId: string | null;
}

// Just the webhook payload fields we read.
export interface PullRequestPayload {
  action: string;
  repository: { full_name: string };
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: 'open' | 'closed';
    draft?: boolean;
    merged?: boolean;
    merged_at: string | null;
    user: { login: string } | null;
    head: { ref: string };
  };
}

export interface PushPayload {
  ref: string;
  repository: { full_name: string; default_branch: string };
  commits?: { id: string; message: string; url: string }[];
}

const PR_ACTIONS = new Set([
  'opened',
  'reopened',
  'ready_for_review',
  'converted_to_draft',
  'edited',
  'synchronize',
  'closed',
]);

/** Actions that (re)announce a PR as open and ready — the "PR opened" automation. */
const OPEN_ACTIONS = new Set(['opened', 'reopened', 'ready_for_review']);

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
async function findIssues(projectId: string, numbers: number[], branch?: string): Promise<IssueRow[]> {
  const match: SQL[] = [];
  if (numbers.length) match.push(inArray(tickets.ticketNumber, numbers));
  if (branch) match.push(eq(tickets.githubBranch, branch));
  if (!match.length) return [];
  return queryIssues(and(eq(tickets.projectId, projectId), isNull(tickets.deletedAt), or(...match)));
}

async function moveIssues(project: SyncProject, issues: IssueRow[], target: WorkflowState | null, states: WorkflowState[]) {
  if (!target) return;
  for (const issue of issues) {
    if (!shouldAdvance(issue.state, target, states)) continue;
    const result = await updateIssueFields(SYSTEM_ACTOR, project.id, issue.id, { stateId: target.id });
    if (!result.ok) console.error(`[github] could not move ${issue.key}: ${result.error}`);
  }
}

export async function syncPullRequest(project: SyncProject, payload: PullRequestPayload) {
  if (!PR_ACTIONS.has(payload.action)) return;
  const pr = payload.pull_request;
  const repo = payload.repository.full_name;
  const { auto, linkOnly } = classifyPullRequest(
    { branch: pr.head.ref, title: pr.title, body: pr.body },
    project.ticketKey,
  );

  const [referenced, existing] = await Promise.all([
    findIssues(project.id, [...auto, ...linkOnly], pr.head.ref),
    db
      .select({ ticketId: githubPullRequests.ticketId, state: githubPullRequests.state })
      .from(githubPullRequests)
      .where(
        and(
          eq(githubPullRequests.projectId, project.id),
          sql`lower(${githubPullRequests.repo}) = lower(${repo})`,
          eq(githubPullRequests.number, pr.number),
        ),
      ),
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
    (issue) => auto.has(issue.number) || issue.githubBranch === pr.head.ref,
  );

  const merged = !!pr.merged;
  const state = merged ? 'merged' : pr.state;
  const now = new Date();
  await db
    .insert(githubPullRequests)
    .values(
      linked.map((issue) => ({
        id: crypto.randomUUID(),
        projectId: project.id,
        ticketId: issue.id,
        repo,
        number: pr.number,
        title: pr.title.slice(0, 500),
        url: pr.html_url,
        state,
        draft: !!pr.draft,
        branch: pr.head.ref,
        authorLogin: pr.user?.login ?? null,
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [githubPullRequests.ticketId, githubPullRequests.repo, githubPullRequests.number],
      set: {
        title: sql`excluded.title`,
        url: sql`excluded.url`,
        state: sql`excluded.state`,
        draft: sql`excluded.draft`,
        branch: sql`excluded.branch`,
        authorLogin: sql`excluded.author_login`,
        mergedAt: sql`excluded.merged_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  // Events only on transitions, so GitHub redeliveries stay idempotent.
  const events: IssueEventInput[] = [];
  const base = { number: pr.number, url: pr.html_url, repo, title: pr.title };
  for (const issue of linked) {
    const before = previous.get(issue.id);
    const common = { projectId: project.id, ticketId: issue.id, actorId: null };
    const about = { key: issue.key, title: issue.title, pullRequest: base };
    if (before === undefined) {
      events.push({
        ...common,
        type: GITHUB_EVENT.prLinked,
        data: { ...about, summary: `linked PR #${pr.number}` },
      });
    }
    if (state === 'merged' && before !== 'merged') {
      events.push({
        ...common,
        type: GITHUB_EVENT.prMerged,
        data: { ...about, summary: `merged PR #${pr.number}` },
      });
    } else if (state === 'closed' && before !== 'closed') {
      events.push({
        ...common,
        type: GITHUB_EVENT.prClosed,
        data: { ...about, summary: `closed PR #${pr.number} without merging` },
      });
    }
  }
  if (events.length) await emitIssueEvent(events);

  if (!autoIssues.length) return;
  const states = await loadStates(project.id);
  if (merged) {
    // Only on the merge itself: a later edit of a merged PR must not re-close
    // an issue someone reopened by hand.
    if (payload.action !== 'closed') return;
    const target = resolveAutomationState(project.githubPrMergeStateId, states, defaultPrMergeState);
    await moveIssues(project, autoIssues, target, states);
  } else if (pr.state === 'open' && !pr.draft) {
    // edited / synchronize only move issues this delivery linked for the first
    // time — otherwise every push would undo a manual move back to In Progress.
    const candidates = OPEN_ACTIONS.has(payload.action)
      ? autoIssues
      : autoIssues.filter((issue) => !previous.has(issue.id));
    const target = resolveAutomationState(project.githubPrOpenStateId, states, defaultPrOpenState);
    await moveIssues(project, candidates, target, states);
  }
}

/** Commits pushed to the default branch close issues they reference with closing words. */
export async function syncPush(project: SyncProject, payload: PushPayload) {
  if (payload.ref !== `refs/heads/${payload.repository.default_branch}`) return;
  const closedBy = new Map<number, { id: string; url: string }>();
  for (const commit of payload.commits ?? []) {
    for (const number of closingNumbers(commit.message, project.ticketKey)) {
      if (!closedBy.has(number)) closedBy.set(number, { id: commit.id, url: commit.url });
    }
  }
  if (!closedBy.size) return;

  const [issues, states] = await Promise.all([
    findIssues(project.id, [...closedBy.keys()]),
    loadStates(project.id),
  ]);
  const target = resolveAutomationState(project.githubPrMergeStateId, states, defaultPrMergeState);
  if (!target) return;

  const moved = issues.filter((issue) => shouldAdvance(issue.state, target, states));
  if (!moved.length) return;
  await emitIssueEvent(
    moved.map((issue) => {
      const commit = closedBy.get(issue.number)!;
      const sha = commit.id.slice(0, 7);
      return {
        projectId: project.id,
        ticketId: issue.id,
        actorId: null,
        type: GITHUB_EVENT.commitClosed,
        data: {
          key: issue.key,
          title: issue.title,
          summary: `closed by commit ${sha}`,
          commit: { sha: commit.id, url: commit.url },
          repo: payload.repository.full_name,
        },
      };
    }),
  );
  await moveIssues(project, moved, target, states);
}
