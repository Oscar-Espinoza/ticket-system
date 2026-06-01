// DB connectivity test — proves a real write + read against the live Neon
// database through the application Drizzle driver (neon-http).
//
// Requires a valid DATABASE_URL in .env.local (loaded by src/tests/setup.ts)
// and an applied migration (see Plan 01-01 Task 3). It inserts a throwaway
// `user` row, reads it back, asserts equality, and deletes it in cleanup so the
// test leaves no residue. `user` is chosen because it has no outbound foreign
// keys, keeping the round-trip self-contained.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/db/schema';

const testUserId = `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const testEmail = `${testUserId}@db-connectivity.test`;

describe('Neon DB connectivity (real write + read)', () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is not set. Create .env.local with a Neon connection string before running this test.',
      );
    }
  });

  afterAll(async () => {
    // Clean up the throwaway row regardless of assertion outcome.
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('inserts a row and reads the same row back from Neon', async () => {
    const now = new Date();

    await db.insert(users).values({
      id: testUserId,
      name: 'DB Connectivity Test',
      email: testEmail,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(testUserId);
    expect(rows[0].email).toBe(testEmail);
    expect(rows[0].name).toBe('DB Connectivity Test');
  });
});
