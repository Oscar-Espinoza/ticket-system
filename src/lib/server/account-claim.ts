// After an unverified account is claimed (claimUnverifiedAccount in
// src/lib/sso.ts): the one-time dashboard notice and the "Your account was
// secured" email. What the items mean: src/lib/account-claim.ts.
//
// The notice is a row in Better Auth's verification table under its own
// identifier (Better Auth never reads it), written right after the claim
// commits and taken (read and deleted) by the first dashboard load of a new
// session. Server-only.

import { and, eq, gt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { verifications } from '@/db/schema';
import { type ClaimReport, parseClaimReport } from '@/lib/account-claim';
import { db } from '@/lib/db';
import { emailConfigured, sendEmail } from '@/lib/email';
import { accountSecuredEmail } from '@/lib/email-verification';
import { after } from '@/lib/kit/request';

export type ClaimVia = 'sso' | 'password_reset';

const NOTICE_PREFIX = 'account-claimed:';
const NOTICE_DAYS = 30;

/** A session younger than this shows a pending notice (older ones never look). */
export const CLAIM_NOTICE_SESSION_AGE_MS = 10 * 60 * 1000;

export interface ClaimNotice {
  via: ClaimVia;
  at: string;
  removed: ClaimReport;
}

/** The statements that (re)write the user's notice, for one db.batch. */
export function claimNoticeWrites(userId: string, notice: ClaimNotice) {
  const identifier = `${NOTICE_PREFIX}${userId}`;
  const now = new Date();
  return [
    db.delete(verifications).where(eq(verifications.identifier, identifier)),
    db.insert(verifications).values({
      id: randomUUID(),
      identifier,
      value: JSON.stringify(notice),
      expiresAt: new Date(now.getTime() + NOTICE_DAYS * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    }),
  ] as const;
}

/** Reads and deletes the user's pending notice (once), or null. */
export async function takeClaimNotice(userId: string): Promise<ClaimNotice | null> {
  const rows = await db
    .delete(verifications)
    .where(and(eq(verifications.identifier, `${NOTICE_PREFIX}${userId}`), gt(verifications.expiresAt, sql`now()`)))
    .returning({ value: verifications.value });
  for (const { value } of rows) {
    try {
      const parsed = JSON.parse(value) as Partial<ClaimNotice>;
      const removed = parseClaimReport(parsed.removed);
      if (removed && (parsed.via === 'sso' || parsed.via === 'password_reset') && typeof parsed.at === 'string') {
        return { via: parsed.via, at: parsed.at, removed };
      }
    } catch {
      // A malformed row shows nothing.
    }
  }
  return null;
}

/**
 * "Your account was secured", to the account's address, after the response
 * (it never delays or fails the claim). Only when email is really configured.
 */
export function sendAccountSecuredEmail(email: string, notice: ClaimNotice) {
  if (!emailConfigured()) return;
  after(() => sendEmail(accountSecuredEmail(email, notice)));
}
