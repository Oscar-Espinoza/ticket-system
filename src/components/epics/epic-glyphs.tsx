// Small epic glyphs: epic icon, status, health, progress ring, milestone diamond.

import { Box } from 'lucide-react';

import { StatusIcon } from '@/components/ui-icons';
import { cn } from '@/lib/utils';
import {
  DEFAULT_EPIC_COLOR,
  EPIC_STATUS_GLYPH,
  EPIC_STATUS_LABEL,
  HEALTH_COLOR,
  HEALTH_LABEL,
  type EpicStatus,
  type Health,
} from './epic-model';

export function EpicIcon({
  color,
  className,
}: {
  color: string | null | undefined;
  className?: string;
}) {
  return (
    <Box
      aria-hidden="true"
      className={cn('size-4 shrink-0', className)}
      style={{ color: color ?? DEFAULT_EPIC_COLOR }}
    />
  );
}

export function EpicStatusIcon({ status, size = 14 }: { status: EpicStatus; size?: 14 | 16 }) {
  const glyph = EPIC_STATUS_GLYPH[status];
  return (
    <StatusIcon
      type={glyph.type}
      color={glyph.color}
      size={size}
      percent={status === 'paused' ? 50 : 60}
      aria-label={EPIC_STATUS_LABEL[status]}
    />
  );
}

export function HealthDot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: HEALTH_COLOR[health] }}
    />
  );
}

/** "● On track"; renders a muted "No updates" when health is null and `showEmpty`. */
export function HealthChip({
  health,
  showEmpty = false,
  className,
}: {
  health: Health | null;
  showEmpty?: boolean;
  className?: string;
}) {
  if (!health) {
    return showEmpty ? (
      <span className={cn('text-xs text-muted-foreground', className)}>No updates</span>
    ) : null;
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', className)}
      style={{ color: HEALTH_COLOR[health] }}
    >
      <HealthDot health={health} />
      {HEALTH_LABEL[health]}
    </span>
  );
}

/** Circular progress, 0–100. */
export function ProgressRing({
  percent,
  size = 16,
  color,
  className,
}: {
  percent: number;
  size?: number;
  color?: string | null;
  className?: string;
}) {
  const r = 6;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-muted" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        stroke={color ?? 'var(--color-primary)'}
        strokeDasharray={`${filled} ${circumference}`}
        transform="rotate(-90 8 8)"
        opacity={percent > 0 ? 1 : 0}
      />
    </svg>
  );
}

export function MilestoneGlyph({
  done = false,
  color,
  className,
}: {
  done?: boolean;
  color?: string | null;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={cn('size-3 shrink-0', className)}
      style={{ color: color ?? 'currentColor' }}
    >
      <path
        d="M6 1 11 6 6 11 1 6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill={done ? 'currentColor' : 'none'}
      />
    </svg>
  );
}
