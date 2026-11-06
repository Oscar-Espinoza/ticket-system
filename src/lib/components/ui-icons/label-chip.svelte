<!-- Domain chip (replaces shadcn Badge); every color maps to a token. -->
<script module lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  export type LabelChipColor =
    | 'default'
    | 'primary'
    | 'destructive'
    | 'backlog'
    | 'todo'
    | 'in_progress'
    | 'in_review'
    | 'done';

  export interface LabelChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'color' | 'children'> {
    color?: LabelChipColor;
    /** Hide the dot (mono ticket keys, icon-only usage). Default: shown. */
    dot?: boolean;
    /** Arbitrary dot color (a label's hex); overrides `color`'s token. */
    dotColor?: string;
    children?: Snippet;
  }
</script>

<script lang="ts">
  import { cn } from '@/lib/utils';

  // Exhaustiveness: a new color must pick a token here or the build fails.
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

  let {
    color = 'default',
    dot = true,
    dotColor,
    class: className,
    children,
    ...rest
  }: LabelChipProps = $props();
</script>

<span
  data-slot="label-chip"
  data-color={color}
  class={cn(
    // h-5 + text-xs (11px) matches the C1 label scale Badge used, but the
    // 4-6px corner (rounded, not rounded-4xl) reads as a chip, not a pill.
    'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded px-1.5',
    'bg-secondary text-secondary-foreground',
    'text-xs font-medium whitespace-nowrap',
    className,
  )}
  {...rest}
>
  {#if dot}
    <span
      aria-hidden="true"
      class={cn('size-1.5 shrink-0 rounded-full', !dotColor && DOT_CLASS[color])}
      style:background-color={dotColor || undefined}
    ></span>
  {/if}
  {@render children?.()}
</span>
