// Small read-only property displays shared by list rows, board cards and the
// detail pane (and any surface that lists issues).
//
// Port of src/components/issues/issue-properties.tsx, with the same export
// names, so callers keep one import:
//   import { DueDateChip, EstimateChip, LabelChips, relativeTime } from '@/lib/components/issues/issue-properties';
// The components are also importable one by one (label-chips.svelte,
// estimate-chip.svelte, due-date-chip.svelte). Props as in React (className → class).

export { default as LabelChips } from './label-chips.svelte';
export { default as EstimateChip } from './estimate-chip.svelte';
export { default as DueDateChip } from './due-date-chip.svelte';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

export function relativeTime(date: Date, now = Date.now()): string {
  const seconds = (new Date(date).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
