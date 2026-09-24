// Status glyphs; the prop type is the ticket_status DB enum, so they can't drift apart.

import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';
import type { ticketStatusEnum } from '@/db/schema';

// The status type IS the DB enum — type-only import, erased at runtime.
export type TicketStatus = (typeof ticketStatusEnum.enumValues)[number];

// Omit size/children: `size` is re-declared as the literal union 14 | 16 and
// children make no sense for a self-contained glyph.
type GlyphProps = Omit<ComponentPropsWithoutRef<'svg'>, 'size' | 'children'>;

export interface StatusIconProps extends GlyphProps {
  status: TicketStatus;
  /** 14 or 16 px (C4 contract). */
  size?: 14 | 16;
  /** In-progress arc fill, 0–100. Ignored by other variants. */
  percent?: number;
}

// Exhaustiveness proof #1: a new enum value breaks this map at compile time.
const STATUS_CLASS: Record<TicketStatus, string> = {
  backlog: 'text-status-backlog',
  todo: 'text-status-todo',
  in_progress: 'text-status-in-progress',
  in_review: 'text-status-in-review',
  done: 'text-status-done',
};

// Exhaustiveness proof #2: accessible labels stay in sync with the enum too.
const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

const R = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * R; // ≈ 37.699 — arc math for percent

export function StatusIcon({
  status,
  size = 16,
  percent = 40,
  className,
  ...rest
}: StatusIconProps) {
  const arc =
    (Math.min(100, Math.max(0, percent)) / 100) * RING_CIRCUMFERENCE;

  return (
    <svg
      data-slot="status-icon"
      data-status={status}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role="img"
      aria-label={STATUS_LABEL[status]}
      className={cn('shrink-0', STATUS_CLASS[status], className)}
      {...rest}
    >
      {status === 'backlog' && (
        // Dotted ring — near-zero dashes with round caps render evenly
        // spaced dots around the circumference.
        <circle
          cx="8"
          cy="8"
          r={R}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="0.01 3.14"
          strokeLinecap="round"
        />
      )}

      {status === 'todo' && (
        <circle cx="8" cy="8" r={R} stroke="currentColor" strokeWidth="1.5" />
      )}

      {status === 'in_progress' && (
        <>
          {/* Faint track keeps the arc legible at any percent */}
          <circle
            cx="8"
            cy="8"
            r={R}
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.25"
          />
          <circle
            cx="8"
            cy="8"
            r={R}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${RING_CIRCUMFERENCE}`}
            transform="rotate(-90 8 8)"
          />
        </>
      )}

      {status === 'in_review' && (
        <>
          <circle cx="8" cy="8" r={R} stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.2" fill="currentColor" />
        </>
      )}

      {status === 'done' && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          {/* Check is knocked out in the C1 primary-foreground (white in both
              themes) so it stays contrasty over any caller-supplied color. */}
          <path
            d="M5.4 8.2 L7.3 10.1 L10.6 6.4"
            className="stroke-primary-foreground"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
