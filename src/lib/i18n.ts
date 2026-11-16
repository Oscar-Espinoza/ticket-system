// Interface language: Paraglide JS messages (messages/{locale}.json, compiled
// to src/lib/paraglide by the Vite plugin) plus Intl formatters that follow the
// current locale. Works on the server (per request, AsyncLocalStorage) and in
// the browser (the <html lang> the server rendered).
//
//   import { m } from '@/lib/i18n';
//   m.issues_empty_title()            // "No issues yet" / "Aún no hay tickets"
//   m.issues_count({ count })         // plurals: see messages/GLOSSARY.md
//
// Formatting: formatDate / formatNumber / relativeTime (src/lib/relative-time.ts)
// take the current locale; pass { locale } when rendering for someone else
// (emails: src/lib/server/i18n.ts).

import { getLocale } from '@/lib/paraglide/runtime';
import { BASE_LOCALE, type AppLocale, toAppLocale } from '@/lib/i18n-locales';

export { m } from '@/lib/paraglide/messages';
export { getLocale, setLocale } from '@/lib/paraglide/runtime';
export { BASE_LOCALE, LOCALES, LOCALE_NAMES, toAppLocale, type AppLocale } from '@/lib/i18n-locales';

/** The current interface language. */
export function currentLocale(): AppLocale {
  return toAppLocale(getLocale()) ?? BASE_LOCALE;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();
const listFormats = new Map<string, Intl.ListFormat>();

function cached<T>(map: Map<string, T>, locale: string, options: object, make: () => T): T {
  const key = `${locale}|${JSON.stringify(options)}`;
  let value = map.get(key);
  if (!value) map.set(key, (value = make()));
  return value;
}

/** An Intl.DateTimeFormat for the current (or given) locale; cached per locale and options. */
export function dateFormat(options: Intl.DateTimeFormatOptions, locale: AppLocale = currentLocale()) {
  return cached(dateFormats, locale, options, () => new Intl.DateTimeFormat(locale, options));
}

/** An Intl.NumberFormat for the current (or given) locale; cached per locale and options. */
export function numberFormat(options: Intl.NumberFormatOptions = {}, locale: AppLocale = currentLocale()) {
  return cached(numberFormats, locale, options, () => new Intl.NumberFormat(locale, options));
}

/** An Intl.RelativeTimeFormat for the current (or given) locale; cached per locale and options. */
export function relativeTimeFormat(
  options: Intl.RelativeTimeFormatOptions = {},
  locale: AppLocale = currentLocale(),
) {
  return cached(relativeFormats, locale, options, () => new Intl.RelativeTimeFormat(locale, options));
}

export function formatDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  locale?: AppLocale,
): string {
  return dateFormat(options, locale).format(new Date(date));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale?: AppLocale): string {
  return numberFormat(options, locale).format(value);
}

/** "Ana, Bob and Carol" / "Ana, Bob y Carol". */
export function formatList(items: string[], locale: AppLocale = currentLocale()): string {
  return cached(listFormats, locale, {}, () => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })).format(items);
}
