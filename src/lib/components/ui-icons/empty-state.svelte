<script module lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
    /** Leading glyph, rendered inside a muted circle. */
    icon?: Snippet;
    title: string;
    description?: string;
    /** CTA slot — pass a real control (never a dead button). */
    action?: Snippet;
  }
</script>

<script lang="ts">
  import { cn } from '@/lib/utils';

  let { icon, title, description, action, class: className, ...rest }: EmptyStateProps = $props();
</script>

<div
  data-slot="empty-state"
  class={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}
  {...rest}
>
  {#if icon}
    <span
      aria-hidden="true"
      class="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-4"
    >
      {@render icon()}
    </span>
  {/if}
  <p class="text-base font-medium">{title}</p>
  {#if description}
    <p class="max-w-sm text-sm text-muted-foreground">{description}</p>
  {/if}
  {#if action}
    <div class="mt-1">{@render action()}</div>
  {/if}
</div>
