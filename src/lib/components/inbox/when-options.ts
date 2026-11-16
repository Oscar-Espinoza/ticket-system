import { formatDate, m } from '@/lib/i18n';

// "Later" presets shared by inbox snooze and issue reminders. Computed in the
// browser, so "tomorrow 9:00" means the viewer's own morning.

export interface WhenPreset {
  id: string;
  label: string;
  date: Date;
}

const MORNING_HOUR = 9;

export function atMorning(day: Date): Date {
  const date = new Date(day);
  date.setHours(MORNING_HOUR, 0, 0, 0);
  return date;
}

function inHours(hours: number, now: Date): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function tomorrowMorning(now: Date): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  return atMorning(date);
}

/** Next Monday 9:00 (a week from today when today is Monday). */
function nextWeekMorning(now: Date): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + (((8 - date.getDay()) % 7) || 7));
  return atMorning(date);
}

export function snoozePresets(now = new Date()): WhenPreset[] {
  return [
    { id: 'hour', label: m.editor_when_in_1_hour(), date: inHours(1, now) },
    { id: 'tomorrow', label: m.common_tomorrow(), date: tomorrowMorning(now) },
    { id: 'next-week', label: m.editor_when_next_week(), date: nextWeekMorning(now) },
  ];
}

export function reminderPresets(now = new Date()): WhenPreset[] {
  return [
    { id: 'hours', label: m.editor_when_in_3_hours(), date: inHours(3, now) },
    { id: 'tomorrow', label: m.common_tomorrow(), date: tomorrowMorning(now) },
    { id: 'next-week', label: m.editor_when_next_week(), date: nextWeekMorning(now) },
  ];
}

const SAME_YEAR: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};
const OTHER_YEAR: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/** "Tue, Sep 29, 9:00 AM" */
export function formatWhen(date: Date, now = new Date()): string {
  return formatDate(date, date.getFullYear() === now.getFullYear() ? SAME_YEAR : OTHER_YEAR);
}
