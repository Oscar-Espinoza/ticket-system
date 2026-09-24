// Workflow-state glyphs, keyed by state *type* (custom states share their
// type's glyph). A state's own color tints it via `color`; otherwise the type's
// token color applies.

import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';
import { STATE_TYPE_LABEL, type StateType, type WorkflowState } from '@/lib/issue-model';

// Omit size/children: `size` is re-declared as the literal union 14 | 16 and
// children make no sense for a self-contained glyph.
type GlyphProps = Omit<ComponentPropsWithoutRef<'svg'>, 'size' | 'children' | 'color'>;

export interface StatusIconProps extends GlyphProps {
  type: StateType;
  /** Any CSS color (a state's hex). Defaults to the type's token color. */
  color?: string;
  /** 14 or 16 px (C4 contract). */
  size?: 14 | 16;
  /** Started pie fill, 0–100. Ignored by other types. */
  percent?: number;
}

// Exhaustiveness: a new state type must pick a color here or the build fails.
const TYPE_CLASS: Record<StateType, string> = {
  triage: 'text-orange-500',
  backlog: 'text-status-backlog',
  unstarted: 'text-status-todo',
  started: 'text-status-in-progress',
  completed: 'text-status-done',
  canceled: 'text-muted-foreground',
};

const R = 6;
const PIE_R = 2; // stroke-width 2×PIE_R turns the dash into a filled wedge
const PIE_CIRCUMFERENCE = 2 * Math.PI * PIE_R;

export function StatusIcon({
  type,
  color,
  size = 16,
  percent = 50,
  className,
  style,
  ...rest
}: StatusIconProps) {
  const pie = (Math.min(100, Math.max(0, percent)) / 100) * PIE_CIRCUMFERENCE;

  return (
    <svg
      data-slot="status-icon"
      data-state-type={type}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role="img"
      aria-label={STATE_TYPE_LABEL[type]}
      className={cn('shrink-0', !color && TYPE_CLASS[type], className)}
      style={color ? { color, ...style } : style}
      {...rest}
    >
      {type === 'triage' && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          {/* Two opposing arrows, knocked out like the completed check. */}
          <path
            d="M5 6.6h5.6M9 5l1.6 1.6L9 8.2M11 9.4H5.4M7 7.8 5.4 9.4 7 11"
            className="stroke-primary-foreground"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {type === 'backlog' && (
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

      {type === 'unstarted' && (
        <circle cx="8" cy="8" r={R} stroke="currentColor" strokeWidth="1.5" />
      )}

      {type === 'started' && (
        <>
          <circle cx="8" cy="8" r={R} stroke="currentColor" strokeWidth="1.5" />
          <circle
            cx="8"
            cy="8"
            r={PIE_R}
            stroke="currentColor"
            strokeWidth={PIE_R * 2}
            strokeDasharray={`${pie} ${PIE_CIRCUMFERENCE}`}
            transform="rotate(-90 8 8)"
          />
        </>
      )}

      {type === 'completed' && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          {/* Check is knocked out in the C1 primary-foreground (white in both
              themes) so it stays contrasty over any state color. */}
          <path
            d="M5.4 8.2 L7.3 10.1 L10.6 6.4"
            className="stroke-primary-foreground"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {type === 'canceled' && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path
            d="M5.9 5.9 10.1 10.1M10.1 5.9 5.9 10.1"
            className="stroke-primary-foreground"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

export interface StateIconProps extends Omit<StatusIconProps, 'type' | 'color'> {
  state: Pick<WorkflowState, 'type' | 'color' | 'name'>;
}

/** A project's workflow state: its type's glyph in its own color, named for AT. */
export function StateIcon({ state, ...rest }: StateIconProps) {
  return <StatusIcon type={state.type} color={state.color} aria-label={state.name} {...rest} />;
}
