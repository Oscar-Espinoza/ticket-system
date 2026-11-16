// The language an invitation email is written in: the invitee's saved language
// when the address already has an account, else the inviter's (the language of
// the request that sends it). Server-only.

import { eq } from 'drizzle-orm';

import { users } from '@/db/schema';
import { db } from '@/lib/db';
import { type AppLocale, BASE_LOCALE, currentLocale, toAppLocale } from '@/lib/i18n';

export async function inviteLocale(email: string): Promise<AppLocale> {
  const [row] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!row) return currentLocale();
  return toAppLocale(row.locale) ?? BASE_LOCALE;
}
