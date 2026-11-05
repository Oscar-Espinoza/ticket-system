<!-- Ring glyph: dashed (upcoming), progress arc (current), filled check (past). -->
<script lang="ts">
  import { cn } from '@/lib/utils';

  let {
    status,
    progress = 0,
    size = 16,
    class: className,
  }: {
    status: 'current' | 'upcoming' | 'past';
    /** 0–100, current cycles. */
    progress?: number;
    size?: number;
    class?: string;
  } = $props();

  const r = 6;
  const c = 2 * Math.PI * r;
</script>

<svg
  aria-hidden="true"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  class={cn('shrink-0', status === 'current' ? 'text-primary' : 'text-muted-foreground', className)}
>
  {#if status === 'past'}
    <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.8" />
    <path
      d="M5.2 8.2 7.1 10l3.7-4"
      stroke="var(--background)"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {:else}
    <circle
      cx="8"
      cy="8"
      {r}
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray={status === 'upcoming' ? '2 2' : undefined}
      opacity={status === 'current' ? 0.35 : 1}
    />
    {#if status === 'current'}
      <circle
        cx="8"
        cy="8"
        {r}
        stroke="currentColor"
        stroke-width="1.5"
        stroke-dasharray="{(Math.min(100, Math.max(0, progress)) / 100) * c} {c}"
        transform="rotate(-90 8 8)"
        stroke-linecap="round"
      />
    {/if}
  {/if}
</svg>
