// Better Auth's `emailVerification.sendVerificationEmail` (wired in auth.ts
// only when email is configured, see src/lib/email-verification.ts).
//
// Per-user cooldown: at most one verification email per user per minute,
// whatever asks for it (sign-up, the banner's Resend, the sign-in form).
// Better Auth also rate-limits /send-verification-email per IP (3 a minute,
// production only), but its memory store is per server instance; this one is
// in the database. A request inside the cooldown is dropped silently, so the
// endpoint's answer never tells a caller more than before.

import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { verificationEmail, verificationLink } from '@/lib/email-verification';
import { verifications } from '@/db/schema';

export const VERIFICATION_EMAIL_COOLDOWN_SECONDS = 60;
const COOLDOWN = sql.raw(`interval '${VERIFICATION_EMAIL_COOLDOWN_SECONDS} seconds'`);

/**
 * Claims the user's send slot: true when no claim is younger than the
 * cooldown. The marker rows live in Better Auth's verification table under
 * their own identifier (Better Auth never reads them).
 */
async function claimSendSlot(userId: string): Promise<boolean> {
  const identifier = `verification-email-sent:${userId}`;
  await db.execute(sql`
    delete from ${verifications}
    where ${verifications.identifier} = ${identifier} and ${verifications.expiresAt} <= now()
  `);
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into ${verifications} (id, identifier, value, expires_at, created_at, updated_at)
    select ${randomUUID()}, ${identifier}, '1',
      now() + ${COOLDOWN}, now(), now()
    where not exists (
      select 1 from ${verifications}
      where ${verifications.identifier} = ${identifier} and ${verifications.expiresAt} > now()
    )
    returning id
  `);
  return rows.length > 0;
}

export async function sendVerificationEmail({
  user,
  url,
}: {
  user: { id: string; name?: string | null; email: string };
  url: string;
}): Promise<void> {
  if (!(await claimSendSlot(user.id))) return;
  await sendEmail(verificationEmail(user, verificationLink(url)));
}
