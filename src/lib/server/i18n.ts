// Server side of the interface language (src/lib/i18n.ts).
//
// Per request: src/hooks.server.ts runs every request inside
// paraglideMiddleware, which picks the locale by the strategies in
// vite.config.ts: the signed-in user's saved language (custom-user, below),
// then the PARAGLIDE_LOCALE cookie, then Accept-Language, then English.
//
// For someone else (emails, notifications sent by a cron or another user's
// action): look up the recipient's language with recipientLocale() and build
// the text inside withLocale(), or pass { locale } to each message.

import { inArray, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { BASE_LOCALE, type AppLocale, toAppLocale } from '@/lib/i18n-locales';
import { cookieName, defineCustomServerStrategy } from '@/lib/paraglide/runtime';
import { paraglideMiddleware } from '@/lib/paraglide/server';

/** The saved language of the user a request belongs to (set by the session hook). */
const requestUserLocale = new WeakMap<Request, AppLocale>();

defineCustomServerStrategy('custom-user', {
  getLocale: (request) => (request ? requestUserLocale.get(request) : undefined),
});

/** Called by the session hook once it knows who is signed in. */
export function setRequestUserLocale(request: Request, locale: unknown): void {
  const value = toAppLocale(locale);
  if (value) requestUserLocale.set(request, value);
}

/**
 * The language to write to a user in. Users who never picked one get English:
 * their browser's language isn't known outside their own requests.
 */
export async function recipientLocale(userId: string): Promise<AppLocale> {
  const [row] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return toAppLocale(row?.locale) ?? BASE_LOCALE;
}

/** recipientLocale for many users at once; ids not found map to English. */
export async function recipientLocales(userIds: string[]): Promise<Map<string, AppLocale>> {
  const out = new Map<string, AppLocale>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(inArray(users.id, [...new Set(userIds)]));
  for (const id of userIds) out.set(id, BASE_LOCALE);
  for (const row of rows) out.set(row.id, toAppLocale(row.locale) ?? BASE_LOCALE);
  return out;
}

/** The language for an email address: its account's language, or English. */
export async function recipientLocaleByEmail(email: string): Promise<AppLocale> {
  const [row] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return toAppLocale(row?.locale) ?? BASE_LOCALE;
}

/**
 * Runs `fn` with `locale` as the current language: m.*() messages, getLocale()
 * and the formatters in src/lib/i18n.ts all follow it, also inside a request
 * in another language (it nests). Use it to build an email for a recipient.
 */
export function withLocale<T>(locale: AppLocale, fn: () => T | Promise<T>): Promise<T> {
  const request = new Request('http://localhost/', {
    headers: { cookie: `${cookieName}=${locale}` },
  });
  let result: T | undefined;
  return paraglideMiddleware(request, async () => {
    result = await fn();
    return new Response(null);
  }).then(() => result as T);
}
