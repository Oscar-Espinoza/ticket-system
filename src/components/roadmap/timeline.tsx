'use client';

// Gantt timeline of dated items (epics). Data-agnostic: the project roadmap
// passes editable items + onChangeDates; the initiative page renders it
// read-only across projects. Dates are YYYY-MM-DD in the viewer's calendar.
//
// Dragging: the bar moves in whole weeks; the edges snap the start to a
// Monday and the target to a Sunday, and never cross (min one week). A press
// without movement is a click (opens the item). Esc cancels a drag.
//
// Dependencies (optional): SVG connectors from each blocker bar's end to the
// blocked bar's start, following bars live while dragging. A connector turns
// red when the blocked item starts on or before its blocker's target date.

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { EpicIcon, EpicStatusIcon, MilestoneGlyph } from '@/components/epics/epic-glyphs';
import {
  isClosedEpic,
  progressPercent,
  type EpicStatus,
  type Progress,
} from '@/components/epics/epic-model';
import { addDays, formatDueDate, fromDateString, toDateString } from '@/lib/dates';
import { cn } from '@/lib/utils';

export type Zoom = 'weeks' | 'months' | 'quarters';
export const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'weeks', label: 'Weeks' },
  { id: 'months', label: 'Months' },
  { id: 'quarters', label: 'Quarters' },
];
const PX_PER_DAY: Record<Zoom, number> = { weeks: 28, months: 8, quarters: 3 };

const NAME_COLUMN = 240;
const ROW_HEIGHT = 36;
const STUB_DAYS = 13; // one-sided dates render as a two-week stub
const DAY_MS = 86_400_000;

export interface TimelineItem {
  id: string;
  name: string;
  color: string | null;
  status: EpicStatus;
  startDate: string | null;
  targetDate: string | null;
  progress: Progress;
  href: string;
  /** Shown after the name (e.g. the project key on initiatives). */
  meta?: string;
  milestones: { id: string; name: string; targetDate: string | null }[];
  editable: boolean;
}

/** `from` blocks `to` (item ids). */
export interface TimelineDependency {
  id: string;
  from: string;
  to: string;
}

type DragMode = 'move' | 'start' | 'end';
interface Drag {
  id: string;
  mode: DragMode;
  originX: number;
  start: string;
  end: string;
  /** Current (snapped) preview. */
  nextStart: string;
  nextEnd: string;
  moved: boolean;
}

const dayIndex = (origin: Date, date: string) =>
  Math.round((fromDateString(date).getTime() - origin.getTime()) / DAY_MS);

/** Nearest Monday (start) or Sunday (end) to `date`. */
function snapToWeek(date: Date, edge: 'start' | 'end'): Date {
  const target = edge === 'start' ? 1 : 0;
  const diff = (target - date.getDay() + 7) % 7; // days forward to the edge weekday
  return addDays(date, diff > 3 ? diff - 7 : diff);
}

/** Effective span; one-sided items get a stub. */
function spanOf(item: Pick<TimelineItem, 'startDate' | 'targetDate'>) {
  if (item.startDate && item.targetDate) {
    return { start: item.startDate, end: item.targetDate, partial: false };
  }
  if (item.startDate) {
    return { start: item.startDate, end: toDateString(addDays(fromDateString(item.startDate), STUB_DAYS)), partial: true };
  }
  if (item.targetDate) {
    return { start: toDateString(addDays(fromDateString(item.targetDate), -STUB_DAYS)), end: item.targetDate, partial: true };
  }
  return null;
}

const monthLabel = new Intl.DateTimeFormat('en', { month: 'short' });

