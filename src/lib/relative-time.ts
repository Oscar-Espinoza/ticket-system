// Short relative timestamps ("3h ago", "in 2d", "just now") shared by every list and feed,
// in the interface language (src/lib/i18n.ts).
import { m, relativeTimeFormat } from '@/lib/i18n';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function relativeTime(date: Date, now = Date.now()): string {
  const seconds = (new Date(date).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeTimeFormat({ numeric: 'auto', style: 'short' }).format(Math.round(seconds / size), unit);
    }
  }
  return m.time_just_now();
}
