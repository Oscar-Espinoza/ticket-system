// Intake form anti-spam helpers. Server-only.
//
// The public form carries a render-time stamp signed with the auth secret, so a
// bot can't fake "the page was open for a while": a submission faster than
// MIN_FILL_MS (or with a bad stamp) is treated as spam.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const MIN_FILL_MS = 3000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const secret = () => process.env.BETTER_AUTH_SECRET || 'intake-dev-secret';

const sign = (value: string) =>
  createHmac('sha256', secret()).update(`intake:${value}`).digest('base64url');

export function generateIntakeToken(): string {
  return randomBytes(18).toString('base64url');
}

export function signFormStamp(now = Date.now()): string {
  return `${now}.${sign(String(now))}`;
}

export type StampCheck = 'ok' | 'too-fast' | 'expired' | 'invalid';

export function checkFormStamp(stamp: unknown, now = Date.now()): StampCheck {
  if (typeof stamp !== 'string') return 'invalid';
  const [time, signature] = stamp.split('.');
  if (!time || !signature || !/^\d{1,15}$/.test(time)) return 'invalid';
  const expected = Buffer.from(sign(time));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
  const age = now - Number(time);
  if (age < MIN_FILL_MS) return 'too-fast';
  if (age > MAX_AGE_MS) return 'expired';
  return 'ok';
}
