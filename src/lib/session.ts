import { redirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';

import { auth } from '@/lib/auth';
import { headers } from '@/lib/kit/request';

export type SessionUser = NonNullable<App.Locals['user']>;

// The one place server code asks who the caller is. hooks.server.ts resolves
// the Better Auth session once per request into event.locals; this reads it
// back. Outside a hooked request (tests, scripts) it falls back to Better Auth.
export async function getSession() {
  let locals: App.Locals | undefined;
  try {
    locals = getRequestEvent().locals;
  } catch {
    locals = undefined;
  }
  if (locals && locals.user !== undefined) {
    return locals.user && locals.session ? { user: locals.user, session: locals.session } : null;
  }
  return auth.api.getSession({ headers: await headers() });
}

/**
 * The signed-in session, or a redirect to /login. The /dashboard guard in
 * hooks.server.ts already turns signed-out requests away (data requests
 * included); this is the typed, defence-in-depth read for loads that need it.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect(303, '/login');
  return session;
}

export async function requireUser(): Promise<SessionUser> {
  return (await requireSession()).user;
}
