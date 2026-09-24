import { cn } from '@/lib/utils';

import styles from './skeleton.module.css';

export interface SkeletonProps {
  variant?: 'row' | 'card';
  className?: string;
}

export function Skeleton({ variant = 'row', className }: SkeletonProps) {
  return (
    <span
      data-slot="skeleton"
      data-variant={variant}
      aria-hidden="true"
      className={cn(
        styles.shimmer,
        'block',
        variant === 'row' ? 'h-9 w-full rounded-md' : 'h-24 w-full rounded-lg',
        className,
      )}
    />
  );
}
