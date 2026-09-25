// Slack request signing (https://api.slack.com/authentication/verifying-requests-from-slack):
// X-Slack-Signature = "v0=" + hex(HMAC-SHA256(signing secret, "v0:{timestamp}:{raw body}")).
// Old timestamps are rejected so a captured request can't be replayed.

import { createHmac, timingSafeEqual } from 'node:crypto';

import { slackConfig } from './config';

const MAX_AGE_S = 5 * 60;
const MAX_BODY = 1024 * 1024;

export function verifySlackSignature(
  secret: string,
  body: string,
  timestamp: string | null,
  signature: string | null,
  now = Date.now(),
): boolean {
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_AGE_S) return false;
  const expected = Buffer.from(
    `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`,
  );
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Reads and verifies a Slack request. Returns the raw body, or a Response to
 * send back as-is (app not configured / bad signature / oversized).
 */
export async function readSlackRequest(request: Request): Promise<string | Response> {
  const config = slackConfig();
  if (!config) return new Response('Slack app not configured', { status: 503 });
  const body = await request.text();
  if (body.length > MAX_BODY) return new Response('Payload too large', { status: 413 });
  const ok = verifySlackSignature(
    config.signingSecret,
    body,
    request.headers.get('x-slack-request-timestamp'),
    request.headers.get('x-slack-signature'),
  );
  return ok ? body : new Response('Invalid signature', { status: 401 });
}
