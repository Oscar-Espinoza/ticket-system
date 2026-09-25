'use client';

// Minimal SVG line / area chart: one shared y axis, series drawn in order (a
// null value ends the line — e.g. "remaining" stops at today), crosshair +
// tooltip on hover or ←/→ focus, legend, and a hidden data table.

import { useCallback, useId } from 'react';

import { cn } from '@/lib/utils';
import {
  CHART_MARGIN as M,
  ChartLegend,
  ChartTable,
  ChartTooltip,
  Swatch,
  YAxis,
  niceScale,
  tickIndexes,
  useActiveIndex,
  useChartWidth,
} from './chart-frame';

export interface LineSeries {
  id: string;
  label: string;
  /** One per x label; null = no value (gap / not yet). */
  values: (number | null)[];
  /** Any CSS color, e.g. `var(--primary)`. */
  color: string;
  variant?: 'line' | 'area' | 'dashed';
}

export interface LineChartProps {
  /** Accessible name of the chart. */
  title: string;
  /** Axis tick label per x position. */
  labels: string[];
  /** Longer tooltip / table label per x position (default: `labels`). */
  pointLabels?: string[];
  series: LineSeries[];
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

export function LineChart({
  title,
  labels,
  pointLabels = labels,
  series,
  height = 180,
  formatValue = (v) => String(Math.round(v * 10) / 10),
  className,
}: LineChartProps) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const tableId = useId();
  const count = labels.length;

  const maxValue = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const scale = niceScale(maxValue);
  const plotW = Math.max(1, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const x = useCallback(
    (i: number) => M.left + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW),
    [count, plotW],
  );
  const y = (v: number) => M.top + plotH - (v / scale.max) * plotH;
  const indexAt = useCallback(
    (px: number) =>
      count <= 1 ? 0 : Math.min(count - 1, Math.max(0, Math.round(((px - M.left) / plotW) * (count - 1)))),
    [count, plotW],
  );
  const { active, handlers, onKeyDown, onBlur } = useActiveIndex(count, indexAt);

  const segments = (values: (number | null)[]) => {
    const runs: [number, number][][] = [];
    let run: [number, number][] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push([x(i), y(v)]);
    });
    if (run.length) runs.push(run);
    return runs;
  };
  const path = (run: [number, number][]) =>
    run.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div
        ref={ref}
        className="relative w-full outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50"
        style={{ height }}
        tabIndex={count > 0 ? 0 : undefined}
        role="group"
        aria-label={`${title}. Use the arrow keys to read values.`}
        aria-describedby={tableId}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
            <YAxis ticks={scale.ticks} y={y} width={width} format={formatValue} />
            {tickIndexes(count).map((i) => (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[10px]"
              >
                {labels[i]}
              </text>
            ))}
            {series.map((s) =>
              segments(s.values).map((run, r) => (
                <g key={`${s.id}-${r}`}>
                  {s.variant === 'area' && run.length > 1 && (
                    <path
                      d={`${path(run)}L${run[run.length - 1][0]},${y(0)}L${run[0][0]},${y(0)}Z`}
                      fill={s.color}
                      opacity={0.12}
                    />
                  )}
                  <path
                    d={path(run)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.variant === 'area' ? 2 : 1.5}
                    strokeDasharray={s.variant === 'dashed' ? '4 3' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              )),
            )}
            {active !== null && (
              <g>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={M.top}
                  y2={M.top + plotH}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.5}
                />
                {series.map((s) => {
                  const v = s.values[active];
                  return v === null || v === undefined ? null : (
                    <circle
                      key={s.id}
                      cx={x(active)}
                      cy={y(v)}
                      r={4}
                      fill={s.color}
                      stroke="var(--background)"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            )}
            {/* Hit area larger than the marks. */}
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="transparent"
              {...handlers}
            />
          </svg>
        )}
        {active !== null && width > 0 && (
          <ChartTooltip
            x={x(active)}
            width={width}
            title={pointLabels[active]}
            rows={series.flatMap((s) => {
              const v = s.values[active];
              return v === null || v === undefined
                ? []
                : [
                    {
                      label: s.label,
                      value: formatValue(v),
                      swatch: (
                        <Swatch color={s.color} kind={s.variant === 'dashed' ? 'dashed' : 'line'} />
                      ),
                    },
                  ];
            })}
          />
        )}
      </div>
      {series.length > 1 && (
        <ChartLegend
          items={series.map((s) => ({
            label: s.label,
            color: s.color,
            kind: s.variant === 'dashed' ? 'dashed' : 'line',
          }))}
        />
      )}
      <ChartTable
        id={tableId}
        caption={title}
        columns={['', ...series.map((s) => s.label)]}
        rows={pointLabels.map((label, i) => [
          label,
          ...series.map((s) => (s.values[i] === null ? '—' : formatValue(s.values[i] as number))),
        ])}
      />
    </figure>
  );
}
