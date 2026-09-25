// GitHub access-token accessor — the SINGLE token-read seam (D-04).
//
// This is the ONLY place in src/lib or src/app that reads
// `account.accessToken`. Better Auth encrypts tokens at rest
// (`account.encryptOAuthTokens` in src/lib/auth.ts, AES-256-GCM keyed by
// BETTER_AUTH_SECRET); the decrypt happens here, so callers never see
// ciphertext and never touch the column themselves.
//
// Server-only by construction: imports `db` (neon-http) which reads
// DATABASE_URL and must never run in the browser. Only ever import this from
// server components / route handlers / server actions. The dashboard derives a
// boolean connection status via isGitHubConnected() below (which never selects
// the token).

import { and, eq } from 'drizzle-orm';
import { symmetricDecrypt } from 'better-auth/crypto';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { accounts } from '@/db/schema';

// Mirrors Better Auth's own isLikelyEncrypted(): versioned envelopes start with
// `$ba$`, legacy ciphertext is hex. Plaintext GitHub tokens (`gho_…`) are
// neither, so rows stored before encryption was enabled keep working.
function isEncrypted(token: string): boolean {
  return token.startsWith('$ba$') || (token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token));
}

/**
 * Reads the stored GitHub OAuth access token for a user.
 *
 * @param userId - the Better Auth user id.
 * @returns the access token string, or null when the user has no linked
 *          GitHub account (or the linked account stored no token).
 */
export async function getGitHubToken(userId: string): Promise<string | null> {
  const [account] = await db
    .select({ accessToken: accounts.accessToken })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'github')))
    .limit(1);

  const stored = account?.accessToken;
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored;
  try {
    const { secretConfig } = await auth.$context;
    return await symmetricDecrypt({ key: secretConfig, data: stored });
  } catch (err) {
    // Rotated secret / corrupted row: behave as "not connected" so the UI
    // offers to reconnect instead of failing every GitHub call.
    console.error('[github-token] failed to decrypt token', err);
    return null;
  }
}

/**
 * Derives whether a user has a linked GitHub account, from the account table
 * at call time (D-05 — never from the session JWT).
 *
 * Deliberately selects only `account.id` (NOT accessToken) so connection
 * status can never leak the token: this is the boolean seam the dashboard
 * renders. getGitHubToken() above remains the single token-read site (D-04).
 *
 * @param userId - the Better Auth user id.
 * @returns true iff an account row with providerId === 'github' exists.
 */
export async function isGitHubConnected(userId: string): Promise<boolean> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'github')))
    .limit(1);

  return account != null;
}
