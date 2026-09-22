// Skeleton — C4 primitive (M4 scope item 1). Row/card variants at C1 motion:
// the shimmer lives in the co-located CSS module (keyframes over --muted and
// --accent; prefers-reduced-motion disables the sweep), so the frozen
// globals.css (C1) is untouched.
//
// Consumers: src/app/dashboard/loading.tsx (the project-list loading path —
// M4 acceptance requires demonstrable skeletons wherever a list suspends).

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
        // row = a project row (36px, matches the M4 dense list);
        // card = a taller block for M5/M6 compositions.
        variant === 'row' ? 'h-9 w-full rounded-md' : 'h-24 w-full rounded-lg',
        className,
      )}
    />
  );
}
