// Pure helpers behind the views: grouping, dates, colours, progress and the
// burndown geometry. No DOM, no Svelte, so they are unit-tested directly
// (src/tests/mcp-ui-model.test.ts). The order and label tables come from
// issue-model.ts, the one owner of state types and priorities.

import type { CycleView, IssueSummary } from '@/lib/server/mcp/contracts';
import { fromDateString, toDateString } from '@/lib/dates';
import { PRIORITY_LABEL, PRIORITY_ORDER, STATE_TYPE_LABEL, STATE_TYPE_ORDER, type Priority } from '@/lib/issue-model';

export { PRIORITY_LABEL, PRIORITY_ORDER, STATE_TYPE_LABEL, STATE_TYPE_ORDER };

// ---------------------------------------------------------------------------
// Text and colour
// ---------------------------------------------------------------------------

/** Up to two initials: "Ana María López" → "AL", "ana" → "A", "" → "?". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '?';
  const first = [...words[0]!][0]!;
  const last = words.length > 1 ? [...words[words.length - 1]!][0]! : '';
  return (first + last).toUpperCase();
}

/** Markdown source as one plain line (search snippets are cut from the raw description). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\w-]*/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*~`>#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * State and label colours are user-chosen strings. Only hex values reach a
 * style attribute; anything else gets the neutral fallback.
 */
export function safeColor(color: string | null | undefined, fallback = '#8b8f97'): string {
  return color && HEX.test(color.trim()) ? color.trim() : fallback;
}

// ---------------------------------------------------------------------------
// Dates (YYYY-MM-DD are calendar dates in the viewer's own calendar)
// ---------------------------------------------------------------------------

export type DueTone = 'overdue' | 'soon' | 'later';

/** Overdue (before today), soon (today or the next 3 days) or later. */
export function dueTone(date: string, today: string = toDateString(new Date())): DueTone {
  if (date < today) return 'overdue';
  const soon = fromDateString(today);
  soon.setDate(soon.getDate() + 3);
  return date <= toDateString(soon) ? 'soon' : 'later';
}

/** "Nov 20", or "Nov 20, 2027" when not in `today`'s year. */
export function shortDate(date: string, locale?: string, today: string = toDateString(new Date())): string {
  const d = fromDateString(date);
  if (Number.isNaN(d.getTime())) return date;
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
}

/** "3 days ago", "in 2 hours", "just now" for an ISO timestamp. */
export function relativeTime(iso: string, now: Date = new Date(), locale?: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'second');
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export interface IssueGroup {
  key: string;
  label: string;
  /** State colour for state groups. */
  color: string | null;
  issues: IssueSummary[];
}

const rank = <T>(order: readonly T[], value: T) => {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
};

/**
 * Rows grouped by state (workflow order: type first, then name) or by
 * priority (urgent first). Order inside a group is the order given. Without
 * `groupBy` there is a single unlabelled group.
 */
export function groupIssues(issues: IssueSummary[], groupBy: 'state' | 'priority' | null | undefined): IssueGroup[] {
  if (!groupBy) return [{ key: 'all', label: '', color: null, issues }];
  const groups = new Map<string, IssueGroup & { sort: [number, string] }>();
  for (const issue of issues) {
    const isState = groupBy === 'state';
    const key = isState ? `state:${issue.state.name}` : `priority:${issue.priority}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: isState ? issue.state.name : (PRIORITY_LABEL[issue.priority as Priority] ?? issue.priority),
        color: isState ? safeColor(issue.state.color) : null,
        issues: [],
        sort: isState
          ? [rank(STATE_TYPE_ORDER, issue.state.type as (typeof STATE_TYPE_ORDER)[number]), issue.state.name]
          : [rank(PRIORITY_ORDER, issue.priority as Priority), ''],
      };
      groups.set(key, group);
    }
    group.issues.push(issue);
  }
  return [...groups.values()]
    .sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1].localeCompare(b.sort[1]))
    .map(({ sort: _sort, ...group }) => group);
}

