'use server';

// Developer integrations: GitLab / Bitbucket connections (admin), Sentry
// (admin), the linked pull requests of an issue with review + CI state (read),
// which code hosts a project uses (read), and the GitHub webhook's event
// subscription check / update (admin).
//
// Every action authorizes with authorizeProjectAction first and scopes every
// read/write by project id. Access tokens are encrypted before they're stored
// and never returned to the client.

import { revalidatePath } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { githubPullRequests, projectIntegrations, projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { githubMessage, userOctokit } from '@/lib/github/client';
import {
  getRepoWebhookEvents,
  isUnreachableUrl,
  missingWebhookEvents,
  updateRepoWebhookEvents,
} from '@/lib/github/webhooks';
import {
  createBitbucketHook,
  deleteBitbucketHook,
  getBitbucketRepo,
  isBitbucketRepo,
  type BitbucketAuth,
} from '@/lib/vcs/bitbucket';
import {
  createGitlabHook,
  deleteGitlabHook,
  getGitlabProject,
  isGitlabPath,
  normalizeGitlabUrl,
} from '@/lib/vcs/gitlab';
import { describeVcsError } from '@/lib/vcs/http';
import {
  getProjectIntegration,
  integrationWebhookUrl,
  isIntegrationProvider,
  sentryIntegrationId,
  type BitbucketConfig,
  type GitlabConfig,
} from '@/lib/vcs/integrations';
import {
  isChecksState,
  isReviewDecision,
  isVcsProvider,
  type ChecksState,
  type ReviewDecision,
  type VcsProvider,
} from '@/lib/vcs/providers';
import { decryptToken, encryptToken, newSecret } from '@/lib/vcs/secrets';

type Fail = { ok: false; error: string };

const TOKEN_MAX = 500;

function revalidateSettings(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}/settings/developer`);
}

const str = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

// ---------------------------------------------------------------------------
// Issue pane: linked pull requests, code hosts
// ---------------------------------------------------------------------------

export interface PullRequestView {
  id: string;
  provider: VcsProvider;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  branch: string | null;
  authorLogin: string | null;
  reviewDecision: ReviewDecision | null;
  checksState: ChecksState | null;
  updatedAt: Date;
}

export async function getPullRequests(input: {
  projectId: string;
  ticketId: string;
}): Promise<{ ok: true; pullRequests: PullRequestView[] } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.ticketId !== 'string') return { ok: false, error: 'Issue not found.' };
  const rows = await db
    .select({
      id: githubPullRequests.id,
      provider: githubPullRequests.provider,
      repo: githubPullRequests.repo,
      number: githubPullRequests.number,
      title: githubPullRequests.title,
      url: githubPullRequests.url,
      state: githubPullRequests.state,
      draft: githubPullRequests.draft,
      branch: githubPullRequests.branch,
      authorLogin: githubPullRequests.authorLogin,
      reviewDecision: githubPullRequests.reviewDecision,
      checksState: githubPullRequests.checksState,
      updatedAt: githubPullRequests.updatedAt,
    })
    .from(githubPullRequests)
    .where(
      and(eq(githubPullRequests.projectId, input.projectId), eq(githubPullRequests.ticketId, input.ticketId)),
    )
    .orderBy(desc(githubPullRequests.updatedAt));
  return {
    ok: true,
    pullRequests: rows.map((row) => ({
      ...row,
      provider: isVcsProvider(row.provider) ? row.provider : 'github',
      state: row.state === 'merged' || row.state === 'closed' ? row.state : 'open',
      reviewDecision: isReviewDecision(row.reviewDecision) ? row.reviewDecision : null,
      checksState: isChecksState(row.checksState) ? row.checksState : null,
    })),
  };
}

export interface VcsConnection {
  provider: VcsProvider;
  repo: string;
  webUrl: string;
}

/** Code hosts connected to the project (GitHub first), for the issue header's branch menu. */
export async function getVcsConnections(
  projectId: string,
): Promise<{ ok: true; connections: VcsConnection[] } | Fail> {
  const authz = await authorizeProjectAction(projectId, 'read');
  if (!authz.ok) return authz;
  const [[project], rows] = await db.batch([
    db.select({ githubRepo: projects.githubRepo }).from(projects).where(eq(projects.id, projectId)).limit(1),
    db
      .select({ provider: projectIntegrations.provider, config: projectIntegrations.config })
      .from(projectIntegrations)
      .where(eq(projectIntegrations.projectId, projectId)),
  ]);
  const connections: VcsConnection[] = [];
  if (project?.githubRepo) {
    connections.push({
      provider: 'github',
      repo: project.githubRepo,
      webUrl: `https://github.com/${project.githubRepo}`,
    });
  }
  for (const row of rows) {
    if (row.provider !== 'gitlab' && row.provider !== 'bitbucket') continue;
    const config = row.config as Partial<GitlabConfig & BitbucketConfig>;
    if (typeof config.repo === 'string' && typeof config.webUrl === 'string') {
      connections.push({ provider: row.provider, repo: config.repo, webUrl: config.webUrl });
    }
  }
  return { ok: true, connections };
}

