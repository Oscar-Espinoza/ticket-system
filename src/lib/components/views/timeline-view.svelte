<!--
  Issue timeline (Gantt): one row per issue, grouped by the current grouping,
  a bar from startDate (else the creation day) to dueDate. Drag the bar to
  move both dates, its edges to change one; snapping is per day. Issues
  without a due date get a dashed stub whose right edge sets one.

  A press without movement opens the issue; Esc cancels a drag. Keyboard on a
  focused bar: ←/→ move a day, Shift+←/→ change the due date, Enter opens.

  Client only: "today", the zoom (localStorage) and the scroll position — the
  registry renders it only in the browser.
-->
<script lang="ts">
  import { MONTH_SHORT_FORMAT, pluralize } from '@/lib/format';
  import { untrack } from 'svelte';
  import CalendarRangeIcon from '@lucide/svelte/icons/calendar-range';

  import { useDisplayOptions } from '@/lib/components/issues/display-options.svelte';
  import { isPendingIssue } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState, StateIcon } from '@/lib/components/ui-icons';
  import { addDays, formatDueDate, fromDateString, toDateString } from '@/lib/dates';
  import type { IssueGroup } from '@/lib/issue-grouping';
  import type { IssuePatch, IssueRow } from '@/lib/issue-model';
  import { DAY_MS } from '@/lib/time';
  import { NAME_COLUMN } from './timeline-layout';
  import { cn } from '@/lib/utils';
  import type { IssueViewProps } from '@/lib/components/issues/views';
  import { readStorage, writeStorage } from '@/lib/svelte/storage';
  import TimelineRow, { type DragMode, type TimelineBar, type TimelinePointerEvent } from './timeline-row.svelte';

  let { groups, mutations, selectedId, onSelect }: IssueViewProps = $props();

  type Zoom = 'week' | 'month';
  const ZOOMS: { id: Zoom; label: string }[] = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
  ];
  const PX_PER_DAY: Record<Zoom, number> = { week: 36, month: 12 };
  const ZOOM_KEY = 'issues-timeline-zoom';

  const STUB_DAYS = 2; // no due date: a 3-day dashed stub

  const weekdayLabel = new Intl.DateTimeFormat('en', { weekday: 'narrow' });

  function readZoom(): Zoom {
    return readStorage(ZOOM_KEY) === 'month' ? 'month' : 'week';
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

  const displayOptions = useDisplayOptions();
  const display = $derived(displayOptions.current);
  const canWrite = useProjectPermission('write');
  let scrollEl = $state<HTMLDivElement | null>(null);
  let zoom = $state<Zoom>(readZoom());
  const today = toDateString(new Date());
  let drag = $state<Drag | null>(null);
  let dragRef: Drag | null = null;
  const px = $derived(PX_PER_DAY[zoom]);

  function setZoom(next: Zoom) {
    zoom = next;
    // Blocked storage: the zoom still applies for this visit.
    writeStorage(ZOOM_KEY, next);
  }

  const visible: IssueGroup[] = $derived(display.showEmptyGroups ? groups : groups.filter((g) => g.issues.length > 0));
  const issues = $derived(visible.flatMap((g) => g.issues));

  // Range: whole months covering every bar, and today −2 weeks / +2 months.
  const range = $derived.by(() => {
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
    return { origin, last, totalDays };
  });
  const origin = $derived(range.origin);
  const totalDays = $derived(range.totalDays);
  const width = $derived(totalDays * px);
  const todayIndex = $derived(dayIndex(origin, today));

  const months = $derived.by(() => {
    const list: { key: string; left: number; width: number; label: string }[] = [];
    for (let m = new Date(origin); m <= range.last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const days = Math.round((next.getTime() - m.getTime()) / DAY_MS);
      const showYear = m.getMonth() === 0 || list.length === 0;
      list.push({
        key: toDateString(m),
        left: dayIndex(origin, toDateString(m)) * px,
        width: days * px,
        label: `${MONTH_SHORT_FORMAT.format(m)}${showYear ? ` ${m.getFullYear()}` : ''}`,
      });
    }
    return list;
  });
  // Week zoom: every day (+ weekend shading); month zoom: Mondays.
  const ticks = $derived.by(() => {
    const list: { key: string; left: number; label: string; weekend: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(origin, i);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      if (zoom === 'week') {
        list.push({ key: toDateString(d), left: i * px, label: `${weekdayLabel.format(d)} ${d.getDate()}`, weekend });
      } else if (d.getDay() === 1) {
        list.push({ key: toDateString(d), left: i * px, label: String(d.getDate()), weekend: false });
      }
    }
    return list;
  });

  function scrollToToday(smooth: boolean) {
    const el = scrollEl;
    if (!el) return;
    el.scrollTo({
      left: Math.max(0, todayIndex * px - (el.clientWidth - NAME_COLUMN) / 3),
      behavior: smooth ? 'smooth' : 'auto',
    });
  }
  // On mount and zoom changes only — not after every reschedule.
  $effect(() => {
    void zoom;
    untrack(() => scrollToToday(false));
  });

  function commit(issue: IssueRow, span: Span, start: string, end: string, mode: DragMode) {
    const patch = patchFor(issue, span, start, end, mode);
    if (patch) mutations.update(issue, patch);
  }

  function preview(current: Drag, dx: number): Drag {
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
  }

  const editable = (issue: IssueRow) => canWrite.current && !isPendingIssue(issue);

  function onPointerDown(event: TimelinePointerEvent, issue: IssueRow, mode: DragMode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const span = spanOf(issue);
    const next: Drag = { id: issue.id, mode, originX: event.clientX, span, start: span.start, end: span.end, moved: false };
    dragRef = next;
    if (!editable(issue)) return; // still a click target
    event.currentTarget.setPointerCapture(event.pointerId);
    drag = next;
  }

  function onPointerMove(event: TimelinePointerEvent) {
    const current = dragRef;
    if (!current || !drag) return;
    const next = preview(current, event.clientX - current.originX);
    dragRef = next;
    drag = next;
  }

  function onPointerUp(event: TimelinePointerEvent, issue: IssueRow) {
    const current = dragRef;
    dragRef = null;
    drag = null;
    if (!current || current.id !== issue.id) return;
    const moved = current.moved || Math.abs(event.clientX - current.originX) > 3;
    if (!moved) {
      onSelect?.(issue);
      return;
    }
    if (editable(issue)) commit(issue, current.span, current.start, current.end, current.mode);
  }

  function onPointerCancel() {
    dragRef = null;
    drag = null;
  }

  // Esc cancels an in-flight drag.
  const dragging = $derived(drag !== null);
  $effect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      dragRef = null;
      drag = null;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  function onBarKeyDown(event: KeyboardEvent, issue: IssueRow) {
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
  }

  function barFor(issue: IssueRow): TimelineBar {
    const live = drag?.id === issue.id ? drag : null;
    const span = spanOf(issue);
    const start = live ? live.start : span.start;
    const end = live ? live.end : span.end;
    return {
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
    };
  }

  const grouped = $derived(display.groupBy !== 'none');
</script>

{#if issues.length === 0}
  <EmptyState title="No issues" description="Nothing to show in this view.">
    {#snippet icon()}<CalendarRangeIcon />{/snippet}
  </EmptyState>
{:else}
  <div class="flex min-h-0 flex-col gap-2">
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <div role="radiogroup" aria-label="Zoom" class="flex rounded-md border border-border p-0.5">
        {#each ZOOMS as option (option.id)}
          <button
            type="button"
            role="radio"
            aria-checked={zoom === option.id}
            onclick={() => setZoom(option.id)}
            class={cn(
              'h-6 rounded px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring',
              zoom === option.id ? 'bg-secondary text-foreground' : 'hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        {/each}
      </div>
      <Button variant="ghost" size="xs" onclick={() => scrollToToday(true)}>Today</Button>
      <span class="ml-auto hidden sm:inline">
        {canWrite.current ? 'Drag bars to reschedule · dashed = no due date' : 'Dashed = no due date'}
      </span>
    </div>

    <div
      bind:this={scrollEl}
      class="relative max-h-[calc(100dvh-15rem)] min-h-0 overflow-auto rounded-md border border-border"
    >
      <div class="relative" style:width="{NAME_COLUMN + width}px">
        <!-- Header -->
        <div class="sticky top-0 z-20 flex border-b border-border bg-background">
          <div
            class="sticky left-0 z-30 flex shrink-0 items-end border-r border-border bg-background px-3 pb-1.5 text-xs text-muted-foreground"
            style:width="{NAME_COLUMN}px"
          >
            {pluralize(issues.length, 'issue')}
          </div>
          <div class="relative" style:width="{width}px" style:height="44px">
            {#each months as month (month.key)}
              <div
                class="absolute top-0 h-6 truncate border-l border-border px-1.5 text-xs leading-6 text-muted-foreground"
                style:left="{month.left}px"
                style:width="{month.width}px"
              >
                {month.label}
              </div>
            {/each}
            {#each ticks as tick (tick.key)}
              <div
                class={cn(
                  'absolute top-6 h-5 truncate text-[10px] leading-5 text-muted-foreground/80',
                  zoom === 'week' ? 'text-center' : 'border-l border-border/60 pl-1',
                  tick.key === today && 'font-medium text-primary',
                )}
                style:left="{tick.left}px"
                style:width={zoom === 'week' ? `${px}px` : undefined}
              >
                {tick.label}
              </div>
            {/each}
          </div>
        </div>

        <!-- Rows -->
        <div class="relative" role="list" aria-label="Issue timeline">
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-y-0"
            style:left="{NAME_COLUMN}px"
            style:width="{width}px"
          >
            {#if zoom === 'week'}
              {#each ticks.filter((t) => t.weekend) as t (t.key)}
                <div class="absolute inset-y-0 bg-muted/40" style:left="{t.left}px" style:width="{px}px"></div>
              {/each}
            {/if}
            {#each months as month (month.key)}
              <div class="absolute inset-y-0 border-l border-border/60" style:left="{month.left}px"></div>
            {/each}
            {#if todayIndex >= 0 && todayIndex < totalDays}
              <div class="absolute inset-y-0 z-[1] w-px bg-primary" style:left="{todayIndex * px + px / 2}px"></div>
            {/if}
          </div>

          {#each visible as group (group.id)}
            {#if grouped}
              <div
                role="presentation"
                class="sticky left-0 z-10 flex items-center gap-2 border-b border-border bg-muted/50 px-3 text-xs font-medium"
                style:height="28px"
                style:width="{NAME_COLUMN}px"
              >
                {#if group.state}<StateIcon state={group.state} size={14} />{/if}
                {#if !group.state && group.color}
                  <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background-color={group.color}></span>
                {/if}
                <span class="truncate">{group.label}</span>
                <span class="text-muted-foreground tabular-nums">{group.issues.length}</span>
              </div>
            {/if}
            {#each group.issues as issue (`${group.id}:${issue.id}`)}
              <TimelineRow
                {issue}
                active={issue.id === selectedId}
                {onSelect}
                bar={barFor(issue)}
                {width}
                {onPointerDown}
                {onPointerMove}
                {onPointerUp}
                {onPointerCancel}
                {onBarKeyDown}
              />
            {/each}
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
