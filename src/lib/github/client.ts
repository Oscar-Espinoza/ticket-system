// Per-request Octokit clients built from the acting user's own OAuth token
// (never a shared PAT). Server-only: goes through getGitHubToken (D-04).

import { Octokit } from '@octokit/rest';

import { getGitHubToken } from '@/lib/github-token';
import { REQUIRED_SCOPES } from '@/lib/github/scopes';

export function octokitFor(token: string) {
  return new Octokit({ auth: token, userAgent: 'ticket-system', request: { timeout: 10_000 } });
}

export async function userOctokit(userId: string): Promise<Octokit | null> {
  const token = await getGitHubToken(userId);
  return token ? octokitFor(token) : null;
}

export interface GithubAccount {
  login: string;
  avatarUrl: string;
  /** From the `x-oauth-scopes` response header — what the token really has. */
  scopes: string[];
  /** Both REQUIRED_SCOPES granted. */
  hasRequiredScopes: boolean;
}

export type GithubAccountStatus =
  | { status: 'none' }
  | { status: 'invalid' }
  | ({ status: 'connected' } & GithubAccount);

function hasScopes(scopes: string[]) {
  return REQUIRED_SCOPES.every((scope) => scopes.includes(scope));
}

export async function getGithubAccount(userId: string): Promise<GithubAccountStatus> {
  const octokit = await userOctokit(userId);
  if (!octokit) return { status: 'none' };
  try {
    const { data, headers } = await octokit.rest.users.getAuthenticated();
    const scopes = String(headers['x-oauth-scopes'] ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
    return {
      status: 'connected',
      login: data.login,
      avatarUrl: data.avatar_url,
      scopes,
      hasRequiredScopes: hasScopes(scopes),
    };
  } catch (err) {
    if (githubStatus(err) === 401) return { status: 'invalid' };
    throw err;
  }
}

export function githubStatus(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
    ? err.status
    : undefined;
}

/** GitHub's own message ("Reference already exists", "Validation Failed: …"). */
export function githubMessage(err: unknown): string {
  if (typeof err !== 'object' || err === null) return String(err);
  const data = (err as { response?: { data?: { message?: string; errors?: { message?: string }[] } } })
    .response?.data;
  const detail = data?.errors?.map((e) => e.message).filter(Boolean).join('; ');
  return [data?.message ?? (err as Error).message, detail].filter(Boolean).join(': ');
}

/** A user-facing message for a failed GitHub call about `repo`. */
export function describeGithubError(err: unknown, repo?: string): string {
  switch (githubStatus(err)) {
    case 401:
      return 'Your GitHub connection expired or was revoked. Reconnect it in Settings → GitHub.';
    case 403:
    case 404:
      return repo
        ? `GitHub denied access to ${repo}. Check that you can push to it and that the connection has the repo scope.`
        : 'GitHub denied access. Check the connection has the repo scope.';
    default:
      return `GitHub error: ${githubMessage(err)}`;
  }
}

export function splitRepo(fullName: string): { owner: string; repo: string } | null {
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(fullName);
  return match ? { owner: match[1], repo: match[2] } : null;
}
