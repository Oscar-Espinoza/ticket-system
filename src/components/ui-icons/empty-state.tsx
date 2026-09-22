// EmptyState — C4 primitive (M4 scope item 1). Icon + title + description +
// CTA slot, replacing ad-hoc empty markup ("no 'No projects yet' ad-hoc
// markup" is an M4 acceptance criterion).
//
// The title sits at the C1 heading scale (text-base / 14px, font-medium —
// the same 500 weight the dashboard greeting settles at in M4).

import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface EmptyStateProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** Leading glyph, rendered inside a muted circle. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** CTA slot — pass a real control (D-21: never a dead button). */
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-center',
        className,
      )}
      {...rest}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-4"
        >
          {icon}
        </span>
      )}
      <p className="text-base font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
