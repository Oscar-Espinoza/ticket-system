// Server-side secret handling for every integration: access tokens encrypted at
// rest with Better Auth's symmetricEncrypt (keyed by BETTER_AUTH_SECRET, like
// OAuth tokens), random secrets, timing-safe comparison and HMAC signatures.
// Every webhook, OAuth-state and cron check compares secrets through safeEqual.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';

import { auth } from '@/lib/auth';

export async function encryptToken(token: string): Promise<string> {
  const { secretConfig } = await auth.$context;
  return symmetricEncrypt({ key: secretConfig, data: token });
}

/** null when the secret rotated or the row is corrupt — the UI offers to reconnect. */
export async function decryptToken(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  try {
    const { secretConfig } = await auth.$context;
    return await symmetricDecrypt({ key: secretConfig, data: stored });
  } catch (err) {
    console.error('[crypto] failed to decrypt a stored token', err);
    return null;
  }
}

export function newSecret(): string {
  return randomBytes(32).toString('hex');
}

/** Timing-safe string equality (hashing first makes the lengths equal). */
export function safeEqual(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** HMAC-SHA256 of `body` as hex, e.g. for `sha256=<hex>` signature headers. */
export function hmacHex(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/** Timing-safe check of a `<prefix><hex HMAC-SHA256 of payload>` signature header. */
export function verifyHmac(
  given: string | null | undefined,
  payload: string,
  secret: string,
  prefix = '',
): boolean {
  return safeEqual(given, `${prefix}${hmacHex(payload, secret)}`);
}

/**
 * The key for the app's own signed values (intake stamps, Slack OAuth state).
 * Without BETTER_AUTH_SECRET it falls back to `devFallback`, a public string.
 */
export function appSecret(devFallback: string): string {
  return process.env.BETTER_AUTH_SECRET || devFallback;
}
