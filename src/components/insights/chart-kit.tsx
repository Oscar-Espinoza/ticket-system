'use client';

// Tiny shared pieces for the hand-rolled SVG charts: container width, nice axis
// maxima, index-based hover (pointer + arrow keys), tooltip box, and the
// screen-reader table every chart ships with.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function useChartWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 1, 2, 5 × 10ⁿ ceiling, so gridlines land on round numbers. */
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Nearest data index under the pointer; arrow keys move it when focused. */
export function useIndexHover(count: number, indexAt: (x: number) => number) {
  const [index, setIndex] = useState<number | null>(null);
  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setIndex(Math.max(0, Math.min(count - 1, indexAt(e.clientX - rect.left))));
    },
    [count, indexAt],
  );
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setIndex((i) => {
        const current = i ?? (e.key === 'ArrowLeft' ? count : -1);
        return Math.max(0, Math.min(count - 1, current + (e.key === 'ArrowLeft' ? -1 : 1)));
      });
    },
    [count],
  );
  return {
    index,
    handlers: {
      onPointerMove,
      onPointerLeave: () => setIndex(null),
      onKeyDown,
      onFocus: () => setIndex((i) => i ?? count - 1),
      onBlur: () => setIndex(null),
      tabIndex: 0,
    },
  };
}

export function ChartTooltip({
  x,
  width,
  children,
}: {
  x: number;
  /** Chart width — flips the box to the left of the pointer near the right edge. */
  width: number;
  children: ReactNode;
}) {
  const flip = x > width - 160;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute top-1 z-10 min-w-28 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[var(--shadow-popover)]"
      style={flip ? { right: width - x + 10 } : { left: x + 10 }}
    >
      {children}
    </div>
  );
}

/** A short stroke of the series colour (line key, not a filled box). */
export function SeriesKey({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-0.5 w-3 rounded-full bg-current', className)} />;
}

export function SrTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const weekFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Mar 4" for a YYYY-MM-DD week start. */
export function formatWeek(week: string): string {
  return weekFormat.format(new Date(`${week}T00:00:00Z`));
}

/** 5h · 2.5d · 3.1w */
export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h`;
  const days = hours / 24;
  if (days < 14) return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
  return `${(days / 7).toFixed(1)}w`;
}
