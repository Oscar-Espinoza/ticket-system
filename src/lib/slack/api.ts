// Minimal Slack Web API client. Every method accepts form-encoded bodies (JSON
// bodies only work for write methods), so everything goes as a form with
// nested values (views, blocks) JSON-encoded. Never throws: network errors,
// timeouts and HTTP 429 come back as { ok: false, error }.

import { slackConfig, slackUrls } from './config';

const TIMEOUT_MS = 3000;

export type SlackResponse = { ok: boolean; error?: string } & Record<string, unknown>;

type Params = Record<string, unknown>;

function form(params: Params): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return body;
}

async function post(url: string, params: Params, token?: string): Promise<SlackResponse> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form(params),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Rate limited: callers skip rather than retry (Retry-After can be a minute).
    if (res.status === 429) return { ok: false, error: 'ratelimited' };
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return (await res.json()) as SlackResponse;
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

export function slackApi(method: string, token: string, params: Params = {}): Promise<SlackResponse> {
  return post(`https://slack.com/api/${method}`, params, token);
}

/** Posts to an interaction's response_url (valid 30 min, 5 uses). */
export async function respond(responseUrl: string, message: Params): Promise<boolean> {
  // Only ever Slack's own hooks: the URL came from a verified payload, but be strict.
  if (!responseUrl.startsWith('https://hooks.slack.com/')) return false;
  try {
    const res = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** OAuth v2 install: code → bot token (https://api.slack.com/methods/oauth.v2.access). */
export async function exchangeInstallCode(code: string): Promise<SlackResponse> {
  const config = slackConfig();
  if (!config) return { ok: false, error: 'not_configured' };
  return post('https://slack.com/api/oauth.v2.access', {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: slackUrls().redirect,
  });
}

/** Sign in with Slack (OpenID Connect): code → id_token. */
export async function exchangeOpenIdCode(code: string): Promise<SlackResponse> {
  const config = slackConfig();
  if (!config) return { ok: false, error: 'not_configured' };
  return post('https://slack.com/api/openid.connect.token', {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: slackUrls().redirect,
  });
}
