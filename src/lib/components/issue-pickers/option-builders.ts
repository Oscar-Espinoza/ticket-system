// The option lists the property pickers and the issue context menu both offer,
// so the two stay in step.

import { addDays, toDateString } from '@/lib/dates';
import type { Priority } from '@/lib/issue-model';

// Menu order and number keys match Linear: 0 none, 1 urgent … 4 low.
export const PRIORITY_MENU_ORDER: Priority[] = ['none', 'urgent', 'high', 'medium', 'low'];

/** Quick due dates; "End of this week" is the coming Friday (today when it's Friday). */
export function dueDateQuickOptions(today = new Date()) {
  const friday = addDays(today, (5 - today.getDay() + 7) % 7);
  return [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'End of this week', date: friday },
    { label: 'In one week', date: addDays(today, 7) },
    { label: 'In two weeks', date: addDays(today, 14) },
  ].map((option) => ({ ...option, value: toDateString(option.date) }));
}

/** Viewer first — assigning to yourself is the common case. */
export function viewerFirst<M extends { id: string }>(members: M[], viewerId: string): M[] {
  return [...members.filter((m) => m.id === viewerId), ...members.filter((m) => m.id !== viewerId)];
}