// ---------------------------------------------------------------------------
// GitLab / Bitbucket connections (admin)
// ---------------------------------------------------------------------------

export type VcsConnectResult =
  | { ok: true; repo: string; webhook: 'registered' | 'unreachable' | 'failed'; warning?: string }
  | Fail;

type HookHost = 'gitlab' | 'bitbucket';

/** Upsert the provider row (fresh secret, no hook yet). */
async function saveIntegration(
  projectId: string,
  provider: HookHost,
  userId: string,
  config: GitlabConfig | BitbucketConfig,
  token: string,
): Promise<{ id: string; secret: string }> {
  const now = new Date();
  const values = {
    config: config as unknown as Record<string, unknown>,
    token: await encryptToken(token),
    secret: newSecret(),
    createdById: userId,
    updatedAt: now,
  };
  const [row] = await db
    .insert(projectIntegrations)
    .values({ id: crypto.randomUUID(), projectId, provider, createdAt: now, ...values })
    .onConflictDoUpdate({ target: [projectIntegrations.projectId, projectIntegrations.provider], set: values })
    .returning({ id: projectIntegrations.id });
  return { id: row.id, secret: values.secret };
}

async function setWebhookId(integrationId: string, config: GitlabConfig | BitbucketConfig, webhookId: string | null) {
  await db
    .update(projectIntegrations)
    .set({ config: { ...config, webhookId } as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(projectIntegrations.id, integrationId));
}

async function deleteHook(provider: HookHost, config: GitlabConfig | BitbucketConfig, token: string | null) {
  if (!config.webhookId || !token) return false;
  if (provider === 'gitlab') {
    const c = config as GitlabConfig;
    return deleteGitlabHook(c.baseUrl, token, c.remoteId, c.webhookId!);
  }
  const c = config as BitbucketConfig;
  return deleteBitbucketHook({ token, username: c.username }, c.repo, c.webhookId!);
}

/** Create the hook for a saved integration (secret already stored, so the first delivery verifies). */
async function registerHook(
  provider: HookHost,
  integrationId: string,
  config: GitlabConfig | BitbucketConfig,
  token: string,
  secret: string,
): Promise<Omit<Extract<VcsConnectResult, { ok: true }>, 'ok' | 'repo'>> {
  const url = integrationWebhookUrl(provider, integrationId);
  if (isUnreachableUrl(url)) {
    return {
      webhook: 'unreachable',
      warning: `${provider === 'gitlab' ? 'GitLab' : 'Bitbucket'} can't reach ${url}. Merge request automation needs a public URL — set NEXT_PUBLIC_APP_URL (or GITHUB_WEBHOOK_BASE_URL for a tunnel) and register the webhook again.`,
    };
  }
  try {
    const hookId =
      provider === 'gitlab'
        ? await createGitlabHook((config as GitlabConfig).baseUrl, token, (config as GitlabConfig).remoteId, url, secret)
        : await createBitbucketHook({ token, username: (config as BitbucketConfig).username }, config.repo, url, secret);
    await setWebhookId(integrationId, config, hookId);
    return { webhook: 'registered' };
  } catch (err) {
    console.error(`[${provider}] create webhook failed`, err);
    return { webhook: 'failed', warning: `Couldn't register the webhook. ${describeVcsError(provider, err, config.repo)}` };
  }
}

async function connect(
  projectId: string,
  provider: HookHost,
  userId: string,
  config: GitlabConfig | BitbucketConfig,
  token: string,
): Promise<VcsConnectResult> {
  // Replacing a connection: drop its hook first (best effort, with its own token).
  const previous = await getProjectIntegration<GitlabConfig | BitbucketConfig>(projectId, provider);
  if (previous?.config.webhookId) await deleteHook(provider, previous.config, await decryptToken(previous.token));

  const saved = await saveIntegration(projectId, provider, userId, config, token);
  const webhook = await registerHook(provider, saved.id, config, token, saved.secret);
  revalidateSettings(projectId);
  return { ok: true, repo: config.repo, ...webhook };
}

export async function connectGitlab(input: {
  projectId: string;
  baseUrl: string;
  repo: string;
  token: string;
}): Promise<VcsConnectResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const baseUrl = normalizeGitlabUrl(input.baseUrl);
  if (!baseUrl) return { ok: false, error: 'Enter a public http(s) GitLab URL, e.g. https://gitlab.com.' };
  const path = str(input.repo, 300).replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!isGitlabPath(path)) return { ok: false, error: 'Use the project path, e.g. group/project.' };
  const token = str(input.token, TOKEN_MAX);
  if (!token) return { ok: false, error: 'Enter an access token.' };

  let remote;
  try {
    remote = await getGitlabProject(baseUrl, token, path);
  } catch (err) {
    return { ok: false, error: describeVcsError('gitlab', err, path) };
  }
  return connect(input.projectId, 'gitlab', authz.userId, {
    baseUrl,
    repo: remote.pathWithNamespace,
    remoteId: remote.id,
    webUrl: remote.webUrl,
    defaultBranch: remote.defaultBranch,
    webhookId: null,
  }, token);
}

