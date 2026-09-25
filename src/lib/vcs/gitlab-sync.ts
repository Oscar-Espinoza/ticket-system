// GitLab webhook deliveries (Merge Request / Push / Pipeline hooks) mapped onto
// the shared PR automation. The route has verified X-Gitlab-Token against this
// integration's secret; everything is scoped to its project.

import {
  resetChecks,
  syncClosingCommits,
  syncPullRequest,
  updatePullRequestStatus,
  type PrTrigger,
  type VcsProject,
} from '@/lib/vcs/automation';
import type { GitlabConfig } from '@/lib/vcs/integrations';
import type { ChecksState, ReviewDecision } from '@/lib/vcs/providers';

interface GitlabProjectRef {
  path_with_namespace?: string;
  default_branch?: string | null;
}

export interface MergeRequestHook {
  object_kind: 'merge_request';
  user?: { username?: string };
  project?: GitlabProjectRef;
  reviewers?: unknown[];
  changes?: { draft?: { current?: boolean }; work_in_progress?: { current?: boolean } };
  object_attributes: {
    iid: number;
    title: string;
    description: string | null;
    url: string;
    state: string;
    action?: string;
    source_branch: string | null;
    draft?: boolean;
    work_in_progress?: boolean;
    merged_at?: string | null;
    updated_at?: string;
    oldrev?: string;
  };
}

export interface PushHook {
  object_kind: 'push';
  ref: string;
  project?: GitlabProjectRef;
  commits?: { id: string; message: string; url: string }[];
}

export interface PipelineHook {
  object_kind: 'pipeline';
  project?: GitlabProjectRef;
  merge_request?: { iid: number } | null;
  object_attributes: { status: string; ref: string; sha: string; tag?: boolean };
}

export type GitlabHook = MergeRequestHook | PushHook | PipelineHook;

const repoOf = (hook: { project?: GitlabProjectRef }, config: GitlabConfig) =>
  hook.project?.path_with_namespace ?? config.repo;

function triggerOf(hook: MergeRequestHook): PrTrigger {
  const action = hook.object_attributes.action;
  if (action === 'open' || action === 'reopen') return 'opened';
  if (action === 'close' || action === 'merge') return 'closed';
  // Draft → ready arrives as an update whose draft flag flipped off.
  const readied = hook.changes?.draft?.current === false || hook.changes?.work_in_progress?.current === false;
  return readied ? 'opened' : 'updated';
}

function reviewOf(hook: MergeRequestHook): ReviewDecision | null {
  const action = hook.object_attributes.action;
  if (action === 'approved' || action === 'approval') return 'approved';
  if (action === 'unapproved' || action === 'unapproval') return 'review_required';
  if (action === 'open' && hook.reviewers?.length) return 'review_required';
  return null;
}

async function syncMergeRequest(project: VcsProject, config: GitlabConfig, hook: MergeRequestHook) {
  const mr = hook.object_attributes;
  const repo = repoOf(hook, config);
  const state = mr.state === 'merged' ? 'merged' : mr.state === 'opened' ? 'open' : 'closed';
  const action = mr.action;
  await syncPullRequest(
    project,
    {
      provider: 'gitlab',
      repo,
      number: mr.iid,
      title: mr.title,
      body: mr.description,
      url: mr.url,
      state,
      draft: !!(mr.draft ?? mr.work_in_progress),
      branch: mr.source_branch,
      // `user` is whoever acted; on open that's the author.
      author: action === 'open' ? (hook.user?.username ?? null) : null,
      mergedAt: state === 'merged' ? new Date(mr.merged_at ?? mr.updated_at ?? Date.now()) : null,
      reviewDecision: reviewOf(hook),
    },
    triggerOf(hook),
  );
  // New commits (an update carrying `oldrev`) restart the pipeline.
  if (action === 'update' && mr.oldrev) {
    await resetChecks(project.id, { provider: 'gitlab', repo, number: mr.iid });
  }
}

function pipelineState(status: string): ChecksState | null {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
      return 'failure';
    case 'created':
    case 'waiting_for_resource':
    case 'preparing':
    case 'pending':
    case 'running':
    case 'scheduled':
      return 'pending';
    default:
      // canceled / skipped / manual: no verdict
      return null;
  }
}

async function syncPipeline(project: VcsProject, config: GitlabConfig, hook: PipelineHook) {
  const pipeline = hook.object_attributes;
  const state = pipelineState(pipeline.status);
  if (!state || pipeline.tag) return;
  await updatePullRequestStatus(
    project.id,
    {
      provider: 'gitlab',
      repo: repoOf(hook, config),
      ...(hook.merge_request ? { numbers: [hook.merge_request.iid] } : { branches: [pipeline.ref] }),
      openOnly: true,
    },
    { checksState: state },
  );
}

async function syncPushHook(project: VcsProject, config: GitlabConfig, hook: PushHook) {
  const defaultBranch = hook.project?.default_branch ?? config.defaultBranch;
  if (!defaultBranch || hook.ref !== `refs/heads/${defaultBranch}`) return;
  await syncClosingCommits(project, { provider: 'gitlab', repo: repoOf(hook, config), commits: hook.commits ?? [] });
}

export async function syncGitlabHook(project: VcsProject, config: GitlabConfig, hook: GitlabHook) {
  switch (hook.object_kind) {
    case 'merge_request':
      return syncMergeRequest(project, config, hook);
    case 'push':
      return syncPushHook(project, config, hook);
    case 'pipeline':
      return syncPipeline(project, config, hook);
  }
}
