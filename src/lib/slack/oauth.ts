// Starts the Slack OAuth flows (install = OAuth v2 bot install, link = Sign in
// with Slack / OpenID Connect) from a signed-in browser session. Both return to
// the shared callback, which tells them apart by the signed state.

import { NextResponse } from 'next/server';

import { getSession } from '@/lib/session';
import { appUrl } from '@/lib/integrations/app-url';

import { BOT_SCOPES, slackConfig, slackUrls } from './config';
import { createState, STATE_COOKIE, STATE_MAX_AGE_S, type SlackOAuthPurpose } from './state';

export const SETTINGS_PATH = '/dashboard/settings/slack';
const COOKIE_PATH = '/api/slack';

export function settingsRedirect(params: Record<string, string>): NextResponse {
  const url = new URL(SETTINGS_PATH, appUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, '', { path: COOKIE_PATH, maxAge: 0 });
  return res;
}

export async function startSlackOAuth(purpose: SlackOAuthPurpose): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(SETTINGS_PATH)}`, appUrl()));
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
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('nonce', nonce);
  }

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: appUrl().startsWith('https://'),
    // Lax: the cookie must survive Slack's top-level redirect back to us.
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: STATE_MAX_AGE_S,
  });
  return res;
}
