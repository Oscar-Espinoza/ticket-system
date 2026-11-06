// GitHub access-token accessor — the single place that reads
// `account.accessToken`. Better Auth encrypts tokens at rest
// (`account.encryptOAuthTokens` in src/lib/auth.ts, AES-256-GCM keyed by
// BETTER_AUTH_SECRET); the decrypt happens here, so callers never see
// ciphertext and never touch the column themselves.
//
// Server-only (reads the database). The dashboard derives a boolean connection
// status via isGitHubConnected() below, which never selects the token.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { accounts } from '@/db/schema';
import { decryptToken } from '@/lib/server/crypto';

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
  // Rotated secret / corrupted row: null behaves as "not connected", so the UI
  // offers to reconnect instead of failing every GitHub call.
  return decryptToken(stored);
}

/**
 * Derives whether a user has a linked GitHub account, from the account table
 * at call time (never from the session JWT).
 *
 * Deliberately selects only `account.id` (NOT accessToken) so connection
 * status can never leak the token.
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
