// PriorityIcon — C4 primitive (M4 scope item 1; ships with no consumer until
// M5's issue list — C4 mandates the primitive now so M5 composes, never
// restyles).
//
// Three ascending bars (signal-style): `none` renders all bars ghosted,
// `low`/`medium`/`high` fill 1/2/3 bars respectively, `urgent` renders a
// filled dot (default destructive red per C1). Everything is
// `currentColor`-aware — the default color comes from the variant map below
// and callers override via `className`.

import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

type GlyphProps = Omit<ComponentPropsWithoutRef<'svg'>, 'size' | 'children'>;

export interface PriorityIconProps extends GlyphProps {
  priority: Priority;
  /** 14 or 16 px (C4 contract, matches StatusIcon). */
  size?: 14 | 16;
}

const PRIORITY_CLASS: Record<Priority, string> = {
  none: 'text-muted-foreground',
  low: 'text-muted-foreground',
  medium: 'text-muted-foreground',
  high: 'text-muted-foreground',
  urgent: 'text-destructive',
};

// Filled bar count per variant; urgent uses the dot glyph instead.
const ACTIVE_BARS: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 0,
};

const BAR_X = [2, 6.5, 11] as const;
const BAR_HEIGHT = [3.5, 6.5, 9.5] as const;
const BASELINE = 13; // bars bottom-align here — ascending left to right

export function PriorityIcon({
  priority,
  size = 16,
  className,
  ...rest
}: PriorityIconProps) {
  if (priority === 'urgent') {
    return (
      <svg
        data-slot="priority-icon"
        data-priority={priority}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        role="img"
        aria-label="Urgent"
        className={cn('shrink-0', PRIORITY_CLASS[priority], className)}
        {...rest}
      >
        <circle cx="8" cy="8" r="5.5" fill="currentColor" />
      </svg>
    );
  }

  const active = ACTIVE_BARS[priority];

  return (
    <svg
      data-slot="priority-icon"
      data-priority={priority}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role="img"
      aria-label={`${priority[0].toUpperCase()}${priority.slice(1)} priority`}
      className={cn('shrink-0', PRIORITY_CLASS[priority], className)}
      {...rest}
    >
      {BAR_X.map((x, i) => (
        <rect
          key={x}
          x={x}
          y={BASELINE - BAR_HEIGHT[i]}
          width="3"
          height={BAR_HEIGHT[i]}
          rx="1"
          fill="currentColor"
          opacity={i < active ? 1 : 0.3}
        />
      ))}
    </svg>
  );
}
