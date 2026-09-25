// Bitbucket Cloud webhook deliveries (pull request, push, commit status events)
// mapped onto the shared PR automation. The route has verified the HMAC
// signature against this integration's secret; everything is scoped to its
// project. Build statuses are combined over the whole commit with the stored
// token when it still decrypts, else the delivered status stands alone.

import {
  syncClosingCommits,
  syncPullRequest,
  updatePullRequestStatus,
  type PrTrigger,
  type VcsProject,
} from '@/lib/vcs/automation';
import { listCommitStatuses, type BitbucketAuth } from '@/lib/vcs/bitbucket';
import type { BitbucketConfig } from '@/lib/vcs/integrations';
import { combineChecks, combineReviews, type ChecksState } from '@/lib/vcs/providers';

interface Participant {
  role?: string;
  approved?: boolean;
  state?: string | null;
}

interface PullRequestPayload {
  repository?: { full_name?: string };
  actor?: { nickname?: string; display_name?: string };
  pullrequest: {
    id: number;
    title: string;
    description?: string | null;
    state: string;
    draft?: boolean;
    links?: { html?: { href?: string } };
    source?: { branch?: { name?: string } };
    author?: { nickname?: string; display_name?: string };
    participants?: Participant[];
    reviewers?: unknown[];
    updated_on?: string;
  };
}

interface PushPayload {
  repository?: { full_name?: string };
  push?: {
    changes?: {
      new?: { type?: string; name?: string } | null;
      commits?: { hash: string; message: string; links?: { html?: { href?: string } } }[];
    }[];
  };
}

interface CommitStatusPayload {
  repository?: { full_name?: string };
  commit_status?: { state?: string; refname?: string | null; commit?: { hash?: string } };
}

const repoOf = (payload: { repository?: { full_name?: string } }, config: BitbucketConfig) =>
  payload.repository?.full_name ?? config.repo;

function triggerOf(event: string): PrTrigger {
  if (event === 'pullrequest:created') return 'opened';
  if (event === 'pullrequest:fulfilled' || event === 'pullrequest:rejected') return 'closed';
  return 'updated';
}

async function syncPr(project: VcsProject, config: BitbucketConfig, event: string, payload: PullRequestPayload) {
  const pr = payload.pullrequest;
  const state = pr.state === 'MERGED' ? 'merged' : pr.state === 'OPEN' ? 'open' : 'closed';
  const verdicts = (pr.participants ?? []).map((p) =>
    p.state === 'changes_requested' ? 'changes_requested' : p.approved || p.state === 'approved' ? 'approved' : null,
  );
  const repo = repoOf(payload, config);
  const url = pr.links?.html?.href ?? `${config.webUrl.replace(/\/+$/, '')}/pull-requests/${pr.id}`;
  const reviewDecision = combineReviews(verdicts, !!pr.reviewers?.length);
  await syncPullRequest(
    project,
    {
      provider: 'bitbucket',
      repo,
      number: pr.id,
      title: pr.title,
      body: pr.description ?? null,
      url,
      state,
      draft: !!pr.draft,
      branch: pr.source?.branch?.name ?? null,
      author: pr.author?.nickname ?? pr.author?.display_name ?? null,
      mergedAt: state === 'merged' ? new Date(pr.updated_on ?? Date.now()) : null,
      reviewDecision,
    },
    triggerOf(event),
  );
  // Bitbucket sends the full participant list, so an emptied decision
  // (approval withdrawn, no reviewers left) is authoritative too.
  if (!reviewDecision) {
    await updatePullRequestStatus(project.id, { provider: 'bitbucket', repo, numbers: [pr.id] }, { reviewDecision: null });
  }
}

async function syncPush(project: VcsProject, config: BitbucketConfig, payload: PushPayload) {
  if (!config.defaultBranch) return;
  const commits = (payload.push?.changes ?? [])
    .filter((change) => change.new?.type === 'branch' && change.new.name === config.defaultBranch)
    .flatMap((change) => change.commits ?? [])
    .map((commit) => ({ id: commit.hash, message: commit.message, url: commit.links?.html?.href ?? '' }));
  if (!commits.length) return;
  await syncClosingCommits(project, { provider: 'bitbucket', repo: repoOf(payload, config), commits });
}

function statusState(state: string | undefined): ChecksState | null {
  if (state === 'SUCCESSFUL') return 'success';
  if (state === 'FAILED') return 'failure';
  if (state === 'INPROGRESS') return 'pending';
  return null; // STOPPED
}

async function syncCommitStatus(
  project: VcsProject,
  config: BitbucketConfig,
  payload: CommitStatusPayload,
  auth: BitbucketAuth | null,
) {
  const status = payload.commit_status;
  const branch = status?.refname;
  if (!status || !branch) return; // we match PRs by head branch
  const repo = repoOf(payload, config);
  let state = statusState(status.state);
  if (auth && status.commit?.hash) {
    try {
      const all = await listCommitStatuses(auth, repo, status.commit.hash);
      state = combineChecks(all.map(statusState)) ?? state;
    } catch (err) {
      console.error('[bitbucket] commit statuses lookup failed', err);
    }
  }
  if (!state) return;
  await updatePullRequestStatus(
    project.id,
    { provider: 'bitbucket', repo, branches: [branch], openOnly: true },
    { checksState: state },
  );
}

export async function syncBitbucketEvent(
  project: VcsProject,
  config: BitbucketConfig,
  event: string,
  payload: unknown,
  auth: BitbucketAuth | null,
) {
  if (event.startsWith('pullrequest:')) {
    const pr = payload as PullRequestPayload;
    if (pr?.pullrequest) await syncPr(project, config, event, pr);
  } else if (event === 'repo:push') {
    await syncPush(project, config, payload as PushPayload);
  } else if (event === 'repo:commit_status_created' || event === 'repo:commit_status_updated') {
    await syncCommitStatus(project, config, payload as CommitStatusPayload, auth);
  }
}
