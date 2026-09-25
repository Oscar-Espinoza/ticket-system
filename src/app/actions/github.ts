'use server';

// GitHub integration actions: repo connection + webhook (admin), branch name /
// branch creation (write), linked PRs and the viewer's GitHub status (read).
//
// Every action authorizes with authorizeProjectAction first and scopes every
// read/write by project id. GitHub calls use the ACTING user's own token
// (getGitHubToken via userOctokit) — the token never leaves the server.

import { revalidatePath } from 'next/cache';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { githubPullRequests, projects, tickets, users, workflowStates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent } from '@/lib/events';
import { getTicketById } from '@/lib/tickets';
import {
  describeGithubError,
  githubMessage,
  githubStatus,
  splitRepo,
  userOctokit,
} from '@/lib/github/client';
import { AUTOMATION_OFF } from '@/lib/github/automation';
import { branchNameFor, branchPrefix, isValidBranchName } from '@/lib/github/branch';
import { GITHUB_EVENT } from '@/lib/github/sync';
import {
  createRepoWebhook,
  deleteRepoWebhook,
  isUnreachableUrl,
  newWebhookSecret,
  webhookUrl,
} from '@/lib/github/webhooks';

type Fail = { ok: false; error: string };

function revalidateProject(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
}

async function loadProjectGithub(projectId: string) {
  const [project] = await db
    .select({
      repo: projects.githubRepo,
      webhookId: projects.githubWebhookId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

// ---------------------------------------------------------------------------
// Viewer status (issue header)
// ---------------------------------------------------------------------------

export type GithubViewer = {
  ok: true;
  repo: string | null;
  /** The viewer has a usable GitHub token. */
  connected: boolean;
  login: string | null;
};

export async function getGithubViewer(projectId: string): Promise<GithubViewer | Fail> {
  const authz = await authorizeProjectAction(projectId, 'read');
  if (!authz.ok) return authz;
  const [project, octokit] = await Promise.all([
    loadProjectGithub(projectId),
    userOctokit(authz.userId),
  ]);
  const repo = project?.repo ?? null;
  if (!octokit) return { ok: true, repo, connected: false, login: null };
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    return { ok: true, repo, connected: true, login: data.login };
  } catch (err) {
    // Revoked token → "not connected"; GitHub down → still let them try.
    const revoked = githubStatus(err) === 401;
    if (!revoked) console.error('[github] getAuthenticated failed', githubMessage(err));
    return { ok: true, repo, connected: !revoked, login: null };
  }
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/** Remember the issue's branch name the first time it's copied (first writer wins). */
export async function saveBranchName(input: {
  projectId: string;
  ticketId: string;
  name: string;
}): Promise<{ ok: true; branch: string } | Fail> {
  const authz = await authorizeProjectAction(input.projectId, 'write');
  if (!authz.ok) return authz;
  if (!isValidBranchName(input.name)) return { ok: false, error: 'Invalid branch name.' };
  if (typeof input.ticketId !== 'string' || !input.ticketId) return { ok: false, error: 'Issue not found.' };

  const [saved] = await db
    .update(tickets)
    .set({ githubBranch: input.name })
    .where(
      and(
        eq(tickets.id, input.ticketId),
        eq(tickets.projectId, input.projectId),
        isNull(tickets.githubBranch),
      ),
    )
    .returning({ branch: tickets.githubBranch });
  if (saved) {
    revalidateProject(input.projectId);
    return { ok: true, branch: input.name };
  }
  const issue = await getTicketById(input.projectId, input.ticketId);
  if (!issue) return { ok: false, error: 'Issue not found.' };
  return { ok: true, branch: issue.githubBranch ?? input.name };
}

export type CreateBranchResult =
  | { ok: true; branch: string; url: string; existed: boolean }
  | Fail;

export async function createBranch(input: {
  projectId: string;
  ticketId: string;
}): Promise<CreateBranchResult> {
  const authz = await authorizeProjectAction(input.projectId, 'write');
  if (!authz.ok) return authz;

  const [project, issue, octokit] = await Promise.all([
    loadProjectGithub(input.projectId),
    getTicketById(input.projectId, input.ticketId),
    userOctokit(authz.userId),
  ]);
  if (!issue || issue.deletedAt) return { ok: false, error: 'Issue not found.' };
  const target = project?.repo ? splitRepo(project.repo) : null;
  if (!project?.repo || !target) {
    return { ok: false, error: 'Connect a repository in Settings → GitHub first.' };
  }
  if (!octokit) return { ok: false, error: 'Connect your GitHub account in Settings → GitHub first.' };

  try {
    let branch = issue.githubBranch;
    if (!branch) {
      const [{ data: me }, [viewer]] = await Promise.all([
        octokit.rest.users.getAuthenticated(),
        db.select({ name: users.name }).from(users).where(eq(users.id, authz.userId)).limit(1),
      ]);
      branch = branchNameFor(branchPrefix(me.login, viewer?.name), issue.key, issue.title);
    }

    const { data: repo } = await octokit.rest.repos.get(target);
    let sha: string;
    try {
      const { data: ref } = await octokit.rest.git.getRef({
        ...target,
        ref: `heads/${repo.default_branch}`,
      });
      sha = ref.object.sha;
    } catch (err) {
      if (githubStatus(err) === 409 || githubStatus(err) === 404) {
        return { ok: false, error: `${project.repo} has no commits on ${repo.default_branch} yet.` };
      }
      throw err;
    }

    let existed = false;
    try {
      await octokit.rest.git.createRef({ ...target, ref: `refs/heads/${branch}`, sha });
    } catch (err) {
      if (githubStatus(err) !== 422 || !/already exists/i.test(githubMessage(err))) throw err;
      existed = true;
    }

    if (!issue.githubBranch) {
      await db
        .update(tickets)
        .set({ githubBranch: branch })
        .where(
          and(
            eq(tickets.id, issue.id),
            eq(tickets.projectId, input.projectId),
            isNull(tickets.githubBranch),
          ),
        );
    }
    if (!existed) {
      await emitIssueEvent({
        projectId: input.projectId,
        ticketId: issue.id,
        actorId: authz.userId,
        type: GITHUB_EVENT.branchCreated,
        data: {
          key: issue.key,
          title: issue.title,
          summary: `created branch ${branch}`,
          branch,
          repo: project.repo,
        },
      });
    }
    revalidateProject(input.projectId);
    return {
      ok: true,
      branch,
      existed,
      url: `https://github.com/${project.repo}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`,
    };
  } catch (err) {
    console.error('[github] createBranch failed', githubMessage(err));
    return { ok: false, error: describeGithubError(err, project.repo) };
  }
}

// ---------------------------------------------------------------------------
// Linked pull requests
// ---------------------------------------------------------------------------

export interface LinkedPullRequest {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  branch: string | null;
  authorLogin: string | null;
  updatedAt: Date;
}

export async function getLinkedPullRequests(input: {
  projectId: string;
  ticketId: string;
}): Promise<{ ok: true; pullRequests: LinkedPullRequest[] } | Fail> {
  const authz = await authorizeProjectAction(input.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.ticketId !== 'string') return { ok: false, error: 'Issue not found.' };
  const rows = await db
    .select({
      id: githubPullRequests.id,
      repo: githubPullRequests.repo,
      number: githubPullRequests.number,
      title: githubPullRequests.title,
      url: githubPullRequests.url,
      state: githubPullRequests.state,
      draft: githubPullRequests.draft,
      branch: githubPullRequests.branch,
      authorLogin: githubPullRequests.authorLogin,
      updatedAt: githubPullRequests.updatedAt,
    })
    .from(githubPullRequests)
    .where(
      and(
        eq(githubPullRequests.projectId, input.projectId),
        eq(githubPullRequests.ticketId, input.ticketId),
      ),
    )
    .orderBy(desc(githubPullRequests.updatedAt));
  return {
    ok: true,
    pullRequests: rows.map((row) => ({
      ...row,
      state: row.state === 'merged' || row.state === 'closed' ? row.state : 'open',
    })),
  };
}

// ---------------------------------------------------------------------------
// Settings → GitHub (admin)
// ---------------------------------------------------------------------------

export interface GithubRepoOption {
  fullName: string;
  private: boolean;
  /** The viewer can add webhooks. */
  admin: boolean;
  pushedAt: string | null;
}

export async function listGithubRepos(
  projectId: string,
): Promise<{ ok: true; repos: GithubRepoOption[] } | Fail> {
  const authz = await authorizeProjectAction(projectId, 'admin');
  if (!authz.ok) return authz;
  const octokit = await userOctokit(authz.userId);
  if (!octokit) return { ok: false, error: 'Connect your GitHub account first.' };
  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'pushed',
      affiliation: 'owner,collaborator,organization_member',
    });
    return {
      ok: true,
      repos: data
        .filter((repo) => !repo.archived)
        .map((repo) => ({
          fullName: repo.full_name,
          private: repo.private,
          admin: !!repo.permissions?.admin,
          pushedAt: repo.pushed_at ?? null,
        })),
    };
  } catch (err) {
    return { ok: false, error: describeGithubError(err) };
  }
}

