// OAuth consent screen (D10a). Better Auth's oauth-provider redirects here with
// a signed copy of the authorization request (`…&sig=…`); the Allow / Deny
// buttons post it back (the auth client attaches the signed query), and the
// plugin answers with the client's redirect URL. We only read the query to
// render the app and scopes — the plugin re-verifies the signature.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { oauthClients } from '@/db/schema';
import { ConsentForm } from '@/components/oauth/consent-form';
import { Wordmark } from '@/components/wordmark';

export const metadata: Metadata = { title: 'Authorize app' };

type Search = Record<string, string | string[] | undefined>;

function toQuery(search: Search): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, v);
    }
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

export default async function OAuthConsentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [session, search] = await Promise.all([getSession(), searchParams]);
  const query = toQuery(search);
  // Signed out (e.g. the session expired mid-flow): log in with the same
  // signed query — the auth client resumes the authorization afterwards.
  if (!session?.user) redirect(`/login?${query.toString()}`);

  const clientId = query.get('client_id');
  const valid = !!clientId && !!query.get('sig') && notExpired(query.get('exp'));

  const [client] = valid
    ? await db
        .select({
          name: oauthClients.name,
          icon: oauthClients.icon,
          uri: oauthClients.uri,
          policy: oauthClients.policy,
          tos: oauthClients.tos,
          disabled: oauthClients.disabled,
        })
        .from(oauthClients)
        .where(eq(oauthClients.clientId, clientId))
        .limit(1)
    : [];

  const scopes = [...new Set((query.get('scope') ?? '').split(' ').filter(Boolean))];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
      <Wordmark />
      <ConsentForm
        app={
          client && !client.disabled
            ? {
                name: client.name ?? 'Untitled app',
                icon: client.icon,
                uri: client.uri,
                policy: client.policy,
                tos: client.tos,
              }
            : null
        }
        scopes={scopes}
        user={{ name: session.user.name, email: session.user.email, image: session.user.image ?? null }}
        redirectHost={hostOf(query.get('redirect_uri'))}
      />
    </div>
  );
}
