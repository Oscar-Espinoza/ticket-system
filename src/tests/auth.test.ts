// Integration tests for the email/password auth slice (AUTH-01, AUTH-03, AUTH-04).
//
// These exercise the REAL Better Auth server instance (src/lib/auth.ts) against
// the live Neon database (via authDb / db from src/lib/db.ts). No mocking of the
// auth instance — until Task 2 creates src/lib/auth.ts the import itself fails,
// which IS the RED state for this TDD slice.
//
// Conventions (per Plan 01-02 + Wave 1 lessons):
//   - Unique emails per run (`user-${Date.now()}-...@example.test`) so reruns
//     never collide on the `email` unique constraint.
//   - afterEach deletes any rows created by the run so the suite leaves no residue.
//   - NODE_ENV=test; .env.local is loaded by src/tests/setup.ts via dotenv.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/db/schema';

// Track every email we register so afterEach can clean up the `user` rows
// (sessions/accounts cascade-delete via their FKs to user).
const createdEmails: string[] = [];

function uniqueEmail(tag: string): string {
  const email = `user-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  createdEmails.push(email);
  return email;
}

async function deleteByEmails(emails: string[]) {
  if (emails.length === 0) return;
  await db.delete(users).where(inArray(users.email, emails));
}

describe('Email/password authentication (AUTH-01, AUTH-03, AUTH-04)', () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — create .env.local before running auth tests.');
    }
  });

  afterEach(async () => {
    await deleteByEmails(createdEmails.splice(0, createdEmails.length));
  });

  it('AUTH-01: signUp.email with a unique email + 8-char password persists a `user` row and returns no error', async () => {
    const email = uniqueEmail('signup');

    const result = await auth.api.signUpEmail({
      body: { name: 'Signup User', email, password: 'password123' },
      asResponse: true,
    });

    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(email);
  });

  it('AUTH-01: signUp.email with an already-registered email is rejected as USER_ALREADY_EXISTS', async () => {
    const email = uniqueEmail('dupe');

    // First signup succeeds.
    const first = await auth.api.signUpEmail({
      body: { name: 'First', email, password: 'password123' },
      asResponse: true,
    });
    expect(first.ok).toBe(true);

    // Second signup with the same email must be rejected (HTTP 422, USER_ALREADY_EXISTS).
    const second = await auth.api.signUpEmail({
      body: { name: 'Second', email, password: 'password123' },
      asResponse: true,
    });

    expect(second.ok).toBe(false);
    expect(second.status).toBe(422);
    const payload = await second.json();
    // Better Auth 1.6 emits USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL; older docs
    // referenced USER_ALREADY_EXISTS. Match the family so the contract is
    // version-resilient (the forms key off the same prefix).
    expect(payload.code).toMatch(/^USER_ALREADY_EXISTS/);

    // Exactly one user row exists for that email.
    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });

  it('AUTH-01: signUp.email with a <8-char password is rejected and creates no `user` row', async () => {
    const email = uniqueEmail('shortpw');

    const result = await auth.api.signUpEmail({
      body: { name: 'Short PW', email, password: 'short' },
      asResponse: true,
    });

    // Better Auth 1.6 rejects a too-short password with HTTP 400 /
    // PASSWORD_TOO_SHORT (the original plan loosely described this as
    // "422 / validation error"). What matters: the request is rejected and no
    // `user` row is created.
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    const payload = await result.json();
    expect(payload.code).toBe('PASSWORD_TOO_SHORT');

    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(0);
  });

  it('AUTH-03: after signIn.email a session cookie is set and getSession with those headers returns a non-null session', async () => {
    const email = uniqueEmail('signin');
    const password = 'password123';

    await auth.api.signUpEmail({
      body: { name: 'Sign In', email, password },
      asResponse: true,
    });

    const signInResponse = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });

    expect(signInResponse.ok).toBe(true);

    const setCookie = signInResponse.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('better-auth');

    // Replay the session cookie back to getSession — it must resolve a session.
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: setCookie! }),
    });

    expect(session).not.toBeNull();
    expect(session?.user.email).toBe(email);
  });

  it('AUTH-04: after signOut, getSession with the (now cleared) cookie returns null', async () => {
    const email = uniqueEmail('signout');
    const password = 'password123';

    await auth.api.signUpEmail({
      body: { name: 'Sign Out', email, password },
      asResponse: true,
    });

    const signInResponse = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    const sessionCookie = signInResponse.headers.get('set-cookie')!;
    expect(sessionCookie).toBeTruthy();

    // Sign out using the active session cookie.
    const signOutResponse = await auth.api.signOut({
      headers: new Headers({ cookie: sessionCookie }),
      asResponse: true,
    });
    expect(signOutResponse.ok).toBe(true);

    // The cleared session token no longer resolves. Use the cookie the server
    // sent on sign-out (which expires the session cookie), falling back to the
    // original cookie — either way the session row is revoked, so getSession is null.
    const clearedCookie = signOutResponse.headers.get('set-cookie') ?? sessionCookie;
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: clearedCookie }),
    });

    expect(session).toBeNull();
  });
});
