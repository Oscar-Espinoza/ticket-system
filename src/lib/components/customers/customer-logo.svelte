<!-- Logo tile: deterministic hue from the name, so a customer is recognisable at a glance. -->
<script lang="ts">
  import { cn } from '@/lib/utils';

  let {
    name,
    size = 20,
    class: className,
  }: {
    name: string;
    size?: 16 | 20 | 28;
    class?: string;
  } = $props();

  function hueOf(value: string) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
    return Math.abs(hash) % 360;
  }

  const initial = $derived(name.trim()[0]?.toUpperCase() ?? '?');
</script>

<span
  aria-hidden="true"
  class={cn(
    'inline-flex shrink-0 items-center justify-center rounded font-medium text-white',
    size === 16 && 'size-4 text-[9px]',
    size === 20 && 'size-5 text-[10px]',
    size === 28 && 'size-7 text-sm',
    className,
  )}
  style:background-color="oklch(0.6 0.12 {hueOf(name)})"
>
  {initial}
</span>