/** Curved when the target is comfortably to the right, else an elbow through the row gap. */
function connectorPath(x1: number, y1: number, x2: number, y2: number) {
  if (x2 - x1 >= 16) {
    const c = Math.min(40, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
  }
  const gap = y2 > y1 ? y2 - ROW_HEIGHT / 2 : y2 + ROW_HEIGHT / 2;
  return `M ${x1} ${y1} H ${x1 + 8} V ${gap} H ${x2 - 8} V ${y2} H ${x2}`;
}

export function Timeline({
  items,
  zoom,
  onChangeDates,
  dependencies = [],
  className,
}: {
  /** Items with at least one date (others are ignored). */
  items: TimelineItem[];
  zoom: Zoom;
  /** Connectors between items; ones touching undated/missing items are skipped. */
  dependencies?: TimelineDependency[];
  /** Omit for a read-only timeline. */
  onChangeDates?: (id: string, dates: { startDate?: string; targetDate?: string }) => void;
  className?: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [today] = useState(() => toDateString(new Date()));
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const markerId = `dep-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const px = PX_PER_DAY[zoom];

  const dated = items.filter((item) => item.startDate || item.targetDate);

  // Range: whole months covering every item and today −1 / +3 months (+6 zoomed out).
  const todayDate = fromDateString(today);
  let min = addDays(todayDate, -31);
  let max = addDays(todayDate, zoom === 'quarters' ? 183 : 92);
  for (const item of dated) {
    const span = spanOf(item)!;
    const s = fromDateString(span.start);
    const e = fromDateString(span.end);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  const origin = new Date(min.getFullYear(), min.getMonth(), 1);
  const end = new Date(max.getFullYear(), max.getMonth() + 2, 0);
  const totalDays = Math.round((end.getTime() - origin.getTime()) / DAY_MS) + 1;
  const width = totalDays * px;
  const todayIndex = dayIndex(origin, today);

  const months: { key: string; left: number; width: number; label: string }[] = [];
  for (let m = new Date(origin); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const left = dayIndex(origin, toDateString(m));
    const days = Math.round((next.getTime() - m.getTime()) / DAY_MS);
    const showYear = m.getMonth() === 0 || months.length === 0;
    months.push({
      key: toDateString(m),
      left: left * px,
      width: days * px,
      label: `${monthLabel.format(m)}${showYear ? ` ${m.getFullYear()}` : ''}`,
    });
  }

  // Effective span per item, following an in-flight drag.
  const liveSpan = (item: TimelineItem) => {
    const span = spanOf(item)!;
    const live = drag?.id === item.id ? drag : null;
    return live ? { ...span, start: live.nextStart, end: live.nextEnd } : span;
  };

  const rowOf = new Map(dated.map((item, index) => [item.id, index]));
  const connectors = dependencies.flatMap((dep) => {
    const fromRow = rowOf.get(dep.from);
    const toRow = rowOf.get(dep.to);
    if (fromRow === undefined || toRow === undefined) return [];
    const blocker = dated[fromRow];
    const blocked = dated[toRow];
    const from = liveSpan(blocker);
    const to = liveSpan(blocked);
    // Only real dates can conflict (stubs are placeholders); live while dragging.
    const conflict = Boolean(blocker.targetDate && blocked.startDate) && to.start <= from.end;
    return [
      {
        ...dep,
        conflict,
        blockerName: blocker.name,
        path: connectorPath(
          (dayIndex(origin, from.end) + 1) * px,
          fromRow * ROW_HEIGHT + ROW_HEIGHT / 2,
          dayIndex(origin, to.start) * px,
          toRow * ROW_HEIGHT + ROW_HEIGHT / 2,
        ),
      },
    ];
  });
  const conflictsOf = new Map<string, string[]>();
  for (const c of connectors) {
    if (c.conflict) conflictsOf.set(c.to, [...(conflictsOf.get(c.to) ?? []), c.blockerName]);
  }

  const weeks: { key: string; left: number; label: string }[] = [];
  if (zoom !== 'quarters') {
    for (let d = snapToWeek(origin, 'start'); d <= end; d = addDays(d, 7)) {
      if (d < origin) continue;
      weeks.push({ key: toDateString(d), left: dayIndex(origin, toDateString(d)) * px, label: String(d.getDate()) });
    }
  }

  // Scroll so today sits a third of the way in — on mount and zoom changes
  // only, not after every reschedule (which may widen the range).
  const scrollToToday = useEffectEvent(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, todayIndex * px - (el.clientWidth - NAME_COLUMN) / 3);
  });
  useEffect(() => scrollToToday(), [zoom]);

  const commit = (item: TimelineItem, start: string, endDate: string, mode: DragMode) => {
    if (!onChangeDates) return;
    const span = spanOf(item)!;
    if (start === span.start && endDate === span.end) return;
    const dates: { startDate?: string; targetDate?: string } = {};
    // A move keeps one-sided items one-sided; an edge drag sets that edge.
    if (mode !== 'end' && (item.startDate || mode === 'start')) dates.startDate = start;
    if (mode !== 'start' && (item.targetDate || mode === 'end')) dates.targetDate = endDate;
    if (mode === 'start' && !item.targetDate) dates.targetDate = span.end;
    if (mode === 'end' && !item.startDate) dates.startDate = span.start;
    onChangeDates(item.id, dates);
  };

  const preview = (current: Drag, dx: number): Drag => {
    const s = fromDateString(current.start);
    const e = fromDateString(current.end);
    let nextStart = current.start;
    let nextEnd = current.end;
    if (current.mode === 'move') {
      const weeksMoved = Math.round(dx / (px * 7)) * 7;
      nextStart = toDateString(addDays(s, weeksMoved));
      nextEnd = toDateString(addDays(e, weeksMoved));
    } else if (current.mode === 'start') {
      let candidate = snapToWeek(addDays(s, Math.round(dx / px)), 'start');
      if (candidate > addDays(e, -6)) candidate = addDays(e, -6);
      nextStart = toDateString(candidate);
    } else {
      let candidate = snapToWeek(addDays(e, Math.round(dx / px)), 'end');
      if (candidate < addDays(s, 6)) candidate = addDays(s, 6);
      nextEnd = toDateString(candidate);
    }
    return { ...current, nextStart, nextEnd, moved: current.moved || Math.abs(dx) > 3 };
  };

  const onPointerDown = (event: ReactPointerEvent, item: TimelineItem, mode: DragMode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const span = spanOf(item)!;
    if (!item.editable || !onChangeDates) {
      dragRef.current = { id: item.id, mode: 'move', originX: event.clientX, start: span.start, end: span.end, nextStart: span.start, nextEnd: span.end, moved: false };
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const next: Drag = {
      id: item.id,
      mode,
      originX: event.clientX,
      start: span.start,
      end: span.end,
      nextStart: span.start,
      nextEnd: span.end,
      moved: false,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const current = dragRef.current;
    if (!current || !drag) return;
    const next = preview(current, event.clientX - current.originX);
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerUp = (event: ReactPointerEvent, item: TimelineItem) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;
    const moved = current.moved || Math.abs(event.clientX - current.originX) > 3;
    if (!moved) {
      router.push(item.href);
      return;
    }
    commit(item, current.nextStart, current.nextEnd, current.mode);
  };

  // Esc cancels an in-flight drag.
  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag]);

  const onBarKeyDown = (event: React.KeyboardEvent, item: TimelineItem) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      router.push(item.href);
      return;
    }
    if (!item.editable || !onChangeDates) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -7 : 7;
    const span = spanOf(item)!;
    const s = fromDateString(span.start);
    const e = fromDateString(span.end);
    if (event.shiftKey) {
      const nextEnd = addDays(e, delta);
      if (nextEnd < addDays(s, 6)) return;
      commit(item, span.start, toDateString(nextEnd), 'end');
    } else {
      commit(item, toDateString(addDays(s, delta)), toDateString(addDays(e, delta)), 'move');
    }
  };

  return (
    <div
      ref={scrollRef}
      className={cn('relative overflow-x-auto rounded-md border border-border', className)}
    >
      <div className="relative" style={{ width: NAME_COLUMN + width }}>
        {/* Header */}
        <div className="sticky top-0 z-20 flex border-b border-border bg-background">
          <div
            className="sticky left-0 z-30 shrink-0 border-r border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
            style={{ width: NAME_COLUMN }}
          >
            Epic
          </div>
          <div className="relative" style={{ width, height: zoom === 'quarters' ? 28 : 44 }}>
            {months.map((month) => (
              <div
                key={month.key}
                className="absolute top-0 h-6 truncate border-l border-border px-1.5 text-xs leading-6 text-muted-foreground"
                style={{ left: month.left, width: month.width }}
              >
                {month.label}
              </div>
            ))}
            {weeks.map((week) => (
              <div
                key={week.key}
                className="absolute top-6 h-5 border-l border-border/60 pl-1 text-[10px] leading-5 text-muted-foreground/80"
                style={{ left: week.left }}
              >
                {zoom === 'weeks' || px * 7 >= 40 ? week.label : ''}
              </div>
            ))}
            {todayIndex >= 0 && todayIndex < totalDays && (
              <div
                className="absolute bottom-0 z-10 -translate-x-1/2 rounded bg-primary px-1 text-[10px] leading-4 text-primary-foreground"
                style={{ left: todayIndex * px + px / 2 }}
              >
                Today
              </div>
            )}
          </div>
        </div>

        {/* Rows */}
        <div className="relative" role="list" aria-label="Timeline">
          {/* Grid: month boundaries + today line. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{ left: NAME_COLUMN, width }}>
            {months.map((month) => (
              <div key={month.key} className="absolute inset-y-0 border-l border-border/60" style={{ left: month.left }} />
            ))}
            {todayIndex >= 0 && todayIndex < totalDays && (
              <div className="absolute inset-y-0 w-px bg-primary" style={{ left: todayIndex * px + px / 2 }} />
            )}
          </div>

          {connectors.length > 0 && (
            // Before the rows in the DOM so the (positioned) bars paint over it.
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute top-0 overflow-visible"
              style={{ left: NAME_COLUMN, width, height: dated.length * ROW_HEIGHT }}
            >
              <defs>
                {(['ok', 'conflict'] as const).map((kind) => (
                  <marker
                    key={kind}
                    id={`${markerId}-${kind}`}
                    viewBox="0 0 6 6"
                    refX="5"
                    refY="3"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path
                      d="M0,0 L6,3 L0,6 z"
                      className={kind === 'conflict' ? 'fill-destructive' : 'fill-muted-foreground'}
                    />
                  </marker>
                ))}
              </defs>
              {connectors.map((c) => (
                <path
                  key={c.id}
                  d={c.path}
                  fill="none"
                  strokeWidth={1.25}
                  strokeDasharray={c.conflict ? '4 3' : undefined}
                  markerEnd={`url(#${markerId}-${c.conflict ? 'conflict' : 'ok'})`}
                  className={c.conflict ? 'stroke-destructive' : 'stroke-muted-foreground/70'}
                />
              ))}
            </svg>
          )}

          {dated.map((item) => {
            const live = drag?.id === item.id ? drag : null;
            const span = spanOf(item)!;
            const start = live ? live.nextStart : span.start;
            const endDate = live ? live.nextEnd : span.end;
            const blockers = conflictsOf.get(item.id);
            const left = dayIndex(origin, start) * px;
            const barWidth = Math.max(px, (dayIndex(origin, endDate) - dayIndex(origin, start) + 1) * px);
            const percent = progressPercent(item.progress);
            const editable = item.editable && Boolean(onChangeDates);
            const color = item.color ?? 'var(--color-primary)';
            const muted = isClosedEpic(item.status);
            const label =
              `${item.name}: ${formatDueDate(start)} – ${formatDueDate(endDate)}, ${percent}% complete` +
              (blockers ? `. Starts before ${blockers.join(', ')} ${blockers.length > 1 ? 'end' : 'ends'}` : '');

            return (
              <div key={item.id} role="listitem" className="flex border-b border-border last:border-b-0" style={{ height: ROW_HEIGHT }}>
                <Link
                  href={item.href}
                  className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border bg-background px-3 text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                  style={{ width: NAME_COLUMN }}
                >
                  <EpicIcon color={item.color} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.meta && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.meta}</span>}
                  <EpicStatusIcon status={item.status} />
                </Link>
                <div className="relative" style={{ width }}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-keyshortcuts={editable ? 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Enter' : 'Enter'}
                    title={editable ? `${label}\nDrag to reschedule · ←/→ move a week · Shift+←/→ change target` : label}
                    className={cn(
                      'group absolute top-1.5 flex h-6 items-center overflow-hidden rounded-md text-xs outline-none select-none',
                      'focus-visible:ring-2 focus-visible:ring-ring',
                      editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                      muted && 'opacity-60',
                      span.partial && 'border border-dashed',
                      blockers && 'ring-2 ring-destructive/70',
                    )}
                    style={{
                      left,
                      width: barWidth,
                      borderColor: color,
                      backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`,
                      touchAction: 'none',
                    }}
                    onPointerDown={(e) => onPointerDown(e, item, 'move')}
                    onPointerMove={onPointerMove}
                    onPointerUp={(e) => onPointerUp(e, item)}
                    onPointerCancel={() => {
                      dragRef.current = null;
                      setDrag(null);
                    }}
                    onKeyDown={(e) => onBarKeyDown(e, item)}
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${percent}%`, backgroundColor: `color-mix(in oklab, ${color} 45%, transparent)` }}
                    />
                    <span className="relative truncate px-2 font-medium">
                      {live?.moved
                        ? `${formatDueDate(live.nextStart)} – ${formatDueDate(live.nextEnd)}`
                        : barWidth > 60
                          ? item.name
                          : ''}
                    </span>
                    {editable && (
                      <>
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                          style={{ backgroundColor: color }}
                          onPointerDown={(e) => onPointerDown(e, item, 'start')}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                          style={{ backgroundColor: color }}
                          onPointerDown={(e) => onPointerDown(e, item, 'end')}
                        />
                      </>
                    )}
                  </div>

                  {item.milestones.map((milestone) =>
                    milestone.targetDate ? (
                      <span
                        key={milestone.id}
                        title={`${milestone.name} · ${formatDueDate(milestone.targetDate)}`}
                        className="absolute top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-background"
                        style={{ left: dayIndex(origin, milestone.targetDate) * px + px / 2 }}
                      >
                        <MilestoneGlyph color={item.color} className="size-3.5" />
                      </span>
                    ) : null,
                  )}

                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
