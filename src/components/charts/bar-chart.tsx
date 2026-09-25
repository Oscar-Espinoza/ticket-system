'use client';

// Minimal SVG bar chart: one series of vertical bars (4px rounded tops anchored
// to the baseline), an optional dashed reference line (e.g. an average), hover /
// ←→ tooltip per bar, and a hidden data table.

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

export interface BarDatum {
  label: string;
  value: number;
  /** Extra tooltip rows, e.g. "Scope: 12". */
  details?: { label: string; value: string }[];
}

export interface BarChartProps {
  title: string;
  /** Series name (tooltip + legend). */
  seriesLabel: string;
  bars: BarDatum[];
  color?: string;
  reference?: { label: string; value: number; color?: string };
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

export function BarChart({
  title,
  seriesLabel,
  bars,
  color = 'var(--primary)',
  reference,
  height = 160,
  formatValue = (v) => String(Math.round(v * 10) / 10),
  className,
}: BarChartProps) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const tableId = useId();
  const count = bars.length;
  const refColor = reference?.color ?? 'var(--muted-foreground)';

  const scale = niceScale(Math.max(0, reference?.value ?? 0, ...bars.map((b) => b.value)));
  const plotW = Math.max(1, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const band = plotW / Math.max(1, count);
  const barW = Math.max(4, Math.min(40, band * 0.6));
  const cx = (i: number) => M.left + band * (i + 0.5);
  const y = (v: number) => M.top + plotH - (v / scale.max) * plotH;
  const indexAt = useCallback(
    (px: number) => Math.min(count - 1, Math.max(0, Math.floor((px - M.left) / band))),
    [count, band],
  );
  const { active, handlers, onKeyDown, onBlur } = useActiveIndex(count, indexAt);

  const barPath = (i: number, v: number) => {
    const x0 = cx(i) - barW / 2;
    const top = y(v);
    const base = y(0);
    const r = Math.min(4, barW / 2, base - top);
    if (base - top < 0.5) return '';
    return `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${base}Z`;
  };

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
            {tickIndexes(count, 8).map((i) => (
              <text
                key={i}
                x={cx(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {bars[i].label}
              </text>
            ))}
            {bars.map((bar, i) => (
              <path
                key={i}
                d={barPath(i, bar.value)}
                fill={color}
                opacity={active === null || active === i ? 1 : 0.55}
              />
            ))}
            {reference && (
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(reference.value)}
                y2={y(reference.value)}
                stroke={refColor}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            <rect x={0} y={0} width={width} height={height} fill="transparent" {...handlers} />
          </svg>
        )}
        {active !== null && width > 0 && bars[active] && (
          <ChartTooltip
            x={cx(active)}
            width={width}
            title={bars[active].label}
            rows={[
              {
                label: seriesLabel,
                value: formatValue(bars[active].value),
                swatch: <Swatch color={color} kind="bar" />,
              },
              ...(bars[active].details ?? []),
              ...(reference
                ? [
                    {
                      label: reference.label,
                      value: formatValue(reference.value),
                      swatch: <Swatch color={refColor} kind="dashed" />,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
      {reference && (
        <ChartLegend
          items={[
            { label: seriesLabel, color, kind: 'bar' },
            { label: reference.label, color: refColor, kind: 'dashed' },
          ]}
        />
      )}
      <ChartTable
        id={tableId}
        caption={title}
        columns={['', seriesLabel, ...(bars[0]?.details?.map((d) => d.label) ?? [])]}
        rows={bars.map((bar) => [
          bar.label,
          formatValue(bar.value),
          ...(bar.details?.map((d) => d.value) ?? []),
        ])}
      />
    </figure>
  );
}
