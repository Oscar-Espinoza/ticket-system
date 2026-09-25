// Applies verified GitHub webhook deliveries to one project. Pull requests and
// pushes map onto the provider-neutral engine in src/lib/vcs/automation.ts
// (shared with GitLab / Bitbucket); reviews and checks update the linked PRs'
// review decision and combined CI state.
//
// The caller (the webhook route) has already verified the delivery's signature
// against THIS project's secret, so everything here is scoped to `project.id`.

import { githubMessage, splitRepo, userOctokit } from '@/lib/github/client';
import {
  PR_EVENT,
  resetChecks,
  syncClosingCommits,
  syncPullRequest as syncVcsPullRequest,
  updatePullRequestStatus,
  type PrTrigger,
  type VcsProject,
} from '@/lib/vcs/automation';
import { combineChecks, combineReviews, type ChecksState, type ReviewDecision } from '@/lib/vcs/providers';

export const GITHUB_EVENT = PR_EVENT;

export interface SyncProject {
  id: string;
  ticketKey: string;
  githubPrOpenStateId: string | null;
  githubPrMergeStateId: string | null;
  /** Whose token reads reviews / checks (the admin who connected the repo). */
  githubConnectedById: string | null;
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
    head: { ref: string; sha?: string };
    requested_reviewers?: unknown[];
  };
}

export interface PushPayload {
  ref: string;
  repository: { full_name: string; default_branch: string };
  commits?: { id: string; message: string; url: string }[];
}

export interface PullRequestReviewPayload {
  action: string;
  repository: { full_name: string };
  review: { state: string };
  pull_request: { number: number };
}

type Conclusion = string | null | undefined;

interface CheckPullRequest {
  number: number;
}

export interface CheckSuitePayload {
  action: string;
  repository: { full_name: string };
  check_suite: {
    head_sha: string;
    head_branch: string | null;
    status: string;
    conclusion: Conclusion;
    pull_requests?: CheckPullRequest[];
  };
}

export interface CheckRunPayload {
  action: string;
  repository: { full_name: string };
  check_run: {
    head_sha: string;
    status: string;
    conclusion: Conclusion;
    pull_requests?: CheckPullRequest[];
    check_suite?: { head_branch: string | null };
  };
}

export interface StatusPayload {
  repository: { full_name: string };
  sha: string;
  state: string;
  branches?: { name: string }[];
}

const PR_ACTIONS = new Set([
  'opened',
  'reopened',
  'ready_for_review',
  'converted_to_draft',
  'edited',
  'synchronize',
  'closed',
  'review_requested',
]);

/** Actions that (re)announce a PR as open and ready — the "PR opened" automation. */
const OPEN_ACTIONS = new Set(['opened', 'reopened', 'ready_for_review']);

function vcsProject(project: SyncProject): VcsProject {
  return {
    id: project.id,
    ticketKey: project.ticketKey,
    prOpenStateId: project.githubPrOpenStateId,
    prMergeStateId: project.githubPrMergeStateId,
  };
}

function triggerOf(action: string): PrTrigger {
  if (action === 'closed') return 'closed';
  return OPEN_ACTIONS.has(action) ? 'opened' : 'updated';
}

export async function syncPullRequest(project: SyncProject, payload: PullRequestPayload) {
  if (!PR_ACTIONS.has(payload.action)) return;
  const pr = payload.pull_request;
  const repo = payload.repository.full_name;
  // Verdicts come from pull_request_review deliveries; a review request on a
  // new PR (or a re-request) marks it as awaiting review.
  const reviewRequested =
    (payload.action === 'opened' || payload.action === 'review_requested') &&
    !!pr.requested_reviewers?.length;
  const reviewDecision = reviewRequested
    ? ((await currentReviewDecision(project, repo, pr.number)) ?? 'review_required')
    : null;
  await syncVcsPullRequest(
    vcsProject(project),
    {
      provider: 'github',
      repo,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      url: pr.html_url,
      state: pr.merged ? 'merged' : pr.state,
      draft: !!pr.draft,
      branch: pr.head.ref,
      author: pr.user?.login ?? null,
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      reviewDecision,
    },
    triggerOf(payload.action),
  );
  // New commits restart CI: a known state goes back to pending until checks report.
  if (payload.action === 'synchronize') {
    await resetChecks(project.id, { provider: 'github', repo, number: pr.number });
  }
}

