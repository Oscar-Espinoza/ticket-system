// OAuth apps (third-party clients of our OAuth 2.0 provider) and the apps a
// user has authorized. Client CRUD goes through Better Auth's oauth-provider
// endpoints with the request headers, so the plugin itself enforces ownership
// and hashes secrets; we validate input first for friendly errors. The
// plaintext client secret is returned exactly once (create / rotate).

import { headers } from '@/lib/kit/request';
import { and, count, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from '@/db/schema';
import {
  fail,
  isFail,
  NOT_AUTHENTICATED,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';
import { sessionUserId } from '@/lib/session';
import {
  APP_NAME_MAX,
  CLIENT_URI_MAX,
  httpsUrl,
  OAUTH_APP_SCOPES,
  REDIRECT_URIS_MAX,
  type OAuthAppView,
} from '@/lib/oauth-model';

type Field = 'name' | 'redirectUris' | 'logoUrl' | 'homepageUrl';
type Result<T = object> = ActionResult<T, Field>;

const APPS_MAX = 20;
const URL_MAX = 500;

/** Better Auth APIError → message (their body carries error_description / message). */
function authErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'body' in err) {
    const body = (err as { body?: { error_description?: unknown; message?: unknown } }).body;
    const text = body?.error_description ?? body?.message;
    if (typeof text === 'string' && text) return text;
  }
  return fallback;
}

/** Logo / homepage: the rule every client write path shares (httpsUrl in oauth-model.ts). */
function optionalUrl(raw: unknown, field: Field, label: string): Result<{ url?: string }> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { ok: true };
  if (value.length > CLIENT_URI_MAX) return fail(`${label} is too long.`, field);
  const url = httpsUrl(value);
  return url ? { ok: true, url } : fail(`${label} must be an https URL.`, field);
}

function parseRedirectUris(raw: unknown): Result<{ uris: string[] }> {
  const field = 'redirectUris' as const;
  const lines = (typeof raw === 'string' ? raw : '')
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const uris = [...new Set(lines)];
  if (uris.length === 0) return fail('Add at least one redirect URI.', field);
  if (uris.length > REDIRECT_URIS_MAX) {
    return fail(`At most ${REDIRECT_URIS_MAX} redirect URIs.`, field);
  }
  for (const uri of uris) {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      return fail(`“${uri}” is not a valid URL.`, field);
    }
    if (uri.length > URL_MAX) return fail('Redirect URI is too long.', field);
    if (url.hash || uri.includes('#')) {
      return fail('Redirect URIs can’t contain a #fragment.', field);
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
    if (url.protocol === 'http:' && !loopback) {
      return fail('Redirect URIs must use https (http only for localhost).', field);
    }
    if (['javascript:', 'data:', 'vbscript:', 'file:'].includes(url.protocol)) {
      return fail(`“${url.protocol}” redirect URIs aren’t allowed.`, field);
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
  if (!userId) return NOT_AUTHENTICATED;

  const name = requiredText(input?.name, 'name', APP_NAME_MAX);
  if (isFail(name)) return name;
  const redirects = parseRedirectUris(input.redirectUris);
  if (!redirects.ok) return redirects;
  const logo = optionalUrl(input.logoUrl, 'logoUrl', 'Logo URL');
  if (!logo.ok) return logo;
  const homepage = optionalUrl(input.homepageUrl, 'homepageUrl', 'Homepage');
  if (!homepage.ok) return homepage;
  const isPublic = input.kind === 'public';

  const [{ total }] = await db
    .select({ total: count() })
    .from(oauthClients)
    .where(eq(oauthClients.userId, userId));
  if (total >= APPS_MAX) return fail(`You can register at most ${APPS_MAX} apps.`);

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
    refreshesData();
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
    return fail(authErrorMessage(err, 'Could not register the app.'));
  }
}

export async function rotateOAuthAppSecret(input: {
  clientId: string;
}): Promise<Result<{ clientSecret: string }>> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof input?.clientId !== 'string') return fail('App not found.');
  try {
    const rotated = await auth.api.rotateClientSecret({
      headers: await headers(),
      body: { client_id: input.clientId },
    });
    if (!rotated.client_secret) return fail('Public apps have no secret.');
    return { ok: true, clientSecret: rotated.client_secret };
  } catch (err) {
    return fail(authErrorMessage(err, 'Could not rotate the secret.'));
  }
}

export async function deleteOAuthApp(input: { clientId: string }): Promise<Result> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof input?.clientId !== 'string') return fail('App not found.');
  try {
    // Tokens and consents cascade with the client row.
    await auth.api.deleteOAuthClient({
      headers: await headers(),
      body: { client_id: input.clientId },
    });
    refreshesData();
    return { ok: true };
  } catch (err) {
    return fail(authErrorMessage(err, 'Could not delete the app.'));
  }
}

/**
 * Revoke an app the user authorized: drop the consent AND every token the app
 * holds for this user (the plugin's delete-consent leaves tokens alive).
 */
export async function revokeOAuthConsent(input: { id: string }): Promise<Result> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof input?.id !== 'string') return fail('Authorization not found.');

  const [consent] = await db
    .select({ clientId: oauthConsents.clientId })
    .from(oauthConsents)
    .where(and(eq(oauthConsents.id, input.id), eq(oauthConsents.userId, userId)))
    .limit(1);
  if (!consent) return fail('Authorization not found.');

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
  refreshesData();
  return { ok: true };
}
