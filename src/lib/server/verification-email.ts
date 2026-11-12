// Better Auth's `emailVerification.sendVerificationEmail` and
// `emailAndPassword.sendResetPassword` (wired in auth.ts only when email is
// configured, see src/lib/email-verification.ts).
//
// Per-user cooldown: at most one verification email and one reset email per
// user per minute, whatever asks for it. Better Auth also rate-limits
// /send-verification-email and /request-password-reset per IP (3 a minute,
// production only), but its memory store is per server instance; this one is
// in the database. A request inside the cooldown is dropped silently, so the
// endpoint's answer never tells a caller more than before.
//
// Nothing here logs a link or a token.

import { and, eq, like, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  passwordResetEmail,
  passwordResetLink,
  verificationEmail,
  verificationLink,
} from '@/lib/email-verification';
import { verifications } from '@/db/schema';

export const VERIFICATION_EMAIL_COOLDOWN_SECONDS = 60;
const COOLDOWN = sql.raw(`interval '${VERIFICATION_EMAIL_COOLDOWN_SECONDS} seconds'`);

export type SendSlot = 'verification-email-sent' | 'password-reset-sent';

/**
 * Claims the user's send slot of `kind`: true when no claim is younger than
 * the cooldown. One transaction that first takes a transaction-scoped
 * advisory lock on the marker, so two concurrent claims are serialised (the
 * marker table has no unique constraint to lean on, and under READ COMMITTED
 * two `insert … where not exists` could both insert). Works on both drivers:
 * `db.batch` is one transaction on neon-http and on the pg shim. The marker
 * rows live in Better Auth's verification table under their own identifier
 * (Better Auth never reads them).
 */
export async function claimSendSlot(kind: SendSlot, userId: string): Promise<boolean> {
  const identifier = `${kind}:${userId}`;
  const [, , inserted] = await db.batch([
    db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`),
    db.execute(sql`
      delete from ${verifications}
      where ${verifications.identifier} = ${identifier} and ${verifications.expiresAt} <= now()
    `),
    db.execute<{ id: string }>(sql`
      insert into ${verifications} (id, identifier, value, expires_at, created_at, updated_at)
      select ${randomUUID()}, ${identifier}, '1', now() + ${COOLDOWN}, now(), now()
      where not exists (
        select 1 from ${verifications}
        where ${verifications.identifier} = ${identifier} and ${verifications.expiresAt} > now()
      )
      returning id
    `),
  ]);
  const rows = Array.isArray(inserted) ? inserted : (inserted as { rows?: unknown[] }).rows;
  return (rows?.length ?? 0) > 0;
}

export async function sendVerificationEmail({
  user,
  url,
}: {
  user: { id: string; email: string };
  url: string;
}): Promise<void> {
  if (!(await claimSendSlot('verification-email-sent', user.id))) return;
  await sendEmail(verificationEmail(user, verificationLink(url)));
}

/** Better Auth's reset identifiers (`reset-password:<token>`, value = user id). */
const RESET_PREFIX = 'reset-password:';

/**
 * Sends the reset link. Only the newest link works: the others for this user
 * are deleted when it is sent. Inside the cooldown the new token is deleted
 * unsent (the one sent less than a minute ago stays valid).
 */
export async function sendPasswordReset({
  user,
  url,
  token,
}: {
  user: { id: string; email: string };
  url: string;
  token: string;
}): Promise<void> {
  const current = `${RESET_PREFIX}${token}`;
  const userResets = and(like(verifications.identifier, `${RESET_PREFIX}%`), eq(verifications.value, user.id));
  if (!(await claimSendSlot('password-reset-sent', user.id))) {
    await db.delete(verifications).where(and(userResets, eq(verifications.identifier, current)));
    return;
  }
  await db.delete(verifications).where(and(userResets, ne(verifications.identifier, current)));
  await sendEmail(passwordResetEmail(user, passwordResetLink(url, token)));
}
