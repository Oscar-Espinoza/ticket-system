// Domain chip (replaces shadcn Badge); every color maps to a C1 token.

import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

export type LabelChipColor =
  | 'default'
  | 'primary'
  | 'destructive'
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done';

export interface LabelChipProps extends ComponentPropsWithoutRef<'span'> {
  color?: LabelChipColor;
  /** Hide the dot (mono ticket keys, icon-only usage). Default: shown. */
  dot?: boolean;
  /** Arbitrary dot color (a label's hex); overrides `color`'s token. */
  dotColor?: string;
}

// Exhaustiveness: a new color must pick a C1 token here or the build fails.
const DOT_CLASS: Record<LabelChipColor, string> = {
  default: 'bg-muted-foreground',
  primary: 'bg-primary',
  destructive: 'bg-destructive',
  backlog: 'bg-status-backlog',
  todo: 'bg-status-todo',
  in_progress: 'bg-status-in-progress',
  in_review: 'bg-status-in-review',
  done: 'bg-status-done',
};

export function LabelChip({
  color = 'default',
  dot = true,
  dotColor,
  className,
  children,
  ...rest
}: LabelChipProps) {
  return (
    <span
      data-slot="label-chip"
      data-color={color}
      className={cn(
        // h-5 + text-xs (11px) matches the C1 label scale Badge used, but the
        // 4-6px corner (rounded, not rounded-4xl) reads as a chip, not a pill.
        'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded px-1.5',
        'bg-secondary text-secondary-foreground',
        'text-xs font-medium whitespace-nowrap',
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', !dotColor && DOT_CLASS[color])}
          style={dotColor ? { backgroundColor: dotColor } : undefined}
        />
      )}
      {children}
    </span>
  );
}
