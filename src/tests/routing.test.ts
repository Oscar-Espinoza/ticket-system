// Protected-route redirect test (AUTH-03 routing behavior, D-10).
//
// The security boundary for /dashboard is the SERVER-SIDE layout load
// (src/routes/dashboard/+layout.server.ts), backed by the page-request guard in
// src/hooks.server.ts. The load reads the session from the request headers and,
// when there is none, throws SvelteKit's redirect(303, '/login').
//
// We stub the request headers to be empty (no session cookie) and call the real
// load: the real getSession sees no cookie and resolves null, and the real
// redirect() throws — this verifies the actual guard, not a mock.

import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  headers: async () => new Headers(),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
}));

const { load } = await import('../routes/dashboard/+layout.server');

describe('Protected route guard (AUTH-03 routing, D-10)', () => {
  it('redirects an unauthenticated request to /dashboard to /login (server-side)', async () => {
    const invoke = () => (load as unknown as (event: object) => Promise<unknown>)({});
    await expect(invoke()).rejects.toSatisfy(
      (error: unknown) => isRedirect(error) && error.location === '/login' && error.status === 303,
    );
  });
});
