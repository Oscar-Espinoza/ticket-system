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
