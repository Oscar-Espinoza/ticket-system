'use client';

// Shared pieces of the hand-rolled SVG charts: width measuring, a nice linear
// y scale, keyboard/pointer index tracking, the tooltip, legend and the
// visually-hidden data table (the accessible alternative to the drawing).

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

export const CHART_MARGIN = { top: 8, right: 8, bottom: 22, left: 32 };

/** Width of the wrapper (0 until measured — render nothing before that). */
export function useChartWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A rounded max and 3–5 evenly spaced ticks from 0. */
export function niceScale(max: number): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const niceStep = step < 1 && max >= 1 ? 1 : step;
  const top = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = 0; v <= top + niceStep / 2; v += niceStep) ticks.push(Number(v.toFixed(6)));
  return { max: top, ticks };
}

/** Pick up to `max` evenly spaced indexes (always the first and last). */
export function tickIndexes(count: number, max = 6): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

/**
 * The hovered / keyboard-focused data index. Pointer x → nearest index via
 * `indexAt`; ←/→ step, Home/End jump, Esc clears.
 */
export function useActiveIndex(count: number, indexAt: (x: number) => number) {
  const [active, setActive] = useState<number | null>(null);

  const onPointerMove = useCallback(
    (event: PointerEvent<SVGElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      setActive(indexAt(event.clientX - box.left));
    },
    [indexAt],
  );
  const onPointerLeave = useCallback(() => setActive(null), []);
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (count === 0) return;
      let next: number | null = null;
      if (event.key === 'ArrowRight') next = Math.min(count - 1, (active ?? -1) + 1);
      else if (event.key === 'ArrowLeft') next = Math.max(0, (active ?? count) - 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = count - 1;
      else if (event.key === 'Escape') {
        setActive(null);
        return;
      } else return;
      event.preventDefault();
      setActive(next);
    },
    [active, count],
  );
  return {
    active,
    setActive,
    handlers: { onPointerMove, onPointerLeave },
    onKeyDown,
    onBlur: onPointerLeave,
  };
}

export function ChartTooltip({
  x,
  width,
  title,
  rows,
}: {
  /** Anchor x within the chart, px. */
  x: number;
  width: number;
  title: ReactNode;
  rows: { label: string; value: string; swatch?: ReactNode }[];
}) {
  // Flip to the anchor's left in the right half so it never overflows.
  const right = x > width / 2;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute top-1 z-10 min-w-32 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
      style={right ? { right: width - x + 10 } : { left: x + 10 }}
    >
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2">
          {row.swatch}
          <span className="text-muted-foreground">{row.label}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

export type SwatchKind = 'line' | 'dashed' | 'area' | 'bar';

export function Swatch({ color, kind = 'line' }: { color: string; kind?: SwatchKind }) {
  if (kind === 'bar' || kind === 'area') {
    return (
      <span
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 rounded-[3px]"
        style={{ background: color }}
      />
    );
  }
  return (
    <svg aria-hidden="true" width="14" height="4" className="shrink-0">
      <line
        x1="0"
        y1="2"
        x2="14"
        y2="2"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={kind === 'dashed' ? '3 2' : undefined}
      />
    </svg>
  );
}

export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string; kind?: SwatchKind }[];
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-muted-foreground">
          <Swatch color={item.color} kind={item.kind} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Screen-reader table with the chart's numbers. */
export function ChartTable({
  id,
  caption,
  columns,
  rows,
}: {
  id: string;
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table id={id} className="sr-only">
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
            {row.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={j}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Horizontal gridlines + y tick labels. */
export function YAxis({
  ticks,
  y,
  width,
  format = String,
}: {
  ticks: number[];
  y: (v: number) => number;
  width: number;
  format?: (v: number) => string;
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={CHART_MARGIN.left}
            x2={width - CHART_MARGIN.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={CHART_MARGIN.left - 6}
            y={y(tick)}
            dy="0.32em"
            textAnchor="end"
            className="fill-muted-foreground text-[10px] tabular-nums"
          >
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}
