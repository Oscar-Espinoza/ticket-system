// Integration access tokens encrypted at rest with Better Auth's symmetricEncrypt
// (keyed by BETTER_AUTH_SECRET, like OAuth tokens). Secrets and signatures live
// in ./secrets.

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
