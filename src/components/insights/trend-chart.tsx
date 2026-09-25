'use client';

// Created vs completed per week: two 2px lines, crosshair + tooltip listing both
// series, legend + direct end labels (identity never by colour alone).

import { useCallback } from 'react';

import type { WeekPoint } from '@/lib/insights';
import {
  ChartTooltip,
  SeriesKey,
  SrTable,
  formatWeek,
  niceMax,
  useChartWidth,
  useIndexHover,
} from './chart-kit';

const HEIGHT = 200;
const M = { top: 10, right: 76, bottom: 22, left: 28 };

// Validated pair (CVD ΔE ≥ 27 light + dark): amber for created, brand for completed.
const SERIES = [
  { key: 'created', label: 'Created', className: 'text-[#c98500] dark:text-[#b77800]' },
  { key: 'completed', label: 'Completed', className: 'text-status-done' },
] as const;

export function TrendChart({ weeks }: { weeks: WeekPoint[] }) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const n = weeks.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const max = niceMax(Math.max(1, ...weeks.flatMap((w) => [w.created, w.completed])));
  const x = (i: number) => M.left + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const indexAt = useCallback(
    (px: number) => Math.round(((px - M.left) / Math.max(1, plotW)) * (n - 1)),
    [plotW, n],
  );
  const { index, handlers } = useIndexHover(n, indexAt);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 70))));

  // End labels: nudge apart when the two lines finish close together.
  const last = weeks[n - 1];
  let endY = last ? SERIES.map((s) => y(last[s.key])) : [];
  if (endY.length === 2 && Math.abs(endY[0] - endY[1]) < 12) {
    const mid = (endY[0] + endY[1]) / 2;
    const up = endY[0] <= endY[1] ? 0 : 1;
    endY = endY.map((_, i) => (i === up ? mid - 6 : mid + 6));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 text-xs text-muted-foreground" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <SeriesKey className={s.className} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Issues created and completed per week over the last ${n} weeks. Use arrow keys to read each week.`}
            className="block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
            {...handlers}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} className="stroke-border" />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {Number.isInteger(t) ? t : t.toFixed(1)}
                </text>
              </g>
            ))}
            {weeks.map((w, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text
                  key={w.week}
                  x={x(i)}
                  y={HEIGHT - 6}
                  textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatWeek(w.week)}
                </text>
              ) : null,
            )}
            {index !== null && (
              <line x1={x(index)} x2={x(index)} y1={M.top} y2={M.top + plotH} className="stroke-muted-foreground/50" />
            )}
            {SERIES.map((s, si) => (
              <g key={s.key} className={s.className}>
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={weeks.map((w, i) => `${x(i)},${y(w[s.key])}`).join(' ')}
                />
                {index !== null && (
                  <circle cx={x(index)} cy={y(weeks[index][s.key])} r={4} fill="currentColor" className="stroke-background" strokeWidth={2} />
                )}
                {last && (
                  <text x={x(n - 1) + 8} y={endY[si]} dy="0.32em" className="fill-muted-foreground text-[11px]">
                    {s.label} {last[s.key]}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
        {index !== null && weeks[index] && (
          <ChartTooltip x={x(index)} width={width}>
            <div className="mb-1 text-muted-foreground">Week of {formatWeek(weeks[index].week)}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <SeriesKey className={s.className} />
                <span className="font-medium tabular-nums">{weeks[index][s.key]}</span>
                <span className="text-muted-foreground">{s.label.toLowerCase()}</span>
              </div>
            ))}
          </ChartTooltip>
        )}
      </div>
      <SrTable
        caption="Issues created and completed per week"
        columns={['Week of', 'Created', 'Completed']}
        rows={weeks.map((w) => [formatWeek(w.week), w.created, w.completed])}
      />
    </div>
  );
}
