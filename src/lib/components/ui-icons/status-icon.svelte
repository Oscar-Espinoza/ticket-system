<!--
  Workflow-state glyphs, keyed by state *type* (custom states share their
  type's glyph). A state's own color tints it via `color`; otherwise the type's
  token color applies.
-->
<script module lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  import type { StateType } from '@/lib/issue-model';

  // Omit size/children: `size` is re-declared as the literal union 14 | 16 and
  // children make no sense for a self-contained glyph.
  type GlyphProps = Omit<SVGAttributes<SVGSVGElement>, 'size' | 'children' | 'color' | 'type'>;

  export interface StatusIconProps extends GlyphProps {
    type: StateType;
    /** Any CSS color (a state's hex). Defaults to the type's token color. */
    color?: string;
    /** 14 or 16 px. */
    size?: 14 | 16;
    /** Started pie fill, 0–100. Ignored by other types. */
    percent?: number;
  }
</script>

<script lang="ts">
  import { cn } from '@/lib/utils';
  import { STATE_TYPE_LABEL } from '@/lib/issue-model';

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

  let {
    type,
    color,
    size = 16,
    percent = 50,
    class: className,
    style,
    ...rest
  }: StatusIconProps = $props();

  const pie = $derived((Math.min(100, Math.max(0, percent)) / 100) * PIE_CIRCUMFERENCE);
  // The caller's style wins over `color`.
  const mergedStyle = $derived(color ? `color: ${color};${style ? ` ${style}` : ''}` : style);
</script>

<svg
  data-slot="status-icon"
  data-state-type={type}
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  role="img"
  aria-label={STATE_TYPE_LABEL[type]}
  class={cn('shrink-0', !color && TYPE_CLASS[type], className)}
  style={mergedStyle}
  {...rest}
>
  {#if type === 'triage'}
    <circle cx="8" cy="8" r="6.5" fill="currentColor" />
    <!-- Two opposing arrows, knocked out like the completed check. -->
    <path
      d="M5 6.6h5.6M9 5l1.6 1.6L9 8.2M11 9.4H5.4M7 7.8 5.4 9.4 7 11"
      class="stroke-primary-foreground"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/if}

  {#if type === 'backlog'}
    <!-- Dotted ring — near-zero dashes with round caps render evenly
         spaced dots around the circumference. -->
    <circle
      cx="8"
      cy="8"
      r={R}
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="0.01 3.14"
      stroke-linecap="round"
    />
  {/if}

  {#if type === 'unstarted'}
    <circle cx="8" cy="8" r={R} stroke="currentColor" stroke-width="1.5" />
  {/if}

  {#if type === 'started'}
    <circle cx="8" cy="8" r={R} stroke="currentColor" stroke-width="1.5" />
    <circle
      cx="8"
      cy="8"
      r={PIE_R}
      stroke="currentColor"
      stroke-width={PIE_R * 2}
      stroke-dasharray={`${pie} ${PIE_CIRCUMFERENCE}`}
      transform="rotate(-90 8 8)"
    />
  {/if}

  {#if type === 'completed'}
    <circle cx="8" cy="8" r="6.5" fill="currentColor" />
    <!-- Check is knocked out in the primary-foreground (white in both
         themes) so it stays contrasty over any state color. -->
    <path
      d="M5.4 8.2 L7.3 10.1 L10.6 6.4"
      class="stroke-primary-foreground"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/if}

  {#if type === 'canceled'}
    <circle cx="8" cy="8" r="6.5" fill="currentColor" />
    <path
      d="M5.9 5.9 10.1 10.1M10.1 5.9 5.9 10.1"
      class="stroke-primary-foreground"
      stroke-width="1.6"
      stroke-linecap="round"
    />
  {/if}
</svg>
