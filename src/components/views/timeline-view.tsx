'use client';

// Issue timeline (Gantt): one row per issue, grouped by the current grouping,
// a bar from startDate (else the creation day) to dueDate. Drag the bar to
// move both dates, its edges to change one; snapping is per day. Issues
// without a due date get a dashed stub whose right edge sets one.
//
// A press without movement opens the issue; Esc cancels a drag. Keyboard on a
// focused bar: ←/→ move a day, Shift+←/→ change the due date, Enter opens.

import {
  Fragment,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { CalendarRange } from 'lucide-react';

import { useDisplayOptions } from '@/components/issues/display-options';
import type { IssueViewProps } from '@/components/issues/views';
import {
  handleSelectionClick,
  preventShiftSelect,
  useIsSelected,
  useIssueSelection,
} from '@/components/issues/selection';
import { isPendingIssue } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { EmptyState, StateIcon } from '@/components/ui-icons';
import { addDays, formatDueDate, fromDateString, toDateString } from '@/lib/dates';
import type { IssueGroup } from '@/lib/issue-grouping';
import type { IssuePatch, IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { isClosed } from '@/lib/workflow';

type Zoom = 'week' | 'month';
const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];
const PX_PER_DAY: Record<Zoom, number> = { week: 36, month: 12 };
const ZOOM_KEY = 'issues-timeline-zoom';

const NAME_COLUMN = 280;
const ROW_HEIGHT = 32;
const STUB_DAYS = 2; // no due date: a 3-day dashed stub
const DAY_MS = 86_400_000;

const monthLabel = new Intl.DateTimeFormat('en', { month: 'short' });
const weekdayLabel = new Intl.DateTimeFormat('en', { weekday: 'narrow' });

function readZoom(): Zoom {
  try {
    return window.localStorage.getItem(ZOOM_KEY) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

interface Span {
  start: string;
  end: string;
  /** No due date — the end is a stub. */
  stub: boolean;
}

function spanOf(issue: IssueRow): Span {
  let start = issue.startDate ?? toDateString(new Date(issue.createdAt));
  if (!issue.dueDate) {
    return { start, end: toDateString(addDays(fromDateString(start), STUB_DAYS)), stub: true };
  }
  // Due before the (derived) start: draw a one-day bar on the due date.
  if (issue.dueDate < start) start = issue.dueDate;
  return { start, end: issue.dueDate, stub: false };
}

const dayIndex = (origin: Date, date: string) =>
  Math.round((fromDateString(date).getTime() - origin.getTime()) / DAY_MS);
const shift = (date: string, days: number) => toDateString(addDays(fromDateString(date), days));

type DragMode = 'move' | 'start' | 'end';
interface Drag {
  id: string;
  mode: DragMode;
  originX: number;
  span: Span;
  start: string;
  end: string;
  moved: boolean;
}

/** The patch a drag / key press results in (only what changed). */
function patchFor(issue: IssueRow, span: Span, start: string, end: string, mode: DragMode): IssuePatch | null {
  const patch: IssuePatch = {};
  if (mode !== 'end' && start !== span.start) patch.startDate = start;
  // Moving a stub keeps "no due date"; an edge drag on it sets one.
  if (mode !== 'start' && end !== span.end && (!span.stub || mode === 'end')) patch.dueDate = end;
  return Object.keys(patch).length ? patch : null;
}

export default function TimelineView({ groups, mutations, selectedId, onSelect }: IssueViewProps) {
  const [display] = useDisplayOptions();
  const canWrite = useProjectPermission('write');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState<Zoom>(readZoom);
  const [today] = useState(() => toDateString(new Date()));
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const px = PX_PER_DAY[zoom];

  const setZoom = (next: Zoom) => {
    setZoomState(next);
    try {
      window.localStorage.setItem(ZOOM_KEY, next);
    } catch {
      // Blocked storage: the zoom still applies for this visit.
    }
  };

  const visible: IssueGroup[] = display.showEmptyGroups ? groups : groups.filter((g) => g.issues.length > 0);
  const issues = visible.flatMap((g) => g.issues);

  // Range: whole months covering every bar, and today −2 weeks / +2 months.
  const todayDate = fromDateString(today);
  let min = addDays(todayDate, -14);
  let max = addDays(todayDate, 60);
  for (const issue of issues) {
    const span = spanOf(issue);
    const s = fromDateString(span.start);
    const e = fromDateString(span.end);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  const origin = new Date(min.getFullYear(), min.getMonth(), 1);
  const last = new Date(max.getFullYear(), max.getMonth() + 1, 0);
  const totalDays = Math.round((last.getTime() - origin.getTime()) / DAY_MS) + 1;
  const width = totalDays * px;
  const todayIndex = dayIndex(origin, today);

  const months: { key: string; left: number; width: number; label: string }[] = [];
  for (let m = new Date(origin); m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const days = Math.round((next.getTime() - m.getTime()) / DAY_MS);
    const showYear = m.getMonth() === 0 || months.length === 0;
    months.push({
      key: toDateString(m),
      left: dayIndex(origin, toDateString(m)) * px,
      width: days * px,
      label: `${monthLabel.format(m)}${showYear ? ` ${m.getFullYear()}` : ''}`,
    });
  }
  // Week zoom: every day (+ weekend shading); month zoom: Mondays.
  const ticks: { key: string; left: number; label: string; weekend: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(origin, i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (zoom === 'week') {
      ticks.push({ key: toDateString(d), left: i * px, label: `${weekdayLabel.format(d)} ${d.getDate()}`, weekend });
    } else if (d.getDay() === 1) {
      ticks.push({ key: toDateString(d), left: i * px, label: String(d.getDate()), weekend: false });
    }
  }

  const scrollToToday = (smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      left: Math.max(0, todayIndex * px - (el.clientWidth - NAME_COLUMN) / 3),
      behavior: smooth ? 'smooth' : 'auto',
    });
  };
  const scrollOnZoom = useEffectEvent(() => scrollToToday(false));
  // On mount and zoom changes only — not after every reschedule.
  useEffect(() => scrollOnZoom(), [zoom]);

  const commit = (issue: IssueRow, span: Span, start: string, end: string, mode: DragMode) => {
    const patch = patchFor(issue, span, start, end, mode);
    if (patch) mutations.update(issue, patch);
  };

  const preview = (current: Drag, dx: number): Drag => {
    const days = Math.round(dx / px);
    let { start, end } = current.span;
    if (current.mode === 'move') {
      start = shift(start, days);
      end = shift(end, days);
    } else if (current.mode === 'start') {
      start = shift(start, days);
      // A stub's end just follows; a real due date bounds the start.
      if (current.span.stub) end = shift(start, STUB_DAYS);
      else if (start > end) start = end;
    } else {
      end = shift(end, days);
      if (end < start) end = start;
    }
    return { ...current, start, end, moved: current.moved || Math.abs(dx) > 3 };
  };

  const editable = (issue: IssueRow) => canWrite && !isPendingIssue(issue);

  const onPointerDown = (event: ReactPointerEvent, issue: IssueRow, mode: DragMode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const span = spanOf(issue);
    const next: Drag = { id: issue.id, mode, originX: event.clientX, span, start: span.start, end: span.end, moved: false };
    dragRef.current = next;
    if (!editable(issue)) return; // still a click target
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag(next);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const current = dragRef.current;
    if (!current || !drag) return;
    const next = preview(current, event.clientX - current.originX);
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerUp = (event: ReactPointerEvent, issue: IssueRow) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current || current.id !== issue.id) return;
    const moved = current.moved || Math.abs(event.clientX - current.originX) > 3;
    if (!moved) {
      onSelect?.(issue);
      return;
    }
    if (editable(issue)) commit(issue, current.span, current.start, current.end, current.mode);
  };

  // Esc cancels an in-flight drag.
  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drag]);

  const onBarKeyDown = (event: ReactKeyboardEvent, issue: IssueRow) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelect?.(issue);
      return;
    }
    if (!editable(issue) || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -1 : 1;
    const span = spanOf(issue);
    if (event.shiftKey) {
      const end = shift(span.end, delta);
      if (end >= span.start) commit(issue, span, span.start, end, 'end');
    } else {
      commit(issue, span, shift(span.start, delta), shift(span.end, delta), 'move');
    }
  };

  if (issues.length === 0) {
    return <EmptyState icon={<CalendarRange />} title="No issues" description="Nothing to show in this view." />;
  }

  const grouped = display.groupBy !== 'none';

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div role="radiogroup" aria-label="Zoom" className="flex rounded-md border border-border p-0.5">
          {ZOOMS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={zoom === option.id}
              onClick={() => setZoom(option.id)}
              className={cn(
                'h-6 rounded px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                zoom === option.id ? 'bg-secondary text-foreground' : 'hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="xs" onClick={() => scrollToToday(true)}>
          Today
        </Button>
        <span className="ml-auto hidden sm:inline">
          {canWrite ? 'Drag bars to reschedule · dashed = no due date' : 'Dashed = no due date'}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="relative max-h-[calc(100dvh-15rem)] min-h-0 overflow-auto rounded-md border border-border"
      >
        <div className="relative" style={{ width: NAME_COLUMN + width }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-background">
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end border-r border-border bg-background px-3 pb-1.5 text-xs text-muted-foreground"
              style={{ width: NAME_COLUMN }}
            >
              {issues.length} issue{issues.length === 1 ? '' : 's'}
            </div>
            <div className="relative" style={{ width, height: 44 }}>
              {months.map((month) => (
                <div
                  key={month.key}
                  className="absolute top-0 h-6 truncate border-l border-border px-1.5 text-xs leading-6 text-muted-foreground"
                  style={{ left: month.left, width: month.width }}
                >
                  {month.label}
                </div>
              ))}
              {ticks.map((tick) => (
                <div
                  key={tick.key}
                  className={cn(
                    'absolute top-6 h-5 truncate text-[10px] leading-5 text-muted-foreground/80',
                    zoom === 'week' ? 'text-center' : 'border-l border-border/60 pl-1',
                    tick.key === today && 'font-medium text-primary',
                  )}
                  style={{ left: tick.left, width: zoom === 'week' ? px : undefined }}
                >
                  {tick.label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="relative" role="list" aria-label="Issue timeline">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0"
              style={{ left: NAME_COLUMN, width }}
            >
              {zoom === 'week' &&
                ticks
                  .filter((t) => t.weekend)
                  .map((t) => <div key={t.key} className="absolute inset-y-0 bg-muted/40" style={{ left: t.left, width: px }} />)}
              {months.map((month) => (
                <div key={month.key} className="absolute inset-y-0 border-l border-border/60" style={{ left: month.left }} />
              ))}
              {todayIndex >= 0 && todayIndex < totalDays && (
                <div className="absolute inset-y-0 z-[1] w-px bg-primary" style={{ left: todayIndex * px + px / 2 }} />
              )}
            </div>

            {visible.map((group) => (
              <Fragment key={group.id}>
                {grouped && (
                  <div
                    role="presentation"
                    className="sticky left-0 z-10 flex items-center gap-2 border-b border-border bg-muted/50 px-3 text-xs font-medium"
                    style={{ height: 28, width: NAME_COLUMN }}
                  >
                    {group.state && <StateIcon state={group.state} size={14} />}
                    {!group.state && group.color && (
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                    )}
                    <span className="truncate">{group.label}</span>
                    <span className="text-muted-foreground tabular-nums">{group.issues.length}</span>
                  </div>
                )}
                {group.issues.map((issue) => {
                  const live = drag?.id === issue.id ? drag : null;
                  const span = spanOf(issue);
                  const start = live ? live.start : span.start;
                  const end = live ? live.end : span.end;
                  return (
                    <TimelineRow
                      key={`${group.id}:${issue.id}`}
                      issue={issue}
                      active={issue.id === selectedId}
                      onSelect={onSelect}
                      bar={{
                        left: dayIndex(origin, start) * px,
                        width: Math.max(px, (dayIndex(origin, end) - dayIndex(origin, start) + 1) * px),
                        label: live?.moved
                          ? `${formatDueDate(start)} – ${formatDueDate(end)}`
                          : span.stub
                            ? `${formatDueDate(start)} · no due date`
                            : `${formatDueDate(start)} – ${formatDueDate(end)}`,
                        stub: span.stub && !(live?.moved && live.mode === 'end'),
                        editable: editable(issue),
                        dragging: live !== null,
                      }}
                      width={width}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={() => {
                        dragRef.current = null;
                        setDrag(null);
                      }}
                      onBarKeyDown={onBarKeyDown}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  issue,
  active,
  onSelect,
  bar,
  width,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onBarKeyDown,
}: {
  issue: IssueRow;
  active: boolean;
  onSelect?: (issue: IssueRow) => void;
  bar: { left: number; width: number; label: string; stub: boolean; editable: boolean; dragging: boolean };
  width: number;
  onPointerDown: (event: ReactPointerEvent, issue: IssueRow, mode: DragMode) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent, issue: IssueRow) => void;
  onPointerCancel: () => void;
  onBarKeyDown: (event: ReactKeyboardEvent, issue: IssueRow) => void;
}) {
  const selection = useIssueSelection();
  const selected = useIsSelected(issue.id);
  const closed = isClosed(issue.state.type);
  const color = issue.state.color || 'var(--color-primary)';
  const title = `${issue.key} ${issue.title}: ${bar.label}`;

  return (
    <div role="listitem" className="flex border-b border-border/60" style={{ height: ROW_HEIGHT }}>
      <div
        tabIndex={0}
        data-issue-row={issue.id}
        aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
        aria-current={active ? 'true' : undefined}
        aria-selected={selection.enabled ? selected : undefined}
        onMouseDown={preventShiftSelect}
        onClick={(event) => {
          if (!isPendingIssue(issue) && handleSelectionClick(selection, event, issue.id)) return;
          onSelect?.(issue);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target === event.currentTarget) {
            event.preventDefault();
            onSelect?.(issue);
          }
        }}
        className={cn(
          'sticky left-0 z-10 flex shrink-0 cursor-pointer items-center gap-2 border-r border-border bg-background px-3 text-sm outline-none',
          'hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          active && 'bg-accent',
          selected && 'bg-[color-mix(in_oklch,var(--background),var(--primary)_10%)]',
        )}
        style={{ width: NAME_COLUMN }}
      >
        <StateIcon state={issue.state} size={14} />
        <span className="w-14 shrink-0 truncate font-mono text-xs text-muted-foreground">{issue.key}</span>
        <span className={cn('min-w-0 flex-1 truncate', closed && 'text-muted-foreground')}>{issue.title}</span>
      </div>
      <div className="relative" style={{ width }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={title}
          aria-keyshortcuts={bar.editable ? 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Enter' : 'Enter'}
          title={bar.editable ? `${title}\nDrag to reschedule · ←/→ move a day · Shift+←/→ change due date` : title}
          className={cn(
            'group absolute top-1 z-[2] flex h-6 items-center overflow-hidden rounded-md border text-xs outline-none select-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
            bar.editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
            bar.stub && 'border-dashed',
            closed && 'opacity-60',
            bar.dragging && 'shadow-[var(--shadow-popover)]',
          )}
          style={{
            left: bar.left,
            width: bar.width,
            borderColor: color,
            backgroundColor: `color-mix(in oklab, ${color} ${bar.stub ? 10 : 22}%, transparent)`,
            touchAction: 'none',
          }}
          onPointerDown={(e) => onPointerDown(e, issue, 'move')}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => onPointerUp(e, issue)}
          onPointerCancel={onPointerCancel}
          onKeyDown={(e) => onBarKeyDown(e, issue)}
        >
          <span className={cn('relative truncate px-2', closed && 'line-through')}>
            {bar.dragging || bar.width > 90 ? (bar.dragging ? bar.label : issue.title) : ''}
          </span>
          {bar.editable && (
            <>
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                style={{ backgroundColor: color }}
                onPointerDown={(e) => onPointerDown(e, issue, 'start')}
              />
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                style={{ backgroundColor: color }}
                onPointerDown={(e) => onPointerDown(e, issue, 'end')}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
