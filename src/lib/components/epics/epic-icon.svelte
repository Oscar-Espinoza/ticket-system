<script lang="ts">
  import BoxIcon from '@lucide/svelte/icons/box';

  import { cn } from '@/lib/utils';
  import { DEFAULT_EPIC_COLOR } from '@/lib/epic-model';

  let {
    color,
    class: className,
  }: {
    color: string | null | undefined;
    class?: string;
  } = $props();
</script>

<BoxIcon
  aria-hidden="true"
  class={cn('size-4 shrink-0', className)}
  style="color: {color ?? DEFAULT_EPIC_COLOR}"
/>
