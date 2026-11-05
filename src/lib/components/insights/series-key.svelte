<!-- A short stroke of the series colour (line key, not a filled box). -->
<script lang="ts">
  import { cn } from '@/lib/utils';

  let { class: className }: { class?: string } = $props();
</script>

<span aria-hidden="true" class={cn('inline-block h-0.5 w-3 rounded-full bg-current', className)}></span>
