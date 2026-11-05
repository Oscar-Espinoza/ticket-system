<!-- Circular progress, 0–100. -->
<script lang="ts">
  import { cn } from '@/lib/utils';

  let {
    percent,
    size = 16,
    color,
    class: className,
  }: {
    percent: number;
    size?: number;
    color?: string | null;
    class?: string;
  } = $props();

  const r = 6;
  const circumference = 2 * Math.PI * r;
  const filled = $derived((Math.min(100, Math.max(0, percent)) / 100) * circumference);
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  aria-hidden="true"
  class={cn('shrink-0', className)}
>
  <circle cx="8" cy="8" {r} fill="none" stroke-width="2" class="stroke-muted" />
  <circle
    cx="8"
    cy="8"
    {r}
    fill="none"
    stroke-width="2"
    stroke-linecap="round"
    stroke={color ?? 'var(--color-primary)'}
    stroke-dasharray="{filled} {circumference}"
    transform="rotate(-90 8 8)"
    opacity={percent > 0 ? 1 : 0}
  />
</svg>
