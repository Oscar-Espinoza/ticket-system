// Slack app configuration: env, the request URLs Slack must be pointed at, and
// an app manifest that wires them all up in one paste. Server-only (reads env).
//
// This is the Slack *app* (OAuth + bot token: Asks, DMs). B11's per-project
// incoming webhook (src/lib/integrations/slack.ts) is separate and needs none of it.

import { appUrl } from '@/lib/integrations/app-url';

export const BOT_SCOPES = ['commands', 'chat:write', 'users:read', 'users:read.email', 'im:write'];
/** Only for "Sign in with Slack" (OpenID Connect) account linking. */
export const USER_SCOPES = ['openid'];

export const ASK_COMMAND = '/ask';
export const MESSAGE_SHORTCUT_ID = 'create_issue';
export const ASK_VIEW_ID = 'ask_create';

export interface SlackAppConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
}

export function slackConfig(): SlackAppConfig | null {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!clientId || !clientSecret || !signingSecret) return null;
  return { clientId, clientSecret, signingSecret };
}

export function slackUrls() {
  const origin = appUrl();
  return {
    redirect: `${origin}/api/slack/oauth/callback`,
    commands: `${origin}/api/slack/commands`,
    interactivity: `${origin}/api/slack/interactivity`,
    events: `${origin}/api/slack/events`,
  };
}

/** Paste into api.slack.com/apps → Create New App → From an app manifest (JSON). */
export function slackManifest(): string {
  const urls = slackUrls();
  const manifest = {
    display_information: {
      name: 'Tickets',
      description: 'File issues from Slack and get notified in DMs.',
    },
    features: {
      bot_user: { display_name: 'Tickets', always_online: false },
      slash_commands: [
        {
          command: ASK_COMMAND,
          url: urls.commands,
          description: 'File an issue',
          usage_hint: '[what needs doing]',
          should_escape: false,
        },
      ],
      shortcuts: [
        {
          name: 'Create issue',
          type: 'message',
          callback_id: MESSAGE_SHORTCUT_ID,
          description: 'File this message as an issue',
        },
      ],
    },
    oauth_config: {
      redirect_urls: [urls.redirect],
      scopes: { bot: BOT_SCOPES, user: USER_SCOPES },
    },
    settings: {
      event_subscriptions: {
        request_url: urls.events,
        bot_events: ['app_uninstalled', 'tokens_revoked'],
      },
      interactivity: { is_enabled: true, request_url: urls.interactivity },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };
  return JSON.stringify(manifest, null, 2);
}