// ---------------------------------------------------------------------------
// Project overview
// ---------------------------------------------------------------------------

export interface TypeSegment {
  type: string;
  label: string;
  count: number;
  /** Share of the total, 0–100. */
  percent: number;
}

/** Counts per state type as bar segments, in workflow order, zero counts left out. */
export function typeSegments(counts: Record<string, number>): { total: number; segments: TypeSegment[] } {
  const known = [...STATE_TYPE_ORDER] as string[];
  const types = [...known, ...Object.keys(counts).filter((t) => !known.includes(t))];
  const total = types.reduce((sum, t) => sum + Math.max(0, counts[t] ?? 0), 0);
  const segments = types
    .filter((t) => (counts[t] ?? 0) > 0)
    .map((type) => ({
      type,
      label: STATE_TYPE_LABEL[type as keyof typeof STATE_TYPE_LABEL] ?? type,
      count: counts[type]!,
      percent: total ? (counts[type]! / total) * 100 : 0,
    }));
  return { total, segments };
}

/** Completed share of a cycle's scope, 0–100 (rounded). */
export function cyclePercent(cycle: Pick<CycleView, 'totals'>): number {
  const { scope, completed } = cycle.totals;
  return scope > 0 ? Math.round(Math.min(1, Math.max(0, completed / scope)) * 100) : 0;
}

export interface BurndownGeometry {
  width: number;
  height: number;
  /** Remaining issues over time: a step line from the cycle's start to now (or its end). */
  actual: string;
  /** Straight line from the starting scope to zero at the cycle's end. */
  ideal: string;
  /** x of "now" inside the cycle, null before it starts or after it ends. */
  todayX: number | null;
  /** Largest value on the y axis. */
  max: number;
  /** y of the zero line. */
  baseline: number;
}

/**
 * Burndown (issues still open) as SVG path data inside a width × height box
 * with `pad` around it. Time runs from the cycle's start to its end. The
 * actual line holds each value until the next point; with no points it is
 * empty. Returns null when the cycle has no scope to draw.
 */
export function burndownGeometry(
  cycle: Pick<CycleView, 'startsAt' | 'endsAt' | 'burndown' | 'totals'>,
  width: number,
  height: number,
  now: Date = new Date(),
  pad = 6,
): BurndownGeometry | null {
  const start = Date.parse(cycle.startsAt);
  const end = Date.parse(cycle.endsAt);
  const points = cycle.burndown
    .map((p) => ({ t: Date.parse(p.at), remaining: Math.max(0, p.totals.scope - p.totals.completed), scope: p.totals.scope }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  const max = Math.max(cycle.totals.scope, ...points.map((p) => p.scope), ...points.map((p) => p.remaining));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || max <= 0) return null;

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const x = (t: number) => pad + ((Math.min(end, Math.max(start, t)) - start) / (end - start)) * innerW;
  const y = (value: number) => pad + (1 - Math.min(max, Math.max(0, value)) / max) * innerH;
  const n = (v: number) => Math.round(v * 10) / 10;

  const upTo = Math.min(end, Math.max(start, now.getTime()));
  const visible = points.filter((p) => p.t <= upTo);
  let actual = '';
  visible.forEach((p, i) => {
    actual += i === 0 ? `M${n(x(p.t))},${n(y(p.remaining))}` : `H${n(x(p.t))}V${n(y(p.remaining))}`;
  });
  if (visible.length) actual += `H${n(x(upTo))}`;

  const first = points[0];
  const startScope = first ? first.remaining : cycle.totals.scope - cycle.totals.completed;
  const ideal = `M${n(x(start))},${n(y(startScope))}L${n(x(end))},${n(y(0))}`;
  const todayX = now.getTime() >= start && now.getTime() <= end ? n(x(now.getTime())) : null;
  return { width, height, actual, ideal, todayX, max, baseline: n(y(0)) };
}
