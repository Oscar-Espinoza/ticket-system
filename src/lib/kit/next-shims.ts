// SvelteKit stand-ins for the few Next.js server APIs that src/lib and the
// server actions (src/app/actions) use. vite.config.ts aliases 'next/headers',
// 'next/cache', 'next/navigation', 'next/server' and React's `cache` to these
// while both apps live in the repo, so that shared server code runs unchanged
// under SvelteKit. At cutover the imports are rewritten to point here directly.
//
// Svelte-side code only: never imported by the Next app (tsconfig.json excludes
// src/lib/kit).

import { error, redirect as kitRedirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';

/** next/headers `headers()`: the current request's headers. */
export async function headers(): Promise<Headers> {
  return getRequestEvent().request.headers;
}

/** next/headers `cookies()`: a minimal adapter over SvelteKit's cookies. */
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
 * next/server `after(task)`: run work after the response. Vercel functions keep
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

/** next/cache: SvelteKit has no server cache to bust; clients re-fetch instead. */
export function revalidatePath(_path?: string, _type?: 'page' | 'layout'): void {}
export function revalidateTag(_tag?: string): void {}

/** next/navigation server helpers. */
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
 * React `cache(fn)`: memoize per request. Keyed on the request event, so a
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

/** next/server NextResponse: the subset the server code uses (json, redirect, res.cookies.set). */
export class NextResponse extends Response {
  readonly cookies = {
    set: (name: string, value: string, options?: CookieOptions) => {
      this.headers.append('set-cookie', serializeCookie(name, value, options));
    },
    delete: (name: string, options?: Pick<CookieOptions, 'path' | 'domain'>) => {
      this.headers.append('set-cookie', serializeCookie(name, '', { ...options, maxAge: 0 }));
    },
  };

  static json(body: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }

  static redirect(url: string | URL, init: number | ResponseInit = 307): NextResponse {
    const status = typeof init === 'number' ? init : (init.status ?? 307);
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
}
