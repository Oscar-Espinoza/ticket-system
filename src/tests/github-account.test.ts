// Integration tests for the GitHub-account seam (AUTH-02 support).
//
// Exercises the two account-derived helpers in src/lib/github-token.ts against
// the live Neon database (db / neon-http):
//   - getGitHubToken(userId)   -> the stored access token, or null (D-04 seam)
//   - isGitHubConnected(userId) -> boolean from the account table (D-05)
//
// We insert user + account rows directly (no real OAuth flow — that is the
// manual smoke test in Plan 03 Task 2). Real OAuth consent cannot be automated.
//
// Conventions (per Plan 01-02 + Wave 1 lessons):
//   - Unique ids per run so reruns never collide.
//   - afterEach deletes any user rows created by the run (account rows
//     cascade-delete via their FK to user).
//   - NODE_ENV=test; .env.local is loaded by src/tests/setup.ts via dotenv.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, accounts } from '@/db/schema';
import { getGitHubToken, isGitHubConnected } from '@/lib/github-token';

// Track every user id we create so afterEach can clean up (accounts cascade).
const createdUserIds: string[] = [];

function uniqueId(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function insertUser(): Promise<string> {
  const id = uniqueId('user');
  createdUserIds.push(id);
  const now = new Date();
  await db.insert(users).values({
    id,
    name: 'GitHub Account Test',
    email: `${id}@example.test`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertGitHubAccount(userId: string, accessToken: string) {
  const now = new Date();
  await db.insert(accounts).values({
    id: uniqueId('account'),
    accountId: uniqueId('gh'),
    providerId: 'github',
    userId,
    accessToken,
    createdAt: now,
    updatedAt: now,
  });
}

describe('GitHub account seam (getGitHubToken / isGitHubConnected)', () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — create .env.local before running tests.');
    }
  });

  afterEach(async () => {
    const ids = createdUserIds.splice(0, createdUserIds.length);
    if (ids.length > 0) {
      await db.delete(users).where(inArray(users.id, ids));
    }
  });

  it('returns the token and reports connected when a github account row exists', async () => {
    const userId = await insertUser();
    const token = `gho_${uniqueId('tok')}`;
    await insertGitHubAccount(userId, token);

    await expect(getGitHubToken(userId)).resolves.toBe(token);
    await expect(isGitHubConnected(userId)).resolves.toBe(true);
  });

  it('returns null and reports not-connected when the user has no github account', async () => {
    const userId = await insertUser();

    await expect(getGitHubToken(userId)).resolves.toBeNull();
    await expect(isGitHubConnected(userId)).resolves.toBe(false);
  });
});
