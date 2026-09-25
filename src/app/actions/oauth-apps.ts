'use server';

// OAuth apps (third-party clients of our OAuth 2.0 provider) and the apps a
// user has authorized. Client CRUD goes through Better Auth's oauth-provider
// endpoints with the request headers, so the plugin itself enforces ownership
// and hashes secrets; we validate input first for friendly errors. The
// plaintext client secret is returned exactly once (create / rotate).

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, count, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from '@/db/schema';
import { getSession } from '@/lib/session';
import {
  APP_NAME_MAX,
  OAUTH_APP_SCOPES,
  REDIRECT_URIS_MAX,
  type OAuthAppView,
} from '@/components/oauth/oauth-model';

type Field = 'name' | 'redirectUris' | 'logoUrl' | 'homepageUrl';
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: Field };

const APPS_MAX = 20;
const URL_MAX = 500;
const PAGE = '/dashboard/settings/oauth-apps';

async function sessionUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/** Better Auth APIError → message (their body carries error_description / message). */
function authErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'body' in err) {
    const body = (err as { body?: { error_description?: unknown; message?: unknown } }).body;
    const text = body?.error_description ?? body?.message;
    if (typeof text === 'string' && text) return text;
  }
  return fallback;
}

function optionalUrl(raw: unknown, field: Field, label: string, httpsOnly: boolean): Result<{ url?: string }> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { ok: true };
  if (value.length > URL_MAX) return { ok: false, error: `${label} is too long.`, field };
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && (httpsOnly || url.protocol !== 'http:')) {
      return { ok: false, error: `${label} must use https.`, field };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: `${label} must be a valid URL.`, field };
  }
}

function parseRedirectUris(raw: unknown): Result<{ uris: string[] }> {
  const field = 'redirectUris' as const;
  const lines = (typeof raw === 'string' ? raw : '')
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const uris = [...new Set(lines)];
  if (uris.length === 0) return { ok: false, error: 'Add at least one redirect URI.', field };
  if (uris.length > REDIRECT_URIS_MAX) {
    return { ok: false, error: `At most ${REDIRECT_URIS_MAX} redirect URIs.`, field };
  }
  for (const uri of uris) {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      return { ok: false, error: `“${uri}” is not a valid URL.`, field };
    }
    if (uri.length > URL_MAX) return { ok: false, error: 'Redirect URI is too long.', field };
    if (url.hash || uri.includes('#')) {
      return { ok: false, error: 'Redirect URIs can’t contain a #fragment.', field };
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
    if (url.protocol === 'http:' && !loopback) {
      return { ok: false, error: 'Redirect URIs must use https (http only for localhost).', field };
    }
    if (['javascript:', 'data:', 'vbscript:', 'file:'].includes(url.protocol)) {
      return { ok: false, error: `“${url.protocol}” redirect URIs aren’t allowed.`, field };
    }
  }
  return { ok: true, uris };
}

export async function createOAuthApp(input: {
  name: string;
  redirectUris: string;
  logoUrl?: string;
  homepageUrl?: string;
  kind: 'confidential' | 'public';
}): Promise<Result<{ app: OAuthAppView; clientSecret: string | null }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, error: 'Name is required.', field: 'name' };
  if (name.length > APP_NAME_MAX) {
    return { ok: false, error: `Name must be ${APP_NAME_MAX} characters or fewer.`, field: 'name' };
  }
  const redirects = parseRedirectUris(input.redirectUris);
  if (!redirects.ok) return redirects;
  const logo = optionalUrl(input.logoUrl, 'logoUrl', 'Logo URL', true);
  if (!logo.ok) return logo;
  const homepage = optionalUrl(input.homepageUrl, 'homepageUrl', 'Homepage', false);
  if (!homepage.ok) return homepage;
  const isPublic = input.kind === 'public';

  const [{ total }] = await db
    .select({ total: count() })
    .from(oauthClients)
    .where(eq(oauthClients.userId, userId));
  if (total >= APPS_MAX) return { ok: false, error: `You can register at most ${APPS_MAX} apps.` };

  try {
    const created = await auth.api.createOAuthClient({
      headers: await headers(),
      body: {
        client_name: name,
        redirect_uris: redirects.uris,
        ...(logo.url ? { logo_uri: logo.url } : {}),
        ...(homepage.url ? { client_uri: homepage.url } : {}),
        scope: OAUTH_APP_SCOPES.join(' '),
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: isPublic ? 'none' : 'client_secret_basic',
        ...(isPublic ? {} : { type: 'web' as const }),
      },
    });
    revalidatePath(PAGE);
    return {
      ok: true,
      clientSecret: created.client_secret ?? null,
      app: {
        clientId: created.client_id,
        name,
        icon: logo.url ?? null,
        uri: homepage.url ?? null,
        redirectUris: redirects.uris,
        isPublic,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { ok: false, error: authErrorMessage(err, 'Could not register the app.') };
  }
}

export async function rotateOAuthAppSecret(input: {
  clientId: string;
}): Promise<Result<{ clientSecret: string }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  if (typeof input?.clientId !== 'string') return { ok: false, error: 'App not found.' };
  try {
    const rotated = await auth.api.rotateClientSecret({
      headers: await headers(),
      body: { client_id: input.clientId },
    });
    if (!rotated.client_secret) return { ok: false, error: 'Public apps have no secret.' };
    return { ok: true, clientSecret: rotated.client_secret };
  } catch (err) {
    return { ok: false, error: authErrorMessage(err, 'Could not rotate the secret.') };
  }
}

export async function deleteOAuthApp(input: { clientId: string }): Promise<Result> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  if (typeof input?.clientId !== 'string') return { ok: false, error: 'App not found.' };
  try {
    // Tokens and consents cascade with the client row.
    await auth.api.deleteOAuthClient({
      headers: await headers(),
      body: { client_id: input.clientId },
    });
    revalidatePath(PAGE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: authErrorMessage(err, 'Could not delete the app.') };
  }
}

/**
 * Revoke an app the user authorized: drop the consent AND every token the app
 * holds for this user (the plugin's delete-consent leaves tokens alive).
 */
export async function revokeOAuthConsent(input: { id: string }): Promise<Result> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  if (typeof input?.id !== 'string') return { ok: false, error: 'Authorization not found.' };

  const [consent] = await db
    .select({ clientId: oauthConsents.clientId })
    .from(oauthConsents)
    .where(and(eq(oauthConsents.id, input.id), eq(oauthConsents.userId, userId)))
    .limit(1);
  if (!consent) return { ok: false, error: 'Authorization not found.' };

  const { clientId } = consent;
  // Access tokens first: they reference refresh tokens.
  await db.batch([
    db
      .delete(oauthAccessTokens)
      .where(and(eq(oauthAccessTokens.clientId, clientId), eq(oauthAccessTokens.userId, userId))),
    db
      .delete(oauthRefreshTokens)
      .where(and(eq(oauthRefreshTokens.clientId, clientId), eq(oauthRefreshTokens.userId, userId))),
    db
      .delete(oauthConsents)
      .where(and(eq(oauthConsents.clientId, clientId), eq(oauthConsents.userId, userId))),
  ]);
  revalidatePath(PAGE);
  return { ok: true };
}
