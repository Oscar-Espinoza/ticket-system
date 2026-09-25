'use client';

// Single-series columns (throughput per week, time distributions): thin bars
// with rounded tops on a shared baseline, 2px gaps, optional average rule,
// per-column hover/focus tooltip.

import { useCallback } from 'react';

import { ChartTooltip, SrTable, niceMax, useChartWidth, useIndexHover } from './chart-kit';

export interface Column {
  /** Axis label (short). */
  label: string;
  /** Tooltip heading; defaults to `label`. */
  title?: string;
  value: number;
}

const HEIGHT = 160;
const M = { top: 10, right: 8, bottom: 22, left: 28 };
const GAP = 2;

/** A bar with 4px-rounded top corners anchored on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function ColumnChart({
  data,
  unit,
  caption,
  showAverage = false,
}: {
  data: Column[];
  /** "completed", "issues" — tooltip + table wording. */
  unit: string;
  caption: string;
  showAverage?: boolean;
}) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const n = data.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const slot = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(28, slot - GAP));
  const x = (i: number) => M.left + i * slot + (slot - barW) / 2;
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const indexAt = useCallback((px: number) => Math.floor((px - M.left) / Math.max(1, slot)), [slot]);
  const { index, handlers } = useIndexHover(n, indexAt);
  const average = n ? data.reduce((s, d) => s + d.value, 0) / n : 0;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 60))));

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${caption}. Use arrow keys to read each column.`}
          className="block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          {...handlers}
        >
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} className="stroke-border" />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px]">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {data.map((d, i) => (
            <g key={i}>
              <path
                d={barPath(x(i), y(d.value), barW, y(0) - y(d.value))}
                className={index === i ? 'fill-primary' : 'fill-primary/80'}
              />
              {(i % labelEvery === 0 || i === n - 1) && (
                <text
                  x={x(i) + barW / 2}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {d.label}
                </text>
              )}
            </g>
          ))}
          {showAverage && average > 0 && (
            <g>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(average)}
                y2={y(average)}
                strokeDasharray="3 3"
                className="stroke-muted-foreground"
              />
              <text x={M.left + plotW} y={y(average) - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
                avg {average.toFixed(1)}
              </text>
            </g>
          )}
        </svg>
      )}
      {index !== null && data[index] && (
        <ChartTooltip x={x(index) + barW / 2} width={width}>
          <div className="mb-0.5 text-muted-foreground">{data[index].title ?? data[index].label}</div>
          <span className="font-medium tabular-nums">{data[index].value}</span>{' '}
          <span className="text-muted-foreground">{unit}</span>
        </ChartTooltip>
      )}
      <SrTable
        caption={caption}
        columns={['', unit]}
        rows={data.map((d) => [d.title ?? d.label, d.value])}
      />
    </div>
  );
}
