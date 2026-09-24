// Calendar-date helpers for due dates (YYYY-MM-DD strings). Dates are compared
// as strings in the viewer's local calendar — no timezone shifting.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Local Date → YYYY-MM-DD. */
export function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** YYYY-MM-DD → local midnight Date. */
export function fromDateString(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export type DueStatus = 'overdue' | 'today' | 'upcoming';

export function dueStatus(dueDate: string, today: string = toDateString(new Date())): DueStatus {
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return 'upcoming';
}

const shortFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const longFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Mar 4", or "Mar 4, 2027" outside the current year. */
export function formatDueDate(value: string): string {
  const date = fromDateString(value);
  return (date.getFullYear() === new Date().getFullYear() ? shortFormat : longFormat).format(
    date,
  );
}
