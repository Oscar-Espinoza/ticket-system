// Small fetch wrapper for third-party REST APIs (GitLab, Bitbucket, and the
// Asana / Shortcut importers): JSON in and out, timeout, errors carry the HTTP
// status and the provider's own message. Server-only.

import { VCS_PROVIDER_LABEL, type VcsProvider } from '@/lib/vcs/providers';

export class VcsHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function messageOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return typeof body === 'string' && body ? body.slice(0, 200) : null;
  const b = body as Record<string, unknown>;
  const error = b.error as Record<string, unknown> | string | undefined;
  const errors = Array.isArray(b.errors) ? (b.errors[0] as Record<string, unknown> | undefined) : undefined;
  const candidates = [
    b.message,
    errors?.message,
    typeof error === 'object' ? error?.message : error,
    b.error_description,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c.slice(0, 200);
    if (c && typeof c === 'object') return JSON.stringify(c).slice(0, 200);
  }
  return null;
}

export async function requestJson<T>(
  url: string,
  init: RequestInit & { headers: Record<string, string>; timeoutMs?: number },
): Promise<T> {
  const { timeoutMs = 10_000, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...rest.headers },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (err) {
    throw new VcsHttpError(0, err instanceof Error ? err.message : String(err));
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new VcsHttpError(response.status, messageOf(body) ?? response.statusText);
  return body as T;
}

export function describeVcsError(provider: VcsProvider, err: unknown, repo?: string): string {
  const name = VCS_PROVIDER_LABEL[provider];
  if (!(err instanceof VcsHttpError)) return `${name} error: ${err instanceof Error ? err.message : String(err)}`;
  switch (err.status) {
    case 0:
      return `Couldn't reach ${name}: ${err.message}`;
    case 401:
      return `${name} rejected the access token. Check it hasn't expired and has the required scopes.`;
    case 403:
      return `${name} denied access${repo ? ` to ${repo}` : ''}. The token needs permission to manage webhooks.`;
    case 404:
      return `${repo ?? 'The repository'} wasn't found on ${name}, or the token can't see it.`;
    case 429:
      return `${name} rate-limited the request. Try again in a minute.`;
    default:
      return `${name} error (${err.status}): ${err.message}`;
  }
}
