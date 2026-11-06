// Intake form anti-spam helpers. Server-only.
//
// The public form carries a render-time stamp signed with the auth secret, so a
// bot can't fake "the page was open for a while": a submission faster than
// MIN_FILL_MS (or with a bad stamp) is treated as spam.

import { createHmac, randomBytes } from 'node:crypto';

import { appSecret, safeEqual } from '@/lib/server/secrets';

export const MIN_FILL_MS = 3000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const sign = (value: string) =>
  createHmac('sha256', appSecret('intake-dev-secret')).update(`intake:${value}`).digest('base64url');

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
  if (!safeEqual(sign(time), signature)) return 'invalid';
  const age = now - Number(time);
  if (age < MIN_FILL_MS) return 'too-fast';
  if (age > MAX_AGE_MS) return 'expired';
  return 'ok';
}
