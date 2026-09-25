// Bitbucket Cloud REST 2.0: repository lookup, webhook lifecycle and commit
// statuses. Auth is a repository / workspace access token (Bearer) or, with a
// username, an API token / app password (Basic). Server-only.

import { requestJson, VcsHttpError } from '@/lib/vcs/http';

const API = 'https://api.bitbucket.org/2.0';

export const BITBUCKET_EVENTS = [
  'repo:push',
  'pullrequest:created',
  'pullrequest:updated',
  'pullrequest:fulfilled',
  'pullrequest:rejected',
  'pullrequest:approved',
  'pullrequest:unapproved',
  'pullrequest:changes_request_created',
  'pullrequest:changes_request_removed',
  'repo:commit_status_created',
  'repo:commit_status_updated',
];

export interface BitbucketAuth {
  token: string;
  username: string | null;
}

export function isBitbucketRepo(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) && !value.includes('..');
}

function repoPath(fullName: string) {
  const [workspace, slug] = fullName.split('/');
  return `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}`;
}

function api(auth: BitbucketAuth, path: string, init: RequestInit = {}) {
  const authorization = auth.username
    ? `Basic ${Buffer.from(`${auth.username}:${auth.token}`).toString('base64')}`
    : `Bearer ${auth.token}`;
  return requestJson<unknown>(`${API}${path}`, { ...init, headers: { Authorization: authorization } });
}

export interface BitbucketRepo {
  fullName: string;
  webUrl: string;
  defaultBranch: string | null;
}

export async function getBitbucketRepo(auth: BitbucketAuth, fullName: string): Promise<BitbucketRepo> {
  const data = (await api(auth, repoPath(fullName))) as {
    full_name: string;
    links?: { html?: { href?: string } };
    mainbranch?: { name?: string } | null;
  };
  return {
    fullName: data.full_name,
    webUrl: data.links?.html?.href ?? `https://bitbucket.org/${data.full_name}`,
    defaultBranch: data.mainbranch?.name ?? null,
  };
}

/** Bitbucket signs deliveries with `secret`: `X-Hub-Signature: sha256=<hmac>`. */
export async function createBitbucketHook(
  auth: BitbucketAuth,
  fullName: string,
  url: string,
  secret: string,
): Promise<string> {
  const data = (await api(auth, `${repoPath(fullName)}/hooks`, {
    method: 'POST',
    body: JSON.stringify({
      description: 'Ticket system',
      url,
      active: true,
      secret,
      events: BITBUCKET_EVENTS,
    }),
  })) as { uuid: string };
  return data.uuid;
}

export async function deleteBitbucketHook(auth: BitbucketAuth, fullName: string, hookId: string): Promise<boolean> {
  try {
    await api(auth, `${repoPath(fullName)}/hooks/${encodeURIComponent(hookId)}`, { method: 'DELETE' });
    return true;
  } catch (err) {
    return err instanceof VcsHttpError && err.status === 404;
  }
}

/** Every build status reported on a commit (first page — plenty for one commit). */
export async function listCommitStatuses(auth: BitbucketAuth, fullName: string, hash: string): Promise<string[]> {
  const data = (await api(
    auth,
    `${repoPath(fullName)}/commit/${encodeURIComponent(hash)}/statuses?pagelen=100`,
  )) as { values?: { state?: string }[] };
  return (data.values ?? []).flatMap((status) => (status.state ? [status.state] : []));
}