export async function connectBitbucket(input: {
  projectId: string;
  repo: string;
  token: string;
  username?: string | null;
}): Promise<VcsConnectResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const repo = str(input.repo, 200).replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!isBitbucketRepo(repo)) return { ok: false, error: 'Use the workspace/repository form, e.g. acme/web.' };
  const token = str(input.token, TOKEN_MAX);
  if (!token) return { ok: false, error: 'Enter an access token.' };
  const username = str(input.username, 200) || null;
  const auth: BitbucketAuth = { token, username };

  let remote;
  try {
    remote = await getBitbucketRepo(auth, repo);
  } catch (err) {
    return { ok: false, error: describeVcsError('bitbucket', err, repo) };
  }
  return connect(input.projectId, 'bitbucket', authz.userId, {
    repo: remote.fullName,
    webUrl: remote.webUrl,
    defaultBranch: remote.defaultBranch,
    webhookId: null,
    username,
  }, token);
}

/** Re-create the hook with a fresh secret (e.g. after fixing the public URL). */
export async function registerIntegrationWebhook(input: {
  projectId: string;
  provider: HookHost;
}): Promise<VcsConnectResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  if (input.provider !== 'gitlab' && input.provider !== 'bitbucket') return { ok: false, error: 'Unknown provider.' };
  const row = await getProjectIntegration<GitlabConfig | BitbucketConfig>(input.projectId, input.provider);
  if (!row) return { ok: false, error: 'Not connected.' };
  const token = await decryptToken(row.token);
  if (!token) return { ok: false, error: 'The stored access token can no longer be read. Connect again with a new token.' };

  await deleteHook(input.provider, row.config, token);
  const secret = newSecret();
  const config = { ...row.config, webhookId: null };
  await db
    .update(projectIntegrations)
    .set({ secret, config: config as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(projectIntegrations.id, row.id));
  const webhook = await registerHook(input.provider, row.id, config, token, secret);
  revalidateSettings(input.projectId);
  return { ok: true, repo: row.config.repo, ...webhook };
}

