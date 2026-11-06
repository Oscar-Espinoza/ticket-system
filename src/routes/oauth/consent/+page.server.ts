// OAuth consent screen. Better
// Auth's oauth-provider redirects here with a signed copy of the authorization
// request (`…&sig=…`); the Allow / Deny buttons post it back (the auth client
// attaches the signed query), and the plugin answers with the client's
// redirect URL. We only read the query to render the app and scopes — the
// plugin re-verifies the signature.

import { redirect } from '@sveltejs/kit';

import { getConsentClient } from '@/lib/public-links-read';
import type { PageServerLoad } from './$types';

/** The query regrouped by key (first-seen order), repeated values kept together. */
function toQuery(search: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of new Set(search.keys())) {
    for (const v of search.getAll(key)) params.append(key, v);
  }
  return params;
}

function hostOf(uri: string | null): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).host || uri;
  } catch {
    return null;
  }
}

/** The signed query's `exp` (unix seconds) is still in the future. */
function notExpired(exp: string | null): boolean {
  const seconds = Number(exp);
  return Number.isFinite(seconds) && seconds * 1000 > Date.now();
}

export const load: PageServerLoad = async ({ url, locals }) => {
  const query = toQuery(url.searchParams);
  const user = locals.user;
  // Signed out (e.g. the session expired mid-flow): log in with the same
  // signed query — the auth client resumes the authorization afterwards.
  if (!user) redirect(303, `/login?${query.toString()}`);

  const clientId = query.get('client_id');
  const valid = !!clientId && !!query.get('sig') && notExpired(query.get('exp'));

  const client = valid ? await getConsentClient(clientId) : undefined;

  const scopes = [...new Set((query.get('scope') ?? '').split(' ').filter(Boolean))];

  return {
    app:
      client && !client.disabled
        ? {
            name: client.name ?? 'Untitled app',
            icon: client.icon,
            uri: client.uri,
            policy: client.policy,
            tos: client.tos,
          }
        : null,
    scopes,
    user: { name: user.name, email: user.email, image: user.image ?? null },
    redirectHost: hostOf(query.get('redirect_uri')),
  };
};
