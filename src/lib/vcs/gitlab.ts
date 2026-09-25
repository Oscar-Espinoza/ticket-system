// GitLab REST v4 (gitlab.com or self-hosted): project lookup and project hook
// lifecycle with a personal / project access token (`api` scope). Server-only.

import { isUnreachableUrl } from '@/lib/github/webhooks';
import { requestJson, VcsHttpError } from '@/lib/vcs/http';

export const GITLAB_DEFAULT_URL = 'https://gitlab.com';

/**
 * An http(s) origin (+ optional path for sub-path installs) without a trailing
 * slash, or null. Loopback / private-network hosts are refused: the server
 * fetches this URL with a secret token.
 */
export function normalizeGitlabUrl(input: unknown): string | null {
  const raw = typeof input === 'string' && input.trim() ? input.trim() : GITLAB_DEFAULT_URL;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || isUnreachableUrl(url.href)) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** `group/sub/project` (GitLab paths allow nested groups). */
export function isGitlabPath(value: string): boolean {
  return /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/.test(value) && !value.includes('..');
}

function api(baseUrl: string, token: string, path: string, init: RequestInit = {}) {
  return requestJson<unknown>(`${baseUrl}/api/v4${path}`, {
    ...init,
    headers: { 'PRIVATE-TOKEN': token },
  });
}

export interface GitlabProject {
  id: number;
  pathWithNamespace: string;
  webUrl: string;
  defaultBranch: string | null;
}

export async function getGitlabProject(baseUrl: string, token: string, path: string): Promise<GitlabProject> {
  const data = (await api(baseUrl, token, `/projects/${encodeURIComponent(path)}`)) as {
    id: number;
    path_with_namespace: string;
    web_url: string;
    default_branch: string | null;
  };
  return {
    id: data.id,
    pathWithNamespace: data.path_with_namespace,
    webUrl: data.web_url,
    defaultBranch: data.default_branch ?? null,
  };
}

/** GitLab echoes `token` back as the X-Gitlab-Token header of every delivery. */
export async function createGitlabHook(
  baseUrl: string,
  token: string,
  projectId: number,
  url: string,
  secret: string,
): Promise<string> {
  const data = (await api(baseUrl, token, `/projects/${projectId}/hooks`, {
    method: 'POST',
    body: JSON.stringify({
      url,
      token: secret,
      merge_requests_events: true,
      push_events: true,
      pipeline_events: true,
      enable_ssl_verification: true,
    }),
  })) as { id: number };
  return String(data.id);
}

/** Best effort: true when gone (deleted now or already missing). */
export async function deleteGitlabHook(
  baseUrl: string,
  token: string,
  projectId: number,
  hookId: string,
): Promise<boolean> {
  try {
    await api(baseUrl, token, `/projects/${projectId}/hooks/${encodeURIComponent(hookId)}`, { method: 'DELETE' });
    return true;
  } catch (err) {
    return err instanceof VcsHttpError && err.status === 404;
  }
}
