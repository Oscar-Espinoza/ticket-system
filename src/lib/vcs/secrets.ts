// Integration secrets. Access tokens are encrypted at rest with Better Auth's
// symmetricEncrypt (keyed by BETTER_AUTH_SECRET, like OAuth tokens); webhook
// secrets are compared timing-safely. Server-only.

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
    console.error('[vcs] failed to decrypt an integration token', err);
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
