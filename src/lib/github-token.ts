// GitHub access-token accessor — the SINGLE token-read seam (D-04).
//
// This is the ONLY place in src/lib or src/app that reads
// `account.accessToken`. Centralizing the read here means Phase 7's
// AES-256-GCM encryption-at-rest is a localized change: the encrypt-on-write
// and decrypt-on-read logic lands inside this accessor (and the matching
// write path) without touching any caller.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PHASE 7 AES-256-GCM SEAM (D-04):                                          │
// │   When token encryption-at-rest is introduced, decrypt the stored value   │
// │   HERE before returning it. Do NOT read account.accessToken anywhere else.│
// └─────────────────────────────────────────────────────────────────────────┘
//
// Server-only by construction: imports `db` (neon-http) which reads
// DATABASE_URL and must never run in the browser. Only ever import this from
// server components / route handlers / server actions. This accessor returns
// the raw token string and is reserved for Phase 7+ server actions that
// actually call the GitHub API; the dashboard derives a boolean connection
// status via isGitHubConnected() below (which never selects the token).

import { db } from '@/lib/db';
import { accounts } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

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

  return account?.accessToken ?? null;
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
