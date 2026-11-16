import { dateFormat } from '@/lib/i18n';

/**
 * `3 issues`, `1 issue`: `word` takes an `s` unless `count` is 1. English
 * only: interface text uses a plural message instead (messages/GLOSSARY.md).
 */
export const pluralize = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// These follow the interface language (src/lib/i18n.ts) at each call.
const localized = (options: Intl.DateTimeFormatOptions) => ({
  format: (date?: Date | number) => dateFormat(options).format(date),
});

/** Short month name, e.g. "Jan" / "ene". */
export const MONTH_SHORT_FORMAT = localized({ month: 'short' });
/** "Jan 5, 2026, 3:04 PM" / "5 ene 2026, 15:04". */
export const DATE_TIME_MEDIUM_FORMAT = localized({ dateStyle: 'medium', timeStyle: 'short' });
/** "Jan 5, 2026" / "5 ene 2026". */
export const DATE_MEDIUM_LOCAL_FORMAT = localized({ dateStyle: 'medium' });