/** Commits pushed to the default branch close issues they reference with closing words. */
export async function syncPush(project: SyncProject, payload: PushPayload) {
  if (payload.ref !== `refs/heads/${payload.repository.default_branch}`) return;
  await syncClosingCommits(vcsProject(project), {
    provider: 'github',
    repo: payload.repository.full_name,
    commits: payload.commits ?? [],
  });
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

async function octokitFor(project: SyncProject) {
  if (!project.githubConnectedById) return null;
  return userOctokit(project.githubConnectedById).catch(() => null);
}

/**
 * The PR's decision from all reviews (latest verdict per reviewer), read with
 * the connecting admin's token. undefined = no token or GitHub failed.
 */
async function currentReviewDecision(
  project: SyncProject,
  repo: string,
  number: number,
): Promise<ReviewDecision | undefined> {
  const octokit = await octokitFor(project);
  const target = splitRepo(repo);
  if (!octokit || !target) return undefined;
  try {
    const { data } = await octokit.rest.pulls.listReviews({ ...target, pull_number: number, per_page: 100 });
    const latest = new Map<string, 'approved' | 'changes_requested' | null>();
    for (const review of data) {
      const who = review.user?.login;
      if (!who) continue;
      if (review.state === 'APPROVED') latest.set(who, 'approved');
      else if (review.state === 'CHANGES_REQUESTED') latest.set(who, 'changes_requested');
      else if (review.state === 'DISMISSED') latest.set(who, null);
    }
    return combineReviews(latest.values(), true) ?? 'review_required';
  } catch (err) {
    console.error('[github] listReviews failed', githubMessage(err));
    return undefined;
  }
}

export async function syncPullRequestReview(project: SyncProject, payload: PullRequestReviewPayload) {
  const repo = payload.repository.full_name;
  const number = payload.pull_request.number;
  let decision = await currentReviewDecision(project, repo, number);
  if (!decision) {
    // No token: the delivered review is the best signal we have.
    const state = payload.review.state.toLowerCase();
    if (state === 'approved' || state === 'changes_requested') decision = state;
    else if (state === 'dismissed') decision = 'review_required';
    else return; // a plain comment changes nothing
  }
  await updatePullRequestStatus(project.id, { provider: 'github', repo, numbers: [number] }, { reviewDecision: decision });
}

// ---------------------------------------------------------------------------
// Checks (check_suite / check_run / status)
// ---------------------------------------------------------------------------

function fromCheck(status: string, conclusion: Conclusion): ChecksState | null {
  if (status !== 'completed') return 'pending';
  switch (conclusion) {
    case 'success':
    case 'neutral':
    case 'skipped':
      return 'success';
    case 'failure':
    case 'timed_out':
    case 'cancelled':
    case 'action_required':
    case 'startup_failure':
      return 'failure';
    case 'stale':
      return null;
    default:
      return null;
  }
}

function fromStatus(state: string): ChecksState | null {
  if (state === 'success') return 'success';
  if (state === 'failure' || state === 'error') return 'failure';
  if (state === 'pending') return 'pending';
  return null;
}

/** Combined state of every check run and commit status on `sha`, or null without a token. */
async function combinedChecks(project: SyncProject, repo: string, sha: string): Promise<ChecksState | null> {
  const octokit = await octokitFor(project);
  const target = splitRepo(repo);
  if (!octokit || !target) return null;
  try {
    const [runs, statuses] = await Promise.all([
      octokit.rest.checks.listForRef({ ...target, ref: sha, per_page: 100 }),
      octokit.rest.repos.getCombinedStatusForRef({ ...target, ref: sha }),
    ]);
    return combineChecks([
      ...runs.data.check_runs.map((run) => fromCheck(run.status, run.conclusion)),
      statuses.data.total_count > 0 ? fromStatus(statuses.data.state) : null,
    ]);
  } catch (err) {
    console.error('[github] check lookup failed', githubMessage(err));
    return null;
  }
}

async function applyChecks(
  project: SyncProject,
  repo: string,
  sha: string,
  delivered: ChecksState | null,
  match: { numbers: number[]; branches: string[] },
) {
  const state = (await combinedChecks(project, repo, sha)) ?? delivered;
  if (!state) return;
  await updatePullRequestStatus(
    project.id,
    { provider: 'github', repo, ...match, openOnly: true },
    { checksState: state },
  );
}

export async function syncCheckSuite(project: SyncProject, payload: CheckSuitePayload) {
  const suite = payload.check_suite;
  await applyChecks(project, payload.repository.full_name, suite.head_sha, fromCheck(suite.status, suite.conclusion), {
    numbers: (suite.pull_requests ?? []).map((pr) => pr.number),
    branches: suite.head_branch ? [suite.head_branch] : [],
  });
}

export async function syncCheckRun(project: SyncProject, payload: CheckRunPayload) {
  const run = payload.check_run;
  const branch = run.check_suite?.head_branch;
  await applyChecks(project, payload.repository.full_name, run.head_sha, fromCheck(run.status, run.conclusion), {
    numbers: (run.pull_requests ?? []).map((pr) => pr.number),
    branches: branch ? [branch] : [],
  });
}

export async function syncStatus(project: SyncProject, payload: StatusPayload) {
  await applyChecks(project, payload.repository.full_name, payload.sha, fromStatus(payload.state), {
    numbers: [],
    branches: (payload.branches ?? []).map((branch) => branch.name),
  });
}
