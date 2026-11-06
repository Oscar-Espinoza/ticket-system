/** `3 issues`, `1 issue`: `word` takes an `s` unless `count` is 1. */
export const pluralize = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Short month name, e.g. "Jan". */
export const MONTH_SHORT_FORMAT = new Intl.DateTimeFormat('en', { month: 'short' });
/** "Jan 5, 2026, 3:04 PM". */
export const DATE_TIME_MEDIUM_FORMAT = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
/** "Jan 5, 2026" in the viewer's locale. */
export const DATE_MEDIUM_LOCAL_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
