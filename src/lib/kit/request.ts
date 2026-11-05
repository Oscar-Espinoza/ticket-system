// Request-scoped helpers for server code (src/lib, src/lib/server/actions),
// built on SvelteKit's getRequestEvent(). They keep the call shapes the code
// had under Next.js (headers(), cookies(), after(), cache(), redirect(),
// notFound()), so the server actions run unchanged.
//
// revalidatePath()/revalidateTag() do nothing at runtime: they mark actions
// whose client wrapper should refresh the page afterwards
// (scripts/gen-remote-actions.mjs looks for them).

import { error, redirect as kitRedirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';

/** The current request's headers. */
export async function headers(): Promise<Headers> {
  return getRequestEvent().request.headers;
}

/** A minimal cookie store over SvelteKit's event.cookies. */
export async function cookies() {
  const { cookies } = getRequestEvent();
  return {
    get: (name: string) => {
      const value = cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => cookies.getAll(),
    has: (name: string) => cookies.get(name) !== undefined,
    set: (name: string, value: string, options: Parameters<typeof cookies.set>[2] = { path: '/' }) =>
      cookies.set(name, value, { path: '/', ...options }),
    delete: (name: string) => cookies.delete(name, { path: '/' }),
  };
}

/**
 * after(task): run work after the response. Vercel functions keep
 * it alive through waitUntil; on Node (adapter-node) the process stays up, so
 * the promise simply runs on. Errors are logged, never thrown at the caller.
 */
export function after(task: Promise<unknown> | (() => unknown)): void {
  const run = typeof task === 'function' ? Promise.resolve().then(task) : task;
  const guarded = Promise.resolve(run).catch((err) => console.error('[after] task failed', err));
  let waitUntil: ((p: Promise<unknown>) => void) | undefined;
  try {
    const platform = getRequestEvent().platform as { context?: { waitUntil?: (p: Promise<unknown>) => void } } | undefined;
    waitUntil = platform?.context?.waitUntil?.bind(platform.context);
  } catch {
    // outside a request (cron, boot): nothing to extend
  }
  waitUntil?.(guarded);
}

/** No-ops at runtime; see the header comment. */
export function revalidatePath(_path?: string, _type?: 'page' | 'layout'): void {}
export function revalidateTag(_tag?: string): void {}

/** Redirect / 404 helpers with Next's signatures. */
export function redirect(location: string): never {
  kitRedirect(303, location);
}
export function permanentRedirect(location: string): never {
  kitRedirect(308, location);
}
export function notFound(): never {
  error(404, 'Not found');
}

/**
 * cache(fn): memoize per request. Keyed on the request event, so a
 * layout load, page load and remote calls in one request share one result;
 * outside a request it simply calls fn.
 */
export function cache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const perRequest = new WeakMap<object, Map<string, R>>();
  return (...args: A) => {
    let event: object;
    try {
      event = getRequestEvent();
    } catch {
      return fn(...args);
    }
    let memo = perRequest.get(event);
    if (!memo) perRequest.set(event, (memo = new Map()));
    const key = JSON.stringify(args);
    if (!memo.has(key)) memo.set(key, fn(...args));
    return memo.get(key)!;
  };
}

type CookieOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none' | boolean;
};

function serializeCookie(name: string, value: string, o: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge)}`);
  if (o.expires) parts.push(`Expires=${o.expires.toUTCString()}`);
  parts.push(`Path=${o.path ?? '/'}`);
  if (o.domain) parts.push(`Domain=${o.domain}`);
  if (o.httpOnly) parts.push('HttpOnly');
  if (o.secure) parts.push('Secure');
  if (o.sameSite) parts.push(`SameSite=${o.sameSite === true ? 'Strict' : o.sameSite[0].toUpperCase() + o.sameSite.slice(1)}`);
  return parts.join('; ');
}

/** A Response with a `cookies.set/delete` helper (what the Slack OAuth routes need). */
export class CookieResponse extends Response {
  readonly cookies = {
    set: (name: string, value: string, options?: CookieOptions) => {
      this.headers.append('set-cookie', serializeCookie(name, value, options));
    },
    delete: (name: string, options?: Pick<CookieOptions, 'path' | 'domain'>) => {
      this.headers.append('set-cookie', serializeCookie(name, '', { ...options, maxAge: 0 }));
    },
  };

  static json(body: unknown, init?: ResponseInit): CookieResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new CookieResponse(JSON.stringify(body), { ...init, headers });
  }

  static redirect(url: string | URL, init: number | ResponseInit = 307): CookieResponse {
    const status = typeof init === 'number' ? init : (init.status ?? 307);
    return new CookieResponse(null, { status, headers: { location: String(url) } });
  }
}
