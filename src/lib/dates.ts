// Calendar-date helpers for due dates (YYYY-MM-DD strings). Dates are compared
// as strings in the viewer's local calendar — no timezone shifting.

import { dateFormat } from '@/lib/i18n';
import { fromDateString } from '@/lib/date-strings';

export {
  addDays,
  dueStatus,
  fromDateString,
  isDateString,
  toDateString,
  weekRange,
  type DueStatus,
} from '@/lib/date-strings';

/** "Mar 4", or "Mar 4, 2027" outside the current year. */
export function formatDueDate(value: string): string {
  const date = fromDateString(value);
  return dateFormat(
    date.getFullYear() === new Date().getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  ).format(date);
}
