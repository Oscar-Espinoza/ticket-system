<script lang="ts">
  import { cn } from '@/lib/utils';
  import { HEALTH_COLOR, type Health } from '@/lib/components/epics/epic-model';

  let { health, class: className }: { health: Health; class?: string } = $props();
</script>

<span
  aria-hidden="true"
  class={cn('size-2 shrink-0 rounded-full', className)}
  style="background-color: {HEALTH_COLOR[health]}"
></span>
