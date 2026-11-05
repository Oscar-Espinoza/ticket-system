<script module lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  import type { Priority } from '@/lib/issue-model';

  export type { Priority };

  type GlyphProps = Omit<SVGAttributes<SVGSVGElement>, 'size' | 'children'>;

  export interface PriorityIconProps extends GlyphProps {
    priority: Priority;
    /** 14 or 16 px (C4 contract, matches StatusIcon). */
    size?: 14 | 16;
  }
</script>

<script lang="ts">
  import { cn } from '@/lib/utils';
  import { PRIORITY_LABEL } from '@/lib/issue-model';

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

  let { priority, size = 16, class: className, ...rest }: PriorityIconProps = $props();

  const active = $derived(ACTIVE_BARS[priority]);
</script>

{#if priority === 'urgent'}
  <svg
    data-slot="priority-icon"
    data-priority={priority}
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    role="img"
    aria-label="Urgent"
    class={cn('shrink-0', PRIORITY_CLASS[priority], className)}
    {...rest}
  >
    <circle cx="8" cy="8" r="5.5" fill="currentColor" />
  </svg>
{:else}
  <svg
    data-slot="priority-icon"
    data-priority={priority}
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    role="img"
    aria-label={priority === 'none' ? PRIORITY_LABEL.none : `${PRIORITY_LABEL[priority]} priority`}
    class={cn('shrink-0', PRIORITY_CLASS[priority], className)}
    {...rest}
  >
    {#each BAR_X as x, i (x)}
      <rect
        {x}
        y={BASELINE - BAR_HEIGHT[i]}
        width="3"
        height={BAR_HEIGHT[i]}
        rx="1"
        fill="currentColor"
        opacity={i < active ? 1 : 0.3}
      />
    {/each}
  </svg>
{/if}
