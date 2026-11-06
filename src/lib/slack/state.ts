// OAuth `state` for the Slack install and account-link flows. The state is
// HMAC-signed (auth secret) and names the app user and purpose; its nonce is
// also set as an httpOnly cookie, so a callback only completes in the browser
// that started it (login-CSRF / link-hijack safe).

import { createHmac, randomBytes } from 'node:crypto';

import { appSecret, safeEqual } from '@/lib/server/secrets';

export type SlackOAuthPurpose = 'install' | 'link';

export const STATE_COOKIE = 'slack_oauth_nonce';
export const STATE_MAX_AGE_S = 10 * 60;

interface StatePayload {
  p: SlackOAuthPurpose;
  u: string;
  n: string;
  e: number;
}

const sign = (value: string) =>
  createHmac('sha256', appSecret('slack-dev-secret')).update(`slack-oauth:${value}`).digest('base64url');

export function createState(purpose: SlackOAuthPurpose, userId: string): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url');
  const payload: StatePayload = { p: purpose, u: userId, n: nonce, e: Date.now() + STATE_MAX_AGE_S * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { state: `${body}.${sign(body)}`, nonce };
}

export function readState(
  state: string | null,
  cookieNonce: string | undefined,
): { purpose: SlackOAuthPurpose; userId: string; nonce: string } | null {
  if (!state || !cookieNonce) return null;
  const [body, signature] = state.split('.');
  if (!body || !signature || !safeEqual(sign(body), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload;
    if (payload.p !== 'install' && payload.p !== 'link') return null;
    if (typeof payload.u !== 'string' || typeof payload.n !== 'string') return null;
    if (typeof payload.e !== 'number' || payload.e < Date.now()) return null;
    if (!safeEqual(payload.n, cookieNonce)) return null;
    return { purpose: payload.p, userId: payload.u, nonce: payload.n };
  } catch {
    return null;
  }
}
