// Starts the Slack OAuth flows (install = OAuth v2 bot install, link = Sign in
// with Slack / OpenID Connect) from a signed-in browser session. Both return to
// the shared callback, which tells them apart by the signed state.

import { getRequestEvent } from '$app/server';

import { getSession } from '@/lib/session';
import { appUrl } from '@/lib/integrations/app-url';

import { BOT_SCOPES, SLACK_SETTINGS_PATH, slackConfig, slackUrls, USER_SCOPES } from './config';
import { createState, STATE_COOKIE, STATE_MAX_AGE_S, type SlackOAuthPurpose } from './state';

const COOKIE_PATH = '/api/slack';

const redirectTo = (url: URL) => new Response(null, { status: 307, headers: { location: String(url) } });

export function settingsRedirect(params: Record<string, string>): Response {
  const url = new URL(SLACK_SETTINGS_PATH, appUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  // Explicit false: Kit's defaults (HttpOnly, Secure, SameSite=Lax) would otherwise be added to the expiry.
  getRequestEvent().cookies.set(STATE_COOKIE, '', {
    path: COOKIE_PATH,
    maxAge: 0,
    httpOnly: false,
    secure: false,
    sameSite: false,
  });
  return redirectTo(url);
}

export async function startSlackOAuth(purpose: SlackOAuthPurpose): Promise<Response> {
  const session = await getSession();
  if (!session?.user) {
    return redirectTo(new URL(`/login?redirect=${encodeURIComponent(SLACK_SETTINGS_PATH)}`, appUrl()));
  }
  const config = slackConfig();
  if (!config) return settingsRedirect({ slack: 'error', reason: 'not_configured' });

  const { state, nonce } = createState(purpose, session.user.id);
  const url =
    purpose === 'install'
      ? new URL('https://slack.com/oauth/v2/authorize')
      : new URL('https://slack.com/openid/connect/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', slackUrls().redirect);
  url.searchParams.set('state', state);
  if (purpose === 'install') {
    url.searchParams.set('scope', BOT_SCOPES.join(','));
  } else {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', USER_SCOPES.join(' '));
    url.searchParams.set('nonce', nonce);
  }

  getRequestEvent().cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: appUrl().startsWith('https://'),
    // Lax: the cookie must survive Slack's top-level redirect back to us.
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: STATE_MAX_AGE_S,
  });
  return redirectTo(url);
}