export async function disconnectIntegration(input: {
  projectId: string;
  provider: string;
}): Promise<{ ok: true; warning?: string } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  if (!isIntegrationProvider(input.provider)) return { ok: false, error: 'Unknown provider.' };
  const row = await getProjectIntegration<Partial<GitlabConfig & BitbucketConfig>>(input.projectId, input.provider);
  if (!row) return { ok: true };

  let warning: string | undefined;
  if (input.provider !== 'sentry' && row.config.webhookId) {
    const removed = await deleteHook(
      input.provider,
      row.config as GitlabConfig | BitbucketConfig,
      await decryptToken(row.token),
    ).catch(() => false);
    if (!removed) {
      warning = `Couldn't remove the webhook from ${row.config.repo} — delete it in the repository's webhook settings. It no longer has any effect here.`;
    }
  }
  // Deleting the row (and its secret) is what cuts the link: leftover hooks fail verification.
  await db.delete(projectIntegrations).where(eq(projectIntegrations.id, row.id));
  revalidateSettings(input.projectId);
  return { ok: true, warning };
}

// ---------------------------------------------------------------------------
// Sentry (admin)
// ---------------------------------------------------------------------------

export async function connectSentry(input: {
  projectId: string;
  clientSecret: string;
  authToken?: string | null;
}): Promise<{ ok: true; webhookUrl: string } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const clientSecret = str(input.clientSecret, 200);
  if (clientSecret.length < 16 || /\s/.test(clientSecret)) {
    return { ok: false, error: "Paste the integration's Client Secret from Sentry." };
  }
  const authToken = str(input.authToken, TOKEN_MAX);
  const now = new Date();
  const values = {
    config: {},
    secret: clientSecret,
    token: authToken ? await encryptToken(authToken) : null,
    createdById: authz.userId,
    updatedAt: now,
  };
  const [row] = await db
    .insert(projectIntegrations)
    .values({ id: sentryIntegrationId(input.projectId), projectId: input.projectId, provider: 'sentry', createdAt: now, ...values })
    .onConflictDoUpdate({ target: [projectIntegrations.projectId, projectIntegrations.provider], set: values })
    .returning({ id: projectIntegrations.id });
  revalidateSettings(input.projectId);
  return { ok: true, webhookUrl: integrationWebhookUrl('sentry', row.id) };
}

// ---------------------------------------------------------------------------
// GitHub webhook events (admin) — review / CI events added after round 1
// ---------------------------------------------------------------------------

export type GithubWebhookHealth =
  | { ok: true; status: 'current' }
  | { ok: true; status: 'outdated'; missing: string[] }
  | { ok: true; status: 'missing' | 'unknown' };

async function githubHook(projectId: string) {
  const [project] = await db
    .select({ repo: projects.githubRepo, webhookId: projects.githubWebhookId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project?.repo && project.webhookId ? { repo: project.repo, webhookId: project.webhookId } : null;
}

export async function getGithubWebhookHealth(projectId: string): Promise<GithubWebhookHealth | Fail> {
  const authz = await authorizeProjectAction(projectId, 'admin');
  if (!authz.ok) return authz;
  const [hook, octokit] = await Promise.all([githubHook(projectId), userOctokit(authz.userId)]);
  if (!hook || !octokit) return { ok: true, status: 'unknown' };
  try {
    const events = await getRepoWebhookEvents(octokit, hook.repo, hook.webhookId);
    if (!events) return { ok: true, status: 'missing' };
    const missing = missingWebhookEvents(events);
    return missing.length ? { ok: true, status: 'outdated', missing } : { ok: true, status: 'current' };
  } catch (err) {
    // No admin access to the hook with this user's token: nothing to suggest.
    console.error('[github] webhook lookup failed', githubMessage(err));
    return { ok: true, status: 'unknown' };
  }
}

export async function updateGithubWebhookEvents(projectId: string): Promise<{ ok: true } | Fail> {
  const authz = await authorizeProjectAction(projectId, 'admin');
  if (!authz.ok) return authz;
  const [hook, octokit] = await Promise.all([githubHook(projectId), userOctokit(authz.userId)]);
  if (!hook) return { ok: false, error: 'No webhook is registered. Register it first.' };
  if (!octokit) return { ok: false, error: 'Connect your GitHub account first.' };
  try {
    await updateRepoWebhookEvents(octokit, hook.repo, hook.webhookId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Couldn't update the webhook: ${githubMessage(err)}` };
  }
}
