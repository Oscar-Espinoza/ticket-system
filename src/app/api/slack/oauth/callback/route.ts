// Shared OAuth redirect for the Slack install (OAuth v2 → bot token) and the
// account link (OpenID Connect → Slack identity). Trusts nothing from the query
// until the signed state matches this browser's nonce cookie and the current
// session user; the Slack identity then comes straight from Slack's token
// endpoint over TLS (client-secret authenticated), so it can be relied on.

import type { NextRequest } from 'next/server';

import { getSession } from '@/lib/session';
import { exchangeInstallCode, exchangeOpenIdCode } from '@/lib/slack/api';
import { slackConfig } from '@/lib/slack/config';
import { getInstallation, linkSlackUser, saveInstallation } from '@/lib/slack/installations';
import { settingsRedirect } from '@/lib/slack/oauth';
import { readState, STATE_COOKIE } from '@/lib/slack/state';

const fail = (reason: string) => settingsRedirect({ slack: 'error', reason });

function jwtClaims(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = readState(params.get('state'), request.cookies.get(STATE_COOKIE)?.value);
  if (!state) return fail('state');
  const session = await getSession();
  if (!session?.user || session.user.id !== state.userId) return fail('session');

  // The user pressed Cancel on Slack's consent screen.
  if (params.get('error')) return fail('denied');
  const code = params.get('code');
  const config = slackConfig();
  if (!code || !config) return fail(config ? 'denied' : 'not_configured');

  try {
    if (state.purpose === 'install') {
      const res = await exchangeInstallCode(code);
      const team = res.team as { id?: string; name?: string } | null | undefined;
      const authed = res.authed_user as { id?: string } | undefined;
      if (!res.ok || typeof res.access_token !== 'string' || !team?.id) {
        console.error('[slack] oauth.v2.access failed', res.error);
        return fail(res.is_enterprise_install ? 'enterprise' : 'exchange');
      }
      await saveInstallation({
        teamId: team.id,
        teamName: team.name ?? null,
        token: res.access_token,
        botUserId: typeof res.bot_user_id === 'string' ? res.bot_user_id : null,
        installedById: state.userId,
      });
      // The installer just proved their Slack identity: link them too.
      if (authed?.id) await linkSlackUser(state.userId, team.id, authed.id);
      return settingsRedirect({ slack: 'installed' });
    }

    const res = await exchangeOpenIdCode(code);
    const claims = res.ok ? jwtClaims(res.id_token) : null;
    const teamId = claims?.['https://slack.com/team_id'];
    const slackUserId = claims?.['https://slack.com/user_id'];
    const aud = claims?.aud;
    if (
      !claims ||
      claims.iss !== 'https://slack.com' ||
      !(aud === config.clientId || (Array.isArray(aud) && aud.includes(config.clientId))) ||
      claims.nonce !== state.nonce ||
      typeof teamId !== 'string' ||
      typeof slackUserId !== 'string'
    ) {
      console.error('[slack] openid.connect.token failed', res.error);
      return fail('exchange');
    }
    if (!(await getInstallation(teamId))) return fail('not_installed');
    await linkSlackUser(state.userId, teamId, slackUserId);
    return settingsRedirect({ slack: 'linked' });
  } catch (err) {
    console.error('[slack] oauth callback failed', err);
    return fail('exchange');
  }
}