export type ConnectResult =
  | { ok: true; repo: string; webhook: 'registered' | 'unreachable' | 'failed'; warning?: string }
  | Fail;

/** Register (or re-register) the project's webhook with the caller's token. */
async function registerFor(
  projectId: string,
  repo: string,
  previousHookId: string | null,
  octokit: NonNullable<Awaited<ReturnType<typeof userOctokit>>>,
): Promise<Omit<Extract<ConnectResult, { ok: true }>, 'ok' | 'repo'>> {
  if (previousHookId) await deleteRepoWebhook(octokit, repo, previousHookId);
  const setHook = (githubWebhookId: string | null, githubWebhookSecret: string | null) =>
    db
      .update(projects)
      .set({ githubWebhookId, githubWebhookSecret, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

  const url = webhookUrl();
  if (isUnreachableUrl(url)) {
    await setHook(null, null);
    return {
      webhook: 'unreachable',
      warning: `GitHub can't reach ${url}. Pull request automation needs a public URL — set NEXT_PUBLIC_APP_URL (or GITHUB_WEBHOOK_BASE_URL for a tunnel) and register the webhook again.`,
    };
  }
  // Secret first: GitHub's immediate `ping` must already verify.
  const secret = newWebhookSecret();
  await setHook(null, secret);
  try {
    const hookId = await createRepoWebhook(octokit, repo, secret);
    await setHook(hookId, secret);
    return { webhook: 'registered' };
  } catch (err) {
    console.error('[github] createWebhook failed', githubMessage(err));
    await setHook(null, null);
    const status = githubStatus(err);
    return {
      webhook: 'failed',
      warning:
        status === 403 || status === 404
          ? `You need admin access to ${repo} to add a webhook. Ask a repository admin to connect it.`
          : `Couldn't register the webhook: ${githubMessage(err)}`,
    };
  }
}

export async function connectRepository(input: {
  projectId: string;
  repo: string;
}): Promise<ConnectResult> {
  const authz = await authorizeProjectAction(input.projectId, 'admin');
  if (!authz.ok) return authz;
  const repoName = typeof input.repo === 'string' ? input.repo.trim() : '';
  const target = splitRepo(repoName);
  if (!target) return { ok: false, error: 'Use the owner/name form, e.g. acme/web.' };

  const [project, octokit] = await Promise.all([
    loadProjectGithub(input.projectId),
    userOctokit(authz.userId),
  ]);
  if (!project) return { ok: false, error: 'Project not found.' };
  if (!octokit) return { ok: false, error: 'Connect your GitHub account first.' };

  let fullName: string;
  try {
    const { data } = await octokit.rest.repos.get(target);
    fullName = data.full_name; // canonical casing
  } catch (err) {
    return { ok: false, error: describeGithubError(err, repoName) };
  }

  // Switching repos: drop the old hook first (best effort, with this user's token).
  if (project.repo && project.webhookId && project.repo.toLowerCase() !== fullName.toLowerCase()) {
    await deleteRepoWebhook(octokit, project.repo, project.webhookId);
  }
  await db
    .update(projects)
    .set({
      githubRepo: fullName,
      githubConnectedById: authz.userId,
      githubWebhookId: null,
      githubWebhookSecret: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId));

  const sameRepoHook =
    project.repo?.toLowerCase() === fullName.toLowerCase() ? project.webhookId : null;
  const webhook = await registerFor(input.projectId, fullName, sameRepoHook, octokit);
  revalidateProject(input.projectId);
  return { ok: true, repo: fullName, ...webhook };
}

export async function registerWebhook(projectId: string): Promise<ConnectResult> {
  const authz = await authorizeProjectAction(projectId, 'admin');
  if (!authz.ok) return authz;
  const [project, octokit] = await Promise.all([
    loadProjectGithub(projectId),
    userOctokit(authz.userId),
  ]);
  if (!project?.repo) return { ok: false, error: 'Connect a repository first.' };
  if (!octokit) return { ok: false, error: 'Connect your GitHub account first.' };
  const webhook = await registerFor(projectId, project.repo, project.webhookId, octokit);
  revalidateProject(projectId);
  return { ok: true, repo: project.repo, ...webhook };
}

export async function disconnectRepository(
  projectId: string,
): Promise<{ ok: true; warning?: string } | Fail> {
  const authz = await authorizeProjectAction(projectId, 'admin');
  if (!authz.ok) return authz;
  const project = await loadProjectGithub(projectId);
  if (!project?.repo) return { ok: true };

  let warning: string | undefined;
  if (project.webhookId) {
    const octokit = await userOctokit(authz.userId);
    const removed = octokit ? await deleteRepoWebhook(octokit, project.repo, project.webhookId) : false;
    if (!removed) {
      warning = `Couldn't remove the webhook from ${project.repo} — delete it in the repository's settings (Webhooks). It no longer has any effect here.`;
    }
  }
  // Clearing the secret is what actually cuts the link: deliveries from a
  // leftover hook fail verification.
  await db
    .update(projects)
    .set({
      githubRepo: null,
      githubWebhookId: null,
      githubWebhookSecret: null,
      githubConnectedById: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  revalidateProject(projectId);
  return { ok: true, warning };
}

/** `null` = default state, AUTOMATION_OFF = no action, else a state id of this project. */
export async function updateGithubAutomation(input: {
  projectId: string;
  prOpenStateId: string | null;
  prMergeStateId: string | null;
}): Promise<{ ok: true } | Fail> {
  const authz = await authorizeProjectAction(input.projectId, 'admin');
  if (!authz.ok) return authz;

  const settings = [input.prOpenStateId, input.prMergeStateId];
  if (!settings.every((value) => value === null || typeof value === 'string')) {
    return { ok: false, error: 'Invalid state.' };
  }
  for (const id of settings) {
    if (id === null || id === AUTOMATION_OFF) continue;
    const [state] = await db
      .select({ id: workflowStates.id })
      .from(workflowStates)
      .where(and(eq(workflowStates.id, id), eq(workflowStates.projectId, input.projectId)))
      .limit(1);
    if (!state) return { ok: false, error: 'That state no longer exists.' };
  }

  await db
    .update(projects)
    .set({
      githubPrOpenStateId: input.prOpenStateId,
      githubPrMergeStateId: input.prMergeStateId,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId));
  revalidatePath(`/dashboard/projects/${input.projectId}/settings/github`);
  return { ok: true };
}

