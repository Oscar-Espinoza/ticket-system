<script lang="ts">
  import { cn } from '@/lib/utils';

  let {
    done = false,
    color,
    class: className,
  }: {
    done?: boolean;
    color?: string | null;
    class?: string;
  } = $props();
</script>

<svg
  viewBox="0 0 12 12"
  aria-hidden="true"
  class={cn('size-3 shrink-0', className)}
  style="color: {color ?? 'currentColor'}"
>
  <path
    d="M6 1 11 6 6 11 1 6Z"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    fill={done ? 'currentColor' : 'none'}
  />
</svg>
